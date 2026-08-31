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
import { runCustomerTurn, CustomerTurnError, scheduleAsyncPerceptionAfterReply } from "@/lib/ai/customer-turn";
import {
  handleTypedQuantityFill,
  safetyProbeFired,
  handleTypedInteractiveAction,
  handleUnknownInteractiveCommand,
  isTypedInteractiveActionId,
  type TypedInteractiveActionResult,
  type UnknownInteractiveCommandResult,
} from "@/lib/messaging/typed-actions";
import { evaluateTesterAllowlist } from "@/lib/messaging/tester-allowlist";
import { modeAllowsAgentReply, type SystemMode } from "@/lib/ai/modes";
import { sendWhatsAppText, sendWhatsAppInteractive, sendWhatsAppImageLink, sendWhatsAppAudio } from "./outbound";
// WO-CONTROL Part B — capture the conversation's control_epoch at AI-turn start and thread
// it into the reply send; the outbound chokepoint drops the reply if a human claimed the
// conversation mid-turn (epoch changed). readControlEpoch is deploy-safe (missing column → null).
import { readControlEpoch } from "./send-gate";
import { decideVoiceSend, voiceHardZeroReason, voiceNotesPerDay, voiceSignalsForTurn } from "./voice-budget";
import { shouldOfferVoiceReply } from "@/lib/ai/voice-reply-trigger";
import { synthesizeVoiceReply } from "@/lib/ai/tts";
import { buildPhotoThreadCaptions } from "./photo-thread";
import { buildDishPhotoMessage } from "./dish-photo-message";
import { imageHistoryContent } from "./image-turn";
import { decideMediaSend, CONVERSATION_MEDIA_BUDGET, MAX_IMAGES_PER_MESSAGE, DEFAULT_MAX_IMAGES_PER_MESSAGE, type MediaZeroReason } from "./media-guard";
import { isMediaWindowReset, MEDIA_WINDOW_MS } from "./media-window";
import { asksForMorePhotos, asksForMenuLink } from "@/lib/ai/media-intent";
import { coalesceInbound } from "@/lib/messaging/inbound-coalescing";
import { claimTurn, releaseTurn } from "@/lib/db/turn-claim";
// WO-LIVE6-REPLY-DAMPENER — silence a RUN of unclear-fragment replies. The safety net +
// human-request detector run FIRST here and always win (never dampened).
import { shouldDampenReply } from "@/lib/ai/reply-dampener";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";
import { detectAllergenSymptom } from "@/lib/ai/allergen-gate-symptoms";
import { detectPhoneticSafetyNet } from "@/lib/ai/phonetic-safety-net";
import { detectAllergenEmergency } from "@/lib/ai/allergen-emergency";
// WO-SAFETY-BRIDGE — a safety-class inbound during HUMAN_ACTIVE with nobody attending gets a
// caution ACK + a loud re-alert (ownership unchanged). Gated on the safety_bridge flag.
import { isSafetyClassInbound, safetyBridgeAck, SAFETY_BRIDGE_WINDOW_MINUTES } from "@/lib/ai/safety-bridge";
import { isExplicitHumanRequest } from "@/lib/ai/human-request";
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
import { calmHoldingReply, calmNewAllergyReply } from "@/lib/ai/allergy-calm-hold";
import { mergeAllergyNote, parseAllergyNote } from "@/lib/ai/allergen-companion";
// WO-COMPANION-W1-CORE §1e — the no-purgatory recovery. Pure decision + authored texts.
import {
  decideRecoveryAction,
  emergencyReply,
  recoveryReply,
  recoveryChoiceTitles,
  RECOVERY_CHOICE_REALERT,
  RECOVERY_CHOICE_CONTINUE,
  isEmergencyClassHold,
} from "@/lib/ai/allergen-companion-flow";
import { recordAllergyEvent } from "@/lib/db/allergy-audit";
import type { LlmMessage } from "@/lib/ai/llm/types";
import { formatCustomerVisiblePresentation, formatCustomerVisibleText } from "@/lib/util/customer-visible-format";
import { resolveTenantDialect } from "@/lib/ai/dialect";
import { lookupVoice, voiceMayReadDialect, voiceMatchesPin } from "@/lib/ai/tts/voice-registry";

export type RespondAndSendStatus =
  | "responded"
  | "skipped_takeover"
  | "skipped_mode"
  | "skipped_not_allowlisted"
  | "skipped_no_customer_msg"
  | "skipped_not_found"
  | "send_failed"
  | "agent_error"
  | "deduped"
  // WO-SAFETY-BRIDGE — a safety-class inbound during HUMAN_ACTIVE with an absent operator was
  // acknowledged (caution ACK) + the team loudly re-alerted; ownership stays human, the wait
  // clock is NOT bumped. Silent (already-bridged this window) collapses to skipped_takeover.
  | "safety_bridged"
  // WO-LIVE6-REPLY-DAMPENER — a 3rd+ consecutive unclear fragment within a short window
  // was silenced (the «مش فاهم» pile-up killer). Never reached for a meaningful message or
  // anything the allergen net / human-request detector flags.
  | "dampened"
  // WO-COMPANION-W1-CORE §1e — the recovery reply was sent (never silence). The
  // customer was asked «وصلك أحد من الفريق؟» / re-alerted / told an emergency hold
  // needs a human. Distinct from skipped_takeover so purgatory is observably fixed.
  | "recovery_prompt"
  | "recovery_realert"
  | "recovery_emergency_held"
  // WO-CALM — safety-held allergy turns are answered by fixed templates, never the Brain.
  | "allergy_calm_holding"
  | "allergy_calm_new_allergy"
  | "allergy_calm_emergency"
  // WO-CONTROL Part B — the Brain reply was DROPPED at the send chokepoint because the
  // conversation's control_epoch changed between turn-start and send (a human claimed it
  // mid-turn). Nothing was transmitted; a blocked_stale_sender signal was logged.
  | "blocked_stale_sender";

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

// WO-COMPANION-W1-CORE §1e — the idle window (minutes) that marks a pending-human
// thread as PURGATORY (customer waiting, no human tending). An actively-chatting human
// keeps updated_at fresh, so the recovery never interrupts live handling.
const RECOVERY_IDLE_MINUTES = 15;

type RecoveryOutcome =
  | { kind: "reply"; result: RespondAndSendResult } // recovery handled the turn (sent a message)
  | { kind: "resume" }                              // §1e·b resume → caller continues to the Brain
  | { kind: "none" };                               // not purgatory → caller runs existing logic

/**
 * §1e HANDOFF-RECOVERY — no purgatory, ever. For a pending-human thread receiving a
 * customer message, decide and execute the ONE recovery action: ask «وصلك أحد من
 * الفريق؟» (+ both choices), re-alert the team, resume with Kivo (§1e·b, non-emergency
 * only), or explain an emergency hold needs a human (§1e·d, never resumable). A resume
 * PRESERVES the allergy context (§1e·c: escalation_reason/allergy_note carry forward)
 * and RE-FIRES the staff alert + audits the customer's verbatim choice (§1e·b). Best-
 * effort; a failure returns {none} so the legacy path still runs.
 */
