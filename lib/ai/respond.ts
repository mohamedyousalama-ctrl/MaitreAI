// ============================================================================
// MaitreAI — Customer-agent orchestrator (Sprint 8, slice 3 core)
// The Brain's turn loop: build the cached system prompt, run the adapter with
// the order-building tools, execute tool calls (money computed from the menu),
// and return the reply + draft + signals + token usage. Pure and adapter-
// injected — callers (the server route / demo client) own persistence and
// channel send. Works identically against the mock adapter (free, deterministic)
// and Claude (when ANTHROPIC_API_KEY is set).
// ============================================================================

import { getAdapter } from "./llm";
import type { LlmContentBlock, LlmMessage, LlmUsage } from "./llm/types";
import { buildCustomerAgentSystemPrompt, type BrainContext } from "./prompt";
import { DEFAULT_PAYMENT_CONFIG } from "@/lib/payments/config";
import { modeAllowsOrders } from "./modes";
import { dialectProfile } from "./dialect";
import { fabricatesMoney, knownMenuPrices, offersNonMenuProduct } from "./money-guard";
import { isExplicitOrderConfirmation } from "./order-confirm";
import { assertsAllergenSafety, shouldEscalateOnSafetyClaim } from "./allergen-gate";
import { isExplicitHumanRequest } from "./human-request";
// WO-COMPANION-W1-CORE (§0/§6): companion banned-phrase guard + confirmation
// checkpoint. Consulted ONLY when brain.allergyCompanion is on (flag OFF → inert).
import { scanBannedAllergyPhrases, parseAllergyNote, computeDishTruthState, type DishTruthState } from "./allergen-companion";
import { isAllergyScanContext } from "./allergen-scan-context";
import { buildCheckpointRecap, repairBannedAllergyReply, companionNeutralRepairLine, type CheckpointDish } from "./allergen-companion-flow";
// WO-COMPANION-W2: feed the §6 recap the REAL two-axis MenuItem data so verified
// dishes surface honestly (computeDishTruthState itself unchanged — ruling C).
import { dishDataFromMenuItem } from "./dish-allergen-data";
import {
  emptyDraft,
  executeTool,
  NON_ORDER_TOOLS,
  orderToolsWithGeo,
  type OrderDraft,
  type Presentation,
  type PhotoRequest,
  type ToolContext,
  type ToolSignal,
} from "./tools";

export interface RespondInput {
  brain: BrainContext;
  /** Prior turns (user/assistant), oldest first. */
  history: LlmMessage[];
  userMessage: string;
  /** Open order draft from the previous WhatsApp turn, if one exists. */
  initialDraft?: OrderDraft | null;
  /** Karim Pro P3 (Layer B): a per-turn perception recovery directive, appended
   *  to the system prompt for THIS turn only when perception flags low confidence
   *  / unknown input / a safety cue. Absent on clear turns → identical behavior. */
  perceptionDirective?: string | null;
  /** Karim Pro P4: a per-turn cadence cue (e.g. frustration → short apology+action),
   *  derived from the P3 read; appended only when it carries a non-default signal. */
  cadenceDirective?: string | null;
  /** Allergen-safety: is this conversation already a safety hold? Used by the Fix-3
   *  output guard to decide whether a blocked allergen-safety claim also escalates
   *  to a human (only on a genuine avoidance signal — never on a benign filter). */
  safetyHoldActive?: boolean;
  /** WO-DELIVERY-D1: a per-turn directive appended to the system prompt when an
   *  inbound location pin was routed (confirm zone+branch) or fell outside all zones
   *  (relay the soft message). Absent on non-pin turns → identical behavior. */
  geoDirective?: string | null;
  /** WO-MEDIA-INBOUND: a per-turn directive appended when the inbound was an image —
   *  carries the provenance-marked vision READ (or a warm never-silence fallback when
   *  the read failed). Context only: it NEVER gates safety (the deterministic allergen
   *  gate runs on the customer's own text). Absent on non-image turns → identical. */
  imageDirective?: string | null;
  /** WO-LIVE-3 §4: a per-turn directive appended when the media budget is spent for the
   *  window, or the customer asked for the menu — so Karim's text points to the web menu
   *  link and never pretends photos were attached (guard→model coherence). media_guard
   *  OFF / healthy budget → null → identical behavior. */
  mediaDirective?: string | null;
  /** WO-LIVE5-ANSWER-FIRST: a per-turn directive appended when the customer explicitly
   *  asked to SEE a photo/the menu (asksToSeeMedia) and the answer_first flag is on — it
   *  forces Karim to serve that see-request this turn before advancing checkout. Absent
   *  otherwise → identical behavior. */
  answerFirstDirective?: string | null;
}

