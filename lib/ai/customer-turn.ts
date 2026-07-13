// ============================================================================
// MaitreAI — Customer-turn orchestrator (Sprint 9, S9-1) — SERVER ONLY
// The single place that runs one Customer-Agent Brain turn against the live
// adapter AND persists the outcome (AI reply + agent_runs cost row + signals +
// escalation→human flip). Extracted from /api/agent/respond so BOTH the
// secret-guarded HTTP route (scripts/eval) and the WhatsApp webhook bridge
// (lib/messaging/respond-and-send) share exactly one Brain path — no drift, no
// double-counting. Money is computed by the order tools, never the model.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrain } from "@/lib/db/brain";
import { isPromoActiveNow } from "@/lib/promo";
import { respond, isExplicitOrderConfirmation, type RespondResult } from "@/lib/ai/respond";
import { deriveSystemMode } from "@/lib/ai/modes";
import { costUsd, modelFor } from "@/lib/ai/llm";
import { seedAiTone } from "@/lib/seed-data";
import type { BrainContext } from "@/lib/ai/prompt";
import type { StandingInstruction, TonightNote } from "@/lib/ai/standing-instructions";
import { loadResolvedPaymentMethods } from "@/lib/payments/resolve";
import { type Tier, isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { isExplicitHumanRequest } from "@/lib/ai/human-request";
import { recordCriticalAlert } from "@/lib/alerts/record";
import { setOwnershipState } from "@/lib/db/ownership";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";
import { detectAllergenSymptom } from "@/lib/ai/allergen-gate-symptoms";
// WO-COMPANION-W1-CORE (§1a/§5): the deterministic companion FLOW spine + authored
// texts + the write-side effects. Consulted ONLY when allergy_companion_mode is ON.
import {
  decideCompanionAction,
  emergencyReply,
  type CompanionDecision,
} from "@/lib/ai/allergen-companion-flow";
import { detectAllergenEmergency } from "@/lib/ai/allergen-emergency";
import { decideVoiceLadder, garbledVoiceReply, confirmVoiceReply, isVoiceAssent, wasVoiceLadderConfirm } from "@/lib/ai/voice-quality";
import { resolveVoiceCandidates, expectedAnswerClass, type VoiceCandidate } from "@/lib/ai/voice-aliases";
import { applyCompanionSideEffects } from "@/lib/db/allergy-companion-effects";
import { recordAllergyEvent, buildBannedPhraseBlockAudit } from "@/lib/db/allergy-audit";
import { asksForMenuLink, asksToSeeMedia, buildAnswerFirstDirective } from "@/lib/ai/media-intent";
import { CONVERSATION_MEDIA_BUDGET } from "@/lib/messaging/media-guard";
import { isMediaWindowReset, buildMediaDirective } from "@/lib/messaging/media-window";
import { detectPhoneticSafetyNet } from "@/lib/ai/phonetic-safety-net";
import { resolveKsaRegion } from "@/lib/ai/personas/khalid";
// WO-KHALID-STEP2: dialect-leakage QUALITY linter (observability only — NOT the safety
// gate). Separate lane from allergen-gate/safety-hold/escalation; never blocks a turn.
import { findLeakage } from "@/lib/ai/personas/khalid-dialect-linter.mjs";
import { detectCallbackRequest } from "@/lib/ai/callback-trigger";
// WO-LIVE6-DUP-ORDER-AWARENESS — deterministic "refers to an order I already placed"
// detector + Arabic-Indic order-number rendering for the recap. Consulted ONLY when the
// dup_order_awareness flag is ON and a registered order exists this conversation.
import { refersToRegisteredOrder } from "@/lib/ai/order-reference";
import { toArabicDigits } from "@/lib/util/arabic-digits";
import { perceiveTurn, recoveryDirective, cadenceCue, type PerceptionRead } from "@/lib/ai/perception";
import { emitConversationReport } from "@/lib/intelligence/conversation-report";
import type { LlmMessage, LlmUsage } from "@/lib/ai/llm/types";
import { emptyDraft, type OrderDraft, type PhotoRequest, type Presentation, type ToolSignal } from "@/lib/ai/tools";
import { applyPinRouting } from "@/lib/delivery/routing";
import { buildImageDirective } from "@/lib/messaging/image-turn";
import type { AiToneConfig } from "@/lib/types";
import { dialectProfile } from "@/lib/ai/dialect";

/** Typed error so callers can map to the right HTTP status / timeline note. */
export class CustomerTurnError extends Error {
  // Explicit field (not a TS parameter property) so the file loads under Node's
  // strip-only TypeScript mode — the route-level webhook proofs (WO-LIVE-3 §6) import
  // this module transitively through the route handler.
  code: "restaurant_not_found" | "agent_error";
  constructor(code: "restaurant_not_found" | "agent_error", message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "CustomerTurnError";
  }
}

export interface CustomerTurnInput {
  restaurantId: string;
  /** When set, the AI reply is persisted into this conversation and logged against it. */
  conversationId: string | null;
  /** Prior turns (oldest first), excluding the message being answered. */
  history: LlmMessage[];
  /** The customer message to answer. */
  userMessage: string;
  /** Persist the AI reply as a message row (default true when conversationId is set). */
  persistReply?: boolean;
  /** WO-VOICE-1: STT confidence when this turn was a transcribed voice note
   *  (undefined for typed text). Feeds ONLY the fail-closed net's secondary
   *  confidence tripwire; the pipeline is otherwise unchanged. */
  sttConfidence?: number | null;
  /** WO-PHONETIC-NET-TYPED-SCOPE: true when this turn is a transcribed voice note
   *  (meta.voice). Lets the phonetic net apply its full STT-recovery near budget to
   *  voice while typed text gets the tightened near path. Undefined ⇒ typed. */
  isVoiceTranscript?: boolean;
  /** WO-DELIVERY-D1: the customer's WhatsApp location pin, when this turn was a pin.
   *  Acted on ONLY when the tenant has delivery_geo_routing ON (else ignored, so a
   *  stray pin never changes behavior). The webhook only ever passes this when the
   *  flag is on, so flag-off tenants never even reach here. */
  pinLocation?: { lat: number; lng: number; name?: string; address?: string } | null;
  /** WO-MEDIA-INBOUND: set when this turn's inbound was an image (media_turn_trigger).
   *  `caption` is the customer's own words (already the userMessage / gate input);
   *  `description` is the MODEL vision read (context only). Drives a provenance-marked
   *  per-turn directive so Karim engages with the image — or warmly asks when the read
   *  failed (never silence). The webhook only passes this when the flag is on, so
   *  flag-off tenants never reach here → pipeline byte-identical when off. */
  imageContext?: { caption: string | null; description: string | null } | null;
}

export interface CustomerTurnOutcome {
  reply: string;
  escalate: boolean;
  escalationReason: string | null;
  draft: OrderDraft;
  signals: ToolSignal[];
  presentation: Presentation | null;
  photoRequests: PhotoRequest[];
  toolNames: string[];
  model: string;
  adapter: "claude" | "mock";
  mode: string;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  agentRunId: string | null;
  /** Id of the persisted AI reply message row (null when not persisted). */
  replyMessageId: string | null;
  /** Karim Pro P1: tier + feature flags — let the send path gate the finalize-report emit. */
  tier: Tier | "standard";
  features: Record<string, unknown> | null;
  /** Karim Pro P3: the per-turn perception read (labeled inference), or null when
   *  perception is off / the read failed. For the harness dump + observability. */
  perception: PerceptionRead | null;
  /** True when the model called resend_receipt; triggers receipt re-send downstream. */
  resendReceipt: boolean;
}

function isOpenDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OrderDraft>;
  return Array.isArray(draft.lines) && draft.lines.length > 0 && draft.finalized !== true;
}

