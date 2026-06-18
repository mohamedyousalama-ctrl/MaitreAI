// ============================================================================
// MaitreAI — WhatsApp Cloud API webhook (canonical path: /api/whatsapp/webhook)
// This is the URL configured in Meta. (Kept reachable at the legacy
// /api/channels/whatsapp/webhook via a thin re-export.)
// GET  : Meta verification handshake — echoes hub.challenge on verify-token
//        match (200), 403 on mismatch. PUBLIC (Meta sends no cookie; middleware
//        treats /api as public, so this is never auth-gated).
// POST : verifies X-Hub-Signature-256 (when an app secret is set), normalizes
//        inbound (incl. voice notes → STT), persists idempotently (dedupe on
//        channel_message_id), runs the Brain, sends the reply. Returns 200 fast.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { extractInboundPhoneNumberId, normalizeWhatsAppInbound, verifyWhatsAppWebhook } from "@/lib/messaging/adapters/whatsapp";
import { isWhatsAppConfigured, readWhatsAppEnv } from "@/lib/messaging/config";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistInboundMessage } from "@/lib/db/messages";
import { resolveWebhookRestaurantId, resolveWebhookTenant } from "@/lib/db/restaurants";
import { respondAndSendWhatsApp } from "@/lib/messaging/respond-and-send";
import { transcribeWhatsAppVoice } from "@/lib/messaging/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- GET: verification handshake -------------------------------------------
export function GET(req: NextRequest) {
  const env = readWhatsAppEnv();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  // No verify token configured → helpful dev response instead of a crash.
  if (!env.verifyToken) {
    return NextResponse.json(
      {
        ok: false,
        mode: "test",
        message: "WhatsApp verify token غير مُهيأ. عيّن WHATSAPP_VERIFY_TOKEN لتفعيل التحقق من الـ webhook.",
      },
      { status: 200 }
    );
  }

  const result = verifyWhatsAppWebhook({ mode, token, challenge, verifyToken: env.verifyToken });
  if (result !== null) {
    // Meta expects the raw challenge string echoed back as text/plain.
    return new NextResponse(result, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ ok: false, message: "verify token mismatch" }, { status: 403 });
}