export interface RespondResult {
  reply: string;
  draft: OrderDraft;
  escalate: boolean;
  escalationReason: string | null;
  signals: ToolSignal[];
  /** Interactive options the model asked to present (WhatsApp buttons/list), if any. */
  presentation: Presentation | null;
  /** Real menu photos requested by the model tool. */
  photoRequests: PhotoRequest[];
  usage: LlmUsage;
  toolNames: string[];
  stopReason: string;
  model: string;
  adapter: "claude" | "mock";
  resendReceipt: boolean;
}

const MAX_ITERATIONS = 6;
const MONEY_TOOL_NAMES = new Set(["add_to_order", "remove_from_order", "set_fulfillment", "get_order_summary", "finalize_draft"]);

// Real-time 86ing: an item already in the saved cart may have been marked
// out-of-stock since it was added. Surface it (per turn, on the uncached user
// message) so «كريم» tells the customer and offers a swap/removal instead of
// silently keeping (or finalizing) it. Deterministic — not the model's read.
// finalize_draft (tools.ts) is the hard backstop; this is the proactive layer.
function eightySixAlert(draft: OrderDraft, menuItems: ToolContext["menuItems"]): string | null {
  const gone = draft.lines.filter((l) => {
    const it = menuItems.find((m) => m.id === l.itemId);
    return !it || !it.available;
  });
  if (!gone.length) return null;
  const names = gone.map((g) => `«${g.name}»`).join("، ");
  return (
    `[تنبيه توفّر: ${names} لم يعد متاحاً الآن. أخبر العميل بلطف، واعرض إزالته أو بديلاً متاحاً من المنيو. ` +
    `لا تؤكّد (finalize) الطلب وبه صنف غير متاح.]`
  );
}

function claimsOrderConfirmed(text: string): boolean {
  return /(تم\s+(?:تأكيد|تسجيل|استلام)\s+الطلب|طلبك\s+(?:اتأكد|تأكد|تسجل|تم)|order\s+(?:confirmed|placed))/iu.test(text);
}

// WO-LIVE5-CONFIRM-GATE — the confirmation detector now lives in its own pure module
// (lib/ai/order-confirm.ts, imported above) so the SAME rule guards the fast-path AND the
// finalize_draft tool, and a receive/photo request («ابعتلي صوره») can never read as a
// confirmation. Re-exported so existing importers (customer-turn) are unchanged.
export { isExplicitOrderConfirmation };

// Fix D — the «تمام» fast-path may auto-finalize ONLY when the conversation is
// genuinely at an order-confirmation point. If the last thing كريم said was a
// reset / transfer / escalation / "can't clear the old items" message, a «تمام» is
// agreement to THAT — not an order confirm — so we must NOT blind-finalize the
// (possibly stale) basket (#1017). The model loop then handles it instead.
const RESET_ESCALATION_RE = /(أحوّل|أحول|نحوّل|نحول|حوّلت|حولت|الفريق|موظف|مش بتتمسح|ما بتتمسح|ماتتمسح|بتتمسح|نبدأ من الأول|نبدا من الأول|من الأول|نمسح|أمسح|امسح|تتمسح)/u;
// Positive signal that كريم just read the order back / asked to confirm it.
const ORDER_READBACK_RE = /(الإجمالي|الاجمالي|المجموع|تأكيد الطلب|تأكد الطلب|تؤكد الطلب|أأكد|نأكد|أكدّ|تأكيد|أرسل الطلب|نكمل للدفع)/u;

