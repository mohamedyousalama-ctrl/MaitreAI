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
import { normalizeWhatsAppInbound, verifyWhatsAppWebhook } from "@/lib/messaging/adapters/whatsapp";
import { isWhatsAppConfigured, readWhatsAppEnv } from "@/lib/messaging/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistInboundMessage } from "@/lib/db/messages";
import { resolveWebhookRestaurantId } from "@/lib/db/restaurants";
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
function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- POST: inbound messages ------------------------------------------------
export async function POST(req: NextRequest) {
  const env = readWhatsAppEnv();
  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");

  // --- TEMP inbound diagnostic (S9): log EVERY POST attempt incl. 401s, so we
  // can tell from the DB whether Meta is delivering and whether the signature
  // matches. No message content — only shape + signature prefixes. Remove once
  // the live round-trip is confirmed. ---
  try {
    const dbg = createAdminClient();
    if (dbg) {
      const expected = env.appSecret ? "sha256=" + createHmac("sha256", env.appSecret).update(rawBody).digest("hex") : null;
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
          sigComputedPrefix: expected ? expected.slice(0, 23) : null,
          sigOk: !!sig && !!expected && sig === expected,
          rawLen: rawBody.length,
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
    if (!verifySignature(rawBody, sig, env.appSecret)) {
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
  const admin = createAdminClient();
  if (admin && messages.length > 0) {
    const restaurantId = await resolveWebhookRestaurantId(admin);
    if (restaurantId) {
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
  });
}