// --- signature verification (server-only) ----------------------------------
/** Verify Meta's X-Hub-Signature-256 HMAC over the raw request body. */
// --- POST: inbound messages ------------------------------------------------
export async function POST(req: NextRequest) {
  const env = readWhatsAppEnv();
  // Read the RAW bytes — HMAC must be over the exact bytes Meta signed, not a
  // re-encoded string (the payload contains Arabic; round-tripping via text()
  // could in principle differ). rawBody (string) is only for JSON parsing.
  const rawBuf = Buffer.from(await req.arrayBuffer());
  const rawBody = rawBuf.toString("utf8");
  const sig = req.headers.get("x-hub-signature-256");
  const hmac = (data: Buffer | string) => (env.appSecret ? "sha256=" + createHmac("sha256", env.appSecret).update(data).digest("hex") : null);
  const compBytes = hmac(rawBuf); // authoritative
  const compText = hmac(rawBody); // diagnostic comparison

  // --- TEMP inbound diagnostic (S9): log EVERY POST attempt incl. 401s, so we
  // can tell from the DB whether Meta is delivering and whether the signature
  // matches. No message content — only shape + signature prefixes. Remove once
  // the live round-trip is confirmed. ---
  try {
    const dbg = createAdminClient();
    if (dbg) {
      let shape: Record<string, unknown> = {};
      try {
        const p = JSON.parse(rawBody) as { object?: string; entry?: { changes?: { value?: { messages?: unknown[]; statuses?: unknown[] } }[] }[] };
        const v = p?.entry?.[0]?.changes?.[0]?.value;
        const msgs = (v?.messages ?? []) as { type?: string; from?: string }[];
        shape = {
          object: p?.object ?? null,
          hasMessages: msgs.length > 0,
          msgCount: msgs.length,
          hasStatuses: ((v?.statuses ?? []) as unknown[]).length > 0,
          firstType: msgs[0]?.type ?? null,
          fromPresent: !!msgs[0]?.from,
        };
      } catch {
        shape = { parseError: true };
      }
      await dbg.from("webhook_debug").insert({
        detail: {
          appSecretSet: !!env.appSecret,
          sigPresent: !!sig,
          sigReceivedPrefix: sig ? sig.slice(0, 23) : null,
          sigComputedPrefix: compBytes ? compBytes.slice(0, 23) : null,
          sigComputedTextPrefix: compText ? compText.slice(0, 23) : null,
          sigOk: !!sig && !!compBytes && sig === compBytes,
          sigOkText: !!sig && !!compText && sig === compText,
          rawLen: rawBuf.length,
          ...shape,
        },
      });
    }
  } catch {
    /* never let diagnostics break the webhook */
  }
  // --- end diagnostic ---

  // Signature check only when an app secret is configured (placeholder-friendly).
  // Sandbox escape hatch: WHATSAPP_SKIP_SIGNATURE=true bypasses validation so the
  // round-trip can run while the correct App Secret is sorted out. SANDBOX ONLY —
  // turn OFF before real customers. The breadcrumb above still logs sigOk so we
  // can confirm the moment the real secret matches.
  const skipSig = (process.env.WHATSAPP_SKIP_SIGNATURE ?? "").trim().toLowerCase() === "true";
  if (env.appSecret && !skipSig) {
    const okSig = !!sig && !!compBytes && sig.length === compBytes.length && timingSafeEqual(Buffer.from(sig), Buffer.from(compBytes));
    if (!okSig) {
      return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  const messages = normalizeWhatsAppInbound(payload);

  // Persist to Supabase when configured (idempotent on channel_message_id);
  // otherwise fall back to console logging (test mode).
  let persisted = 0;
  let deduped = 0;
  let responded = 0;
  let resolvedBy: "phone_number_id" | "env_fallback" = "env_fallback";
  const admin = createAdminClient();
  if (admin && messages.length > 0) {
    // Per-tenant routing: resolve the restaurant by the inbound phone_number_id
    // and use ITS decrypted credentials for both persistence and the outbound
    // reply (so a tenant answers from its own number). If no tenant matches, or
    // it isn't fully/decryptably configured, resolveWebhookTenant returns null
    // and we fall back to the EXISTING env behavior — unchanged for Wesaya.
    const phoneNumberId = extractInboundPhoneNumberId(payload);
    const tenant = await resolveWebhookTenant(admin, phoneNumberId);
    const restaurantId = tenant?.restaurantId ?? (await resolveWebhookRestaurantId(admin));
    const perTenantEnv = tenant?.env ?? null; // null → readWhatsAppEnv() uses env vars
    resolvedBy = tenant ? "phone_number_id" : "env_fallback";
    // Non-secret breadcrumb — never the token/appSecret/decrypted values.
    console.log("[whatsapp:webhook] resolved", { resolvedBy, restaurantId, hasPhoneNumberId: !!phoneNumberId });

    if (restaurantId) {
      // Bind the resolved creds for the whole persist→Brain→send chain. With a
      // null override this is a transparent pass-through (env behavior).
      await runWithWhatsAppCreds(perTenantEnv, async () => {
      // Persist first (dedupe on redelivery), collecting NEW conversations to answer.
      const toAnswer = new Set<string>();
      for (const m of messages) {
        try {
          // S9-6: a voice note is transcribed BEFORE persisting, so the transcript
          // IS the stored message text — the operator sees exactly what the AI heard.
          let stt: { adapter: string; model: string; costUsd: number } | null = null;
          if (m.audioId && !m.text) {
            const t = await transcribeWhatsAppVoice(m.audioId, m.audioMime);
            m.text = t.text || "[رسالة صوتية — تعذّر التفريغ]";
            stt = { adapter: t.adapter, model: t.model, costUsd: t.costUsd };
          }
          const r = await persistInboundMessage(admin, restaurantId, m);
          if (r.inserted) {
            persisted++;
            if (r.conversationId) {
              toAnswer.add(r.conversationId);
              // Log transcription cost to agent_runs (like LLM tokens).
              if (stt) {
                await admin.from("agent_runs").insert({
                  restaurant_id: restaurantId,
                  conversation_id: r.conversationId,
                  trigger: "voice",
                  input: "[voice note]",
                  output: m.text,
                  model: stt.model,
                  adapter: stt.adapter,
                  cost_usd: stt.costUsd,
                });
              }
            }
          } else {
            deduped++;
          }
        } catch (e) {
          console.error("[whatsapp:webhook] persist error", e);
        }
      }

      // Run the Brain once per touched conversation and send the reply over
      // WhatsApp. Synchronous (well within Meta's webhook timeout); failures are
      // caught so we always return 200 and Meta never re-queues our LLM errors.
      for (const conversationId of toAnswer) {
        try {
          const res = await respondAndSendWhatsApp(admin, restaurantId, conversationId);
          if (res.status === "responded") responded++;
        } catch (e) {
          console.error("[whatsapp:webhook] respond error", e);
        }
      }
      }); // end runWithWhatsAppCreds
    } else {
      console.warn("[whatsapp:webhook] no restaurant to attach inbound messages to");
    }
  } else if (messages.length > 0) {
    console.log(
      `[whatsapp:webhook] received ${messages.length} message(s)`,
      messages.map((m) => ({ from: m.from, name: m.customerName, text: m.text }))
    );
  }

  return NextResponse.json({
    ok: true,
    mode: isWhatsAppConfigured(env) ? "connected" : "test",
    received: messages.length,
    persisted,
    deduped,
    responded,
    resolvedBy,
  });
}
