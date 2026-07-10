// ============================================================================
// MaitreAI — Inbound → Brain → WhatsApp bridge (Sprint 9, S9-1) — SERVER ONLY
// The keystone: after the webhook has persisted an inbound message, run the
// Customer Agent (same shared path as /api/agent/respond) and put the reply on
// the WhatsApp wire. Honors takeover (a human-owned conversation is left alone),
// the 24h window, and surfaces every send failure to the conversation timeline
// so nothing is ever silently dropped.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCustomerTurn, CustomerTurnError } from "@/lib/ai/customer-turn";
import { routeInteractive } from "@/lib/messaging/interactive-router";
import { evaluateTesterAllowlist } from "@/lib/messaging/tester-allowlist";
import { modeAllowsAgentReply, type SystemMode } from "@/lib/ai/modes";
import { sendWhatsAppText, sendWhatsAppInteractive, sendWhatsAppImageLink, sendWhatsAppAudio } from "./outbound";
import { decideVoiceSend, voiceHardZeroReason, voiceNotesPerDay } from "./voice-budget";
import { shouldOfferVoiceReply } from "@/lib/ai/voice-reply-trigger";
import { synthesizeVoiceReply } from "@/lib/ai/tts";
import { buildPhotoThreadCaptions } from "./photo-thread";
import { decideMediaSend, CONVERSATION_MEDIA_BUDGET, type MediaZeroReason } from "./media-guard";
import { isSafetyHeld } from "@/lib/db/safety-hold";
import { appBaseUrl } from "@/lib/db/delivery";
import { persistOrderFromDraft } from "@/lib/db/orders-create";
import { readHandoffConfig, isSafetyHold, isIdleBeyond } from "@/lib/tenant/handoff";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { emitConversationReport } from "@/lib/intelligence/conversation-report";
import { ensureDeliveryRowForOrder } from "@/lib/db/delivery";
import { resolveMemberNames } from "@/lib/db/member-names";
import { sendReceiptToCustomer } from "./send-receipt";
import { setOwnershipState } from "@/lib/db/ownership";
import { checkAndNotifyStuck } from "@/lib/intelligence/stuck-detection";
import { recordCriticalAlert } from "@/lib/alerts/record";
import type { LlmMessage } from "@/lib/ai/llm/types";

export type RespondAndSendStatus =
  | "responded"
  | "skipped_takeover"
  | "skipped_mode"
  | "skipped_not_allowlisted"
  | "skipped_no_customer_msg"
  | "skipped_not_found"
  | "send_failed"
  | "agent_error"
  | "deduped";

export interface RespondAndSendResult {
  status: RespondAndSendStatus;
  reply?: string;
  escalate?: boolean;
  sendStatus?: string;
  error?: string;
}

interface PersistedDraftOrder {
  created: boolean;
  orderId: string | null;
  orderNumber: string | null;
}

/** Insert a system note into the conversation timeline (operator-visible). */
async function noteToTimeline(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  text: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  await admin.from("messages").insert({
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "system",
    text,
    status: "sent",
    meta,
  });
}

/** HANDOFF-HARDENING (Fix 1) — nudge the team that a human-owned conversation has
 *  gone idle while the customer is still messaging. Operator-facing only (never
 *  sent to the customer). Deduped to at most one alert per idle window so a
 *  customer pinging repeatedly doesn't spam the timeline. Safety holds get a
 *  louder, "do not auto-return" alert. Does NOT touch updated_at (the wait/SLA
 *  clock stays truthful about how long the customer has actually waited). */
async function realertOperator(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  idleMinutes: number,
  safety: boolean
): Promise<void> {
  const sinceIso = new Date(Date.now() - idleMinutes * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("meta")
    .eq("conversation_id", conversationId)
    .eq("sender", "system")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5);
  const alreadyAlerted = (recent ?? []).some((m) => (m.meta as Record<string, unknown> | null)?.kind === "handoff_idle_alert");
  if (alreadyAlerted) return;
  const text = safety
    ? "⏰🔒 العميل لسه مستني — دي محادثة سلامة/حساسية محوّلة لموظف ومحتاجة متابعة بشرية. (لا تُعاد للمساعد تلقائياً.)"
    : "⏰ العميل لسه مستني ردك — برجاء المتابعة.";
  await noteToTimeline(admin, restaurantId, conversationId, text, { kind: "handoff_idle_alert", safety });
}

/** Send the full web-menu link once — the budget-exhaustion fallback (browse the
 *  menu with photos on the web instead of the bot sending more images). */
async function sendMenuLinkFallback(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  phone: string,
  lastInboundAtMs: number
): Promise<void> {
  const { data: r } = await admin.from("restaurants").select("slug").eq("id", restaurantId).maybeSingle();
  const slug = (r as { slug?: string | null } | null)?.slug ?? null;
  const url = slug ? `${appBaseUrl()}/order/${slug}` : appBaseUrl();
  const text = `تقدر تتصفّح المنيو كامل بالصور من هنا 👇\n${url}`;
  const send = await sendWhatsAppText({ to: phone, text, lastInboundAtMs });
  await admin.from("messages").insert({
    restaurant_id: restaurantId,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "ai",
    text,
    // "skipped" = test mode (no creds): the reply is persisted, just not transmitted.
    status: send.status === "failed" ? "failed" : "sent",
    channel_message_id: send.externalMessageId ?? null,
    meta: { kind: "media_budget_menu_link" },
  });
}

