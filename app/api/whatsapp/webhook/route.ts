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
import { extractInboundPhoneNumberId, markWhatsAppRead, normalizeWhatsAppInbound, verifyWhatsAppWebhook } from "@/lib/messaging/adapters/whatsapp";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
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

  // Signature check only when an app secret is configured (placeholder-friendly).
  // When configured we ALWAYS verify Meta's X-Hub-Signature-256 HMAC and reject
  // (401) on mismatch. A local-dev escape hatch (WHATSAPP_SKIP_SIGNATURE=true) is
  // honored ONLY outside production — in production the signature is enforced no
  // matter what that env var says, so a stale "true" can never weaken live traffic.
  const skipSig =
    process.env.NODE_ENV !== "production" &&
    (process.env.WHATSAPP_SKIP_SIGNATURE ?? "").trim().toLowerCase() === "true";
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

    if (restaurantId) {
      // Bind the resolved creds for the whole persist→Brain→send chain. With a
      // null override this is a transparent pass-through (env behavior).
      await runWithWhatsAppCreds(perTenantEnv, async () => {
      // Karim Pro P4 (cadence) — HONEST read-receipt + typing, fired IMMEDIATELY
      // (before the heavy persist/Brain work) keyed on each inbound message.id.
      // Gated on the narrow `cadence` flag; default off → nothing changes for
      // other tenants. The typing indicator reflects the REAL processing that
      // follows (every agent turn is >1.5s) and auto-dismisses on send — there is
      // NO artificial delay. Dial: cadence_level="fast" → read-only (no typing).
      // Best-effort, non-blocking: a failed read/typing NEVER blocks the reply.
      try {
        const { data: rRow } = await admin.from("restaurants").select("feature_flags").eq("id", restaurantId).single();
        const flags = (rRow?.feature_flags as Record<string, unknown> | null) ?? null;
        if (isFeatureExplicitlyEnabled("cadence", flags)) {
          const typing = String(flags?.cadence_level ?? "balanced") !== "fast";
          await Promise.all(
            messages.filter((m) => m.externalMessageId).map((m) => markWhatsAppRead(m.externalMessageId as string, { typing }))
          );
        }
      } catch (e) {
        console.error("[whatsapp:webhook] cadence read/typing error (non-blocking)", e);
      }

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