/** Allergen-safety INPUT GATE (Fix 1) — the deterministic forced outcome when the
 *  gate fires. NO LLM call: acknowledge the allergen honestly, escalate to the
 *  team, preserve the in-progress draft. Mirrors a RespondResult so the downstream
 *  persist/escalation path is unchanged. */
function forcedAllergenSafetyResult(
  term: string | null,
  dialect: string,
  initialDraft: OrderDraft | null,
  currency: string,
  source: "allergen_gate" | "allergen_symptom" | "phonetic_safety_net" = "allergen_gate",
  netReason: string | null = null
): RespondResult {
  const t = term && term !== "الحساسية" ? `«${term}»` : "الحساسية";
  // WO-SAFETY-MODEL-V3 — NOTIFY-WITHOUT-HOLD: honest line + kitchen note + choices +
  // CONTINUE. NEVER promises a transfer (staff are alerted; the customer chooses). The
  // conversation stays AI_ACTIVE; a human is offered but never forced.
  const reply =
    dialect === "egyptian"
      ? `خدت بالي إنك ذكرت ${t} 🙏 صحتك تهمّنا — سجّلت الملاحظة للمطبخ ونبّهت الفريق. مش هقدر أأكد ملاءمة الأصناف من نفسي، بس نقدر نكمّل والملاحظة واضحة، أو أوصلك بموظف يتأكد لك — تحب إيه؟`
      : `خذت بالي إنك ذكرت ${t} 🙏 صحتك تهمّنا — سجّلت الملاحظة للمطبخ ونبّهت الفريق. ما أقدر أأكد ملاءمة الأصناف من نفسي، بس نقدر نكمّل والملاحظة واضحة، أو أوصلك بموظف يتأكد لك — وش تحب؟`;
  const reason = `سلامة الحساسية (بوابة حتمية): العميل ذكر تجنّب/مشكلة مع ${term ?? "الطعام"} — نُبّه الفريق؛ لا تجميد، كريم يكمل مع ملاحظة واضحة`;
  return {
    reply,
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: false,
    escalationReason: null,
    signals: [{ type: "notify_without_hold", detail: { reason, source, term, ...(netReason ? { netReason } : {}) } }],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "allergen_gate_notify",
    model: "deterministic_allergen_gate",
    adapter: "mock",
    resendReceipt: false,
  };
}

/** WO-LIVE6-DUP-ORDER-AWARENESS — the already-registered order surfaced into the turn so a
 *  reference to «طلبي القديم» resolves to it instead of re-finalizing a duplicate. */
interface RegisteredOrderRef {
  orderNumber: string;
  /** One-line item summary, e.g. «١× عرض الكتيبة» (Arabic-Indic quantities). */
  itemsSummary: string;
  /** Friendly Arabic status line, e.g. «بانتظار تأكيد المطعم». */
  statusLabel: string;
}

/** WO-LIVE6-DUP-ORDER-AWARENESS — deterministic recap outcome (flag: dup_order_awareness).
 *  No LLM: the customer referred to an order they ALREADY placed this conversation, so
 *  resolve to THAT order (never re-finalize a duplicate — live #1009→#1010). Non-escalating,
 *  draft untouched (NOT finalized → the persist path never runs). The SAFETY-FIRST gate in
 *  the dispatch chain guarantees no allergen/emergency/human-request signal was present. */
function dupOrderRecapResult(
  order: RegisteredOrderRef,
  dialect: string,
  initialDraft: OrderDraft | null,
  currency: string
): RespondResult {
  const num = toArabicDigits(order.orderNumber);
  const openDoor =
    dialect === "egyptian" ? "ولو حابب تطلب حاجة جديدة قولّي 😊" : "ولو تحب تطلب شي جديد قول لي 😊";
  const reply = `طلبك رقم #${num} مسجّل بالفعل ✅\n${order.itemsSummary}\n${order.statusLabel}\n${openDoor}`;
  return {
    reply,
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: false,
    escalationReason: null,
    signals: [{ type: "missing_data", detail: { reason: "dup_order_reference", orderNumber: order.orderNumber } }],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "dup_order_reference",
    model: "deterministic_dup_order",
    adapter: "mock",
    resendReceipt: false,
  };
}

/** Companion-mode EMERGENCY outcome (§5) — deterministic, no LLM. An ACTIVE
 *  reaction ALWAYS escalates to a SYSTEM_HOLD marked emergency-class (NEVER
 *  customer-resumable, §1e·d); the reply is the fixed §5 line (staff alerted, never
 *  reassurance). Mirrors a RespondResult so the downstream persist/escalation path
 *  is unchanged; the escalation reason carries the marker so is_safety_hold →
 *  SYSTEM_HOLD and the recovery path recognizes it. */
function companionEmergencyResult(
  decision: CompanionDecision,
  dialect: string,
  initialDraft: OrderDraft | null,
  currency: string
): RespondResult {
  // WO-SAFETY-MODEL-V3 (§5): an ACTIVE emergency NO LONGER holds. Karim STAYS with the
  // urgent-guidance line (advise emergency services, never reassurance) and fires a LOUD
  // staff alert — silence during a medical emergency was the worst possible behavior.
  const reason = `طوارئ حساسية نشطة${decision.emergencyLabel ? ` (${decision.emergencyLabel})` : ""} — بُلّغ الفريق فوراً؛ لا تجميد، كريم يكمل بإرشاد الطوارئ`;
  return {
    reply: emergencyReply(dialect),
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: false,
    escalationReason: null,
    signals: [
      { type: "notify_without_hold", detail: { reason, source: "emergency", label: decision.emergencyLabel } },
    ],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "allergen_companion_emergency",
    model: "deterministic_allergen_companion",
    adapter: "mock",
    resendReceipt: false,
  };
}

/** WO-VOICE-QUALITY (d) — deterministic GARBLED-VOICE outcome (flag: voice_garble_guard).
 *  No LLM: the transcript is unintelligible, so send Karim's honest "audio unclear, please
 *  retype" line and keep the in-progress draft. NON-escalating (a quality nudge, not a
 *  safety event) — the SAFETY-FIRST gate upstream guarantees no allergen signal was present. */
function voiceGarbleResult(
  dialect: string,
  initialDraft: OrderDraft | null,
  currency: string,
  reason: string | null
): RespondResult {
  return {
    reply: garbledVoiceReply(dialect),
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: false,
    escalationReason: null,
    signals: [{ type: "missing_data", detail: { reason: "voice_garbled_retry", source: "voice_garble_guard", garbleReason: reason } }],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "voice_garble_guard",
    model: "deterministic_voice_garble_guard",
    adapter: "mock",
    resendReceipt: false,
  };
}

