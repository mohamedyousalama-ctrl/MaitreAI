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
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { downloadWhatsAppMedia, extractInboundPhoneNumberId, markWhatsAppRead, normalizeWhatsAppImages, normalizeWhatsAppInbound, normalizeWhatsAppLocations, normalizeWhatsAppStatuses, verifyWhatsAppWebhook } from "@/lib/messaging/adapters/whatsapp";
import { describeInboundImage } from "@/lib/ai/image-perception";
import { IMAGE_PLACEHOLDER } from "@/lib/messaging/image-turn";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { isWhatsAppConfigured, readWhatsAppEnv, type WhatsAppEnv } from "@/lib/messaging/config";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistInboundMessage } from "@/lib/db/messages";
import { resolveWebhookAlertRestaurantId, resolveWebhookRestaurantId, resolveWebhookTenant } from "@/lib/db/restaurants";
import { decideWebhookRouting } from "@/lib/messaging/webhook-routing";
import { respondAndSendWhatsApp } from "@/lib/messaging/respond-and-send";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { withConversationLock } from "@/lib/db/conversation-lock";
import { loadStaffNumbers, handleStaffCommand } from "@/lib/staff/command-channel";
import { normalizePhone } from "@/lib/messaging/phone";
import { transcribeWhatsAppVoice, VOICE_STT_UNAVAILABLE_TRANSCRIPT } from "@/lib/messaging/voice";
import { expectedAnswerClass, CLASS_PRIORITY_TERMS } from "@/lib/ai/voice-aliases";
import { garbledVoiceReply } from "@/lib/ai/voice-quality";
import { isMockSttProductionError, mockSttAllowed, resolveSttAdapterName } from "@/lib/ai/stt";
import { recordCriticalAlert } from "@/lib/alerts/record";
import { recordWebhookAnomaly } from "@/lib/monitoring/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A TIMEOUT HERE IS NOT A DROPPED TURN, IT IS A REPEATED BILL.
//
// This handler transcribes and answers INLINE, inside the message loop, before returning
// 200 to Meta — and it carried no maxDuration at all, so it ran on the platform default
// while app/api/demo/voice/route.ts (the same brain, the same STT) explicitly sets 60 for
// exactly this reason. A voice note is an STT round trip plus a perception call plus model
// calls over a ~17k-token prompt; when that runs past the ceiling Meta redelivers the whole
// batch, every audio message is transcribed AGAIN, and the second bill is written nowhere:
// transcription happens before `persistInboundMessage`, and the agent_runs insert is inside
// `if (r.inserted)` — which is false on a redelivery. So the one failure mode that spends
// twice is the one the spend monitor cannot see.
//
// The empty-transcript rescue (lib/ai/stt/fallback.ts) adds a bounded 4s to that worst case,
// which is what made an already-latent ceiling worth fixing rather than noting.
export const maxDuration = 60;

// V1-pii — never write raw customer PII (phone, name, message content) to logs.
// Mask a phone to its last 4 digits so a log line is still useful for debugging
// (which sender, roughly) without storing identifying data. Empty → "unknown".
function maskPhone(p: string | undefined | null): string {
  const s = (p ?? "").replace(/\D/g, "");
  return s.length >= 4 ? `…${s.slice(-4)}` : "unknown";
}

function voiceFallbackDialect(country: string | null): "egyptian" | "saudi" {
  return country === "EG" ? "egyptian" : "saudi";
}

function sttErrorDetail(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message.slice(0, 240) };
  return { name: typeof error, message: String(error).slice(0, 240) };
}

async function recordVoiceSttUnavailableIncident(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId?: string | null;
    adapterName: string;
    from: string;
    messageId?: string | null;
    error: unknown;
  }
): Promise<void> {
  const detail = sttErrorDetail(args.error);
  const context = {
    adapterName: args.adapterName,
    from: maskPhone(args.from),
    messageId: args.messageId ?? null,
    errorName: detail.name,
    errorMessage: detail.message,
    mockBlocked: isMockSttProductionError(args.error),
  };
  console.error("[whatsapp:webhook] CRITICAL voice_stt_unavailable", context);
  await recordCriticalAlert(admin, {
    restaurantId: args.restaurantId,
    conversationId: args.conversationId ?? null,
    type: "voice_stt_unavailable",
    detail: "Production voice STT unavailable; sent deterministic voice-retry fallback.",
    context,
  });
}