function lastAssistantText(history: LlmMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && typeof m.content === "string") return m.content;
  }
  return "";
}

/** True only when the last assistant turn looks like a real order readback/confirm
 *  prompt and is NOT a reset/escalation/transfer message. */
function atConfirmationPoint(history: LlmMessage[]): boolean {
  const t = lastAssistantText(history);
  if (!t.trim()) return false;
  if (RESET_ESCALATION_RE.test(t)) return false;
  return ORDER_READBACK_RE.test(t);
}

function safeMoneyReply(dialect: string): string {
  return dialect === "egyptian"
    ? "أقدر أحسبهولك بدقة من السيستم، بس لازم أبني الطلب الأول. تحب أضيف إيه؟"
    : "أقدر أحسبه لك بدقة من السيستم، بس لازم أبني الطلب أول. وش تحب أضيف؟";
}

function safeNonMenuReply(dialect: string): string {
  return dialect === "egyptian"
    ? "تحب أضيفلك حاجة من المنيو؟ 😊"
    : "تحب أضيف لك شي من المنيو؟ 😊";
}

function safeConfirmReply(dialect: string): string {
  return dialect === "egyptian"
    ? "لسه ما أكدتش الطلب؛ لازم أبنيه وأحسب الإجمالي من السيستم الأول. تحب أراجعه معاك؟"
    : "لسه ما أكدت الطلب؛ لازم أبنيه وأحسب الإجمالي من السيستم أول. تحب أراجعه معك؟";
}

// Allergen-safety guard reply (Fix 3) — ESCALATING variant: a genuine allergy/
// avoidance is in play; never certify safety, hand to the kitchen/team to verify.
function safeAllergenReply(dialect: string): string {
  return dialect === "egyptian"
    ? "صحتك أهم حاجة عندنا 🙏 مش هقدر أأكد إن الصنف ده آمن من ناحية الحساسية من غير ما المطبخ يتأكد — هحوّلك لفريق المطعم يساعدوك تختار بأمان."
    : "صحتك أهم شي عندنا 🙏 ما أقدر أأكد إن الصنف هذا آمن من ناحية الحساسية بدون ما المطبخ يتأكد — بحوّلك لفريق المطعم يساعدونك تختار بأمان.";
}

// Allergen-safety guard reply (Fix 3) — NON-escalating variant: a benign "without
// X" filter, no allergy/avoidance stated. Still NEVER certify safety, but keep
// serving — no human handoff.
function safeAllergenNoEscalateReply(dialect: string): string {
  return dialect === "egyptian"
    ? "ما اقدرش أأكد إن أي صنف خالي تماماً من مسببات الحساسية 🙏 بس أقدر أرشّحلك حسب المكوّنات المذكورة، وأأكدلك من المطبخ لو حابب."
    : "ما أقدر أأكد إن أي صنف خالٍ تماماً من مسببات الحساسية 🙏 بس أقدر أرشّح لك حسب المكوّنات المذكورة، وأتأكد لك من المطبخ لو تحب.";
}

// WO-COMPANION-W1-CORE §6 — the confirmation checkpoint. Whenever companion mode is
// on AND an allergy exists in the session AND the customer has NOT yet explicitly
// acknowledged, a finalize is INTERCEPTED: instead of committing the order, Kivo
// recaps the allergens + the honest per-dish two-axis truth-state and requires an
// explicit acknowledgement. The next explicit confirmation clears it (customer-turn
// logs the ack → allergyAcknowledged, §6.5).
function needsAllergyCheckpoint(brain: BrainContext): boolean {
  return (
    brain.allergyCompanion === true &&
    typeof brain.sessionAllergyNote === "string" &&
    brain.sessionAllergyNote.trim().length > 0 &&
    brain.allergyAcknowledged !== true
  );
}