/** WO-VOICE-LADDER — deterministic MEDIUM-confidence CONFIRM outcome (flag:
 *  voice_garble_guard). No LLM: Karim warmly confirms the uncertain understanding
 *  (echoes what was heard, asks "is this right?") and keeps the draft; the customer's
 *  yes proceeds normally next turn. NON-escalating; never asserts allergen safety
 *  (the ladder downgrades a §0-echo to retype, and safety signals outrank the ladder). */
function voiceConfirmResult(
  dialect: string,
  heard: string,
  initialDraft: OrderDraft | null,
  currency: string,
  candidates: VoiceCandidate[] = []
): RespondResult {
  const top = candidates[0]?.item ?? null;
  return {
    reply: confirmVoiceReply(dialect, heard, top),
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: false,
    escalationReason: null,
    // Provenance-marked «قراءة» — the deterministic candidate READ, never silent truth.
    signals: [{ type: "missing_data", detail: { reason: "voice_confirm", source: "voice_ladder", provenance: "قراءة", candidates } }],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "voice_ladder_confirm",
    model: "deterministic_voice_ladder",
    adapter: "mock",
    resendReceipt: false,
  };
}

/**
 * Run one Brain turn and persist its outcome using the admin (service-role)
 * client. Throws CustomerTurnError("restaurant_not_found") / ("agent_error").
 * On an agent error an error agent_runs row is logged before re-throwing.
 */