async function sendVoiceSttUnavailableFallback(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    to: string;
    lastInboundAtMs: number;
    country: string | null;
  }
): Promise<void> {
  const reply = garbledVoiceReply(voiceFallbackDialect(args.country));
  const send = await sendWhatsAppText({ to: args.to, text: reply, lastInboundAtMs: args.lastInboundAtMs });
  await admin.from("messages").insert({
    restaurant_id: args.restaurantId,
    conversation_id: args.conversationId,
    direction: "outbound",
    sender: "ai",
    text: reply,
    channel_message_id: send.externalMessageId ?? null,
    status: send.status === "sent" ? "sent" : send.status === "skipped" ? "sent" : "failed",
    meta: {
      kind: "voice_stt_unavailable_fallback",
      send_status: send.status,
      window_state: send.windowState,
      attempts: send.attempts,
    },
  });
  if (send.status === "failed") {
    await recordCriticalAlert(admin, {
      restaurantId: args.restaurantId,
      conversationId: args.conversationId,
      type: "whatsapp_send_failed",
      detail: send.error ?? "voice STT fallback send failed",
      context: { kind: "voice_stt_unavailable_fallback", windowState: send.windowState, attempts: send.attempts },
    });
  }
}

type TenantResolutionSurface = "inbound" | "status";