// Least-safe-wins ranking across the session allergens for one dish (the recap must
// show the most cautionary honest state, never the rosiest).
const TRUTH_RANK: Record<DishTruthState, number> = {
  contains: 5,
  severe_shared_risk: 4,
  unknown: 3,
  clear_prep_unknown: 2,
  clear_verified: 1,
};

/** Build the §6 recap for the current draft. WO-COMPANION-W2: each dish resolves
 *  through the REAL two-axis MenuItem data (dishDataFromMenuItem), so a dish lights up
 *  to clear_verified / clear_prep_unknown / contains as the W2 data lands — with NO
 *  data (pre-W2 / unpopulated) it still resolves to "unknown" (byte-identical W1). */
function buildDraftCheckpointRecap(brain: BrainContext, draft: OrderDraft): string {
  const allergens = parseAllergyNote(brain.sessionAllergyNote);
  const byId = new Map(brain.menuItems.map((m) => [m.id, m]));
  const dishes: CheckpointDish[] = draft.lines.map((line) => {
    const data = dishDataFromMenuItem(byId.get(line.itemId));
    // Take the LEAST-SAFE truth-state across all session allergens for this dish.
    let worst: DishTruthState = "clear_verified";
    for (const a of allergens) {
      const st = computeDishTruthState(data, a);
      if (TRUTH_RANK[st] > TRUTH_RANK[worst]) worst = st;
    }
    // No allergens in session shouldn't reach here (checkpoint gates on a note), but
    // stay honest if it does: nothing checked → "unknown", never a rosy default.
    return { name: line.name, state: allergens.length ? worst : "unknown" };
  });
  return buildCheckpointRecap(allergens, dishes, brain.dialect);
}

/** The RespondResult for an intercepted §6 checkpoint — the recap reply, the draft
 *  NOT finalized, no escalation (Kivo keeps talking; the customer acknowledges next). */