/** WO-MONITORING-ALERTING (Part 2) — polite Arabic fallback sent to the CUSTOMER
 *  when the Brain turn fails (API error/timeout). Before this, the thread was
 *  flagged for staff + alerted, but the customer got SILENCE. Now they get a short
 *  honest wait message; the thread is still handed to a human and the failure still
 *  counts toward the Part-1c error-rate alert. NEVER a raw error to the customer.
 *  Best-effort: any failure here is swallowed so it can't mask the original error. */
function agentErrorFallbackText(dialect: string | null | undefined): string {
  return dialect === "egyptian"
    ? "لحظة من فضلك 🙏 حيتواصل معاك أحد الموظفين حالاً."
    : "لحظة من فضلك 🙏 يتواصل معك أحد الموظفين حالاً.";
}

async function sendAgentErrorFallbackToCustomer(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  phone: string,
  lastInboundAtMs: number
): Promise<void> {
  try {
    if (!phone) return;
    const { data: r } = await admin.from("restaurants").select("dialect").eq("id", restaurantId).maybeSingle();
    const text = agentErrorFallbackText((r as { dialect?: string | null } | null)?.dialect);
    const send = await sendWhatsAppText({ to: phone, text, lastInboundAtMs });
    await admin.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "ai",
      text,
      status: send.status === "failed" ? "failed" : "sent",
      channel_message_id: send.externalMessageId ?? null,
      meta: { kind: "agent_error_fallback" },
    });
  } catch (e) {
    console.error("[respond-and-send] agent-error fallback send failed (swallowed)", e);
  }
}

/**
 * WO-VOICE-2 — send an ADDITIVE voice note alongside the (already-sent) text reply.
 * Deterministic gate: trigger (customer used voice / asked) → hard-zero suppression
 * (safety/money/link/receipt = text-only, ruling A) → per-conversation daily budget
 * (10/day, config-overridable, reset by date). On send: synthesize (EL flash_v2.5 →
 * onyx fallback + alert, never a silent drop), transmit, bump the daily counter, and
 * log the per-note cost to agent_runs. Deploy-safe: a missing 0077 counter column
 * (migration PREPARE-ONLY) makes the whole path inert. Best-effort — never throws.
 */
async function maybeSendVoiceNote(
  admin: SupabaseClient,
  args: {
    restaurantId: string; conversationId: string; phone: string; replyText: string;
    inboundWasVoice: boolean; userMessage: string; safetyHold: boolean; isReceipt: boolean;
    lastInboundAtMs: number;
  }
): Promise<void> {
  const triggered = shouldOfferVoiceReply({ inboundWasVoice: args.inboundWasVoice, userText: args.userMessage });

  // Deploy-safe daily-counter read: the 0077 columns are PREPARE-ONLY. A 42703 /
  // "does not exist" means the feature isn't deployed → treat as inert (do nothing).
  const today = new Date().toISOString().slice(0, 10);
  const { data: cRow, error: readErr } = await admin
    .from("conversations")
    .select("voice_notes_day, voice_notes_sent, voice_cost_usd, is_safety_hold")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (readErr) return; // column absent (not deployed) or transient → no voice, text already sent
  const row = cRow as { voice_notes_day?: string | null; voice_notes_sent?: number | null; voice_cost_usd?: number | null; is_safety_hold?: boolean | null } | null;
  // Fail-closed: fold the persisted safety-hold flag into the suppression decision
  // (a safety-held conversation is text-only even if the caller didn't flag it).
  const safetyHold = args.safetyHold || row?.is_safety_hold === true;
  const hardZeroReason = voiceHardZeroReason(args.replyText, { safetyHold, isReceipt: args.isReceipt });
  const sameDay = row?.voice_notes_day === today;
  const notesSentToday = sameDay ? Number(row?.voice_notes_sent ?? 0) : 0;
  const costSoFar = sameDay ? Number(row?.voice_cost_usd ?? 0) : 0;

  const decision = decideVoiceSend({ enabled: true, triggered, hardZeroReason, notesSentToday, cap: voiceNotesPerDay() });
  if (!decision.send) return;

  const tts = await synthesizeVoiceReply(args.replyText);
  if (!tts) return; // both primary + fallback failed → text-only (already sent)
  if (tts.fellBack) {
    void recordCriticalAlert(admin, {
      type: "voice_tts_fallback",
      restaurantId: args.restaurantId,
      conversationId: args.conversationId,
      detail: `ElevenLabs TTS failed, fell back to OpenAI onyx: ${tts.primaryError ?? "unknown"}`,
      context: { adapter: tts.result.adapter },
    });
  }

  const audioSend = await sendWhatsAppAudio({ to: args.phone, audio: tts.result.audio, mime: tts.result.mime, lastInboundAtMs: args.lastInboundAtMs });
  if (audioSend.status !== "sent") return; // transmit failed → don't bill/count

  // Bump the daily counter + accumulate cost (best-effort). Also persist a voice
  // message row + log the per-note synthesis cost to agent_runs (like STT/LLM).
  await admin.from("conversations")
    .update({ voice_notes_day: today, voice_notes_sent: notesSentToday + 1, voice_cost_usd: Number((costSoFar + tts.result.costUsd).toFixed(6)) })
    .eq("id", args.conversationId);
  await admin.from("messages").insert({
    restaurant_id: args.restaurantId,
    conversation_id: args.conversationId,
    direction: "outbound",
    sender: "ai",
    text: args.replyText,
    status: "sent",
    channel_message_id: audioSend.externalMessageId ?? null,
    meta: { kind: "voice_note", voice: true, tts_adapter: tts.result.adapter, tts_model: tts.result.model, tts_cost_usd: tts.result.costUsd },
  });
  await admin.from("agent_runs").insert({
    restaurant_id: args.restaurantId,
    conversation_id: args.conversationId,
    trigger: "voice_tts",
    input: "[voice reply]",
    output: args.replyText,
    model: tts.result.model,
    adapter: tts.result.adapter,
    cost_usd: tts.result.costUsd,
  });
}