export async function runCustomerTurn(
  admin: SupabaseClient,
  input: CustomerTurnInput
): Promise<CustomerTurnOutcome> {
  const { restaurantId, conversationId } = input;
  const persistReply = input.persistReply ?? !!conversationId;

  // Explicit columns (NOT select("*")) — exclude the secret credential columns
  // (wa_access_token_enc / wa_app_secret_enc); the Brain never needs raw secrets.
  const { data: r } = await admin
    .from("restaurants")
    .select(
      "agent_mode,is_open,ai_tone,dialect,name,currency,timezone,business_type,tier,feature_flags,auto_accept_orders,agent_persona_name,tax_mode,tax_rate,payment_config"
    )
    .eq("id", restaurantId)
    .single();
  if (!r) throw new CustomerTurnError("restaurant_not_found");
  const row = r as Record<string, unknown>;
  // Karim Pro P1: tier + narrow feature flags gate conversation-intelligence
  // emission below. A standard tenant with the feature flag emits; nothing else
  // about its agent behavior changes.
  const tenantTier = (row.tier as Tier | null) ?? "standard";
  const tenantFeatures = (row.feature_flags as Record<string, unknown> | null) ?? null;
  // WO-COMPANION-W1-CORE: the master switch. Default OFF → every companion read/
  // branch below is skipped and the legacy allergen path is byte-identical.
  const companionOn = isFeatureExplicitlyEnabled("allergy_companion_mode", tenantFeatures);

  // WO-T1-PAYMENTS: payment-method truth comes ONLY from the resolver. Flag
  // `canonical_payment_methods` OFF (every current tenant) → exactly the legacy
  // normalized payment_config with ZERO extra DB work, so Karim's offered methods
  // are byte-identical. Flag ON → the 0084 canonical table + never-all-off.
  const resolvedPayments = await loadResolvedPaymentMethods(admin, restaurantId, {
    paymentConfig: row.payment_config,
    featureFlags: tenantFeatures,
  });

  const brain = await loadBrain(admin, restaurantId);

  const mode = deriveSystemMode({
    supabaseConfigured: true,
    agentMode: String(row.agent_mode ?? "setup"),
    isOpen: !!row.is_open,
    llmHealthy: true,
  });

  const aiTone: AiToneConfig = { ...seedAiTone, ...((row.ai_tone as Partial<AiToneConfig>) ?? {}) };

  // §E7 handover note — a human's prior commitment the Brain must honor on resume.
  let handoverNote: string | undefined;
  let safetyHoldActive = false;
  let initialDraft: OrderDraft | null = null;
  if (conversationId) {
    const { data: conv } = await admin
      .from("conversations")
      .select("handover_note, is_safety_hold")
      .eq("id", conversationId)
      .single();
    handoverNote = (conv?.handover_note as string | null) ?? undefined;
    // Allergen-safety: an active safety hold lets the Fix-3 output guard escalate a
    // repeated unsafe claim (vs only blocking it). Column exists (migration 0028).
    safetyHoldActive = (conv as { is_safety_hold?: boolean } | null)?.is_safety_hold === true;

    const { data: priorDraftRows } = await admin
      .from("messages")
      .select("meta, created_at")
      .eq("conversation_id", conversationId)
      .eq("sender", "ai")
      .order("created_at", { ascending: false })
      .limit(8);
    // Draft reload: find the MOST RECENT AI message that carries any draft data.
    // Rules (applied in order):
    // 1. If that message's draft is FINALIZED (completed order), the basket is
    //    closed — start clean. This prevents stale-cart bleed-through where the
    //    build-phase messages (recap, add_to_order) are picked up instead of the
    //    confirmation reply, tricking the agent into thinking items are still live.
    // 2. If the draft is open (not finalized, has lines) and within the freshness
    //    window, resume it (mid-order pause). Outside the window: abandonment.
    const firstWithDraft = (priorDraftRows ?? []).find((message) => {
      const d = (message.meta as Record<string, unknown> | null)?.draft;
      return d && typeof d === "object" && Array.isArray((d as Partial<OrderDraft>).lines);
    });
    const DRAFT_FRESHNESS_MS = 45 * 60 * 1000;
    if (firstWithDraft) {
      const d = (firstWithDraft.meta as Record<string, unknown>).draft as OrderDraft;
      if (d.finalized) {
        // Most recent draft is from a completed order — basket is closed.
        initialDraft = null;
      } else if (d.lines.length > 0) {
        const ageMs = Date.now() - new Date(firstWithDraft.created_at as string).getTime();
        const fresh = ageMs <= DRAFT_FRESHNESS_MS;
        initialDraft = fresh ? d : null;
        // Karim Pro P1 terminal hook — ABANDONMENT. A stale open basket (>45 min)
        // means the prior order attempt was abandoned; emit one record for it
        // (Pro-gated; standard tenants do nothing).
        if (!fresh) {
          await emitConversationReport(admin, {
            restaurantId,
            tier: tenantTier,
            features: tenantFeatures,
            conversationId,
            terminalTrigger: "abandoned",
            transcript: input.history,
          });
        }
      }
    }
  }

  const dialect = String(row.dialect ?? "egyptian");

  // WO-COMPANION-W1-CORE (§1a.2/§6): read the session's monotonic allergy-note union
  // and whether a §6 checkpoint is pending/acknowledged. Best-effort + deploy-safe —
  // a missing 0080 column/table → inert (companion mode ON implies 0080 is applied).
  // Flag OFF → we never query; nothing changes.
  let sessionAllergyNote: string | null = null;
  let checkpointPending = false; // a checkpoint recap was shown but not yet acknowledged
  let allergyAcknowledged = false;
  if (companionOn && conversationId) {
    try {
      const { data: an } = await admin
        .from("conversations")
        .select("allergy_note")
        .eq("id", conversationId)
        .maybeSingle();
      sessionAllergyNote = ((an as { allergy_note?: string | null } | null)?.allergy_note as string | null) ?? null;
    } catch {
      /* column absent → inert */
    }
    try {
      const { data: ck } = await admin
        .from("conversation_allergy_events")
        .select("checkpoint_ack_at")
        .eq("conversation_id", conversationId)
        .eq("event_kind", "checkpoint")
        .order("created_at", { ascending: false })
        .limit(1);
      const last = (ck as { checkpoint_ack_at?: string | null }[] | null)?.[0];
      if (last) {
        if (last.checkpoint_ack_at) allergyAcknowledged = true;
        else checkpointPending = true;
      }
    } catch {
      /* table absent → no checkpoint state */
    }
  }

  // Item 9 (flag `standing_instructions`, default OFF): fetch the operator's ACTIVE
  // standing instructions + non-expired tonight's notes to inject as a subordinate,
  // escaped prompt section. Fail-open: any read error → no section (never breaks a
  // customer turn, and never a pre-migration crash). Off → we don't even query.
  const standingInstructionsOn = isFeatureExplicitlyEnabled("standing_instructions", tenantFeatures);
  let standingInstructionRules: StandingInstruction[] = [];
  let tonightNotes: TonightNote[] = [];
  if (standingInstructionsOn) {
    try {
      const nowIso = new Date().toISOString();
      const [{ data: si }, { data: tn }] = await Promise.all([
        admin
          .from("standing_instructions")
          .select("id, version, body")
          .eq("restaurant_id", restaurantId)
          .eq("active", true)
          .is("retired_at", null)
          // Governance (Codex P2): only APPROVED instructions inject — an active but
          // unapproved row (approved_by NULL) is never surfaced to Karim's prompt.
          .not("approved_by", "is", null)
          .order("version", { ascending: true }),
        admin
          .from("tonight_notes")
          .select("id, body")
          .eq("restaurant_id", restaurantId)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: true }),
      ]);
      standingInstructionRules = (si ?? []) as StandingInstruction[];
      tonightNotes = (tn ?? []) as TonightNote[];
    } catch {
      standingInstructionRules = [];
      tonightNotes = [];
    }
  }

  // WO-DELIVERY-D1 — read the geo-routing flag once (STRICT: never implied by 'pro').
  const geoRoutingOn = isFeatureExplicitlyEnabled("delivery_geo_routing", tenantFeatures);

  const ctx: BrainContext = {
    profile: {
      name: String(row.name ?? ""),
      currency: String(row.currency || dialectProfile(dialect).currencyDefault),
      timezone: String(row.timezone ?? "Asia/Riyadh"),
      businessType: String(row.business_type ?? ""),
    },
    dialect,
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    branches: brain.branches,
    deliveryAreas: brain.deliveryAreas,
    policies: brain.policies,
    faqs: brain.faqs,
    activePromotions: brain.promotions.filter((p) => isPromoActiveNow(p)),
    aiTone,
    mode,
    isOpen: !!row.is_open,
    autoAccept: !!row.auto_accept_orders,
    handoverNote,
    personaName: (row.agent_persona_name as string | null) ?? undefined,
    taxMode: String(row.tax_mode ?? "inclusive"),
    taxRate: Number(row.tax_rate ?? 0),
    // F1.2/F1.6 — per-tenant payment config (gates which methods Karim offers).
    // WO-T1-PAYMENTS: sourced from the single resolver (flag-off = legacy, identical).
    paymentConfig: resolvedPayments.config,
    tier: (row.tier as Tier | null) ?? "standard",
    // Karim Pro P4 (cadence): the prompt's §CAD section is included only when the
    // narrow `cadence` flag is on; default off → no cadence section, no change.
    cadence: isFeatureExplicitlyEnabled("cadence", tenantFeatures),
    cadenceLevel: typeof tenantFeatures?.cadence_level === "string" ? (tenantFeatures.cadence_level as string) : "balanced",
    // Issue-B B1 (stateful_orders): surface the authoritative reloaded draft into
    // the system prompt so the model READS state instead of rebuilding from chat.
    // Gated + default off → no block, no behavior change. currentDraft is the SAME
    // object the executor seeds ctx.draft from (respond.ts), so they never drift.
    statefulOrders: isFeatureExplicitlyEnabled("stateful_orders", tenantFeatures),
    currentDraft: initialDraft,
    // Allergen-safety (flag-gated): enables the never-say-safe OUTPUT GUARD in respond.ts.
    deterministicAllergenSafety: isFeatureExplicitlyEnabled("deterministic_allergen_safety", tenantFeatures),
    // WO-COMPANION-W1-CORE (flag `allergy_companion_mode`, default OFF): swaps the
    // prompt allergy block for the companion contract AND enables respond.ts's
    // companion banned-phrase guard + §6 checkpoint. Off → legacy path, byte-identical.
    allergyCompanion: companionOn,
    sessionAllergyNote,
    allergyAcknowledged,
    // WO-KHALID-WIRING (§3): additive persona reads, mirroring the flag flow above.
    // Default OFF for every tenant (khalid_persona is explicit-only); ON only for
    // مطعم الديرة today. The overlay is appended at the END of the prompt in prompt.ts.
    khalidPersona: isFeatureExplicitlyEnabled("khalid_persona", tenantFeatures),
    ksaRegion: resolveKsaRegion(
      typeof tenantFeatures?.khalid_region === "string" ? (tenantFeatures.khalid_region as string) : null
    ),
    // WO-ENCYCLOPEDIA (§3/§4): curated culture block, hard-dependent on khalid_persona.
    ksaEncyclopedia: isFeatureExplicitlyEnabled("ksa_encyclopedia", tenantFeatures),
    ksaCuisineTags: Array.isArray(tenantFeatures?.cuisine_tags)
      ? (tenantFeatures.cuisine_tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [],
    // Item 9 — subordinate operator guidance (escaped, safety-framed). Flag-gated.
    standingInstructions: standingInstructionsOn,
    standingInstructionRules,
    tonightNotes,
    // WO-DELIVERY-D1 — geography-aware delivery (pin → zone → branch). Default OFF →
    // the prompt keeps its legacy "type your address, pins unreadable" instruction and
    // set_fulfillment ignores pickup branches (prompt + tools byte-identical).
    geoRouting: geoRoutingOn,
    // WO-LIVE4-F1b — media_turn_trigger: when ON the system reads inbound images via
    // buildImageDirective, so the prompt tells the model to follow that read instead of
    // claiming it can't see a picture. Default OFF → legacy "can't view images" verbatim.
    mediaTurnTrigger: isFeatureExplicitlyEnabled("media_turn_trigger", tenantFeatures),
    // WO-LIVE6-PRICE-TRUTH — when ON, respond.ts's money guard verifies each item→price pair
    // the model wrote in free prose against menu_items truth and repairs a mis-attributed
    // figure (live #كاديا — ١٥٠ when real is ٣٢٠). Default OFF → the guard never runs, prompt
    // + behavior byte-identical.
    priceTruthGuard: isFeatureExplicitlyEnabled("price_truth_guard", tenantFeatures),
  };

  // Karim Pro P3 — per-turn PERCEPTION (gated on the narrow `perception` flag;
  // standard tenants + Pro-without-perception do NOTHING here). Layer A: read +
  // log. Layer B: a low-confidence/unknown/safety read produces a recovery
  // directive injected for THIS turn so Karim recovers instead of dead-ending.
  // perceiveTurn never throws (null on failure → no log, no directive).
  // Allergen-safety INPUT GATE (Fix 1, flag-gated): a deterministic floor evaluated
  // BEFORE the model — a customer avoidance/medical intent toward a food/allergen
  // term (incl. euphemisms like «اتعب لو اكلت بندق», NOT only «حساسية») FORCES a
  // safety escalation, so safety never depends on a lucky LLM read. Off → never fires.
  // WO-SAFE-2: the BASE allergen euphemism gate runs UNCONDITIONALLY — child safety
  // must NEVER depend on a feature-flag row being present (a new/misconfigured tenant
  // without the flag would otherwise have no allergen floor). Behavior-UNCHANGED for
  // every tenant that already had deterministic_allergen_safety ON (all current
  // tenants): the gate ran then and runs now. The flag remains ONLY for the symptom
  // EXTENSION below.
  // WO-CALLBACK (§1) — deterministic trigger in the agent turn path: flag-gated detection
  // of an explicit phone-callback request. Emits an additive SIGNAL only (no reply/prompt
  // change); the offer→capture→persist→staff-alert flow is playbook-coordinated. Flag OFF
  // → never evaluated. Safety-held conversations still capture (safety-positive, §5).
  const callbackOn = isFeatureExplicitlyEnabled("callback_requests", tenantFeatures);
  const callbackHit = callbackOn ? detectCallbackRequest(input.userMessage) : { fired: false, phrase: null };

  const allergenHit = detectAllergenAvoidance(input.userMessage);
  // Additive symptom/condition/English layer — evaluated when the base gate did NOT
  // fire and the tenant has allergen_symptom_detection explicitly enabled (still flagged).
  const symptomDetectionOn = isFeatureExplicitlyEnabled("allergen_symptom_detection", tenantFeatures);
  const symptomHit = (!allergenHit.fired && symptomDetectionOn)
    ? detectAllergenSymptom(input.userMessage)
    : { fired: false, term: null };
  // WO-VOICE-1 (item-38, binding) — the FAIL-CLOSED PHONETIC NET runs UNCONDITIONALLY
  // (never flag-gated, like the base gate): a near-match/garble/allergy-context on the
  // transcript (or typed text) that the exact vocabulary gate missed forces the same
  // deterministic hold. The 0.66 STT-confidence floor is a SECONDARY tripwire only.
  // Evaluated last (only when the exact gates did not already fire) so a hold decision
  // is reached before perception/LLM.
  const phoneticHit = (!allergenHit.fired && !symptomHit.fired)
    ? detectPhoneticSafetyNet(input.userMessage, { sttConfidence: input.sttConfidence, isVoiceTranscript: input.isVoiceTranscript })
    : { fired: false, term: null, reason: null as string | null };
  const combinedAllergenHit = allergenHit.fired ? allergenHit : (symptomHit.fired ? symptomHit : phoneticHit);
  // Distinct source for observability (net-trip vs vocabulary-hit) — carried into the
  // escalation signal metadata so the live net false-positive rate is watchable.
  const holdSource = allergenHit.fired
    ? "allergen_gate"
    : symptomHit.fired
      ? "allergen_symptom"
      : "phonetic_safety_net";

  // P3 perception — skip the Haiku read entirely when the deterministic gate already
  // fired (the decision is made; no LLM needed). Otherwise unchanged.
  const perceptionOn = isFeatureExplicitlyEnabled("perception", tenantFeatures) && !combinedAllergenHit.fired;
  const perception = perceptionOn ? await perceiveTurn(input.userMessage, input.history) : null;
  const perceptionDirective = perceptionOn ? recoveryDirective(perception) : null;
  // P4 cadence cue (consumes the P3 read; fires only on a non-default mood signal).
  const cadenceDirective = ctx.cadence ? cadenceCue(perception) : null;

  // WO-DELIVERY-D1 — pin → zone → branch routing (flag ON only). Resolved BEFORE the
  // LLM turn so the model receives either a matched zone+branch (confirm + continue)
  // or the exact soft message (outside all zones). The delivery fee is copied from the
  // zone's own data here — never computed by the model (money law). Flag OFF or no pin
  // → geoDirective stays null and initialDraft is untouched (byte-identical).
  let geoDirective: string | null = null;
  if (geoRoutingOn && input.pinLocation) {
    const outcome = applyPinRouting(
      input.pinLocation,
      initialDraft ?? emptyDraft(ctx.profile.currency),
      brain.deliveryAreas,
      brain.branches
    );
    geoDirective = outcome.directive;
    if (outcome.kind === "matched") {
      initialDraft = outcome.draft;
    } else if (conversationId) {
      // Outside all zones → log the miss (insight feed, spec §2/§4). Best-effort: a
      // pre-migration missing zone_misses table NEVER breaks the turn. No customer PII
      // beyond the conversation ref (PM ruling: pin coords + nearest-zone distance only).
      try {
        await admin.from("zone_misses").insert({
          restaurant_id: restaurantId,
          conversation_id: conversationId,
          pin_lat: outcome.miss.pinLat,
          pin_lng: outcome.miss.pinLng,
          nearest_zone_id: outcome.miss.nearestZoneId,
          nearest_distance_km: outcome.miss.nearestDistanceKm,
        });
      } catch {
        /* table absent pre-migration — skip silently */
      }
    }
  }

  const t0 = Date.now();
  let result: RespondResult;
  // WO-COMPANION-W1-CORE — the ONE companion branch point. Off → today's forced
  // allergen escalation, byte-identical. On → the companion path (emergency-first §5,
  // else §1a mention → keep talking). A companion turn's write-side effects (note +
  // audit + post-commit alert) are applied AFTER the reply is computed (below).
  let companionDecision: CompanionDecision | null = null;
  // §6 checkpoint: when the customer explicitly acknowledges a PENDING checkpoint,
  // log the ack (verbatim + timestamp) so respond() lets the finalize through NOW.
  let checkpointJustAcknowledged = false;
  // In companion mode an ACTIVE emergency (§5) must escalate even when the plain
  // avoidance gate did NOT fire (an emergency phrase like «حلقي يتورم» names no
  // allergen) — so evaluate it independently and let it enter the companion path.
  const companionEmergency = companionOn ? detectAllergenEmergency(input.userMessage) : { fired: false, label: null };
  const enterCompanion = companionOn && (combinedAllergenHit.fired || companionEmergency.fired);

  // WO-LIVE6-DUP-ORDER-AWARENESS (flag `dup_order_awareness`, default OFF) — surface the
  // most-recent order the customer ALREADY registered this conversation so a reference to it
  // («طلبي القديم/اللي فات») resolves to THAT order instead of re-finalizing a duplicate
  // (live #1009→#1010: same basket, 23 min apart, past the 120s double-tap window). Read is
  // gated + best-effort: OFF or no conversation → null → byte-identical. Cancelled/rejected
  // orders are excluded (a customer may legitimately re-order after a cancel). The intercept
  // itself sits AFTER every safety branch in the dispatch below (safety-first).
  const dupOrderAwarenessOn = isFeatureExplicitlyEnabled("dup_order_awareness", tenantFeatures);
  let registeredOrder: RegisteredOrderRef | null = null;
  if (dupOrderAwarenessOn && conversationId) {
    try {
      const { data: ord } = await admin
        .from("orders")
        .select("order_number, items, order_status")
        .eq("restaurant_id", restaurantId)
        .eq("conversation_id", conversationId)
        .not("order_status", "in", "(cancelled,canceled,rejected)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row2 = ord as { order_number?: string | null; items?: unknown; order_status?: string | null } | null;
      if (row2?.order_number) {
        const lines = Array.isArray(row2.items) ? (row2.items as { name?: string; quantity?: number }[]) : [];
        const itemsSummary =
          lines
            .map((l) => `${toArabicDigits(Number(l.quantity ?? 1))}× ${String(l.name ?? "").trim()}`.trim())
            .filter((s) => s && !s.endsWith("× "))
            .join("، ") || "طلبك المسجّل";
        const statusLabel =
          row2.order_status === "pending_confirmation" ? "بانتظار تأكيد المطعم" : "مسجّل في النظام";
        registeredOrder = { orderNumber: String(row2.order_number), itemsSummary, statusLabel };
      }
    } catch {
      /* orders read failed → no registered-order awareness this turn (never breaks a turn) */
    }
  }
  // The intercept fires ONLY on a normal turn — never when a safety/emergency/human-request
  // signal is present (LAWS: a deterministic short-circuit must never swallow safety). The
  // detector requires an explicit old-order reference AND a real registered referent.
  const dupOrderIntercept =
    dupOrderAwarenessOn &&
    registeredOrder != null &&
    !combinedAllergenHit.fired &&
    !companionEmergency.fired &&
    !isExplicitHumanRequest(input.userMessage) &&
    refersToRegisteredOrder(input.userMessage);

  // WO-MEDIA-INBOUND — a provenance-marked per-turn directive when the inbound was an
  // image. Built from the customer's caption + the MODEL vision read; never empty, so
  // an image turn (even a failed read) is answered warmly, never with silence. Context
  // only — it does NOT touch the deterministic allergen gate, which already ran above
  // on input.userMessage (the caption / 📷 placeholder), never on the vision read.
  const imageDirective = input.imageContext ? buildImageDirective(input.imageContext) : null;

  // WO-LIVE-3 §4 — pre-turn media directive (guard→model coherence). Only when
  // media_guard is ON: decide whether the photo budget is spent for THIS window (24h OR
  // new-order reset) and whether the customer asked for the menu, then tell Karim to
  // point to the web menu link honestly instead of pretending photos were attached. The
  // media guard in respond-and-send remains the hard backstop; this only makes THIS
  // turn's text truthful. Deploy-safe (pre-0070 columns → treated as not exhausted);
  // OFF → null → byte-identical. The order read is skipped unless usage hit the budget.
  let mediaDirective: string | null = null;
  if (isFeatureExplicitlyEnabled("media_guard", tenantFeatures) && conversationId) {
    const askedMenu = asksForMenuLink(input.userMessage);
    let budgetExhausted = false;
    try {
      const { data: mrow } = await admin
        .from("conversations")
        .select("images_sent, last_media_at")
        .eq("id", conversationId)
        .maybeSingle();
      const imagesSent = Number((mrow as { images_sent?: number } | null)?.images_sent ?? 0);
      const lastMediaAt = (mrow as { last_media_at?: string | null } | null)?.last_media_at ?? null;
      if (imagesSent >= CONVERSATION_MEDIA_BUDGET) {
        // Only a raw usage at/over budget can be "exhausted" — and only if the window
        // has NOT reset. Read the latest order just here (cheap, and rare).
        const { data: ord } = await admin
          .from("orders")
          .select("created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const oc = (ord as { created_at?: string | null } | null)?.created_at ?? null;
        const reset = isMediaWindowReset({
          lastMediaAtMs: lastMediaAt ? Date.parse(lastMediaAt) : null,
          nowMs: Date.now(),
          latestOrderAtMs: oc ? Date.parse(oc) : null,
        });
        budgetExhausted = !reset;
      }
    } catch {
      /* images_sent/last_media_at absent (pre-0070) → not exhausted; deploy-safe */
    }
    mediaDirective = buildMediaDirective({ enabled: true, budgetExhausted, customerAskedForMenu: askedMenu });
  }

  // WO-LIVE5-ANSWER-FIRST — when the customer explicitly asked to SEE a photo/the menu,
  // force Karim to serve that request THIS turn before advancing checkout (live #1005: two
  // ignored «ابعتلي صوره»). Per-turn directive, gated on the answer_first flag → OFF, or a
  // turn with no see-request → null → the prompt is byte-identical.
  const answerFirstDirective = isFeatureExplicitlyEnabled("answer_first", tenantFeatures)
    ? buildAnswerFirstDirective({ enabled: true, asked: asksToSeeMedia(input.userMessage) })
    : null;

  const runRespond = async (): Promise<RespondResult> => {
    try {
      return await respond({ brain: ctx, history: input.history, userMessage: input.userMessage, initialDraft, perceptionDirective, cadenceDirective, safetyHoldActive, geoDirective, imageDirective, mediaDirective, answerFirstDirective });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.from("agent_runs").insert({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        trigger: "customer",
        input: input.userMessage,
        error: message,
        perception,
      });
      throw new CustomerTurnError("agent_error", message);
    }
  };

  // §6.5 checkpoint ACK — a PENDING checkpoint + an explicit confirmation THIS turn logs
  // the verbatim ack (so respond() permits the finalize now) and marks the session
  // acknowledged. WO-LIVE4-F5: this must fire even when the SAME message ALSO mentions an
  // allergen (routing it through the companion §1a MENTION branch). The live ack «لا مفيش
  // اي حساسه اكد الاوردر» is BOTH a mention AND a checkpoint ack, but only the else branch
  // recorded it before — so the checkpoint re-fired forever. Mention-merge is UNCHANGED and
  // the customer's denial NEVER suppresses the recorded allergy note (standing law — a
  // denial never removes safety data); we ONLY ADD the ack. Idempotent per turn.
  const maybeRecordCheckpointAck = async (): Promise<void> => {
    if (checkpointJustAcknowledged) return;
    if (!(companionOn && checkpointPending && sessionAllergyNote && isExplicitOrderConfirmation(input.userMessage))) return;
    checkpointJustAcknowledged = true;
    ctx.allergyAcknowledged = true;
    await recordAllergyEvent(admin, {
      restaurantId,
      conversationId: conversationId ?? "",
      allergens: [],
      customerMessage: input.userMessage,
      eventKind: "checkpoint",
      checkpointAckText: input.userMessage,
      checkpointAckAt: new Date().toISOString(),
      netReason: "checkpoint_ack",
    });
  };

  // WO-VOICE-LADDER — confidence→behavior ladder (flag voice_garble_guard, default OFF).
  // SAFETY-FIRST (binding): evaluated ONLY when NO allergen/phonetic/emergency signal
  // fired — a garbled allergy disclosure escalates via the branches below, never handled
  // here. Bands: conf ≥ 0.70 ACT (fall through to the Brain) · MEDIUM 0.55–0.70 CONFIRM
  // (warm "did I get this right?") · < 0.55 or zero-overlap-under-ceiling RETYPE.
  const lastAssistant = [...input.history].reverse().find((m) => m.role === "assistant" && typeof m.content === "string")?.content as string | undefined;
  const voiceGuardOn =
    isFeatureExplicitlyEnabled("voice_garble_guard", tenantFeatures) &&
    input.isVoiceTranscript === true &&
    !combinedAllergenHit.fired &&
    !companionEmergency.fired;
  // WO-VOICE-PRECISION (finding 4) — assent-exit: a pure assent («أيوه/تمام/صح») the turn
  // right after a ladder CONFIRM exits the ladder and lets the Brain act on the confirmed
  // content, never re-confirming (kills the live confirm-loop, msg b68666f5). Guarded by the
  // same safety-first condition, so an assent can never bypass an allergen/emergency signal.
  const assentExit = voiceGuardOn && isVoiceAssent(input.userMessage) && wasVoiceLadderConfirm(lastAssistant);
  const voiceLadder =
    voiceGuardOn && !assentExit
      ? decideVoiceLadder({
          text: input.userMessage,
          confidence: typeof input.sttConfidence === "number" ? input.sttConfidence : null,
          menuVocab: ctx.menuItems.map((i) => i.name),
        })
      : { action: "act" as const, reason: assentExit ? "assent_exit" : null };

  if (voiceLadder.action === "retype") {
    result = voiceGarbleResult(dialect, initialDraft, ctx.profile.currency, voiceLadder.reason);
  } else if (voiceLadder.action === "confirm") {
    // WO-VOICE-ALIASES — deterministic candidate matching before the Brain. State-aware:
    // the last AI question's expected class (quantity/size/sauce) biases the candidates.
    // HARD LAW (in resolveVoiceCandidates): allergen-class tokens never become candidates.
    const candidates = resolveVoiceCandidates(input.userMessage, {
      menuItemNames: ctx.menuItems.map((i) => i.name),
      expectedClass: expectedAnswerClass(lastAssistant),
    });
    result = voiceConfirmResult(dialect, input.userMessage, initialDraft, ctx.profile.currency, candidates);
  } else if (combinedAllergenHit.fired && !companionOn) {
    // FLAG OFF — today's deterministic safety escalation, EXACT code untouched.
    result = forcedAllergenSafetyResult(
      combinedAllergenHit.term, dialect, initialDraft, ctx.profile.currency,
      holdSource, holdSource === "phonetic_safety_net" ? phoneticHit.reason : null
    );
  } else if (enterCompanion) {
    // FLAG ON — companion path. decideCompanionAction checks the emergency detector
    // FIRST (wins), else it's a §1a mention. The gate's term (if any) is passed as the
    // note hint so a symptom/phonetic hit still captures a named allergen.
    companionDecision = decideCompanionAction(input.userMessage, sessionAllergyNote, { term: combinedAllergenHit.term });
    if (companionDecision.path === "emergency") {
      // ACTIVE emergency → deterministic escalate, SYSTEM_HOLD, emergency-class.
      result = companionEmergencyResult(companionDecision, dialect, initialDraft, ctx.profile.currency);
    } else {
      // §1a mention → keep talking. Carry the freshly-merged union note into the
      // prompt so the model's recap/checkpoint read the FULL session union.
      ctx.sessionAllergyNote = companionDecision.note;
      // WO-LIVE4-F5 — the SAME message can be BOTH a mention AND a checkpoint ack (live
      // «لا مفيش اي حساسه اكد الاوردر»): record the ack here too so the checkpoint isn't
      // re-fired. The note merge above is untouched — the denial never removes the note.
      await maybeRecordCheckpointAck();
      result = await runRespond();
    }
  } else if (dupOrderIntercept && registeredOrder) {
    // WO-LIVE6-DUP-ORDER-AWARENESS — the customer referred to an order they ALREADY placed
    // this conversation (live «خلينا على طلبي القديم» at 15:01:37). Resolve to THAT order —
    // recap «طلبك #N مسجّل بالفعل ✅» + an open door for a genuinely new order — instead of
    // re-building and re-finalizing a duplicate (#1010). No LLM, no finalize, money untouched.
    result = dupOrderRecapResult(registeredOrder, dialect, initialDraft, ctx.profile.currency);
  } else {
    // Normal turn. In companion mode this MAY be a §6 checkpoint ACKNOWLEDGEMENT: a
    // pending checkpoint + an explicit confirmation → log the verbatim ack now so
    // respond() permits the finalize this turn (§6.5).
    await maybeRecordCheckpointAck();
    result = await runRespond();
  }
  const latencyMs = Date.now() - t0;

  const cfg = modelFor("customer_agent");
  // WO-COST-1 — price ALL FOUR meters (fresh in, out, cache read, cache write). The old
  // ledger priced only in+out, so a full-cache-write turn (the breakpoint bug) was
  // undercounted. This is correct regardless of whether the cache_creation_tokens column
  // has been applied yet — cost comes from the in-memory usage, not the DB column.
  const cost = costUsd(
    cfg,
    result.usage.inputTokens,
    result.usage.outputTokens,
    result.usage.cacheReadTokens,
    result.usage.cacheCreationTokens ?? 0,
  );

  // Persist the AI reply (optimistically "sent"; the channel sender downgrades
  // it to "failed" and notes the timeline if real delivery fails).
  let replyMessageId: string | null = null;
  if (persistReply && conversationId) {
    const { data: msg } = await admin
      .from("messages")
      .insert({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender: "ai",
        text: result.reply,
        status: "sent",
        meta: {
          model: result.model,
          escalate: result.escalate,
          draft: result.draft,
          presentation: result.presentation,
          photoRequests: result.photoRequests,
        },
      })
      .select("id")
      .single();
    replyMessageId = (msg?.id as string) ?? null;
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  // WO-COMPANION-W1-CORE — write-side effects of a companion turn (§1a.2/§1a.3/§4):
  // stamp the monotonic union note, run the post-commit status query + staff alert,
  // and emit the §4 audit row. Best-effort / never throws. Emergency's SYSTEM_HOLD +
  // staff surface is handled by the escalation flip below; here the emergency path
  // only records the note + audit (post-commit alert is guarded off for emergency).
  if (companionDecision && conversationId) {
    await applyCompanionSideEffects(admin, {
      restaurantId,
      conversationId,
      decision: companionDecision,
      customerMessage: input.userMessage,
      agentReply: result.reply,
    }).catch((e) => console.error("[companion] side-effects error", e));
  }
  // §6 CHECKPOINT recap emitted this turn (respond.ts intercepted a finalize): record
  // the checkpoint audit row (ack null) so the NEXT explicit confirmation is treated
  // as the acknowledgement. Suppressed on the ack turn itself (already logged above).
  if (companionOn && conversationId && result.stopReason === "allergy_checkpoint" && !checkpointJustAcknowledged) {
    await recordAllergyEvent(admin, {
      restaurantId,
      conversationId,
      allergens: [],
      customerMessage: input.userMessage,
      eventKind: "checkpoint",
      agentReply: result.reply,
      humanOffered: true,
      netReason: "checkpoint_recap",
    }).catch(() => {});
  }
  // WO-LIVE-2-F4 — §0 output-scan BLOCK audit. The banned-phrase block (respond.ts)
  // fires from the OUTPUT scan and is NOT on the mention/emergency/checkpoint audit
  // paths, so a companion safety block wrote ZERO audit rows (live: conv c016a121,
  // §4 audit empty despite the block firing). Record it from the signal respond()
  // emits — phrases + blocked draft (truth_states) + the rewrite sent (agent_reply).
  // Best-effort / deploy-safe (recordAllergyEvent never throws). Post-F2 this fires
  // only in a real allergy context, so it's a genuine liability record, not noise.
  if (companionOn && conversationId) {
    const blockAudit = buildBannedPhraseBlockAudit(result.signals, {
      restaurantId,
      conversationId,
      customerMessage: input.userMessage,
      sessionAllergyNote,
      agentReply: result.reply,
    });
    if (blockAudit) await recordAllergyEvent(admin, blockAudit).catch(() => {});
  }

  const { data: run } = await admin
    .from("agent_runs")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "customer",
      input: input.userMessage,
      output: result.reply,
      tools_used: result.toolNames,
      model: result.model,
      adapter: result.adapter,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cost_usd: cost,
      latency_ms: latencyMs,
      tokens: result.usage.inputTokens + result.usage.outputTokens,
      confidence: result.escalate ? 50 : null,
      perception,
    })
    .select("id")
    .single();

  // WO-COST-1 (PREPARE-ONLY, migration 0087): store the cache-write meter best-effort so
  // the ledger keeps working BEFORE the ceremony applies the column. cost_usd already
  // prices this meter above; only the stored count waits. An unknown-column error
  // pre-migration is swallowed and never disturbs the turn.
  const runId = (run as { id?: string } | null)?.id;
  if (runId) {
    try {
      await admin.from("agent_runs").update({ cache_creation_tokens: result.usage.cacheCreationTokens ?? 0 }).eq("id", runId);
    } catch { /* column not applied yet — PREPARE-ONLY */ }
  }

  if (result.signals.length) {
    await admin.from("conversation_signals").insert(
      result.signals.map((s) => ({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        type: s.type,
        detail: s.detail,
      }))
    );
  }

  // WO-SAFETY-MODEL-V3 (SINGLE DOOR) — exactly ONE path may transfer a conversation: an
  // EXPLICIT human request. result.escalate is set upstream only via that gate, but we
  // RE-VERIFY here (defense in depth) so NO path can transfer without an explicit ask.
  const explicitHuman = isExplicitHumanRequest(input.userMessage);
  if (result.escalate && explicitHuman && conversationId) {
    // THE ONE DOOR — a requested handoff is NORMAL service: HUMAN_ACTIVE, resumable,
    // NEVER a safety hold (SYSTEM_HOLD is a manual staff action only now).
    const escalatedAt = new Date().toISOString();
    const flipPatch: Record<string, unknown> = {
      owner: "human",
      status: "يحتاج تدخل موظف",
      escalation_reason: result.escalationReason,
      is_safety_hold: false,
      updated_at: escalatedAt,
    };
    await setOwnershipState(admin, conversationId, "HUMAN_ACTIVE", { extra: flipPatch });
    await admin.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "system",
      text: `🔔 العميل طلب موظف${result.escalationReason ? ` — ${result.escalationReason}` : ""}. العميل بانتظار رد الفريق.`,
      status: "sent",
      meta: { kind: "escalation", reason: result.escalationReason, escalatedAt },
    });
    await emitConversationReport(admin, {
      restaurantId,
      tier: tenantTier,
      features: tenantFeatures,
      conversationId,
      terminalTrigger: "escalated",
      escalationReason: result.escalationReason,
      transcript: [
        ...input.history,
        { role: "user", content: input.userMessage },
        { role: "assistant", content: result.reply },
      ],
    });
  }

  // WO-SAFETY-MODEL-V3 — NOTIFY-WITHOUT-HOLD: every suppressed escalation (a
  // notify_without_hold signal, OR a wanted transfer that was NOT an explicit request)
  // alerts staff with the FULL reason but NEVER freezes — ownership stays AI_ACTIVE and
  // the conversation flows. The reason is audited so nothing the model wanted to say is
  // lost, it just can't freeze anything. Best-effort; never blocks the turn.
  if (conversationId) {
    const notifies: Array<{ reason: string; emergency: boolean }> = [];
    for (const s of result.signals) {
      if (s.type !== "notify_without_hold") continue;
      const reason = String((s.detail as { reason?: string })?.reason ?? "");
      if (reason) notifies.push({ reason, emergency: (s.detail as { source?: string })?.source === "emergency" });
    }
    if (result.escalate && !explicitHuman && result.escalationReason) {
      notifies.push({ reason: result.escalationReason, emergency: false });
    }
    for (const nfy of notifies) {
      await recordCriticalAlert(admin, {
        restaurantId,
        type: nfy.emergency ? "allergy_emergency_active" : "safety_notify_no_hold",
        detail: nfy.reason,
        conversationId,
      });
    }
  }

  // WO-KHALID-STEP2 — dialect-leakage OBSERVABILITY (flag-scoped, quality-only).
  // Runs ONLY when khalid_persona is on; a pure scan of the outbound reply that LOGS a
  // hit so we can measure the leakage rate. It NEVER blocks, escalates, regenerates, or
  // touches the safety path — a dialect leak is a quality miss, not a safety event.
  // Wrapped so observability can never break a customer turn.
  if (isFeatureExplicitlyEnabled("khalid_persona", tenantFeatures) && result.reply) {
    try {
      const leak = findLeakage(result.reply);
      if (!leak.ok) {
        console.warn(
          `[khalid:dialect-leakage] conv=${conversationId} ${leak.hits.length} hit(s): ` +
            leak.hits.map((h) => `${h.marker}(${h.category})`).join(", ")
        );
      }
    } catch {
      /* observability must never affect a turn */
    }
  }

  return {
    reply: result.reply,
    escalate: result.escalate,
    escalationReason: result.escalationReason,
    draft: result.draft,
    signals: callbackHit.fired
      ? [...result.signals, { type: "callback_requested" as const, detail: { phrase: callbackHit.phrase } }]
      : result.signals,
    presentation: result.presentation,
    photoRequests: result.photoRequests,
    toolNames: result.toolNames,
    model: result.model,
    adapter: result.adapter,
    mode,
    usage: result.usage,
    costUsd: cost,
    latencyMs,
    agentRunId: (run?.id as string) ?? null,
    replyMessageId,
    tier: tenantTier,
    features: tenantFeatures,
    perception,
    resendReceipt: result.resendReceipt,
  };
}