async function handleAllergyRecovery(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    ownershipState: string | null;
    escalationReason: string | null;
    updatedAt: string | null;
    phone: string;
    dialect: string;
  }
): Promise<RecoveryOutcome> {
  const { restaurantId, conversationId, ownershipState, escalationReason, updatedAt, phone, dialect } = args;
  try {
    // Read the latest inbound (the message to act on) + the preceding outbound so we
    // know whether the LAST thing Kivo said was the recovery question (→ this is its
    // answer). One small read.
    const { data: recentMsgs } = await admin
      .from("messages")
      .select("sender, text, meta, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8);
    const rows = (recentMsgs ?? []) as { sender: string; text: string | null; meta: Record<string, unknown> | null; created_at: string }[];
    const inbound = rows.find((m) => m.sender === "customer");
    if (!inbound) return { kind: "none" };
    const lastInboundAtMs = new Date(inbound.created_at).getTime();
    const interactiveId = (inbound.meta as { interactiveId?: string } | null)?.interactiveId ?? null;
    const messageText = (inbound.text ?? "").trim();
    // recoveryPending: the newest OUTBOUND (ai/system) message is the recovery question.
    const lastOutbound = rows.find((m) => m.sender === "ai" || m.sender === "human" || m.sender === "system");
    const recoveryPending = (lastOutbound?.meta as { kind?: string } | null)?.kind === "allergy_recovery_question";

    const isIdle = isIdleBeyond(updatedAt, RECOVERY_IDLE_MINUTES);
    const action = decideRecoveryAction({ ownershipState, escalationReason, isIdle, recoveryPending, messageText, interactiveId });
    if (action === "none") return { kind: "none" };

    const emergency = isEmergencyClassHold(escalationReason);

    // ── RESUME (§1e·b, non-emergency only): customer explicitly chose to continue ──
    if (action === "resume_continue") {
      // §1e·c: PRESERVE the allergy context — do NOT clear escalation_reason/allergy_note.
      // Customer-initiated SYSTEM_HOLD→AI_ACTIVE is a legal, deliberate resume (the map
      // permits it); the enforced transition is satisfied.
      await setOwnershipState(admin, conversationId, "AI_ACTIVE", {
        extra: { owner: "ai", status: "AI نشط", updated_at: new Date().toISOString() },
      });
      // §1e·b: RE-FIRE the staff alert on resume (staff stay in the loop) + audit the
      // customer's verbatim choice.
      await realertOperator(admin, restaurantId, conversationId, RECOVERY_IDLE_MINUTES, true).catch(() => {});
      await recordAllergyEvent(admin, {
        restaurantId, conversationId, allergens: [], customerMessage: messageText,
        eventKind: "recovery", humanAccepted: false, staffNotified: true,
        netReason: "recovery_resume_continue",
      }).catch(() => {});
      await noteToTimeline(admin, restaurantId, conversationId,
        "العميل اختار يكمل مع المساعد بعد انتظار الفريق — رجعت المحادثة للمساعد مع تنبيه الفريق مرة ثانية.",
        { kind: "allergy_recovery_resume" });
      return { kind: "resume" };
    }

    // ── The remaining actions all SEND a reply and stay held (never resume). ──
    let text: string;
    let statusKind: RespondAndSendStatus;
    let auditReason: string;
    let buttons: { id: string; title: string }[] = [];
    const titles = recoveryChoiceTitles(dialect);
    if (action === "realert") {
      await realertOperator(admin, restaurantId, conversationId, RECOVERY_IDLE_MINUTES, true).catch(() => {});
      text = dialect === "egyptian"
        ? "نبّهت الفريق تاني 🙏 هيتواصلوا معاك في أقرب وقت. وأنا هنا لو حبيت أكمّل معاك."
        : "نبّهت الفريق مرة ثانية 🙏 بيتواصلون معك قريب. وأنا هنا لو حبيت أكمّل معك.";
      statusKind = "recovery_realert";
      auditReason = "recovery_realert";
    } else if (action === "emergency_held") {
      // §1e·d — emergency-class hold is NEVER customer-resumable. Re-alert; explain a
      // team member must assist. Never certifies safety, never reassures.
      await realertOperator(admin, restaurantId, conversationId, RECOVERY_IDLE_MINUTES, true).catch(() => {});
      text = dialect === "egyptian"
        ? "دي حالة لازم حد من الفريق يتابعها معاك بنفسه 🙏 نبّهتهم تاني. لو فيه أي عرض قوي دلوقتي، اتصل بالطوارئ فوراً."
        : "هذي حالة لازم أحد من الفريق يتابعها معك بنفسه 🙏 نبّهتهم مرة ثانية. إذا فيه أي عرض قوي الحين، تواصل مع الطوارئ فوراً.";
      statusKind = "recovery_emergency_held";
      auditReason = "recovery_emergency_held";
    } else {
      // send_question — ask «وصلك أحد من الفريق؟». Offer BOTH choices, EXCEPT an
      // emergency hold offers ONLY re-alert (never a continue-with-Kivo path).
      text = recoveryReply(dialect);
      buttons = emergency
        ? [{ id: RECOVERY_CHOICE_REALERT, title: titles.realert }]
        : [{ id: RECOVERY_CHOICE_REALERT, title: titles.realert }, { id: RECOVERY_CHOICE_CONTINUE, title: titles.continue }];
      statusKind = "recovery_prompt";
      auditReason = emergency ? "recovery_question_emergency" : "recovery_question";
    }

    // Persist + send the reply (marked so the next turn recognizes the pending question).
    const metaKind = action === "send_question" ? "allergy_recovery_question" : "allergy_recovery_ack";
    const outboundText = formatCustomerVisibleText(text, dialect);
    const { data: rmsg } = await admin
      .from("messages")
      .insert({
        restaurant_id: restaurantId, conversation_id: conversationId,
        direction: "outbound", sender: "ai", text: outboundText, status: "sent",
        meta: { kind: metaKind },
      })
      .select("id")
      .single();
    let sendStatus = "sent";
    const recoveryPresentation = formatCustomerVisiblePresentation({ kind: "buttons" as const, buttons }, dialect);
    const send = buttons.length
      ? await sendWhatsAppInteractive({ to: phone, body: outboundText, presentation: recoveryPresentation, lastInboundAtMs })
      : await sendWhatsAppText({ to: phone, text: outboundText, lastInboundAtMs });
    sendStatus = send.status;
    if (rmsg?.id) {
      await admin.from("messages")
        .update(send.status === "sent" ? { status: "sent", channel_message_id: send.externalMessageId ?? null } : { status: "failed" })
        .eq("id", rmsg.id);
    }
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    await recordAllergyEvent(admin, {
      restaurantId, conversationId, allergens: [], customerMessage: messageText,
      eventKind: "recovery", agentReply: outboundText, humanOffered: action === "send_question",
      staffNotified: action !== "send_question", netReason: auditReason,
    }).catch(() => {});

    return { kind: "reply", result: { status: statusKind, reply: outboundText, sendStatus } };
  } catch (e) {
    console.error("[companion:recovery] error (falling through to legacy)", e);
    return { kind: "none" };
  }
}

async function handleCalmHeldInbound(
  admin: SupabaseClient,
  args: {
    restaurantId: string;
    conversationId: string;
    ownershipState: string | null;
    isSafetyHold: boolean | null;
    phone: string;
    dialect: string;
    features: Record<string, unknown> | null;
  }
): Promise<RespondAndSendResult | null> {
  const { restaurantId, conversationId, ownershipState, isSafetyHold, phone, dialect, features } = args;
  if (!isFeatureExplicitlyEnabled("allergy_calm_hold", features)) return null;
  if (!isSafetyHeld({ ownership_state: ownershipState, is_safety_hold: isSafetyHold })) return null;

  const { data: recentMsgs } = await admin
    .from("messages")
    .select("sender, text, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  const rows = (recentMsgs ?? []) as { sender: string; text: string | null; meta: Record<string, unknown> | null; created_at: string }[];
  const lastOutbound = rows.find((m) => m.sender === "ai" || m.sender === "human" || m.sender === "system");
  const lastOutboundAtMs = lastOutbound ? Date.parse(lastOutbound.created_at) : null;
  const customerRows = rows.filter(
    (m) => m.sender === "customer" && (lastOutboundAtMs == null || Date.parse(m.created_at) > lastOutboundAtMs)
  );
  const latestCustomer = rows.find((m) => m.sender === "customer");
  const inboundRows = customerRows.length ? customerRows : latestCustomer ? [latestCustomer] : [];
  if (!inboundRows.length) return null;
  const chronological = [...inboundRows].reverse();
  const messageText = chronological.map((m) => (m.text ?? "").trim()).filter(Boolean).join("\n").trim();
  if (!messageText) return null;
  const newestInbound = inboundRows[0];
  const lastInboundAtMs = Math.max(...inboundRows.map((m) => Date.parse(m.created_at)).filter((n) => Number.isFinite(n)));
  const sttConfidence = (newestInbound.meta as { stt_confidence?: number } | null)?.stt_confidence;
  const isVoiceTranscript = (newestInbound.meta as { voice?: boolean } | null)?.voice === true;

  // Safety-critical detectors run before any human-door branch and are never skipped.
  const allergenHit = detectAllergenAvoidance(messageText);
  const symptomHit = detectAllergenSymptom(messageText);
  const phoneticHit = detectPhoneticSafetyNet(messageText, { sttConfidence, isVoiceTranscript });
  const emergencyHit = detectAllergenEmergency(messageText);
  const explicitHuman = isExplicitHumanRequest(messageText);

  if (!allergenHit.fired && !symptomHit.fired && !phoneticHit.fired && !emergencyHit.fired && explicitHuman) {
    return null;
  }

  const { data: noteRow } = await admin
    .from("conversations")
    .select("allergy_note")
    .eq("id", conversationId)
    .maybeSingle();
  const existingNote = ((noteRow as { allergy_note?: string | null } | null)?.allergy_note ?? "").trim();
  const noteTerms: Array<string | null> = [];
  if (allergenHit.fired) noteTerms.push(allergenHit.term);
  if (symptomHit.fired) noteTerms.push(symptomHit.term);
  if (phoneticHit.fired) noteTerms.push(phoneticHit.term);
  const nextNote = noteTerms.length ? mergeAllergyNote(existingNote, noteTerms) : existingNote;
  if (nextNote && nextNote !== existingNote) {
    await admin.from("conversations").update({ allergy_note: nextNote }).eq("id", conversationId);
  }

  const emergency = emergencyHit.fired || symptomHit.fired;
  const newAllergy = allergenHit.fired || phoneticHit.fired;
  // WO escalate-mode: the plain HOLD reply rotates across three deterministic
  // templates by the count of hold replies already sent (text-only; hold state is
  // untouched). Read the branch's stored display phone for the T3 direct-contact
  // line; when absent, the template omits it cleanly.
  const { count: priorHoldCount } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("meta->>kind", "allergy_calm_hold_wait");
  const { data: branchRow } = await admin
    .from("restaurants")
    .select("phone")
    .eq("id", restaurantId)
    .maybeSingle();
  const branchPhone = ((branchRow as { phone?: string | null } | null)?.phone ?? "").trim() || null;
  const text = emergency
    ? emergencyReply(dialect)
    : newAllergy
      ? calmNewAllergyReply(dialect)
      : calmHoldingReply(dialect, priorHoldCount ?? 0, branchPhone);
  const outboundText = formatCustomerVisibleText(text, dialect);
  const metaKind = emergency ? "allergy_calm_hold_emergency" : newAllergy ? "allergy_calm_hold_new_allergy" : "allergy_calm_hold_wait";
  const { data: rmsg } = await admin
    .from("messages")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "ai",
      text: outboundText,
      status: "sent",
      meta: { kind: metaKind },
    })
    .select("id")
    .single();
  const send = await sendWhatsAppText({ to: phone, text: outboundText, lastInboundAtMs: Number.isFinite(lastInboundAtMs) ? lastInboundAtMs : Date.now() });
  if (rmsg?.id) {
    await admin.from("messages")
      .update(send.status === "sent" ? { status: "sent", channel_message_id: send.externalMessageId ?? null } : { status: "failed" })
      .eq("id", rmsg.id);
  }

  if (emergency) {
    await recordCriticalAlert(admin, {
      restaurantId,
      type: "allergy_emergency_active",
      detail: "رسالة أعراض/طوارئ وصلت أثناء تعليق حساسية — أرسلنا إرشاد الطوارئ وبقي الطلب متوقفاً.",
      conversationId,
      context: { emergencyLabel: emergencyHit.label, symptomTerm: symptomHit.term, allergyNote: nextNote || null },
    });
  }
  if (emergency || newAllergy) {
    await recordAllergyEvent(admin, {
      restaurantId,
      conversationId,
      allergens: parseAllergyNote(nextNote),
      customerMessage: messageText,
      eventKind: emergency ? "emergency" : "mention",
      agentReply: outboundText,
      humanOffered: false,
      staffNotified: emergency,
      netReason: emergency
        ? `calm_hold_emergency:${emergencyHit.label ?? symptomHit.term ?? ""}`
        : `calm_hold_new_allergy:${allergenHit.term ?? phoneticHit.term ?? ""}`,
    }).catch(() => {});
  }

  return {
    status: emergency ? "allergy_calm_emergency" : newAllergy ? "allergy_calm_new_allergy" : "allergy_calm_holding",
    reply: outboundText,
    sendStatus: send.status,
  };
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
  const { data: r } = await admin.from("restaurants").select("slug,dialect,country").eq("id", restaurantId).maybeSingle();
  const slug = (r as { slug?: string | null } | null)?.slug ?? null;
  const dialect = resolveTenantDialect(r as { dialect?: string | null; country?: string | null } | null, "respond-and-send.menu-link", restaurantId);
  const url = slug ? `${appBaseUrl()}/order/${slug}` : appBaseUrl();
  const text = `${formatCustomerVisibleText("تقدر تتصفّح المنيو كامل بالصور من هنا 👇", dialect)}\n${url}`;
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
    const { data: r } = await admin.from("restaurants").select("dialect,country").eq("id", restaurantId).maybeSingle();
    const dialect = resolveTenantDialect(r as { dialect?: string | null; country?: string | null } | null, "respond-and-send.error-fallback", restaurantId);
    const text = formatCustomerVisibleText(agentErrorFallbackText(dialect), dialect);
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
/** The globally configured voice id, trimmed at the point of use. */
const envVoiceId = (): string => (process.env.ELEVENLABS_VOICE_ID || "").trim();

/** EXPORTED FOR THE PROOF, and for a specific reason. A review deleted the `return` from
 *  the dialect guard below and the entire 215-file suite stayed green, because the only
 *  thing watching that line was a regex looking for an identifier — which `false &&` and a
 *  dropped `return` both leave in place. That is the exact trap this repo has now written
 *  down five times. The guard is proven by DRIVING this function, so the wiring is tested
 *  and not merely the helper it calls. */
export async function maybeSendVoiceNote(
  admin: SupabaseClient,
  args: {
    restaurantId: string; conversationId: string; phone: string; replyText: string;
    inboundWasVoice: boolean; userMessage: string; safetyHold: boolean; isReceipt: boolean;
    lastInboundAtMs: number; tenantDialect: string;
    /** The tenant's feature flags, re-checked here — see below. */
    features: Record<string, unknown> | null;
  }
): Promise<void> {
  // THE FLAG IS RE-CHECKED HERE, not only at the call site.
  //
  // The call site checks it too, and that check is what normally applies. But a review
  // hoisted the read out of the `if` — `const voiceFlag = isFeature…(…); const voiceAllowed
  // = voiceFlag ? true : true;` — and every assertion stayed green at 216/216 while all 13
  // tenants became able to speak, because the assertions were regexes over the lines around
  // the call and the identifier was still there. Enumerating the ways to weaken a condition
  // is always incomplete.
  //
  // Inside the function it is covered by DRIVING the function, which is the only kind of
  // coverage that has survived a round of this. Defence in depth: the call site still gates,
  // and a caller that forgets to is refused here.
  if (!isFeatureExplicitlyEnabled("voice_notes", args.features)) return;

  // A VOICE MAY ONLY READ ITS OWN DIALECT.
  //
  // `ELEVENLABS_VOICE_ID` is a single GLOBAL setting and there is no per-tenant voice
  // column, so every tenant with `voice_notes` on gets the SAME voice. «Khalid kivo» is a
  // Najdi Saudi male. «وصاية» is an Egyptian tenant, `agent_mode: live`, `voice_notes: true`,
  // 20 conversations — so the moment a key is provisioned, that restaurant's real customers
  // would start receiving Cairene Arabic spoken in a Saudi accent. No configuration exists
  // that would make that correct: the release registry admits exactly one voice.
  //
  // Refusing costs the tenant nothing it had yesterday — the text reply is always composed
  // and sent first, and voice is additive by construction — while speaking is a quality
  // failure their customers hear on the first note. Checked HERE rather than at the call
  // site so a second caller cannot omit it.
  const registered = lookupVoice(envVoiceId());
  if (!voiceMayReadDialect(registered, args.tenantDialect)) {
    console.warn(
      `[voice] restaurant=${args.restaurantId} tenant dialect "${args.tenantDialect}" does not match ` +
        `the registered voice (${registered ? `«${registered.name}», ${registered.dialect}` : "none registered"}); ` +
        `text-only. A voice for this dialect has to be registered before it can speak.`
    );
    return;
  }

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
  if (!tts) {
    // SAY SOMETHING. A 4xx here — a key scoped to the wrong account, a plan without
    // eleven_v3, a voice or pronunciation-dictionary id that does not exist in this
    // account, an exhausted quota — correctly produces silence rather than a substitute
    // voice. But it produced silence with NO alert and not even a console line, so voice
    // could be dead for every live tenant with no signal anywhere, indefinitely. The
    // customer is unharmed (the text reply already went; voice is additive), which is
    // exactly why nobody would notice.
    //
    // A LOG LINE, NOT AN ALERT. recordCriticalAlert emails and WhatsApps a human, and this
    // fires once per turn — a bad key would page continuously. The fallback path already
    // alerts for the case that ships a wrong voice; this one only needs to be visible.
    console.warn(
      `[voice] restaurant=${args.restaurantId} synthesis produced nothing — text-only. ` +
        `If this repeats, check ELEVENLABS_API_KEY, the plan's access to the pinned model, ` +
        `and that the voice and pronunciation dictionary exist in that account.`
    );
    return; // both primary + fallback failed → text-only (already sent)
  }

  // DID A REAL PROVIDER ANSWER? Declared HERE, above both of its uses, because a previous
  // pass at this file put a constant below the closure that read it and shipped a
  // temporal-dead-zone crash that no assertion caught.
  //
  // The adapter, never the price. `ttsCostUsd` returns 0 for any model missing from
  // TTS_RATE_PER_CHAR and `OPENAI_TTS_MODEL` is env-overridable, so "it cost $0" is not
  // evidence that nothing was bought — that is the false-$0 trap recorded on KIV-95, and it
  // produced 40 real billed calls against a cap of 10. `TtsAdapterName` is a closed union
  // and only `mock.ts` emits "mock" without ever touching the network, so this comparison
  // is compiler-checked: a typo is a type error, not a silent fail-open.
  const billed = tts.result.adapter !== "mock";

  // THE PROVIDER HAS ALREADY BILLED US. Record the spend BEFORE *every* post-synthesis
  // decision — the transmit check and the pin refusal below are the same class of thing,
  // and returning early on either discarded our only record of money already spent.
  //
  // The refusal used to sit ABOVE this insert, so a refused synthesis was paid for and
  // then vanished: 25 turns → 25 paid syntheses, 0 ledger rows, $0.00 recorded. That is
  // money the daily-budget alert cannot see, which is precisely the spend nobody catches.
  // The demo path has carried its `spend` through a post-synthesis refusal since it was
  // written (lib/demo/voice-out.ts, `spentAnyway`); this one now does the same.
  //
  // ONLY WHEN SOMETHING WAS ACTUALLY BOUGHT. A mock synthesis is not spend, and writing a
  // $0 ledger row for it on every turn is write amplification with no reader.
  if (billed) {
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

  /** Charge this conversation's daily voice budget for the synthesis we just made.
   *
   *  `voice_notes_sent` is the ONLY thing bounding how much voice work one conversation can
   *  cause in a day — `decideVoiceSend` is its only reader in the repo, so no dashboard,
   *  report or invoice reads it and advancing it here corrupts nothing. Leaving it untouched
   *  on the non-delivery paths meant a configuration that paid and delivered nothing was
   *  UNCAPPED: it repeated on every triggering turn, of every conversation, every day.
   *  Driven at 20 turns: 20 billed syntheses against a cap of 10.
   *
   *  ADVANCED ONLY WHEN THE NOTE WAS DELIVERED, OR WHEN A REAL PROVIDER WAS CONTACTED. A
   *  first version advanced it on every refusal, which was wider than its own justification:
   *  with `TTS_ADAPTER` unset or `mock` no provider is called and no audio can exist, yet ten
   *  mock turns burned a real conversation's whole daily budget — so an operator who then
   *  fixed the configuration got silence from that conversation for the rest of the UTC day,
   *  which is exactly the confusion an activation does not need.
   *
   *  THE TEST IS THE ADAPTER, NOT THE PRICE. A second version used `costUsd > 0`, and that
   *  was worse than the problem it fixed. `ttsCostUsd` returns 0 for any model absent from
   *  TTS_RATE_PER_CHAR, and `OPENAI_TTS_MODEL` is env-overridable to a real model — so
   *  `tts-1-hd` produced REAL billed OpenAI syntheses priced at $0, read as "never billed",
   *  and the cap never advanced: 40 real syntheses against a cap of 10, uncapped forever.
   *  That is the "an unpriced model becomes a false $0" trap already recorded against this
   *  project on KIV-95, and the lesson is that our own price table is an ESTIMATE and can
   *  never be the gate on whether money was spent. Whether a provider was called can.
   *  Anything that is not the mock counts, so an adapter we do not recognise fails safe.
   *
   *  Counting a paid-but-undelivered synthesis is NOT a claim that a note was sent: no
   *  `messages` row is written on those paths, so nothing tells the customer or the operator
   *  that audio went out. The column governs the per-conversation voice BUDGET, and money
   *  the provider took is spent whether or not we could use what came back. */
  const chargeVoiceBudget = async (delivered: boolean): Promise<void> => {
    // NOTHING SPENT AND NOTHING SENT IS NOTHING TO RECORD. Without this the mock adapter —
    // the DEFAULT, and what every unconfigured environment runs — wrote a conversations row
    // on every triggering turn forever, where it used to be bounded to the cap by burning
    // the counter. Free, invisible to the customer, and pure write amplification; skipping
    // it also makes the update a no-op-free path rather than one that rewrites the same
    // numbers back. `delivered` still forces the write, so a delivered note always counts.
    if (!delivered && !billed) return;
    // `|| 0` so an out-of-contract adapter returning a non-number cannot write NaN into a
    // NOT NULL numeric column and reject the whole update — which would silently take the
    // counter down with it, re-opening the cap hole this function exists to close.
    const cost = Number(tts.result.costUsd) || 0;
    await admin.from("conversations")
      .update({
        voice_notes_day: today,
        voice_notes_sent: notesSentToday + (delivered || billed ? 1 : 0),
        voice_cost_usd: Number((costSoFar + cost).toFixed(6)),
      })
      .eq("id", args.conversationId);
  };

  // VERIFY WHAT CAME BACK, exactly as the demo does — and for the reason the demo's own
  // note gives: asserting only what we ASKED for leaves the whole voice guarantee resting
  // on a selection made in another file.
  //
  // The hole this closes: `TTS_ADAPTER=openai` is an accepted value, so an operator who
  // writes it — with a perfectly correct ELEVENLABS_VOICE_ID sitting beside it — gets
  // `onyx` synthesized and TRANSMITTED to a real customer, with the registry never
  // consulted and `fellBack:false`, so no alert fires either. The dialect guard does not
  // catch it: it checks the configured ElevenLabs voice, which is correct. The demo has
  // refused this since it was written (voiceMatchesPin requires adapter === "elevenlabs");
  // the live path, which reaches actual paying customers, did not.
  //
  // SCOPED TO A NON-FALLBACK RESULT. A `fellBack` result IS onyx, deliberately: the
  // fallback law exists for a provider that is DOWN, and it is bounded and alerted. What
  // must never happen is a silent substitution nobody chose and nobody is told about.
  //
  // COMPARED CANONICAL AGAINST CANONICAL. `registered` came from `lookupVoice`, which
  // deliberately tolerates a lowercase paste or a zero-width character, and the adapter
  // puts the registry's own spelling on the wire and echoes THAT back. Comparing it
  // against the raw env string therefore refused the RIGHT voice — after paying for it —
  // on every one of those tolerated spellings: 25 turns, 25 paid syntheses, 0 transmitted,
  // with the log below sending the operator to `TTS_ADAPTER`, the one variable that was
  // correct. The demo hit this exact defect and fixed it the same way; this is that fix.
  if (!tts.fellBack && !voiceMatchesPin(tts.result, registered?.voiceId ?? "")) {
    console.warn(
      `[voice] restaurant=${args.restaurantId} refusing a synthesis that is not the ` +
        `registered voice: got adapter=${tts.result.adapter}, voice=${tts.result.voiceId ?? "none"}; ` +
        `expected adapter=elevenlabs, voice=${registered?.voiceId ?? "none registered"}. ` +
        `Text-only, and the synthesis was still billed. Whichever of the two differs is ` +
        `the one to fix — TTS_ADAPTER for the adapter, ELEVENLABS_VOICE_ID for the voice.`
    );
    await chargeVoiceBudget(false);
    return;
  }

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
  if (audioSend.status !== "sent") {
    // A FAILED TRANSMIT STILL COSTS WHAT THE SYNTHESIS COST. The spend row above already
    // records it, but the daily cap did not — so a bad WHATSAPP_ACCESS_TOKEN, or Meta's
    // /media endpoint failing, billed ElevenLabs on every triggering turn and delivered
    // nothing, uncapped, for as long as it lasted. Driven: ledger 1, conversation updates 0,
    // counter 0. Same defect as the refusal path above, one exit further down.
    await chargeVoiceBudget(false);
    return;
  }

  // Bump the daily counter + accumulate cost (best-effort). Also persist a voice
  // message row + log the per-note synthesis cost to agent_runs (like STT/LLM).
  await chargeVoiceBudget(true);
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
  // The agent_runs spend row is written ABOVE, before the transmit — see the note there.
  // One row per synthesis, not one per successful send.
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
  features: Record<string, unknown> | null,
  userMessage: string
): Promise<void> {
  // FLAG GATE (standing law): the guard's caps + budget + hard-zero are a behavior
  // change, so they ship behind the explicit-only `media_guard` flag, OFF by default.
  // OFF → byte-identical legacy path: min(requested, 4) via decideMediaSend({enabled:
  // false}), and NONE of the new DB reads below run (no counter/hold/payment queries),
  // so a flag-off tenant (e.g. Wesaya) is unchanged down to the query set. Flipping the
  // safety-hold hard-zero ON for a live tenant is its own one-line proposal post-merge.
  const mediaGuardOn = isFeatureExplicitlyEnabled("media_guard", features);

  // WO-LIVE-3 — customer media intent (effective only when the flag is ON): an explicit
  // "more photos" ask raises the per-message cap 2→3 (§3); an explicit menu/link ask
  // legitimises an intentional web-menu-link send (§5).
  const askedForMorePhotos = mediaGuardOn && asksForMorePhotos(userMessage);
  const askedForMenuLink = mediaGuardOn && asksForMenuLink(userMessage);
  const perMessageCap = askedForMorePhotos ? MAX_IMAGES_PER_MESSAGE : DEFAULT_MAX_IMAGES_PER_MESSAGE;

  // ── Deterministic HARD-ZERO (fail-closed): never intrude media on a safety hold,
  //    an open complaint, or a pending payment. Only evaluated when the flag is ON.
  let hardZero = false;
  let hardZeroReason: MediaZeroReason | null = null;
  let imagesAlreadySent = 0;      // RAW window-to-date count from the counter
  let counterDeployed = false;
  let windowReset = false;         // §2: a 24h-elapsed OR new-order window → budget fresh
  let latestOrderAtMs: number | null = null;
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

    // ── Deploy-safe budget-counter read: images_sent + last_media_at land with 0070.
    //    Missing column (42703) → budget inert; the caps + hard-zero still fully apply.
    counterDeployed = true;
    const { data: cRow, error: cErr } = await admin
      .from("conversations")
      .select("images_sent, last_media_at")
      .eq("id", conversationId)
      .maybeSingle();
    if (cErr) {
      if (cErr.code === "42703" || /does not exist/i.test(cErr.message ?? "")) {
        counterDeployed = false;
      } else {
        // TRANSIENT read failure → FAIL SAFE: treat the budget as fully consumed so we
        // send NO images and offer the web menu. NEVER fall through to 0 (= over-send).
        imagesAlreadySent = CONVERSATION_MEDIA_BUDGET;
        counterDeployed = false;
      }
    } else {
      imagesAlreadySent = Number((cRow as { images_sent?: number } | null)?.images_sent ?? 0);
      // §2 — budget WINDOW: reset the budget on EITHER a rolling 24h OR when a new order
      // started since the last media send (whichever first) — computed from existing
      // timestamps, no new column. The latest-order read is only needed when usage is
      // non-zero (a reset only matters when there's something to reset).
      const lastMediaAt = (cRow as { last_media_at?: string | null } | null)?.last_media_at ?? null;
      if (imagesAlreadySent > 0) {
        const { data: ord } = await admin
          .from("orders")
          .select("created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const oc = (ord as { created_at?: string | null } | null)?.created_at ?? null;
        latestOrderAtMs = oc ? Date.parse(oc) : null;
      }
      windowReset = isMediaWindowReset({
        lastMediaAtMs: lastMediaAt ? Date.parse(lastMediaAt) : null,
        nowMs: Date.now(),
        latestOrderAtMs,
      });
    }
  }

  // §1/§5 — has a web-menu link already gone out in THIS budget window? (send once).
  // Window start mirrors the budget window: max(now−24h, latest order start). Queried
  // lazily — only when we actually might send a link (an ask or a budget fallback).
  let linkCheckDone = false;
  let linkAlreadySentThisWindow = false;
  const menuLinkSentThisWindow = async (): Promise<boolean> => {
    if (linkCheckDone) return linkAlreadySentThisWindow;
    linkCheckDone = true;
    const windowStartMs = Math.max(Date.now() - MEDIA_WINDOW_MS, latestOrderAtMs ?? 0);
    const { data } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("meta->>kind", "media_budget_menu_link")
      .gte("created_at", new Date(windowStartMs).toISOString())
      .limit(1)
      .maybeSingle();
    linkAlreadySentThisWindow = !!(data as { id?: string } | null)?.id;
    return linkAlreadySentThisWindow;
  };

  // §5 — LINK ON EXPLICIT ASK: an INTENTIONAL web-menu-link send (not a budget fallback),
  // once per window, and NEVER during a hard-zero (a link is media too). Satisfies the ask.
  if (mediaGuardOn && askedForMenuLink && !hardZero) {
    if (!(await menuLinkSentThisWindow())) {
      await sendMenuLinkFallback(admin, restaurantId, conversationId, phone, lastInboundAtMs);
    }
    return;
  }

  const decision = decideMediaSend({
    enabled: mediaGuardOn,
    requested: photoRequests.length,
    imagesAlreadySent: windowReset ? 0 : imagesAlreadySent,
    hardZero,
    hardZeroReason,
    perMessageCap,
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
      // §1 — DEDUP: send the fallback web-menu card at most ONCE per window; a further
      // budget exhaustion is handled by Karim's text (the §4 directive), no repeat card.
      if (!(await menuLinkSentThisWindow())) {
        await sendMenuLinkFallback(admin, restaurantId, conversationId, phone, lastInboundAtMs);
      }
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

  // WO-PHOTO-PERSIST — record each successfully-sent photo as a real message row so
  // the console transcript is complete (a dish photo was previously send-only, leaving
  // nothing to render). Behind persist_outbound_media, DEFAULT OFF → flag-off never
  // inserts, so the send path is byte-identical; the Wesaya flip happens post-merge.
  const persistOutboundMedia = isFeatureExplicitlyEnabled("persist_outbound_media", features);

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
      // Best-effort: the photo is already delivered; a persist failure must never
      // throw out of the send loop or undo the send.
      if (persistOutboundMedia) {
        try {
          await admin.from("messages").insert(buildDishPhotoMessage({
            restaurantId,
            conversationId,
            imageUrl: photo.imageUrl,
            name: photo.name,
            caption: captions[i],
            externalMessageId: send.externalMessageId ?? null,
          }));
        } catch { /* transcript row is bookkeeping — never fail the turn on it */ }
      }
    }
  }

  // Persist the conversation budget counter (best-effort; only when deployed). §2 — on a
  // window reset the base is 0 (this send starts a fresh window), else the running count.
  if (counterDeployed && sent > 0) {
    await admin
      .from("conversations")
      .update({ images_sent: (windowReset ? 0 : imagesAlreadySent) + sent, last_media_at: new Date().toISOString() })
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
    .select("id, owner, channel, customer_id, escalation_reason, updated_at, ownership_state, is_safety_hold, control_epoch, customers(phone)")
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
  let resumedByRecovery = false; // §1e·b — the customer chose to continue with Kivo
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

    const { data: rFlags } = await admin.from("restaurants").select("feature_flags, dialect, country").eq("id", restaurantId).single();
    const features = (rFlags?.feature_flags as Record<string, unknown> | null) ?? null;
    const dialect = resolveTenantDialect(rFlags as { dialect?: string | null; country?: string | null } | null, "respond-and-send.notify", restaurantId);
    const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";

    const calmHeld = await handleCalmHeldInbound(admin, {
      restaurantId,
      conversationId,
      ownershipState,
      isSafetyHold: (conv as { is_safety_hold?: boolean | null }).is_safety_hold ?? null,
      phone,
      dialect,
      features,
    });
    if (calmHeld) return calmHeld;

    // WO-COMPANION-W1-CORE §1e — RECOVERY (no purgatory, ever). A pending-human thread
    // that stalls must NEVER meet the customer with silence: ask «وصلك أحد من الفريق؟»
    // (+ re-alert / continue), re-alert on request, resume with Kivo on an EXPLICIT
    // affirmative (non-emergency), or explain an emergency hold needs a human (§1e·d).
    //
    // ⚠️ FLAG-SCOPING (carve-out — BOTH SIGN-OFFS): the recovery is GATED on
    // allergy_companion_mode in W1, so flag-OFF stays BYTE-IDENTICAL (the law). The spec
    // §1e scope-note argues this purgatory bug-fix SHOULD apply even flag-OFF; that
    // unflagged carve-out is DEFERRED to the dual sign-off (shipping an unflagged reply/
    // timing change on the Wesaya-live path is exactly what the highest-caution law
    // forbids without an explicit ruling). To promote it, drop the `companionOn &&`.
    const companionOn = isFeatureExplicitlyEnabled("allergy_companion_mode", features);
    if (companionOn) {
      const rec = await handleAllergyRecovery(admin, {
        restaurantId,
        conversationId,
        ownershipState,
        escalationReason: conv.escalation_reason as string | null,
        updatedAt: conv.updated_at as string | null,
        phone,
        dialect,
      });
      if (rec.kind === "reply") return rec.result;
      // rec.kind === "resume": ownership is now AI_ACTIVE, staff re-alerted, context
      // preserved — SKIP the legacy idle logic and fall through to the Brain turn.
      if (rec.kind === "resume") {
        resumedByRecovery = true;
      }
    }

    // WO-SAFETY-BRIDGE (FR-012 residual) — a SAFETY-CLASS inbound during HUMAN_ACTIVE with an
    // ABSENT operator must never sit unacknowledged. Runs BEFORE the readHandoffConfig / 772 bail
    // (so it also covers the handoff_timeout-OFF and not-yet-idle cases). Presence proxy = the
    // wait clock (updated_at, reset only by operator replies) stale past the short bridge window.
    // Effect: a caution ACK to the customer + a LOUD re-alert. Ownership stays human (NO
    // setOwnershipState); the wait clock is NOT bumped (an automated ack is not operator activity,
    // so the operator's absence stays truthful and the next re-alert is not suppressed). Deduped
    // to ≤1 per window via a `safety_bridge_ack` system-note marker. Flag OFF → never evaluated →
    // byte-identical.
    // WO-SIMPLIFY (PART A) — the simple-allergy posture BYPASSES the safety-bridge injection
    // (branched, never deleted): its deflection + human offer already handle allergy safety, so
    // the bridge ACK must not also inject «صحتك تهمّنا» on top. Flag OFF → unchanged behavior.
    if (!resumedByRecovery && isFeatureExplicitlyEnabled("safety_bridge", features) &&
        !isFeatureExplicitlyEnabled("allergy_simple", features) &&
        isIdleBeyond(conv.updated_at as string | null, SAFETY_BRIDGE_WINDOW_MINUTES)) {
      const { data: lastInbound } = await admin
        .from("messages")
        .select("text, created_at")
        .eq("conversation_id", conversationId)
        .eq("sender", "customer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const inboundText = (lastInbound as { text?: string | null } | null)?.text ?? "";
      if (inboundText && isSafetyClassInbound(inboundText)) {
        // Dedup: did we already bridge within this window? (Mirrors realertOperator's marker check.)
        const sinceIso = new Date(Date.now() - SAFETY_BRIDGE_WINDOW_MINUTES * 60 * 1000).toISOString();
        const { data: marks } = await admin
          .from("messages")
          .select("meta")
          .eq("conversation_id", conversationId)
          .eq("sender", "system")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(5);
        const alreadyBridged = (marks ?? []).some((m) => (m.meta as Record<string, unknown> | null)?.kind === "safety_bridge_ack");
        if (alreadyBridged) return { status: "skipped_takeover" }; // already acked this window — stay silent

        const phone = (conv.customers as { phone?: string } | null)?.phone ?? "";
        const ackDialect = resolveTenantDialect(rFlags as { dialect?: string | null; country?: string | null } | null, "respond-and-send.ack", restaurantId);
        const ackText = formatCustomerVisibleText(safetyBridgeAck(ackDialect), ackDialect);
        // 1. CUSTOMER ACK — persist + send. NOTE: we do NOT bump conversations.updated_at (unlike
        //    the recovery send): an automated ack is not operator activity.
        const { data: ackMsg } = await admin
          .from("messages")
          .insert({
            restaurant_id: restaurantId,
            conversation_id: conversationId,
            direction: "outbound",
            sender: "ai",
            text: ackText,
            status: "sent",
            meta: { kind: "safety_bridge_ack" },
          })
          .select("id")
          .single();
        const ackSend = await sendWhatsAppText({ to: phone, text: ackText, lastInboundAtMs: Date.now() });
        if (ackMsg?.id) {
          await admin
            .from("messages")
            .update(ackSend.status === "sent" ? { status: "sent", channel_message_id: ackSend.externalMessageId ?? null } : { status: "failed" })
            .eq("id", ackMsg.id);
        }
        // Dedup marker (system note) — the window guard above keys on this.
        await noteToTimeline(admin, restaurantId, conversationId,
          "🔒 رسالة سلامة/حساسية وصلت والمحادثة مع موظف — بعتنا للعميل إشعار مبدئي ونبّهنا الفريق للمتابعة.",
          { kind: "safety_bridge_ack" });
        // 2. LOUD re-alert (banner + WhatsApp-to-admin + email), deduped per-conversation while active.
        await recordCriticalAlert(admin, {
          restaurantId,
          type: "safety_unattended_handoff",
          detail: "وصلت رسالة سلامة/حساسية من العميل والمحادثة محوّلة لموظف بدون متابعة — محتاجة تدخّل بشري فوري.",
          conversationId,
        });
        // Ownership UNCHANGED (no setOwnershipState) — the human still owns the thread.
        return { status: "safety_bridged", reply: ackText, sendStatus: ackSend.status };
      }
    }

    const cfg = readHandoffConfig(features);
    const idle = !resumedByRecovery && cfg.enabled && isIdleBeyond(conv.updated_at as string | null, cfg.idleMinutes);
    if (!resumedByRecovery && !idle) return { status: "skipped_takeover" };
    if (!resumedByRecovery) {

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
    } // end !resumedByRecovery (legacy idle policy)
  }

  // Mode gate (incident control, §F): only auto-reply in modes that allow it.
  // A tenant flipped to setup/paused leaves the inbound for human handling — no
  // auto-reply — while test/live (and closed) reply normally. The stored
  // agent_mode (setup|test|live|paused) maps onto SystemMode; a missing value
  // defaults to live so the existing reply path is unchanged.
  const { data: rest } = await admin.from("restaurants").select("agent_mode, feature_flags, dialect, country").eq("id", restaurantId).single();
  const agentMode = ((rest?.agent_mode as string) || "live") as SystemMode;
  if (!modeAllowsAgentReply(agentMode)) return { status: "skipped_mode" };
  // WO-LIVE4-F2 — per-conversation inbound coalescing (flag inbound_coalescing, default
  // OFF). feature_flags is an existing column, so folding it into the agent_mode read is
  // deploy-safe; the WATERMARK column read below is the one that must degrade gracefully.
  const convFlags = (rest?.feature_flags as Record<string, unknown> | null) ?? null;
  // `country` BELONGS in this select. It is not a late-migration column: `country text not
  // null default 'SA'` is in 0001_init.sql, the ORIGINAL schema, and lib/db/conversations.ts
  // already reads it standalone and unguarded on the conversation-creation path. It was once
  // removed from here on the belief that it was one of the "tester" columns of migration
  // 0057 and would 42703 on an early deploy; the only thing that said so was an over-broad
  // regex in proof-tester-allowlist.test.ts, whose own comment scopes that deploy-safety
  // invariant to the tester columns. country is merely co-selected with them there.
  //
  // The omission was not harmless. This dialect feeds formatCustomerVisibleText (digit
  // style) and the Najdi-vs-Cairene resume line below, so a tenant in the fallback state
  // resolved SAUDI in the brain (which sees country) and EGYPTIAN here — a SPLIT persona,
  // an Egyptian reply rendered with Saudi digits, which is a worse failure than being
  // uniformly wrong in one direction.
  const outboundDialect = resolveTenantDialect(rest as { dialect?: string | null; country?: string | null } | null, "respond-and-send.outbound", restaurantId);
  const coalescingOn = isFeatureExplicitlyEnabled("inbound_coalescing", convFlags);

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

  // WO-LIVE6-TURN-LOCK — BLOCKING atomic per-conversation claim BEFORE the watermark read,
  // so two concurrent webhooks for the same conversation can't both read the pre-turn
  // watermark and both reply (live dup: conv 68966859 — two turns 56ms apart on identical
  // input; the conversation_locks mutex did not serialize them). The winner runs; a loser
  // BLOCKS here, then the watermark read + coalescing below re-evaluate against the winner's
  // freshly-stamped watermark → an already-covered burst returns null (silent), a mid-turn
  // straggler is answered (never dropped). Gated on coalescingOn (the same flag F2 rides);
  // deploy-safe — a missing 0086 column / transient error proceeds anyway (never drop), and
  // flag-off tenants never enter here → byte-identical.
  let turnClaimDeployed = false;
  if (coalescingOn) {
    const claim = await claimTurn(admin, conversationId);
    turnClaimDeployed = claim.deployed;
  }

  // WO-LIVE4-F2 — INBOUND COALESCING (flag inbound_coalescing). Meta delivers each
  // message as its own webhook, so a rapid burst (or a pin-then-text) otherwise becomes
  // N Brain turns = N replies, and only the NEWEST message reaches the gated userMessage
  // (an allergy that isn't last bypasses the deterministic INPUT gate). Read the 0085
  // watermark (deploy-safe: a missing column / transient read → coalescing inert, exactly
  // the legacy single-message path). coalesceInbound then either merges the unanswered
  // burst into ONE gated turn or, for the second webhook of a burst, returns null (empty
  // burst) → we stay silent (no double reply). Flag OFF → enabled:false → byte-identical.
  let watermarkMs: number | null = null;
  let coalescingActive = false;
  if (coalescingOn) {
    const { data: wmRow, error: wmErr } = await admin
      .from("conversations")
      .select("last_answered_inbound_at")
      .eq("id", conversationId)
      .maybeSingle();
    if (!wmErr) {
      coalescingActive = true;
      const wm = (wmRow as { last_answered_inbound_at?: string | null } | null)?.last_answered_inbound_at ?? null;
      watermarkMs = wm ? Date.parse(wm) : null;
    }
    // wmErr (0085 not applied / transient) → coalescingActive stays false → single-message.
  }
  const coalesced = coalesceInbound(rows, { enabled: coalescingActive, watermarkMs });
  if (!coalesced) {
    // WO-LIVE6-TURN-LOCK — the winner already covered this burst (watermark advanced past
    // it): release the claim we may hold and stay silent (never wedge the conversation).
    if (turnClaimDeployed) await releaseTurn(admin, conversationId);
    return { status: "skipped_no_customer_msg" };
  }

  const rawText = coalesced.mergedText;
  const lastInteractiveId = (coalesced.anchor.meta as { interactiveId?: string } | null)?.interactiveId;
  const lastInboundAtMs = coalesced.maxCreatedAtMs;

  // WO-FIX-INTERACTIVE — a WhatsApp tap is a command id, not text for the model.
  // Known ids are handled unconditionally before runCustomerTurn; unknown ids get
  // a deterministic retry reply and an operator-visible log. The one carve-out is
  // a coalesced burst with an earlier safety signal: the safety gate gets the full
  // merged text and wins over the tap. The bridge can only use current menu state
  // + latest/fresh draft checks here: full prompt lineage/action tokens belong to
  // the BRAIN scoped-prompt model, so this is a safest-available staleness guard,
  // not a solved prompt-lineage proof.
  let typedConfirmMessage: string | null = null;
  const cleanInteractiveId = typeof lastInteractiveId === "string" ? lastInteractiveId.trim() : "";
  if (cleanInteractiveId) {
    // Structured-intake gate law: a bare tap carries no customer text. For a
    // coalesced burst, scan the merged text so an earlier safety disclosure is
    // never swallowed by a trailing button/list tap.
    const tapSafetyText = coalesced.count === 1 ? "" : rawText;
    const tapSafetyProbe = {
      allergenAvoidance: detectAllergenAvoidance(tapSafetyText).fired,
      allergenSymptom: detectAllergenSymptom(tapSafetyText).fired,
      phoneticSafetyNet: detectPhoneticSafetyNet(tapSafetyText, { sttConfidence: null, isVoiceTranscript: false }).fired,
      allergenEmergency: detectAllergenEmergency(tapSafetyText).fired,
    };
    const burstSafetyTakesPriority = coalesced.count > 1 && safetyProbeFired(tapSafetyProbe);
    if (!burstSafetyTakesPriority && !isTypedInteractiveActionId(cleanInteractiveId)) {
      let unknown: UnknownInteractiveCommandResult;
      try {
        unknown = await handleUnknownInteractiveCommand(admin, {
          restaurantId,
          conversationId,
          interactiveId: cleanInteractiveId,
          fallbackText: rawText,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await sendAgentErrorFallbackToCustomer(admin, restaurantId, conversationId, phone, lastInboundAtMs);
        await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
          extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `unknown_interactive_error: ${detail}` },
        });
        await noteToTimeline(
          admin,
          restaurantId,
          conversationId,
          "تعذّر التعامل مع اختيار تفاعلي غير معروف — تم تحويل المحادثة لموظف للمتابعة.",
          { kind: "unknown_interactive_error", detail, interactiveId: cleanInteractiveId }
        );
        await recordCriticalAlert(admin, { restaurantId, type: "agent_error", detail: `unknown_interactive_error: ${detail}`, conversationId });
        if (turnClaimDeployed) await releaseTurn(admin, conversationId);
        return { status: "agent_error", error: detail };
      }
      if (coalescingActive) {
        try {
          await admin
            .from("conversations")
            .update({ last_answered_inbound_at: new Date(coalesced.maxCreatedAtMs).toISOString() })
            .eq("id", conversationId);
        } catch (e) {
          console.error("[respond-and-send] unknown-interactive watermark update failed (non-blocking)", e);
        }
      }
      if (turnClaimDeployed) await releaseTurn(admin, conversationId);
      const unknownReply = formatCustomerVisibleText(unknown.reply, outboundDialect);
      const send = await sendWhatsAppText({ to: phone, text: unknownReply, lastInboundAtMs });
      if (unknown.replyMessageId) {
        await admin
          .from("messages")
          .update(
            send.status === "sent"
              ? { text: unknownReply, status: "sent", channel_message_id: send.externalMessageId ?? null }
              : { text: unknownReply, status: send.status === "skipped" ? "sent" : "failed" }
          )
          .eq("id", unknown.replyMessageId);
      }
      if (send.status === "failed") {
        await noteToTimeline(
          admin,
          restaurantId,
          conversationId,
          `تعذّر إرسال رد اختيار غير معروف عبر واتساب: ${send.error ?? "خطأ غير معروف"}. الرسالة محفوظة ويمكن إعادة المحاولة.`,
          { kind: "send_error", source: "unknown_interactive_id", interactiveId: unknown.id, windowState: send.windowState, attempts: send.attempts }
        );
        return { status: "send_failed", reply: unknownReply, sendStatus: "failed", error: send.error };
      }
      return { status: "responded", reply: unknownReply, escalate: false, sendStatus: send.status };
    }

    if (!burstSafetyTakesPriority) {
      let typed: TypedInteractiveActionResult;
      try {
        typed = await handleTypedInteractiveAction(admin, {
          restaurantId,
          conversationId,
          interactiveId: cleanInteractiveId,
          features: convFlags,
          safetyProbe: tapSafetyProbe,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        await sendAgentErrorFallbackToCustomer(admin, restaurantId, conversationId, phone, lastInboundAtMs);
        await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
          extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `typed_action_error: ${detail}` },
        });
        await noteToTimeline(
          admin,
          restaurantId,
          conversationId,
          "تعذّر تنفيذ الإجراء التفاعلي تلقائياً — تم تحويل المحادثة لموظف للمتابعة.",
          { kind: "typed_action_error", detail }
        );
        await recordCriticalAlert(admin, { restaurantId, type: "agent_error", detail: `typed_action_error: ${detail}`, conversationId });
        if (turnClaimDeployed) await releaseTurn(admin, conversationId);
        return { status: "agent_error", error: detail };
      }
      if (typed.kind === "confirm_gate") {
        // confirm_order must still pass through the existing confirm/allergen gate.
        // At a real confirmation point that path is deterministic and performs no
        // LLM generation; stale/invalid confirms keep today's guarded behavior.
        typedConfirmMessage = typed.userMessage;
      } else {
        if (coalescingActive) {
          try {
            await admin
              .from("conversations")
              .update({ last_answered_inbound_at: new Date(coalesced.maxCreatedAtMs).toISOString() })
              .eq("id", conversationId);
          } catch (e) {
            console.error("[respond-and-send] typed-action watermark update failed (non-blocking)", e);
          }
        }
        if (turnClaimDeployed) await releaseTurn(admin, conversationId);
        const typedReply = formatCustomerVisibleText(typed.reply, outboundDialect);
        const typedPresentation = typed.presentation
          ? formatCustomerVisiblePresentation(typed.presentation, outboundDialect)
          : null;
        const send = typedPresentation
          ? await sendWhatsAppInteractive({ to: phone, body: typedReply, presentation: typedPresentation, lastInboundAtMs })
          : await sendWhatsAppText({ to: phone, text: typedReply, lastInboundAtMs });
        if (typed.replyMessageId) {
          await admin
            .from("messages")
            .update(
              send.status === "sent"
                ? { text: typedReply, status: "sent", channel_message_id: send.externalMessageId ?? null }
                : { text: typedReply, status: send.status === "skipped" ? "sent" : "failed" }
            )
            .eq("id", typed.replyMessageId);
        }
        if (send.status === "failed") {
          await noteToTimeline(
            admin,
            restaurantId,
            conversationId,
            `تعذّر إرسال رد الإجراء التفاعلي عبر واتساب: ${send.error ?? "خطأ غير معروف"}. الرسالة محفوظة ويمكن إعادة المحاولة.`,
            { kind: "send_error", source: "typed_interactive_action", action: typed.action, windowState: send.windowState, attempts: send.attempts }
          );
          return { status: "send_failed", reply: typedReply, sendStatus: "failed", error: send.error };
        }
        return { status: "responded", reply: typedReply, escalate: false, sendStatus: send.status };
      }
    }
  }

  // WO-QTY — typed_quantity_fill (default OFF): when Karim's last turn asked a
  // quantity question for the current draft item, a bare numeric answer is handled
  // by the same deterministic server rail as quantity taps. qty:N button ids are
  // already handled unconditionally above. Non-numeric input, a stale/no pending
  // quantity prompt, or an ambiguous draft falls through below unchanged to the
  // existing model path.
  if (
    coalesced.count === 1 &&
    typedConfirmMessage == null &&
    !cleanInteractiveId &&
    isFeatureExplicitlyEnabled("typed_quantity_fill", convFlags)
  ) {
    const quantitySafetyProbe = {
      allergenAvoidance: detectAllergenAvoidance(rawText).fired,
      allergenSymptom: detectAllergenSymptom(rawText).fired,
      phoneticSafetyNet: detectPhoneticSafetyNet(rawText, { sttConfidence: null, isVoiceTranscript: false }).fired,
      allergenEmergency: detectAllergenEmergency(rawText).fired,
    };
    let typed;
    try {
      typed = await handleTypedQuantityFill(admin, {
        restaurantId,
        conversationId,
        userMessage: rawText,
        interactiveId: lastInteractiveId,
        features: convFlags,
        safetyProbe: quantitySafetyProbe,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await sendAgentErrorFallbackToCustomer(admin, restaurantId, conversationId, phone, lastInboundAtMs);
      await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", {
        extra: { owner: "human", status: "يحتاج تدخل موظف", escalation_reason: `typed_quantity_fill_error: ${detail}` },
      });
      await noteToTimeline(
        admin,
        restaurantId,
        conversationId,
        "تعذّر ضبط الكمية تلقائياً — تم تحويل المحادثة لموظف للمتابعة.",
        { kind: "typed_quantity_fill_error", detail }
      );
      await recordCriticalAlert(admin, { restaurantId, type: "agent_error", detail: `typed_quantity_fill_error: ${detail}`, conversationId });
      if (turnClaimDeployed) await releaseTurn(admin, conversationId);
      return { status: "agent_error", error: detail };
    }
    if (typed.kind === "handled") {
      if (coalescingActive) {
        try {
          await admin
            .from("conversations")
            .update({ last_answered_inbound_at: new Date(coalesced.maxCreatedAtMs).toISOString() })
            .eq("id", conversationId);
        } catch (e) {
          console.error("[respond-and-send] typed-quantity watermark update failed (non-blocking)", e);
        }
      }
      if (turnClaimDeployed) await releaseTurn(admin, conversationId);
      const send = typed.presentation
        ? await sendWhatsAppInteractive({ to: phone, body: typed.reply, presentation: typed.presentation, lastInboundAtMs })
        : await sendWhatsAppText({ to: phone, text: typed.reply, lastInboundAtMs });
      if (typed.replyMessageId) {
        await admin
          .from("messages")
          .update(
            send.status === "sent"
              ? { status: "sent", channel_message_id: send.externalMessageId ?? null }
              : { status: send.status === "skipped" ? "sent" : "failed" }
          )
          .eq("id", typed.replyMessageId);
      }
      if (send.status === "failed") {
        await noteToTimeline(
          admin,
          restaurantId,
          conversationId,
          `تعذّر إرسال رد ضبط الكمية عبر واتساب: ${send.error ?? "خطأ غير معروف"}. الرسالة محفوظة ويمكن إعادة المحاولة.`,
          { kind: "send_error", source: "typed_quantity_fill", action: typed.action, windowState: send.windowState, attempts: send.attempts }
        );
        return { status: "send_failed", reply: typed.reply, sendStatus: "failed", error: send.error };
      }
      return { status: "responded", reply: typed.reply, escalate: false, sendStatus: send.status };
    }
  }

  const userMessage = typedConfirmMessage ?? rawText;
  if (!userMessage) {
    if (turnClaimDeployed) await releaseTurn(admin, conversationId); // WO-LIVE6-TURN-LOCK — never wedge
    return { status: "skipped_no_customer_msg" };
  }
  // WO-VOICE-1/2 + WO-DELIVERY-D1 + WO-MEDIA-INBOUND — the per-turn signals. The
  // single-message signals (STT confidence, voice door, interactive id) come from the
  // ANCHOR (the newest burst message); a location pin / image is honored ANYWHERE in the
  // burst (coalesceInbound picks the newest row carrying each), so a pin-then-text burst
  // still routes the pin this turn. All undefined off-flag → runCustomerTurn ignores them.
  const sttConfidence = (coalesced.anchor.meta as { stt_confidence?: number } | null)?.stt_confidence;
  const inboundWasVoice = (coalesced.anchor.meta as { voice?: boolean } | null)?.voice === true;
  const pinLocation = (coalesced.pinRow?.meta as { location?: { lat: number; lng: number; name?: string; address?: string } } | null)?.location;
  const lastImage = (coalesced.imageRow?.meta as { image?: { caption?: string; description?: string | null } } | null)?.image;

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
  // WO-LIVE4-F2 — when coalescing merged a burst into userMessage, drop those same burst
  // customer rows from the LLM history (they'd otherwise appear twice — once merged, once
  // as history). The excluded set mirrors coalesceInbound's floor: customer rows strictly
  // newer than the watermark, or (cold start) newer than the last reply. Flag OFF /
  // inactive → nothing excluded → history byte-identical.
  const burstFloorMs = coalescingActive
    ? (watermarkMs ?? (() => {
        const lastReply = [...rows].reverse().find((m) => m.sender === "ai" || m.sender === "human");
        return lastReply ? Date.parse(lastReply.created_at) : -Infinity;
      })())
    : Infinity;
  const inCoalescedBurst = (m: { sender: string; created_at: string }) =>
    coalescingActive && m.sender === "customer" && Date.parse(m.created_at) > burstFloorMs;
  const histRows = rows.slice(0, lastCustomerIdx).filter((m) => m.text && m.sender !== "system" && !inCoalescedBurst(m));
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
    // WO-MEDIA-INBOUND — a PRIOR customer image turn: fold the vision READ into this
    // history line so a LATER turn "sees" the image (this is exactly why the next text
    // after the flyer could reference it). The read is appended ONLY behind its
    // provenance marker (imageHistoryContent) — clearly NOT customer text, and never
    // gate input (history is not gated; only the current userMessage is).
    if (m.sender === "customer") {
      const desc = (m.meta as { image?: { description?: string | null } } | null)?.image?.description;
      const content = desc ? imageHistoryContent(m.text as string, desc) : (m.text as string);
      return { role: "user", content };
    }
    return { role: "assistant", content: m.text as string };
  });

  // HANDOFF-HARDENING (Fix 1): after a timeout auto-return, open with an honest
  // resume line that acknowledges the wait BEFORE the Brain answers the message.
  if (resumedAfterTimeout) {
    // DIALECT-BRANCHED. This was one unbranched Egyptian line carrying three markers the
    // linter bans — «معلش», «معاك», «دلوقتي» — sent to every tenant including Saudi ones.
    const resumeText = formatCustomerVisibleText(
      outboundDialect === "saudi"
        ? "العذر منك تأخّرنا عليك 🙏 أنا معك الحين ونكمّل على طول."
        : "معلش اتأخرنا عليك 🙏 أنا معاك دلوقتي ونكمّل على طول.",
      outboundDialect,
    );
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

  // WO-LIVE6-REPLY-DAMPENER — after 2 answered unclear-fragment replies within a short window,
  // a 3rd+ unclear fragment gets SILENCE (kills the «مش فاهم» pile-up: live conv 68966859,
  // 15:18–15:19). SAFETY-FIRST (binding): the allergen net + human-request detector run HERE and
  // ALWAYS win — a safety/human-request message is NEVER dampened; any meaningful message resets
  // the streak (which is derived from the recent messages already in `rows` — no schema). Flag
  // OFF → never evaluated → byte-identical. Placed just before the Brain turn so a dampened
  // fragment costs no LLM call and sends nothing.
  if (isFeatureExplicitlyEnabled("reply_dampener", convFlags)) {
    const safetyOrHuman =
      detectAllergenAvoidance(userMessage).fired ||
      detectAllergenSymptom(userMessage).fired ||
      detectPhoneticSafetyNet(userMessage, { sttConfidence, isVoiceTranscript: inboundWasVoice }).fired ||
      detectAllergenEmergency(userMessage).fired ||
      isExplicitHumanRequest(userMessage);
    if (!safetyOrHuman) {
      const priorCustomer = rows
        .slice(0, lastCustomerIdx)
        .filter((m) => m.sender === "customer" && !!m.text)
        .reverse() // most-recent-first
        .map((m) => ({ text: m.text as string, createdAtMs: Date.parse(m.created_at) }));
      if (shouldDampenReply(userMessage, priorCustomer, Date.now())) {
        // Stay silent — release the turn claim so the conversation never wedges, advance no
        // watermark (this fragment was not answered), and send nothing.
        if (turnClaimDeployed) await releaseTurn(admin, conversationId);
        return { status: "dampened" };
      }
    }
  }

  // WO-CONTROL Part B — capture the control_epoch at AI-turn start. The reply is composed
  // against THIS epoch; if a human claims the conversation while the Brain thinks, the epoch
  // bumps and the send chokepoint drops the (now stale) reply. Deploy-safe: null pre-migration
  // → the gate stays inert. Prefer the value already read on the conv row; fall back to a fresh
  // read only if it was absent.
  let controlEpochAtStart =
    (conv as { control_epoch?: number | null }).control_epoch ?? (await readControlEpoch(admin, conversationId));

  // 3. Brain turn — persists the AI reply, logs cost to agent_runs, flips to
  //    human on escalation. Any failure hands the thread to a human + notes it.
  let outcome;
  try {
    outcome = await runCustomerTurn(admin, { restaurantId, conversationId, history, userMessage, sttConfidence, isVoiceTranscript: inboundWasVoice, pinLocation, imageContext: lastImage ? { caption: lastImage.caption ?? null, description: lastImage.description ?? null } : null });
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
    // WO-LIVE6-TURN-LOCK — release the claim on the error path too (the watermark below is
    // NOT reached, so it stays a post-success truth; the claim frees the conversation now
    // rather than waiting out the TTL).
    if (turnClaimDeployed) await releaseTurn(admin, conversationId);
    return { status: "agent_error", error: detail };
  }

  // WO-LIVE4-F2 — the turn answered the whole coalesced burst: advance the watermark to
  // the newest customer message it covered, so a later webhook for a message at/under it
  // stays silent (no double reply) while a message that landed mid-turn (strictly newer)
  // gets its own turn (never dropped). Best-effort, only when the 0085 column is present;
  // the error path above returns before here, so a failed turn never advances the mark.
  if (coalescingActive) {
    try {
      await admin
        .from("conversations")
        .update({ last_answered_inbound_at: new Date(coalesced.maxCreatedAtMs).toISOString() })
        .eq("id", conversationId);
    } catch (e) {
      console.error("[respond-and-send] coalescing watermark update failed (non-blocking)", e);
    }
  }

  // WO-LIVE6-TURN-LOCK — the watermark is now the post-success truth, so release the claim:
  // any concurrent arrival re-reads the advanced watermark → empty burst → silent, and a
  // genuine follow-up (a message strictly newer than the watermark) can claim immediately.
  if (turnClaimDeployed) await releaseTurn(admin, conversationId);

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

  // WO-CONTROL Part B — re-baseline the enqueue epoch when the BRAIN itself performed an
  // ownership transition this turn (an escalation/handoff). Its own transition bumped the
  // epoch, and its reply (the handoff message) must still send — so the gate must compare
  // against the POST-transition epoch, not turn-start. Only an EXTERNAL change after this
  // point (a human claim) then blocks the send. A non-escalating turn keeps the turn-start
  // epoch, so a mid-turn human claim is caught.
  if (outcome.escalate === true) {
    controlEpochAtStart = (await readControlEpoch(admin, conversationId)) ?? controlEpochAtStart;
  }

  // 4. Put the reply on the WhatsApp wire — as an interactive message when the
  //    Brain presented options (degrades to numbered text on failure), else text.
  const outboundReply = formatCustomerVisibleText(outcome.reply, outboundDialect);
  const outboundPresentation = outcome.presentation
    ? formatCustomerVisiblePresentation(outcome.presentation, outboundDialect)
    : null;
  // The control_epoch guard rides with the send; the outbound chokepoint re-reads the
  // epoch immediately before the WhatsApp API call and drops a stale reply.
  const epochGuard = { admin, conversationId, restaurantId, epochAtEnqueue: controlEpochAtStart, source: "ai_reply" };
  const send = outboundPresentation
    ? await sendWhatsAppInteractive({ to: phone, body: outboundReply, presentation: outboundPresentation, lastInboundAtMs, guard: epochGuard })
    : await sendWhatsAppText({ to: phone, text: outboundReply, lastInboundAtMs, guard: epochGuard });

  // WO-CONTROL Part B — the reply was dropped as a stale sender (a human claimed the
  // conversation mid-turn). Nothing transmitted; the signal is already logged. Mark the
  // persisted reply failed (it never went out) and return without perception/voice/media.
  if (send.blocked === "stale_sender") {
    if (outcome.replyMessageId) {
      await admin.from("messages").update({ status: "failed" }).eq("id", outcome.replyMessageId);
    }
    return { status: "blocked_stale_sender", reply: outboundReply, escalate: outcome.escalate };
  }

  if ((send.status === "sent" || send.status === "skipped") && outcome.perceptionAsync) {
    scheduleAsyncPerceptionAfterReply(admin, { restaurantId, conversationId, history, userMessage });
  }

  // WO-VOICE-2 — ADDITIVE voice note. The text reply above already went (voice is
  // never a replacement). Flag-gated (voice_notes, default OFF); fires only when the
  // customer opened the door AND the turn is not a hard-zero category (safety/money/
  // link/receipt → text-only, ruling A). Best-effort — never blocks the text path.
  if (send.status === "sent" && conversationId && isFeatureExplicitlyEnabled("voice_notes", outcome.features)) {
    void maybeSendVoiceNote(admin, {
      restaurantId,
      conversationId,
      phone,
      replyText: outboundReply,
      inboundWasVoice,
      userMessage,
      tenantDialect: outboundDialect,
      features: outcome.features,
      // DERIVED FROM THE TURN, NOT FROM PROXIES — the same fix the demo route got, on the
      // surface that matters more. `escalate === true` does not identify a safety turn:
      // the ACTIVE ANAPHYLAXIS branch (customer-turn.ts companionEmergencyResult) returns
      // escalate:false and deliberately does not hold, so «🚨 اتصل بالإسعاف 997 الحين» was
      // sent to a real customer AS A VOICE NOTE. The deterministic allergen gate and the
      // allergy checkpoint escaped the same way; only the calm hold was caught, and only
      // because enterCalmAllergyHold writes is_safety_hold to the row first.
      //
      // An ambulance number is the one sentence in this product where a mis-heard digit
      // has a physical consequence, and voice-budget.ts rules it text-only for exactly
      // that reason. voiceSignalsForTurn reads stopReason, which every deterministic
      // branch sets truthfully, and fails closed on anything unlisted.
      ...voiceSignalsForTurn({
        stopReason: outcome.stopReason,
        escalate: outcome.escalate,
        model: outcome.model,
        // A receipt resend is a receipt even when the branch itself is an ordinary turn.
        orderNumber: outcome.resendReceipt === true ? "resend" : null,
      }),
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
    // WO-LIVE-3 §5 — also engage the media path on an explicit menu/link ask (even with
    // no photos requested), so Karim can send the web menu link intentionally (once).
    if (outcome.photoRequests.length || asksForMenuLink(userMessage)) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs, { ownership_state: ownershipState, escalation_reason: (conv.escalation_reason as string | null) ?? null }, outcome.features, userMessage);
    }
    if (outcome.replyMessageId) {
      await admin
        .from("messages")
        .update({ text: outboundReply, status: "sent", channel_message_id: send.externalMessageId ?? null })
        .eq("id", outcome.replyMessageId);
    }
    return { status: "responded", reply: outboundReply, escalate: outcome.escalate, sendStatus: "sent" };
  }

  if (send.status === "skipped") {
    // Test mode (no credentials): the reply is persisted, just not transmitted.
    if (outcome.photoRequests.length || asksForMenuLink(userMessage)) {
      await sendRequestedPhotos(admin, restaurantId, conversationId, phone, outcome.photoRequests, lastInboundAtMs, { ownership_state: ownershipState, escalation_reason: (conv.escalation_reason as string | null) ?? null }, outcome.features, userMessage);
    }
    if (outcome.replyMessageId) {
      await admin.from("messages").update({ text: outboundReply }).eq("id", outcome.replyMessageId);
    }
    return { status: "responded", reply: outboundReply, escalate: outcome.escalate, sendStatus: "skipped" };
  }

  // Real failure (network / 4xx after retries, or outside the 24h window) —
  // mark the reply failed and surface it so an operator can act. Nothing dropped.
  if (outcome.replyMessageId) {
    await admin.from("messages").update({ text: outboundReply, status: "failed" }).eq("id", outcome.replyMessageId);
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
    reply: outboundReply,
    escalate: outcome.escalate,
    sendStatus: send.status,
    error: send.error,
  };
}