/**
 * WO-MEDIA-GUARD — dispose of the agent's requested photos through the deterministic
 * media guard: hard-zero while safety-held / complaint-open / payment-pending; else
 * cap at 3/message within a 6/conversation budget; offer the web menu when spent.
 */
async function sendRequestedPhotos(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string,
  phone: string,
  photoRequests: { imageUrl: string; caption: string; name: string }[],
  lastInboundAtMs: number,
  conv: { ownership_state: string | null; escalation_reason: string | null },
  features: Record<string, unknown> | null
): Promise<void> {
  // FLAG GATE (standing law): the guard's caps + budget + hard-zero are a behavior
  // change, so they ship behind the explicit-only `media_guard` flag, OFF by default.
  // OFF → byte-identical legacy path: min(requested, 4) via decideMediaSend({enabled:
  // false}), and NONE of the new DB reads below run (no counter/hold/payment queries),
  // so a flag-off tenant (e.g. Wesaya) is unchanged down to the query set. Flipping the
  // safety-hold hard-zero ON for a live tenant is its own one-line proposal post-merge.
  const mediaGuardOn = isFeatureExplicitlyEnabled("media_guard", features);

  // ── Deterministic HARD-ZERO (fail-closed): never intrude media on a safety hold,
  //    an open complaint, or a pending payment. Only evaluated when the flag is ON.
  let hardZero = false;
  let hardZeroReason: MediaZeroReason | null = null;
  let imagesAlreadySent = 0;
  let counterDeployed = false;
  if (mediaGuardOn) {
    let isSafetyHoldFlag: boolean | null = null;
    {
      const { data: sh } = await admin.from("conversations").select("is_safety_hold").eq("id", conversationId).maybeSingle();
      isSafetyHoldFlag = (sh as { is_safety_hold?: boolean | null } | null)?.is_safety_hold ?? null;
    }
    if (isSafetyHeld({ ownership_state: conv.ownership_state, is_safety_hold: isSafetyHoldFlag })) {
      hardZero = true;
      hardZeroReason = "safety_hold";
    } else if (/شكو[ىي]/.test(conv.escalation_reason ?? "")) {
      // Deterministic complaint marker — the engine stamps «شكوى عميل …» as the reason.
      hardZero = true;
      hardZeroReason = "complaint_open";
    } else {
      // payment-pending: a linked order with an outstanding payment link (awaiting pay).
      const { data: pend } = await admin
        .from("orders")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("payment_status", "payment_link_sent")
        .limit(1)
        .maybeSingle();
      if ((pend as { id?: string } | null)?.id) {
        hardZero = true;
        hardZeroReason = "payment_pending";
      }
    }

    // ── Deploy-safe budget-counter read: images_sent lands with migration 0070. Until
    //    it applies, a missing-column read (42703) means "budget not deployed" → treat
    //    as 0 and skip counter writes; the 3/message cap + hard-zero still fully apply.
    counterDeployed = true;
    const { data: cRow, error: cErr } = await admin
      .from("conversations")
      .select("images_sent")
      .eq("id", conversationId)
      .maybeSingle();
    if (cErr) {
      if (cErr.code === "42703" || /does not exist/i.test(cErr.message ?? "")) {
        // Column not deployed yet (pre-0070) → budget inert; the 3/message cap +
        // hard-zero still fully apply. A KNOWN not-a-failure state, not an error.
        counterDeployed = false;
      } else {
        // TRANSIENT read failure (network / RLS / timeout) → FAIL SAFE: treat the
        // budget as fully consumed so we send NO images and offer the web menu
        // instead. NEVER fall through to 0 (= full budget), which would silently
        // un-count and over-send on a flaky read. Leave counterDeployed=false so we
        // never persist a counter computed over unknown state.
        imagesAlreadySent = CONVERSATION_MEDIA_BUDGET;
        counterDeployed = false;
      }
    } else {
      imagesAlreadySent = Number((cRow as { images_sent?: number } | null)?.images_sent ?? 0);
    }
  }

  const decision = decideMediaSend({
    enabled: mediaGuardOn,
    requested: photoRequests.length,
    imagesAlreadySent,
    hardZero,
    hardZeroReason,
  });

  if (decision.allowed === 0) {
    if (hardZero) {
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        "🚫 لم تُرسَل صور — المحادثة عليها حالة (سلامة/شكوى/دفع معلّق) تمنع إرسال الوسائط.",
        { kind: "media_suppressed", reason: hardZeroReason }
      );
    } else if (decision.fallbackToMenuLink) {
      await sendMenuLinkFallback(admin, restaurantId, conversationId, phone, lastInboundAtMs);
    }
    return;
  }

  // WO-PHOTO-THREAD — reshape ONLY the images that passed the caps into a compact
  // captioned sequence: image 0 carries a lead caption naming the set, each image
  // keeps its own name—price tag. Presentation-only — the slice (which/how many) is
  // decided above by decideMediaSend and is unchanged. GATED behind its OWN
  // photo_thread flag (default OFF), NOT media_guard: media_guard is opt-in to the
  // CAPS (a safety/cost control), never to a presentation change — a live tenant
  // must not inherit a new caption behavior via a flag enabled for another purpose.
  // photo_thread OFF → byte-identical per-image captions (existing behavior).
  const shown = photoRequests.slice(0, decision.allowed);
  const photoThreadOn = isFeatureExplicitlyEnabled("photo_thread", features);
  const captions = photoThreadOn ? buildPhotoThreadCaptions(shown) : shown.map((p) => p.caption);

  let sent = 0;
  for (let i = 0; i < shown.length; i++) {
    const photo = shown[i];
    const send = await sendWhatsAppImageLink({
      to: phone,
      imageUrl: photo.imageUrl,
      caption: captions[i],
      lastInboundAtMs,
    });
    if (send.status === "failed") {
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        `تعذّر إرسال صورة ${photo.name} عبر واتساب: ${send.error ?? "خطأ غير معروف"}.`,
        { kind: "photo_send_error", itemName: photo.name, imageUrl: photo.imageUrl, attempts: send.attempts }
      );
    } else if (send.status === "sent") {
      sent++;
    }
  }

  // Persist the conversation budget counter (best-effort; only when deployed).
  if (counterDeployed && sent > 0) {
    await admin
      .from("conversations")
      .update({ images_sent: imagesAlreadySent + sent, last_media_at: new Date().toISOString() })
      .eq("id", conversationId);
  }
}