async function failClosedTenantResolution(
  admin: SupabaseClient,
  args: {
    surface: TenantResolutionSurface;
    phoneNumberId: string | null;
    messageCount?: number;
    statusCount?: number;
  }
) {
  const alertRestaurantId = resolveWebhookAlertRestaurantId();
  const context = {
    surface: args.surface,
    phoneNumberId: args.phoneNumberId,
    messageCount: args.messageCount ?? 0,
    statusCount: args.statusCount ?? 0,
    nodeEnv: process.env.NODE_ENV ?? null,
    hasWhatsAppRestaurantId: !!(process.env.WHATSAPP_RESTAURANT_ID ?? "").trim(),
    hasAlertPlatformRestaurantId: !!(process.env.ALERT_PLATFORM_RESTAURANT_ID ?? "").trim(),
  };
  const detail = "WhatsApp webhook tenant resolution failed: env fallback has no explicit restaurant id.";

  if (!alertRestaurantId) {
    console.error(
      "[whatsapp:webhook] CRITICAL tenant_resolution_failed: WHATSAPP_RESTAURANT_ID and ALERT_PLATFORM_RESTAURANT_ID are unset; failing closed without system_alerts insert",
      context
    );
  } else {
    console.error("[whatsapp:webhook] CRITICAL tenant_resolution_failed: failing closed", context);
    await recordCriticalAlert(admin, {
      restaurantId: alertRestaurantId,
      type: "webhook_tenant_resolution_failed",
      detail,
      context,
    });
  }

  return NextResponse.json({ ok: false, error: "tenant_resolution_failed" }, { status: 503 });
}

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
        // WO-MONITORING-ALERTING (1b) — ledger the 401 so the sweep can detect a
        // signature-break SPIKE (the exact incident). Fire-and-forget, never blocks.
        void recordWebhookAnomaly(admin, "invalid_signature", { phoneNumberId, restaurantId: tenant?.restaurantId ?? null });
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

  // WO-LIVE-3 §6 — a webhook can carry ONLY location pins or ONLY images (Meta delivers
  // each message as its own webhook), which normalizeWhatsAppInbound discards → text-less.
  // The inbound-handling block below must still run for those so the tenant is resolved,
  // flags are loaded, and the flag-gated location/image ingest branches (+ Brain loop)
  // execute — otherwise both branches are unreachable in production (the live bug: a
  // Wesaya pin returned 200 OK but never produced a location row or a zone_miss). The
  // `messages.length > 0` term is kept FIRST so the text/voice path short-circuits and is
  // byte-identical (the location/image normalizers only run for a text-less webhook).
  const hasInboundToHandle =
    messages.length > 0 ||
    normalizeWhatsAppLocations(payload).length > 0 ||
    normalizeWhatsAppImages(payload).length > 0;

  // Persist to Supabase when configured (idempotent on channel_message_id);
  // otherwise fall back to console logging (test mode).
  let persisted = 0;
  let deduped = 0;
  let responded = 0;
  let persistFailed = 0;
  let statusUpdated = 0;
  let resolvedBy: "phone_number_id" | "env_fallback" = "env_fallback";
  if (admin && hasInboundToHandle) {
    // Strict per-tenant routing (decideWebhookRouting — pure, unit-tested):
    // 1. tenant resolved by phone_number_id → use its creds (multi-tenant path)
    // 2. phone_number_id === the configured GLOBAL WHATSAPP_PHONE_NUMBER_ID, or NO
    //    phone_number_id at all → env fallback (legacy single-tenant path, e.g. Wesaya).
    //    The globally-configured number is a valid target, NOT a drop.
    // 3. any OTHER unmapped phone_number_id → drop cleanly (200, no persist, no reply).
    //    Never serve an unknown number from another tenant's / the global creds.
    const globalPnid = readWhatsAppEnv().phoneNumberId;
    const routing = decideWebhookRouting(!!tenant, phoneNumberId, globalPnid);
    let restaurantId: string | null;
    let perTenantEnv: WhatsAppEnv | null;
    if (routing === "per_tenant" && tenant) {
      restaurantId = tenant.restaurantId;
      perTenantEnv = tenant.env;
      resolvedBy = "phone_number_id";
    } else if (routing === "drop") {
      console.warn("[whatsapp:webhook] unresolved_phone_number_id", {
        phoneNumberId,
        messageCount: messages.length,
        action: "dropped",
      });
      // WO-MONITORING-ALERTING (1b) — ledger the drop so the sweep can detect a
      // spike of inbound going to an unrouted number. Fire-and-forget, never blocks.
      void recordWebhookAnomaly(admin, "unresolved_phone_number_id", { phoneNumberId });
      return NextResponse.json({
        ok: true,
        received: messages.length,
        dropped: true,
        reason: "unresolved_phone_number_id",
      });
    } else {
      restaurantId = await resolveWebhookRestaurantId(admin);
      if (!restaurantId) {
        return await failClosedTenantResolution(admin, { surface: "inbound", phoneNumberId, messageCount: messages.length });
      }
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
      // Read the tenant's flags ONCE — shared by the WO-2 staff channel and the
      // cadence indicator below (one read, as before; +country for phone matching).
      const { data: rRow } = await admin.from("restaurants").select("feature_flags, country").eq("id", restaurantId).single();
      const flags = (rRow?.feature_flags as Record<string, unknown> | null) ?? null;
      const tenantCountry = (rRow?.country as string | null) ?? null;

      // WO-2 STAFF COMMAND CHANNEL — a SECOND lane with absolute supremacy over the
      // customer lane. FIRST statement is the flag gate: OFF → this whole branch is
      // skipped, no staff query, no partition → the webhook is byte-equivalent to
      // today. ON → a message from a REGISTERED staff number is diverted to the
      // deterministic command handler and NEVER enters the customer lane (no persist,
      // no conversation, no Brain). A staff command's only effects are its own.
      let isStaffMsg: (m: { from?: string | null }) => boolean = () => false;
      if (isFeatureExplicitlyEnabled("staff_command_channel", flags)) {
        try {
          const staff = await loadStaffNumbers(admin, restaurantId, tenantCountry);
          if (staff.size > 0) {
            isStaffMsg = (m) => staff.has(normalizePhone(m.from ?? "", tenantCountry));
            for (const m of messages) {
              const row = staff.get(normalizePhone(m.from ?? "", tenantCountry));
              if (row) await handleStaffCommand(admin, restaurantId, row, m.text ?? "", m.from ?? "");
            }
          }
        } catch (e) {
          console.error("[whatsapp:webhook] staff command channel error (non-blocking)", e);
        }
      }

      try {
        if (isFeatureExplicitlyEnabled("cadence", flags)) {
          const typing = String(flags?.cadence_level ?? "balanced") !== "fast";
          await Promise.all(
            messages.filter((m) => m.externalMessageId && !isStaffMsg(m)).map((m) => markWhatsAppRead(m.externalMessageId as string, { typing }))
          );
        }
      } catch (e) {
        console.error("[whatsapp:webhook] cadence read/typing error (non-blocking)", e);
      }

      // Persist first (dedupe on redelivery), collecting NEW conversations to answer.
      // WO-VOICE-QUALITY (b) — when this batch carries a voice note to transcribe, load
      // the tenant's menu item names ONCE to seed the STT prompt bias (item names are the
      // words most likely to be garbled). Names-only select; best-effort (no bias on fail).
      let sttMenuNames: string[] = [];
      // WO-VOICE-ALIASES — state-aware STT prompt bias: the expected answer-class words when
      // the LAST AI turn asked for a quantity/size/sauce. Best-effort (no bias on failure).
      let sttPriorityTerms: string[] = [];
      const resolvedSttAdapterName = resolveSttAdapterName();
      if (messages.some((m) => m.audioId && !m.text) && (resolvedSttAdapterName !== "mock" || mockSttAllowed())) {
        try {
          const { data: mi } = await admin.from("menu_items").select("name").eq("restaurant_id", restaurantId).limit(200);
          sttMenuNames = ((mi ?? []) as Array<{ name?: string | null }>).map((r) => r.name ?? "").filter(Boolean);
        } catch { /* best-effort — no prompt bias on failure */ }
        try {
          const senderPhone = normalizePhone(messages.find((m) => m.audioId && !m.text)?.from ?? "");
          const { data: cust } = senderPhone
            ? await admin.from("customers").select("id").eq("restaurant_id", restaurantId).eq("phone", senderPhone).maybeSingle()
            : { data: null };
          const custId = (cust as { id?: string } | null)?.id;
          if (custId) {
            const { data: convs } = await admin.from("conversations").select("id").eq("restaurant_id", restaurantId).eq("customer_id", custId).order("updated_at", { ascending: false }).limit(1);
            const convId = (convs?.[0] as { id?: string } | null)?.id;
            if (convId) {
              const { data: lo } = await admin.from("messages").select("text").eq("conversation_id", convId).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1);
              const cls = expectedAnswerClass((lo?.[0] as { text?: string } | null)?.text ?? "");
              if (cls) sttPriorityTerms = CLASS_PRIORITY_TERMS[cls];
            }
          }
        } catch { /* best-effort — no state bias on failure */ }
      }

      const toAnswer = new Set<string>();
      for (const m of messages) {
        // SUPREMACY: a staff-lane message NEVER enters the customer lane — no
        // persist, no conversation row, no Brain. (Skipped only when the flag is
        // on AND the number is registered; otherwise isStaffMsg is always false.)
        if (isStaffMsg(m)) continue;
        try {
          // S9-6: a voice note is transcribed BEFORE persisting, so the transcript
          // IS the stored message text — the operator sees exactly what the AI heard.
          let stt: { adapter: string; model: string; costUsd: number } | null = null;
          let sttUnavailable = false;
          let sttUnavailableError: unknown = null;
          if (m.audioId && !m.text) {
            try {
              const t = await transcribeWhatsAppVoice(m.audioId, m.audioMime, sttMenuNames, sttPriorityTerms);
              m.text = t.text || "[رسالة صوتية — تعذّر التفريغ]";
              // WO-VOICE-1: keep the STT provenance so the audio ref + confidence land
              // in messages.meta and the fail-closed net's secondary tripwire can read
              // the confidence downstream.
              m.sttModel = t.model;
              if (typeof t.confidence === "number") m.sttConfidence = t.confidence;
              stt = { adapter: t.adapter, model: t.model, costUsd: t.costUsd };
            } catch (e) {
              if (process.env.NODE_ENV !== "production") throw e;
              sttUnavailable = true;
              sttUnavailableError = e;
              m.text = VOICE_STT_UNAVAILABLE_TRANSCRIPT;
            }
          }
          const r = await persistInboundMessage(admin, restaurantId, m);
          if (r.inserted) {
            persisted++;
            if (r.conversationId) {
              if (sttUnavailable) {
                await recordVoiceSttUnavailableIncident(admin, {
                  restaurantId,
                  conversationId: r.conversationId,
                  adapterName: resolvedSttAdapterName,
                  from: m.from,
                  messageId: m.externalMessageId ?? null,
                  error: sttUnavailableError,
                });
                await sendVoiceSttUnavailableFallback(admin, {
                  restaurantId,
                  conversationId: r.conversationId,
                  to: m.from,
                  lastInboundAtMs: m.timestamp,
                  country: tenantCountry,
                });
              } else {
                toAnswer.add(r.conversationId);
              }
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

      // WO-DELIVERY-D1 — INBOUND LOCATION PINS (delivery_geo_routing). FIRST statement
      // is the flag gate: OFF → this whole branch is skipped, no location is parsed or
      // persisted, so a location message is dropped exactly as it is today (the main
      // normalizer already discards it) → the webhook is byte-equivalent to before.
      // ON → each pin is persisted as a customer message carrying meta.location, so the
      // Brain turn (respond-and-send → runCustomerTurn) routes it to a zone + branch.
      if (isFeatureExplicitlyEnabled("delivery_geo_routing", flags)) {
        try {
          const locations = normalizeWhatsAppLocations(payload);
          for (const loc of locations) {
            // A staff-number pin never enters the customer lane (mirrors the message loop).
            if (isStaffMsg({ from: loc.from })) continue;
            try {
              const r = await persistInboundMessage(admin, restaurantId, {
                channel: "whatsapp",
                externalMessageId: loc.externalMessageId,
                from: loc.from,
                customerName: loc.customerName,
                text: "📍",
                location: { lat: loc.lat, lng: loc.lng, name: loc.name, address: loc.address },
                timestamp: loc.timestamp,
              });
              if (r.inserted) {
                persisted++;
                if (r.conversationId) toAnswer.add(r.conversationId);
              } else {
                deduped++;
              }
            } catch (e) {
              console.error("[whatsapp:webhook] location persist error", e);
              persistFailed++;
              await recordCriticalAlert(admin, {
                restaurantId,
                type: "inbound_persist_failed",
                detail: e instanceof Error ? e.message : String(e),
                context: { from: loc.from, kind: "location" },
              });
            }
          }
        } catch (e) {
          console.error("[whatsapp:webhook] location ingest error (non-blocking)", e);
        }
      }

      // WO-MEDIA-INBOUND — INBOUND IMAGES (media_turn_trigger). FIRST statement is the
      // flag gate: OFF → this whole branch is skipped, no image is parsed/persisted, so
      // an image message is dropped exactly as today (the main normalizer discards it) →
      // the webhook is byte-identical to before. ON → each image is persisted as a
      // customer message: the caption (the customer's words) becomes the turn text AND
      // the deterministic allergen-gate input; a one-shot Haiku vision READ is stamped
      // into meta.image.description (provenance-marked, derived:true — NEVER gate input);
      // and the conversation is queued so the Brain turn engages with the image instead
      // of 45 minutes of silence. The vision read is best-effort: a failure/timeout still
      // fires the turn (Karim warmly asks what's needed) — never silence.
      if (isFeatureExplicitlyEnabled("media_turn_trigger", flags)) {
        try {
          const images = normalizeWhatsAppImages(payload);
          for (const img of images) {
            // A staff-number image never enters the customer lane (mirrors the loop above).
            if (isStaffMsg({ from: img.from })) continue;
            try {
              let description: string | null = null;
              let imgRead: { model: string; costUsd: number } | null = null;
              try {
                const media = await downloadWhatsAppMedia(img.imageId);
                if (media) {
                  const read = await describeInboundImage({ bytes: media.bytes, mime: media.mime, caption: img.caption });
                  if (read) {
                    description = read.description;
                    imgRead = { model: read.model, costUsd: read.costUsd };
                  }
                }
              } catch (e) {
                // Vision read must never block or silence the turn — swallow + fall back.
                console.error("[whatsapp:webhook] image vision read error (non-blocking)", e);
              }
              const r = await persistInboundMessage(admin, restaurantId, {
                channel: "whatsapp",
                externalMessageId: img.externalMessageId,
                from: img.from,
                customerName: img.customerName,
                // The customer's caption is their own words → the turn text + allergen-
                // gate input. No caption → benign 📷 placeholder, so the gate can never
                // fire on the image itself (a derived allergen word never reaches it).
                text: img.caption && img.caption.trim() ? img.caption.trim() : IMAGE_PLACEHOLDER,
                image: { id: img.imageId, mime: img.mime, caption: img.caption, description },
                timestamp: img.timestamp,
              });
              if (r.inserted) {
                persisted++;
                if (r.conversationId) {
                  toAnswer.add(r.conversationId);
                  // Log the vision-read cost to agent_runs (like STT/LLM) when a real read ran.
                  if (imgRead) {
                    await admin.from("agent_runs").insert({
                      restaurant_id: restaurantId,
                      conversation_id: r.conversationId,
                      trigger: "image_perception",
                      input: "[inbound image]",
                      output: description,
                      model: imgRead.model,
                      adapter: "claude",
                      cost_usd: imgRead.costUsd,
                    });
                  }
                }
              } else {
                deduped++;
              }
            } catch (e) {
              console.error("[whatsapp:webhook] image persist error", e);
              persistFailed++;
              await recordCriticalAlert(admin, {
                restaurantId,
                type: "inbound_persist_failed",
                detail: e instanceof Error ? e.message : String(e),
                context: { from: img.from, kind: "image" },
              });
            }
          }
        } catch (e) {
          console.error("[whatsapp:webhook] image ingest error (non-blocking)", e);
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
    // V1-pii — REDACTED test-mode log: no raw phone/name/message content. Log the
    // masked sender, the message kind, and the text LENGTH only — enough to debug
    // "a text message from …6312 arrived" without persisting PII to logs.
    console.log(
      `[whatsapp:webhook] received ${messages.length} message(s) (test mode, not persisted)`,
      messages.map((m) => ({
        from: maskPhone(m.from),
        kind: m.audioId ? "voice" : m.interactiveId ? "interactive" : "text",
        textLen: m.text?.length ?? 0,
      }))
    );
  }

  // T3 — ingest OUTBOUND delivery-status callbacks (sent/delivered/read/failed).
  // Meta sends these in statuses[], separately from messages[] (a webhook may carry
  // either or both). We match each by the wamid we stored on the outbound row
  // (channel_message_id) and update messages.status, so "sent" is CONFIRMED, not
  // assumed, and a failed delivery is visible. Runs AFTER + independently of inbound
  // processing (never blocks it); the whole block fails quietly.
  if (admin) {
    try {
      const statuses = normalizeWhatsAppStatuses(payload);
      if (statuses.length > 0) {
        // Tenant scope mirrors inbound (same decideWebhookRouting rule): the
        // phone_number_id tenant, else env fallback when there's no PNID OR it's the
        // configured global number; any other unmapped PNID is skipped (can't scope safely).
        let statusRid = tenant?.restaurantId ?? null;
        if (!statusRid && decideWebhookRouting(false, phoneNumberId, readWhatsAppEnv().phoneNumberId) === "env_fallback") {
          statusRid = await resolveWebhookRestaurantId(admin);
          if (!statusRid) {
            return await failClosedTenantResolution(admin, { surface: "status", phoneNumberId, statusCount: statuses.length });
          }
        }
        if (statusRid) {
          for (const s of statuses) {
            try {
              if (s.status === "failed") {
                // Set failed only on a real transition (not already read/failed) so a
                // webhook RETRY doesn't re-alert. A failed delivery = the customer did
                // NOT receive it → record a Phase-Q alert with the reason.
                const { data: rows } = await admin
                  .from("messages")
                  .update({ status: "failed" })
                  .eq("restaurant_id", statusRid)
                  .eq("direction", "outbound")
                  .eq("channel_message_id", s.messageId)
                  .not("status", "in", "(read,failed)")
                  .select("id, conversation_id");
                if (rows && rows.length > 0) {
                  statusUpdated += rows.length;
                  await recordCriticalAlert(admin, {
                    type: "whatsapp_send_failed",
                    restaurantId: statusRid,
                    conversationId: (rows[0] as { conversation_id?: string | null }).conversation_id ?? null,
                    detail: `فشل توصيل رسالة واتساب: ${s.error ?? "سبب غير معروف"}`,
                  });
                }
              } else {
                // Advance-only (never downgrade): delivered←sent, read←sent/delivered,
                // sent←sending. Unknown status string → skip. Unknown wamid → 0 rows.
                const allowedFrom =
                  s.status === "read" ? ["sent", "delivered"]
                  : s.status === "delivered" ? ["sent"]
                  : s.status === "sent" ? ["sending"]
                  : null;
                if (!allowedFrom) continue;
                const { data: rows } = await admin
                  .from("messages")
                  .update({ status: s.status })
                  .eq("restaurant_id", statusRid)
                  .eq("direction", "outbound")
                  .eq("channel_message_id", s.messageId)
                  .in("status", allowedFrom)
                  .select("id");
                if (rows) statusUpdated += rows.length;
              }
            } catch (e) {
              console.warn("[whatsapp:webhook] status update error (non-blocking)", e);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[whatsapp:webhook] statuses parse error (non-blocking)", e);
    }
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
    statusUpdated,
    resolvedBy,
  });
}