function checkpointResult(brain: BrainContext, ctx: ToolContext): RespondResult {
  const recap = buildDraftCheckpointRecap(brain, ctx.draft);
  ctx.signals.push({ type: "missing_data", detail: { reason: "allergy_checkpoint", recap } });
  return {
    reply: recap,
    draft: ctx.draft,
    escalate: false,
    escalationReason: null,
    signals: ctx.signals,
    presentation: null,
    photoRequests: ctx.photoRequests,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    toolNames: [],
    stopReason: "allergy_checkpoint",
    model: "deterministic_allergen_companion",
    adapter: "mock",
    resendReceipt: false,
  };
}

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  const system =
    buildCustomerAgentSystemPrompt(input.brain) +
    (input.perceptionDirective ? `\n\n${input.perceptionDirective}` : "") +
    (input.cadenceDirective ? `\n\n${input.cadenceDirective}` : "") +
    (input.geoDirective ? `\n\n${input.geoDirective}` : "") +
    (input.imageDirective ? `\n\n${input.imageDirective}` : "") +
    (input.mediaDirective ? `\n\n${input.mediaDirective}` : "") +
    (input.answerFirstDirective ? `\n\n${input.answerFirstDirective}` : "");
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;
  const knownPrices = knownMenuPrices(input.brain);

  const geoRouting = !!input.brain.geoRouting;
  const ctx: ToolContext = {
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    branches: input.brain.branches,
    geoRouting,
    draft: input.initialDraft ? structuredClone(input.initialDraft) : emptyDraft(currency),
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: input.brain.taxMode ?? "inclusive",
    taxRate: input.brain.taxRate ?? 0,
    paymentConfig: input.brain.paymentConfig ?? DEFAULT_PAYMENT_CONFIG,
    resendReceipt: false,
    // WO-LIVE5-CONFIRM-GATE — whether THIS turn's customer message is an explicit order
    // confirmation. finalize_draft refuses when this is false, so the model-tool-loop
    // path can never commit a phantom order on a non-confirmation (live #1005). The
    // fast-path already gates on the same predicate; this closes the loop path too.
    userConfirmed: isExplicitOrderConfirmation(input.userMessage),
    // WO-SAFETY-MODEL-V3 (SINGLE DOOR) — whether THIS turn is an explicit human request.
    // The escalate_to_human tool transfers ONLY when true; otherwise it's notify-without-hold.
    explicitHuman: isExplicitHumanRequest(input.userMessage),
  };

  const canOrder = modeAllowsOrders(input.brain.mode) && input.brain.isOpen;
  const tools = canOrder ? orderToolsWithGeo(geoRouting) : NON_ORDER_TOOLS;

  // Real-time 86ing: if a saved-cart item went out-of-stock since it was added,
  // append a per-turn availability alert to the (uncached) user message so «كريم»
  // surfaces it proactively. Tool guards (finalize_draft) still enforce it hard.
  const availabilityAlert =
    canOrder && input.initialDraft?.lines.length ? eightySixAlert(input.initialDraft, ctx.menuItems) : null;
  const userTurn: LlmMessage = availabilityAlert
    ? {
        role: "user",
        content: [
          { type: "text", text: input.userMessage },
          { type: "text", text: availabilityAlert },
        ],
      }
    : { role: "user", content: input.userMessage };
  const messages: LlmMessage[] = [...input.history, userTurn];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const toolNames: string[] = [];

  if (
    canOrder &&
    input.initialDraft?.lines.length &&
    isExplicitOrderConfirmation(input.userMessage) &&
    atConfirmationPoint(input.history)
  ) {
    // §6 checkpoint — intercept the fast-path finalize when an unacknowledged allergy
    // is in the session. Recap + require ack instead of committing the order.
    if (needsAllergyCheckpoint(input.brain)) return checkpointResult(input.brain, ctx);
    toolNames.push("finalize_draft");
    const out = executeTool("finalize_draft", {}, ctx);
    if (!out.isError) {
      return {
        reply: out.content,
        draft: ctx.draft,
        escalate: false,
        escalationReason: null,
        signals: ctx.signals,
        presentation: null,
        photoRequests: ctx.photoRequests,
        usage,
        toolNames,
        stopReason: "tool_finalized",
        model: adapter.name,
        adapter: adapter.name,
        resendReceipt: false,
      };
    }
    // Finalize refused — surface the ACTIONABLE blocker, NEVER the generic deferral
    // (which masked it and caused the verbatim confirm loop). The #1 cause is a
    // missing fulfillment choice: ask pickup-or-delivery and present both as a
    // one-tap choice so the customer resolves it immediately (loop-breaker) instead
    // of re-confirming into a dead end.
    if (!ctx.draft.fulfillment) {
      return {
        reply:
          input.brain.dialect === "saudi"
            ? "تمام! قبل لا أأكد الطلب — تبي استلام من الفرع ولا توصيل؟ 😊"
            : "تمام! قبل ما أأكد الطلب — تحب استلام من الفرع ولا توصيل؟ 😊",
        draft: ctx.draft,
        escalate: false,
        escalationReason: null,
        signals: ctx.signals,
        presentation: {
          kind: "buttons",
          buttons: [
            { id: "set_pickup", title: "استلام من الفرع" },
            { id: "set_delivery", title: "توصيل" },
          ],
        },
        photoRequests: ctx.photoRequests,
        usage,
        toolNames,
        stopReason: "needs_fulfillment",
        model: adapter.name,
        adapter: adapter.name,
        resendReceipt: false,
      };
    }
    // Any OTHER finalize precondition (e.g. below-minimum / invalid-zone delivery):
    // relay the SPECIFIC reason, not the generic deferral. safeConfirmReply stays
    // only as a last resort for a truly unknown/empty failure.
    return {
      reply: out.content || safeConfirmReply(input.brain.dialect),
      draft: ctx.draft,
      escalate: false,
      escalationReason: null,
      signals: ctx.signals,
      presentation: null,
      photoRequests: ctx.photoRequests,
      usage,
      toolNames,
      stopReason: "tool_finalized",
      model: adapter.name,
      adapter: adapter.name,
      resendReceipt: false,
    };
  }

  let text = "";
  let stopReason = "end_turn";
  let model: string = adapter.name;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await adapter.generate({ system, messages, tools }, "customer_agent");
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    usage.cacheReadTokens += res.usage.cacheReadTokens;
    // Preserve the last NON-EMPTY text: the model often emits its sentence
    // alongside a tool_use block, then adds nothing after the tool result —
    // overwriting with that empty turn would leave a blank reply.
    if (res.text && res.text.trim()) text = res.text;
    stopReason = res.stopReason;
    model = res.model;

    if (!res.toolCalls.length) break;

    messages.push({ role: "assistant", content: res.rawContent });
    const results: LlmContentBlock[] = [];
    for (const call of res.toolCalls) {
      // §6 checkpoint — the model tried to finalize with an unacknowledged allergy in
      // the session. Intercept: recap + require ack instead of committing the order.
      if (call.name === "finalize_draft" && needsAllergyCheckpoint(input.brain)) {
        return checkpointResult(input.brain, ctx);
      }
      toolNames.push(call.name);
      const out = executeTool(call.name, call.input, ctx);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: out.content,
        is_error: out.isError,
      });
    }
    messages.push({ role: "user", content: results });
  }

  // A presentation needs a non-empty body (WhatsApp rejects empty interactive
  // bodies); if the model left the text blank, give it a friendly opener.
  if (!text.trim() && ctx.presentation) text = "تفضّل 👇";

  // Money-truth guard: when no pricing tool ran this turn, allow the model to
  // QUOTE real menu prices while describing the menu (Type 1), but still block a
  // fabricated/computed order total or any non-menu amount (Type 2). Order totals
  // in the actual order flow come from the tools (which set usedMoneyTool).
  const usedMoneyTool = toolNames.some((name) => MONEY_TOOL_NAMES.has(name));
  if (text.trim() && !usedMoneyTool && fabricatesMoney(text, currency, knownPrices)) {
    ctx.signals.push({ type: "money_mismatch", detail: { reason: "money_without_tool", reply: text } });
    text = safeMoneyReply(input.brain.dialect);
  }
  if (text.trim() && !ctx.draft.finalized && claimsOrderConfirmed(text)) {
    ctx.signals.push({ type: "money_mismatch", detail: { reason: "confirmation_without_finalized_draft", reply: text } });
    text = safeConfirmReply(input.brain.dialect);
  }
  // Non-menu product guard: never PROACTIVELY upsell a product (e.g. a soft drink)
  // that isn't on the menu. Declining one the customer asked for is unaffected.
  if (text.trim()) {
    const offending = offersNonMenuProduct(text, input.brain.menuItems.map((i) => i.name));
    if (offending) {
      ctx.signals.push({ type: "off_menu", detail: { reason: "non_menu_upsell", term: offending, reply: text } });
      text = safeNonMenuReply(input.brain.dialect);
    }
  }
  // Allergen-safety OUTPUT GUARD (Fix 3) — WO-SAFE-2: now UNCONDITIONAL (was
  // flag-gated). NEVER let the agent certify an item is allergen-safe («مفيهوش بندق»
  // / «آمن» / nut-free) — there is no operator-verified allergen data, so any such
  // claim is unsafe. Replace it with an escalate-safe reply and hand to a human.
  // Safety beats the sale, always. Behavior-unchanged for tenants that had the flag
  // ON (all current tenants); now also protects a flag-absent tenant + agent/suggest.
  if (text.trim() && assertsAllergenSafety(text)) {
    // ALWAYS block the unverifiable allergen-safety claim. WO-SAFETY-MODEL-V2: in
    // COMPANION mode a safety-assertion NEVER holds — replace the draft with the honest
    // neutral line and keep flowing (no ctx.escalation). Escalation is reserved for a
    // human request or a §6 checkpoint decline. FLAG-OFF is byte-identical: companion is
    // false → escalate exactly as before (genuine avoidance/allergy signal OR active hold
    // → handoff; a benign "without X" filter → answered honestly, no handoff).
    const companion = input.brain.allergyCompanion === true;
    const wantsEscalate = !companion && shouldEscalateOnSafetyClaim(input.userMessage, input.safetyHoldActive === true);
    // WO-SAFETY-MODEL-V3 (SINGLE DOOR): a safety-claim escalation may TRANSFER only on an
    // EXPLICIT human request. Otherwise it's NOTIFY-WITHOUT-HOLD — staff alerted with the
    // reason, Karim STAYS with the honest (no-transfer) line.
    const transfer = wantsEscalate && ctx.explicitHuman === true;
    const reason = "سلامة الحساسية: المساعد حاول تأكيد سلامة صنف بدون بيانات مؤكدة — يحتاج تأكيد المطبخ";
    ctx.signals.push({
      type: transfer ? "escalation" : wantsEscalate ? "notify_without_hold" : "missing_data",
      detail: { reason: wantsEscalate ? reason : "allergen_safety_claim", source: "safety_claim_guard", companion, reply: text },
    });
    if (transfer) {
      ctx.escalation = ctx.escalation ?? { reason };
      text = safeAllergenReply(input.brain.dialect);
    } else if (companion) {
      // Repair, never hold. The neutral line is §0 banned-clean and never certifies.
      text = companionNeutralRepairLine(input.brain.dialect);
    } else {
      // Non-companion severe-allergy claim without an explicit human request → honest,
      // no-transfer line (staff already notified via the notify_without_hold signal).
      text = safeAllergenNoEscalateReply(input.brain.dialect);
    }
  }
  // WO-COMPANION-W1-CORE §0 — companion banned-phrase guard. In companion mode Kivo
  // must NEVER assert food safety: scan the FULL §0 vocabulary («آمن»/«مضمون»/«عادي»/
  // «ما عليك»/«ما يضرك»/«خالي تماماً»/«بدون أي تلامس»/«يناسب الحساسية»/"safe") over the
  // outbound text (including any legacy rewrite above, which uses «آمن» negated), and
  // REPLACE it with a banned-phrase-clean reply that hands to the kitchen. Off → inert.
  //
  // WO-LIVE-2-F2 — the scan now runs ONLY in a real allergy context (session note,
  // safety hold, or an inbound allergy mention this turn). The vocabulary contains
  // common non-safety words («عادي» = "regular" flavor, "safe" mid-word); scanning
  // every reply produced a false SYSTEM_HOLD when the model offered a flavor
  // («عادي، حار، أو مكس؟») on a normal ordering turn (conv c016a121). The scanner and
  // its vocabulary are UNCHANGED — only WHETHER to run it this turn is gated. An
  // allergy-context turn scans exactly as before; flag-off stays byte-identical
  // (isAllergyScanContext returns false whenever allergyCompanion !== true).
  if (text.trim() && isAllergyScanContext({
    allergyCompanion: input.brain.allergyCompanion,
    sessionAllergyNote: input.brain.sessionAllergyNote,
    safetyHoldActive: input.safetyHoldActive,
    userMessage: input.userMessage,
  })) {
    const banned = scanBannedAllergyPhrases(text);
    if (banned.length) {
      // WO-SAFETY-MODEL-V2: the §0 trip NO LONGER holds/escalates (founder abolition).
      // Deterministically REPAIR the draft (sentence-level strip + neutral line + a
      // re-scan double-lock) and let the reply SEND — the conversation always flows.
      // Non-escalating signal (audit only); no ctx.escalation → no SYSTEM_HOLD. The §0
      // scanner + its vocabulary are UNTOUCHED; only the consumer changed hold→repair.
      ctx.signals.push({ type: "missing_data", detail: { reason: "companion_banned_phrase_repaired", phrases: banned, reply: text } });
      text = repairBannedAllergyReply(text, input.brain.dialect);
    }
  }

  return {
    reply: text,
    draft: ctx.draft,
    escalate: !!ctx.escalation,
    escalationReason: ctx.escalation?.reason ?? null,
    signals: ctx.signals,
    presentation: ctx.presentation,
    photoRequests: ctx.photoRequests,
    usage,
    toolNames,
    stopReason,
    model,
    adapter: adapter.name,
    resendReceipt: ctx.resendReceipt,
  };
}