export async function respondAndSendWhatsApp(
  admin: SupabaseClient,
  restaurantId: string,
  conversationId: string
): Promise<RespondAndSendResult> {
  // 1. Conversation + owner + recipient phone + customer id (+ the handoff clock
  //    and reason for the idle policy below).
  const { data: conv } = await admin
    .from("conversations")
    .select("id, owner, channel, customer_id, escalation_reason, updated_at, ownership_state, customers(phone)")
    .eq("id", conversationId)
    .single();
  if (!conv) return { status: "skipped_not_found", error: "conversation_not_found" };
  const customerId = (conv.customer_id as string | null) ?? null;
  const ownershipState = (conv.ownership_state as string | null) ?? null;

  // Spine Step 3 (enforcement-safe reopen): a CLOSED conversation receiving a new
  // inbound is reopened to AI_ACTIVE — the ONE legal transition out of CLOSED — before
  // the Brain turn. Without this, a downstream escalation flip (AI_ACTIVE→HUMAN_ACTIVE/
  // SYSTEM_HOLD) would start from CLOSED and the now-enforced map would throw. This is
  // exactly the documented "customer messages again, reopen" transition.
  if (ownershipState === "CLOSED") {
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط" },
    });
  }

  // Spine Step 3 (enforcement-safe hold-clearance canonicalization): when the operator
  // clears an allergy/safety hold via the UI (returnToAi in conversation-store.ts), it
  // updates `owner='ai'` AND calls setOwnershipState(SYSTEM_HOLD→AI_ACTIVE). That write
  // goes through the browser client with fire-and-forget (fire() swallows errors), so if
  // RLS or a network error silently rejects it, `owner` becomes 'ai' while
  // `ownership_state` stays 'SYSTEM_HOLD'. On the next inbound the human branch is
  // bypassed (owner='ai'), but the enforced map then throws on any transition out of
  // SYSTEM_HOLD that the Brain or error-handler tries to make. Fix: detect the mismatch
  // here and canonicalize — SYSTEM_HOLD→AI_ACTIVE is the deliberate operator release and
  // IS legal. #87 guarantee is preserved: we only do this when owner is already 'ai'
  // (meaning a human already pressed "return to AI"); we never auto-release a hold where
  // owner is still 'human'.
  if ((conv.owner as string) === "ai" && ownershipState === "SYSTEM_HOLD") {
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط", is_safety_hold: false },
    });
  }

  // Takeover (Amendment 03 §E): a human owns this thread — the Brain normally
  // stays out. HANDOFF-HARDENING (Fix 1 — stop "silent death"): a human-owned
  // thread must never answer the customer with nobody, forever. When the customer
  // messages and no operator has tended the thread for the tenant's idle window,
  // apply the per-tenant idle policy. SAFETY holds (allergy/medical escalation
  // reason) NEVER auto-return — re-alert the team and stay silent. Flag-gated
  // (handoff_timeout); default off → the existing skipped_takeover behavior.
  let resumedAfterTimeout = false;
  if ((conv.owner as string) === "human") {
    // Spine Step 3 (Part A — stuck detection live): a human-owned thread is exactly the
    // "customer waiting on a person" posture where stuck-ness matters. Detect + alert
    // (deduped internally to ≤1 per window) BEFORE the idle/realert policy, so a stuck
    // thread is surfaced even when handoff_timeout is off. Healthy AI_ACTIVE flows never
    // enter this block, so normal replies get no stuck check and no alert spam. A failure
    // here never breaks the turn.
    await checkAndNotifyStuck({ admin, restaurantId, conversationId }).catch((e) =>
      console.error("[respond-and-send] stuck check error", e)
    );

    const { data: rFlags } = await admin.from("restaurants").select("feature_flags").eq("id", restaurantId).single();
    const features = (rFlags?.feature_flags as Record<string, unknown> | null) ?? null;
    const cfg = readHandoffConfig(features);
    const idle = cfg.enabled && isIdleBeyond(conv.updated_at as string | null, cfg.idleMinutes);
    if (!idle) return { status: "skipped_takeover" };

    // Safety carve-out source of truth: the STRUCTURED is_safety_hold flag (Fix 2),
    // read only when the allergen-safety feature is on — so Wesaya (flag off) never
    // references the new column (deploy-safe before the migration) and stays
    // byte-identical (falls back to the legacy reason-text classifier). When on, the
    // structured flag means a safety hold can NEVER wrongly auto-return regardless
    // of how the model phrased its escalation reason.
    let structuredSafety = false;
    if (isFeatureExplicitlyEnabled("deterministic_allergen_safety", features)) {
      const { data: sh } = await admin.from("conversations").select("is_safety_hold").eq("id", conversationId).single();
      structuredSafety = (sh as { is_safety_hold?: boolean } | null)?.is_safety_hold === true;
    }
    // Spine Step 3 (enforcement-safe + #87 hardening): treat an explicit SYSTEM_HOLD
    // ownership state as a safety hold UNCONDITIONALLY — independent of the feature flag
    // or the model's free-text reason. This makes the "a safety hold never auto-returns"
    // guarantee STRUCTURAL, and guarantees the auto-return path below (SYSTEM_HOLD would
    // be an illegal → HUMAN_IDLE transition under enforcement) is never reached.
    const isSystemHold = ownershipState === "SYSTEM_HOLD";
    const safety = isSystemHold || structuredSafety || isSafetyHold(conv.escalation_reason as string | null);
    if (safety || cfg.action === "realert_only") {
      // Keep the human in the loop; nudge staff (deduped to ≤ once per idle window).
      // Safety holds are released only by a deliberate human action — never here.
      await realertOperator(admin, restaurantId, conversationId, cfg.idleMinutes, safety);
      return { status: "skipped_takeover" };
    }

    // Non-safety + auto_return: return ownership to the AI through the SAME fields
    // returnToAi writes (owner/status reset, escalation_reason + handover_note
    // cleared — no human commitment to honor) and reset the wait clock. Then fall
    // through so the Brain answers the waiting customer; an honest resume line is
    // sent first (below, once recipient + 24h window are resolved).
    // Ownership axis (spine Step 1): the timeout path is HUMAN_IDLE → AI_ACTIVE. Mark
    // the idle hand-off explicitly, then return to the AI, dual-writing the legacy
    // owner/status/reason resets via `extra`. (Safety holds never reach here — they
    // bail above with realert_only — so SYSTEM_HOLD can never auto-return.)
    await setOwnershipState(admin, conversationId, "HUMAN_IDLE");
    await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
      extra: { owner: "ai", status: "AI نشط", escalation_reason: null, handover_note: null, updated_at: new Date().toISOString() },
    });
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "المحادثة رجعت للمساعد تلقائياً بعد انتظار العميل بدون رد من الفريق.",
      { kind: "handoff_auto_return", idleMinutes: cfg.idleMinutes }
    );
    resumedAfterTimeout = true;
  }

  // Mode gate (incident control, §F): only auto-reply in modes that allow it.
  // A tenant flipped to setup/paused leaves the inbound for human handling — no
  // auto-reply — while test/live (and closed) reply normally. The stored
  // agent_mode (setup|test|live|paused) maps onto SystemMode; a missing value
  // defaults to live so the existing reply path is unchanged.
  const { data: rest } = await admin.from("restaurants").select("agent_mode").eq("id", restaurantId).single();
  const agentMode = ((rest?.agent_mode as string) || "live") as SystemMode;
  if (!modeAllowsAgentReply(agentMode)) return { status: "skipped_mode" };

  const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";

  // DRYRUN-1 allowlist config — read the tester columns SEPARATELY so this is
  // deploy-safe: our process applies migration 0057 BEFORE merge, but if the code
  // ever runs before the columns exist, a missing-column read must mean "feature
  // not deployed → inert" (byte-identical to today), NOT "hold everyone". A
  // GENUINE read failure while the columns DO exist stays indeterminate → the
  // fail-safe HOLD below still fires. We distinguish the two by the Postgres
  // undefined-column signal (code 42703 / "does not exist").
  const { data: alRow, error: alErr } = await admin
    .from("restaurants")
    .select("country, tester_allowlist, tester_allowlist_mode")
    .eq("id", restaurantId)
    .single();
  const columnsMissing =
    !!alErr && (alErr.code === "42703" || /column .* does not exist|does not exist/i.test(alErr.message ?? ""));
  // Feature not deployed → inert: force mode-off + no read error so the decision
  // helper falls straight through (allow). Otherwise pass the real row/error and
  // let the fail-safe (indeterminate → hold) govern.
  const allowlistReadError = !!alErr && !columnsMissing;

  // DRYRUN-1 tester allowlist — UPSTREAM recipient filter (purely subtractive).
  // When tester_allowlist_mode is ON, Karim auto-responds ONLY to numbers in
  // tester_allowlist; every other inbound is held for human handling. This sits
  // BEFORE runCustomerTurn, so it only decides whether Karim engages at all — it
  // never touches, weakens, or reorders the deterministic allergen gate that runs
  // INSIDE runCustomerTurn for everyone Karim does answer.
  //
  // FAIL-SAFE = HOLD: the gate responds ONLY if the number is explicitly
  // allowlisted (never block-only-if-denied). If the restaurants row failed to
  // read while it was needed, or the mode flag is indeterminate, we cannot prove
  // the number is allowed → HOLD. An empty/NULL allowlist with mode on holds
  // everyone. The default-false column means an unset tenant is fully inert.
  const allowlistDecision = evaluateTesterAllowlist({
    testerAllowlistMode: columnsMissing ? false : (alRow?.tester_allowlist_mode as boolean | null | undefined),
    testerAllowlist: alRow?.tester_allowlist as string[] | null | undefined,
    country: alRow?.country as string | null | undefined,
    phone,
    readError: allowlistReadError,
    hasRow: Boolean(alRow),
  });
  if (!allowlistDecision.allow) {
    // Hold means HAND TO A HUMAN, not silently drop: flip the conversation into
    // the human queue (HUMAN_ACTIVE → Karim stays silent, a person picks it up)
    // so the customer isn't left with no reply and no owner. At this point the
    // state is AI_ACTIVE (takeover/hold/closed were all resolved above), so
    // AI_ACTIVE→HUMAN_ACTIVE is a legal transition. Dual-writes owner='human' +
    // an escalation reason for the queue, and advances the wait clock to the
    // customer's just-arrived message. Best-effort: a flip failure must not throw
    // the whole webhook — we still hold (never auto-answer). The allergen gate is
    // untouched: this path never reaches runCustomerTurn.
    try {
      await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
        extra: {
          owner: "human",
          status: "بانتظار موظف",
          escalation_reason: "tester_allowlist_hold",
          updated_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("[allowlist] hold ownership flip failed (still holding):", e);
    }
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "🔒 محتجز للمراجعة البشرية — الرقم خارج قائمة التجربة (وضع التجربة مفعّل).",
      { kind: "held_not_allowlisted" }
    );
    return { status: "skipped_not_allowlisted" };
  }

  // 2. History + the customer message to answer (last inbound), from the DB —
  //    the inbound was already persisted by the webhook, so we derive both here
  //    (no double-counting of the message into the prompt).
  const { data: msgs } = await admin
    .from("messages")
    .select("sender,text,created_at,meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  // Fetch the NEWEST 40 (descending) then reverse to chronological (oldest→
  // newest). The previous ascending+limit(40) returned the OLDEST 40, so in a
  // long thread lastIndexOf("customer") resolved to message ~#40 — the agent
  // kept answering a stale message and looped. Reversing makes the window the
  // last 40 in order, so the final "customer" row IS the latest inbound.
  const rows = ([...(msgs ?? [])] as { sender: string; text: string | null; created_at: string; meta: Record<string, unknown> | null }[]).reverse();
  const lastCustomerIdx = rows.map((m) => m.sender).lastIndexOf("customer");
  if (lastCustomerIdx < 0) return { status: "skipped_no_customer_msg" };
  const rawText = (rows[lastCustomerIdx].text ?? "").trim();
  // S6 — deterministic interactive routing: if the last inbound was a tap on a
  // control WE minted (meta.interactiveId ∈ known set), resolve it to an explicit
  // canonical directive so the tap routes by the controlled id, NOT by the title
  // text the LLM could misread. Unknown ids / item:<…> / free text fall through to
  // rawText. This only disambiguates the input — it still flows through the SAME
  // gated agent (allergen input+output gate in runCustomerTurn/respond; SYSTEM_HOLD
  // / ownership / mode already gated above), so no safety rule is bypassed.
  const lastInteractiveId = (rows[lastCustomerIdx].meta as { interactiveId?: string } | null)?.interactiveId;
  const userMessage = routeInteractive(lastInteractiveId, rawText).text;
  if (!userMessage) return { status: "skipped_no_customer_msg" };
  // WO-VOICE-1: carry the transcribed voice note's STT confidence (persisted in meta
  // by the webhook) into the turn so the fail-closed net's SECONDARY tripwire can read
  // it. Undefined for typed messages → the tripwire is inert (pipeline unchanged).
  const sttConfidence = (rows[lastCustomerIdx].meta as { stt_confidence?: number } | null)?.stt_confidence;
  // WO-VOICE-2: did the customer open the voice door this turn (sent a voice note)?
  const inboundWasVoice = (rows[lastCustomerIdx].meta as { voice?: boolean } | null)?.voice === true;
  const lastInboundAtMs = new Date(rows[lastCustomerIdx].created_at).getTime();

  // HX1 — label human-authored turns so Karim distinguishes its own words from the
  // operator's. Human turns stay role:"assistant" (a valid LLM role) but their
  // content is prefixed with a marker carrying the staff name, resolved server-side
  // from meta.author_member_id (stamped by /api/whatsapp/send). ai/customer turns
  // are unchanged.
  // HX2 — exclude sender:"system" rows: they are INTERNAL operator-facing timeline
  // notes (handoff/escalation/stuck/receipt/send-error), NEVER customer dialogue and
  // never sent to the customer — so they must not pollute Karim's prompt. They stay
  // persisted for the operator UI (this only drops them from the LLM context). The
  // 40-window fetch and lastCustomerIdx (the message-to-answer) are unchanged; we
  // only filter what's fed into `history`.
  const histRows = rows.slice(0, lastCustomerIdx).filter((m) => m.text && m.sender !== "system");
  const authorIds = histRows
    .filter((m) => m.sender === "human")
    .map((m) => (m.meta as { author_member_id?: string } | null)?.author_member_id);
  const nameMap = await resolveMemberNames(admin, authorIds);
  const history: LlmMessage[] = histRows.map((m) => {
    if (m.sender === "human") {
      const aid = (m.meta as { author_member_id?: string } | null)?.author_member_id;
      const name = aid ? nameMap.get(aid) : undefined;
      const marker = name ? `«رسالة من فريق المطعم - ${name}»` : "«رسالة من فريق المطعم»";
      return { role: "assistant", content: `${marker}: ${m.text as string}` };
    }
    return { role: m.sender === "customer" ? "user" : "assistant", content: m.text as string };
  });

  // HANDOFF-HARDENING (Fix 1): after a timeout auto-return, open with an honest
  // resume line that acknowledges the wait BEFORE the Brain answers the message.
  if (resumedAfterTimeout) {
    const resumeText = "معلش اتأخرنا عليك 🙏 أنا معاك دلوقتي ونكمّل على طول.";
    const { data: rmsg } = await admin
      .from("messages")
      .insert({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender: "ai",
        text: resumeText,
        status: "sent",
        meta: { kind: "handoff_resume" },
      })
      .select("id")
      .single();
    const rsend = await sendWhatsAppText({ to: phone, text: resumeText, lastInboundAtMs });
    if (rmsg?.id) {
      await admin
        .from("messages")
        .update(rsend.status === "sent" ? { status: "sent", channel_message_id: rsend.externalMessageId ?? null } : { status: "failed" })
        .eq("id", rmsg.id);
    }
  }

  // 3. Brain turn — persists the AI reply, logs cost to agent_runs, flips to
  //    human on escalation. Any failure hands the thread to a human + notes it.
  let outcome;
  try {
    outcome = await runCustomerTurn(admin, { restaurantId, conversationId, history, userMessage, sttConfidence, isVoiceTranscript: inboundWasVoice });
  } catch (e) {
    // Fix B: surface the REAL message (was discarding it → «agent_error: agent_error»).
    const detail = e instanceof CustomerTurnError ? (e.message || e.code) : e instanceof Error ? e.message : String(e);
    // WO-MONITORING-ALERTING (Part 2) — GRACEFUL DEGRADATION: the customer must
    // NEVER hear silence (or a raw error) when the Brain fails. Send a polite Arabic
    // "a staff member will reach you" line FIRST, then flag the thread for a human
    // and alert. This runs ONLY in the error path — the happy path never enters
    // this catch, so a successful turn is byte-identical.
    await sendAgentErrorFallbackToCustomer(admin, restaurantId, conversationId, phone, lastInboundAtMs);
    // Ownership axis (spine Step 1): an agent error hands the thread to a human.
    await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
      extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `agent_error: ${detail}` },
    });
    await noteToTimeline(
      admin,
      restaurantId,
      conversationId,
      "تعذّر توليد رد المساعد تلقائياً — تم تحويل المحادثة لموظف للمتابعة.",
      { kind: "agent_error", detail }
    );
    // Critical-failure alert: console banner + email (best-effort, never throws).
    await recordCriticalAlert(admin, { restaurantId, type: "agent_error", detail, conversationId });
    return { status: "agent_error", error: detail };
  }

  // 4.5 (S9-4.5): a finalized draft becomes a real order row BEFORE the
  // customer-facing confirmation is transmitted. If the server-side DB recompute
  // rejects the draft, do not send a "confirmed" message.
  let persistedOrder: PersistedDraftOrder | null = null;
  if (outcome.draft.finalized) {
    try {
      persistedOrder = await persistOrderFromDraft(admin, { restaurantId, conversationId, customerId, draft: outcome.draft, agentRunId: outcome.agentRunId });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("[respond-and-send] order persist error", e);
      if (outcome.replyMessageId) {
        await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
      }
      // Ownership axis (spine Step 1): a persist failure hands the thread to a human.
      await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
        extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `order_persist_error: ${detail}` },
      });
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        "تعذّر تأكيد الطلب تلقائياً لأن مراجعة الأسعار من السيستم فشلت — تم تحويل المحادثة لموظف للمتابعة.",
        { kind: "order_persist_error", detail }
      );
      // Q2 — revenue path: order row failed to persist. Surface to banner + WhatsApp.
      await recordCriticalAlert(admin, { restaurantId, type: "order_persist_failed", detail, conversationId });
      return { status: "agent_error", reply: outcome.reply, escalate: true, error: detail };
    }

    // Karim Pro P1 terminal hook — ORDER FINALIZED. Emit ONLY after the order is
    // actually committed (so order_placed/order_total/order_id are TRUE, never
    // narrated). Pro-gated; standard tenants emit nothing.
    if (persistedOrder?.created && persistedOrder.orderId) {
      await emitConversationReport(admin, {
        restaurantId,
        tier: outcome.tier,
        features: outcome.features,
        conversationId,
        terminalTrigger: "finalized",
        order: {
          id: persistedOrder.orderId,
          total: outcome.draft.total,
          fulfillment: outcome.draft.fulfillment,
          paymentStatus: "unpaid",
          // F1.7 Fix 2 / F1.6 — the real method stamped at creation (orders-create.ts):
          // the customer's chosen method, or "cod" when none was selected.
          paymentMethod: outcome.draft.paymentMethod ?? "cod",
          branchId: null,
        },
        transcript: [
          ...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: outcome.reply },
        ],
      });
    }
  }

  // If the draft was finalized but the persist was an idempotent no-op, the same
  // order content was already placed in a prior turn (reorder of identical items in
  // the same conversation). Skip the customer-facing send — never tell the customer
  // "your order is placed" when we did not create a new order row.
  if (outcome.draft.finalized && persistedOrder?.created === false) {
    console.warn("[respond-and-send] idempotent no-op — skipping duplicate confirmation", {
      conversationId,
      orderId: persistedOrder.orderId,
      agentRunId: outcome.agentRunId,
    });
    if (outcome.replyMessageId) {
      await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
    }
    return { status: "deduped", reply: outcome.reply };
  }

  // 4. Put the reply on the WhatsApp wire — as an interactive message when the
  //    Brain presented options (degrades to numbered text on failure), else text.
  const send = outcome.presentation
    ? await sendWhatsAppInteractive({ to: phone, body: outcome.reply, presentation: outcome.presentation, lastInboundAtMs })
    : await sendWhatsAppText({ to: phone, text: outcome.reply, lastInboundAtMs });

  // WO-VOICE-2 — ADDITIVE voice note. The text reply above already went (voice is
  // never a replacement). Flag-gated (voice_notes, default OFF); fires only when the
  // customer opened the door AND the turn is not a hard-zero category (safety/money/
  // link/receipt → text-only, ruling A). Best-effort — never blocks the text path.
  if (send.status === "sent" && conversationId && isFeatureExplicitlyEnabled("voice_notes", outcome.features)) {
    void maybeSendVoiceNote(admin, {
      restaurantId,
      conversationId,
      phone,
      replyText: outcome.reply,
      inboundWasVoice,
      userMessage,
      safetyHold: outcome.escalate === true,
      isReceipt: outcome.resendReceipt === true,
      lastInboundAtMs,
    }).catch((e) => console.error("[respond-and-send] voice note error", e));
  }

  // Receipt resend — customer asked «فين الايصال؟» and the model called resend_receipt.
  if (outcome.resendReceipt && conversationId) {
    const { data: latestOrd } = await admin
      .from("orders")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestOrd?.id) {
      sendReceiptToCustomer(admin, latestOrd.id as string).catch((e) => {
        console.error("[respond-and-send] receipt resend error", e);
        // Q2 — best-effort alert on a failed receipt resend (non-blocking).
        void recordCriticalAlert(admin, {
          type: "receipt_send_failed",
          restaurantId,
          conversationId,
          detail: e instanceof Error ? e.message : String(e),
          context: { orderId: latestOrd.id, resend: true },
        });
      });
    }
  }

  // Receipt auto-sends after the customer confirmation (skips in test mode).
  if (persistedOrder?.created && persistedOrder.orderId) {
    try {
      // DLV1 — a finalized DELIVERY order opens a pending delivery row so it's
      // assignable + dispatchable. NOT gated on ENABLE_DELIVERY_TRACKING: the row
      // must exist regardless of the UI toggle (same shared, idempotent helper the
      // storefront path uses; it no-ops for pickup orders).
      if (persistedOrder.orderId && outcome.draft.fulfillment === "delivery") {
        try {
          await ensureDeliveryRowForOrder(admin, persistedOrder.orderId, restaurantId);
        } catch (e) {
          console.error("[respond-and-send] delivery create error", e);
        }
      }
      await sendReceiptToCustomer(admin, persistedOrder.orderId);
    } catch (e) {
      console.error("[respond-and-send] receipt error", e);
      // Q2 — customer didn't get their receipt; surface to banner + WhatsApp.
      await recordCriticalAlert(admin, {
        type: "receipt_send_failed",
        restaurantId,
        conversationId,
        detail: e instanceof Error ? e.message : String(e),
        context: { orderId: persistedOrder.orderId },
      });
    }
  }

  if (send.status === "sent") {
    if (outcome.photoRequests.length) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs, { ownership_state: ownershipState, escalation_reason: (conv.escalation_reason as string | null) ?? null }, outcome.features);
    }
    if (outcome.replyMessageId) {
      await admin
        .from("messages")
        .update({ status: "sent", channel_message_id: send.externalMessageId ?? null })
        .eq("id", outcome.replyMessageId);
    }
    return { status: "responded", reply: outcome.reply, escalate: outcome.escalate, sendStatus: "sent" };
  }

  if (send.status === "skipped") {
    // Test mode (no credentials): the reply is persisted, just not transmitted.
    if (outcome.photoRequests.length) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs, { ownership_state: ownershipState, escalation_reason: (conv.escalation_reason as string | null) ?? null }, outcome.features);
    }
    return { status: "responded", reply: outcome.reply, escalate: outcome.escalate, sendStatus: "skipped" };
  }

  // Real failure (network / 4xx after retries, or outside the 24h window) —
  // mark the reply failed and surface it so an operator can act. Nothing dropped.
  if (outcome.replyMessageId) {
    await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
  }
  await noteToTimeline(
    admin,
    restaurantId,
    conversationId,
    `تعذّر إرسال رد المساعد عبر واتساب: ${send.error ?? "خطأ غير معروف"}. الرسالة محفوظة ويمكن إعادة المحاولة.`,
    { kind: "send_error", windowState: send.windowState, attempts: send.attempts }
  );
  // Critical-failure alert: console banner + email (best-effort, never throws).
  await recordCriticalAlert(admin, {
    restaurantId,
    type: "whatsapp_send_failed",
    detail: send.error ?? "خطأ غير معروف",
    conversationId,
    context: { windowState: send.windowState, attempts: send.attempts },
  });
  return {
    status: "send_failed",
    reply: outcome.reply,
    escalate: outcome.escalate,
    sendStatus: send.status,
    error: send.error,
  };
}
