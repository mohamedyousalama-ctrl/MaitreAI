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
import { respond, type RespondResult } from "@/lib/ai/respond";
import { deriveSystemMode } from "@/lib/ai/modes";
import { costUsd, modelFor } from "@/lib/ai/llm";
import { seedAiTone } from "@/lib/seed-data";
import type { BrainContext } from "@/lib/ai/prompt";
import { type Tier, isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { isSafetyHold } from "@/lib/tenant/handoff";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";
import { perceiveTurn, recoveryDirective, cadenceCue, type PerceptionRead } from "@/lib/ai/perception";
import { emitConversationReport } from "@/lib/intelligence/conversation-report";
import type { LlmMessage, LlmUsage } from "@/lib/ai/llm/types";
import { emptyDraft, type OrderDraft, type PhotoRequest, type Presentation, type ToolSignal } from "@/lib/ai/tools";
import type { AiToneConfig } from "@/lib/types";
import { dialectProfile } from "@/lib/ai/dialect";

/** Typed error so callers can map to the right HTTP status / timeline note. */
export class CustomerTurnError extends Error {
  constructor(public code: "restaurant_not_found" | "agent_error", message?: string) {
    super(message ?? code);
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
  currency: string
): RespondResult {
  const t = term && term !== "الحساسية" ? `«${term}»` : "الحساسية";
  const reply =
    dialect === "egyptian"
      ? `خدت بالي إنك ذكرت ${t} 🙏 صحتك أهم حاجة عندنا — مش هقدر أأكد سلامة الأصناف من غير ما المطبخ يتأكد، فهحوّلك لفريق المطعم يساعدوك تختار بأمان.`
      : `خذت بالي إنك ذكرت ${t} 🙏 صحتك أهم شي عندنا — ما أقدر أأكد سلامة الأصناف بدون ما المطبخ يتأكد، فبحوّلك لفريق المطعم يساعدونك تختار بأمان.`;
  const reason = `سلامة الحساسية (بوابة حتمية): العميل ذكر تجنّب/مشكلة مع ${term ?? "الطعام"} — يحتاج تأكيد المطبخ على الأصناف الآمنة قبل الطلب`;
  return {
    reply,
    draft: initialDraft ? structuredClone(initialDraft) : emptyDraft(currency),
    escalate: true,
    escalationReason: reason,
    signals: [{ type: "escalation", detail: { reason, source: "allergen_gate", term } }],
    presentation: null,
    photoRequests: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: ["escalate_to_human"],
    stopReason: "allergen_gate",
    model: "deterministic_allergen_gate",
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
      "agent_mode,is_open,ai_tone,dialect,name,currency,timezone,business_type,tier,feature_flags,auto_accept_orders,agent_persona_name,tax_mode,tax_rate"
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
  const allergenSafetyOn = ctx.deterministicAllergenSafety === true;
  const allergenHit = allergenSafetyOn ? detectAllergenAvoidance(input.userMessage) : { fired: false, term: null };

  // P3 perception — skip the Haiku read entirely when the deterministic gate already
  // fired (the decision is made; no LLM needed). Otherwise unchanged.
  const perceptionOn = isFeatureExplicitlyEnabled("perception", tenantFeatures) && !allergenHit.fired;
  const perception = perceptionOn ? await perceiveTurn(input.userMessage, input.history) : null;
  const perceptionDirective = perceptionOn ? recoveryDirective(perception) : null;
  // P4 cadence cue (consumes the P3 read; fires only on a non-default mood signal).
  const cadenceDirective = ctx.cadence ? cadenceCue(perception) : null;

  const t0 = Date.now();
  let result: RespondResult;
  if (allergenHit.fired) {
    // Deterministic safety escalation — no LLM call, draft preserved.
    result = forcedAllergenSafetyResult(allergenHit.term, dialect, initialDraft, ctx.profile.currency);
  } else {
    try {
      result = await respond({ brain: ctx, history: input.history, userMessage: input.userMessage, initialDraft, perceptionDirective, cadenceDirective, safetyHoldActive });
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
  }
  const latencyMs = Date.now() - t0;

  const cfg = modelFor("customer_agent");
  const cost = costUsd(cfg, result.usage.inputTokens, result.usage.outputTokens);

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

  // On escalation the AI stops owning the conversation (Amendment 03 §E).
  if (result.escalate && conversationId) {
    // Stamp updated_at at the flip so the needs-attention age == the wait time:
    // once owner=human the AI no longer touches the row, so (now − updated_at) is
    // the operator wait-time/SLA — derivable with NO new column.
    const escalatedAt = new Date().toISOString();
    const flipPatch: Record<string, unknown> = {
      owner: "human",
      status: "يحتاج تدخل موظف",
      escalation_reason: result.escalationReason,
      updated_at: escalatedAt,
    };
    // Fix 2 (flag-gated): set a STRUCTURED is_safety_hold at escalation time — the
    // deterministic source of truth for the #84 carve-out, so "is this a safety
    // hold?" is never re-derived from the model's free-text reason. Only written
    // when the flag is on → Wesaya (flag off) never references the new column, so
    // this is safe even before the additive migration is applied.
    if (allergenSafetyOn) {
      flipPatch.is_safety_hold =
        allergenHit.fired ||
        isSafetyHold(result.escalationReason) ||
        perception?.risk === "allergy" ||
        perception?.risk === "safety";
    }
    await admin.from("conversations").update(flipPatch).eq("id", conversationId);
    // Operator-facing timeline note — reuses the existing system-message timeline
    // (same mechanism as send-error notes); NOT transmitted to the customer.
    // Makes "needs human + reason + waiting" explicit so a single operator sees it.
    await admin.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      direction: "outbound",
      sender: "system",
      text: `🔔 تحتاج تدخّل موظف${result.escalationReason ? ` — السبب: ${result.escalationReason}` : ""}. العميل بانتظار رد الفريق.`,
      status: "sent",
      meta: { kind: "escalation", reason: result.escalationReason, escalatedAt },
    });

    // Karim Pro P1 terminal hook — ESCALATION. Emit one record (Pro-gated;
    // standard tenants do nothing). Real reason from the escalation, transcript
    // includes this turn's exchange.
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

  return {
    reply: result.reply,
    escalate: result.escalate,
    escalationReason: result.escalationReason,
    draft: result.draft,
    signals: result.signals,
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
