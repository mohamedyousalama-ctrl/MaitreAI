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
import { isWhatsAppConfigured, readWhatsAppEnv, type WhatsAppEnv } from "@/lib/messaging/config";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistInboundMessage } from "@/lib/db/messages";
import { resolveWebhookRestaurantId, resolveWebhookTenant } from "@/lib/db/restaurants";
import { respondAndSendWhatsApp } from "@/lib/messaging/respond-and-send";
import { withConversationLock } from "@/lib/db/conversation-lock";
import { transcribeWhatsAppVoice } from "@/lib/messaging/voice";
import { recordCriticalAlert } from "@/lib/alerts/record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- GET: verification handshake -------------------------------------------
export async function GET(req: NextRequest) {
  const env = readWhatsAppEnv();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  // 1. GLOBAL verify token (unchanged Wesaya path — synchronous, no DB). If the
  //    global token matches, echo the challenge exactly as before.
  if (env.verifyToken) {
    const result = verifyWhatsAppWebhook({ mode, token, challenge, verifyToken: env.verifyToken });
    if (result !== null) {
      // Meta expects the raw challenge string echoed back as text/plain.
      return new NextResponse(result, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  }

  // 2. PER-TENANT verify token (multi-app, additive). Meta's verify handshake
  //    carries NO phone_number_id, so we accept the challenge when the token
  //    matches ANY active tenant's wa_verify_token (e.g. BLaban/Kivo's
  //    'kivo-blaban-1988'). Verification only proves we control the endpoint; the
  //    real per-tenant security is the POST signature + phone_number_id routing.
  if (mode === "subscribe" && token) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("restaurants")
        .select("id")
        .eq("wa_verify_token", token)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (data) {
        return new NextResponse(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
      }
    }
  }

  // 3. Nothing configured at all → keep the helpful dev response; otherwise 403.
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

  // Parse the payload up front: we need the inbound phone_number_id to choose the
  // RIGHT signing secret — a per-tenant Meta app (e.g. BLaban/Kivo) signs with its
  // OWN app secret, distinct from the global one (Wesaya/MaitreAI).
  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();
  const phoneNumberId = extractInboundPhoneNumberId(payload);
  // Resolve the tenant ONCE here (reused for routing below). Null when this number
  // isn't stored per-tenant → the global env path applies (Wesaya, unchanged).
  const tenant = admin ? await resolveWebhookTenant(admin, phoneNumberId) : null;

  // Signature: accept if X-Hub-Signature-256 matches EITHER the global app secret
  // (unchanged Wesaya path, tried first) OR the resolving tenant's OWN app secret
  // (per-tenant Meta app). Reject 401 only if a secret applies and none match. The
  // local-dev escape hatch (WHATSAPP_SKIP_SIGNATURE=true) is honored ONLY outside
  // production — in prod the signature is enforced no matter what that var says.
  const skipSig =
    process.env.NODE_ENV !== "production" &&
    (process.env.WHATSAPP_SKIP_SIGNATURE ?? "").trim().toLowerCase() === "true";
  const sigSecrets = [env.appSecret, tenant?.env.appSecret].filter((s): s is string => !!s && s.length > 0);
  if (!skipSig) {
    if (sigSecrets.length > 0) {
      const okSig =
        !!sig &&
        sigSecrets.some((secret) => {
          const comp = "sha256=" + createHmac("sha256", secret).update(rawBuf).digest("hex");
          return sig.length === comp.length && timingSafeEqual(Buffer.from(sig), Buffer.from(comp));
        });
      if (!okSig) {
        return NextResponse.json({ ok: false, message: "invalid signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      // No signing secret configured for this context → fail closed in production.
      // Without this guard any unsigned POST would be processed as legitimate.
      console.warn("[whatsapp:webhook] no_app_secret_configured", {
        phoneNumberId: phoneNumberId ?? null,
        tenantResolved: tenant?.restaurantId ?? null,
      });
      return NextResponse.json({ ok: false, message: "webhook signing not configured" }, { status: 503 });
    }
    // dev/test with no secret → permissive pass-through (unchanged local behavior)
  }

  const messages = normalizeWhatsAppInbound(payload);

  // Persist to Supabase when configured (idempotent on channel_message_id);
  // otherwise fall back to console logging (test mode).
  let persisted = 0;
  let deduped = 0;
  let responded = 0;
  let persistFailed = 0;
  let resolvedBy: "phone_number_id" | "env_fallback" = "env_fallback";
  if (admin && messages.length > 0) {
    // Strict per-tenant routing. Three cases:
    // 1. tenant resolved by phone_number_id → use its creds (multi-tenant path)
    // 2. phone_number_id present but NO tenant matched → drop cleanly (200, no
    //    persist, no reply). Never fall back to a different restaurant's creds.
    // 3. NO phone_number_id at all → env fallback (legacy single-tenant path)
    let restaurantId: string | null;
    let perTenantEnv: WhatsAppEnv | null;
    if (tenant) {
      restaurantId = tenant.restaurantId;
      perTenantEnv = tenant.env;
      resolvedBy = "phone_number_id";
    } else if (phoneNumberId) {
      console.warn("[whatsapp:webhook] unresolved_phone_number_id", {
        phoneNumberId,
        messageCount: messages.length,
        action: "dropped",
      });
      return NextResponse.json({
        ok: true,
        received: messages.length,
        dropped: true,
        reason: "unresolved_phone_number_id",
      });
    } else {
      restaurantId = await resolveWebhookRestaurantId(admin);
      perTenantEnv = null;
      resolvedBy = "env_fallback";
    }

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
          // Track the failure — do NOT swallow. The response gate below will
          // return 5xx so Meta redelivers. Redelivery is safe: the dedup on
          // channel_message_id (messages.ts upsert ignoreDuplicates) means any
          // already-persisted message in the same batch becomes inserted=false
          // and is never added to toAnswer → agent never fires twice.
          persistFailed++;
          // Critical-failure alert: console banner + email (best-effort, never throws).
          await recordCriticalAlert(admin, {
            restaurantId,
            type: "inbound_persist_failed",
            detail: e instanceof Error ? e.message : String(e),
            context: { from: m.from },
          });
        }
      }

      // Run the Brain once per touched conversation and send the reply over
      // WhatsApp. Synchronous (well within Meta's webhook timeout); failures are
      // caught so we always return 200 and Meta never re-queues our LLM errors.
      //
      // Pillar 3 (conversation serialization): wrap each Brain turn in a
      // per-conversation advisory lock so rapid successive messages from the same
      // customer are processed strictly one-after-another, not concurrently.
      // Messages for different conversations still run in parallel (no global
      // serialization). The lock degrades gracefully (never drops a message).
      for (const conversationId of toAnswer) {
        try {
          const res = await withConversationLock(admin, conversationId, async () =>
            respondAndSendWhatsApp(admin, restaurantId, conversationId)
          );
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

  // If any inbound message failed to persist, return 5xx so Meta redelivers
  // the entire batch. Already-persisted messages in the batch are safe:
  // channel_message_id dedup (ignoreDuplicates upsert in persistInboundMessage)
  // returns inserted=false, which gates toAnswer, which gates the agent — so
  // no message is stored twice and no agent turn fires twice.
  if (persistFailed > 0) {
    return NextResponse.json(
      { ok: false, error: "persist_failed", failed: persistFailed, persisted, deduped },
      { status: 500 }
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
