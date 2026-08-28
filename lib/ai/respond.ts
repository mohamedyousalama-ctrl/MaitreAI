// ============================================================================
// MaitreAI — Customer-agent orchestrator (Sprint 8, slice 3 core)
// The Brain's turn loop: build the cached system prompt, run the adapter with
// the order-building tools, execute tool calls (money computed from the menu),
// and return the reply + draft + signals + token usage. Pure and adapter-
// injected — callers (the server route / demo client) own persistence and
// channel send. Works identically against the mock adapter (free, deterministic)
// and Claude (when ANTHROPIC_API_KEY is set).
// ============================================================================

import { getAdapter } from "./llm/index";
import type { LlmContentBlock, LlmMessage, LlmUsage } from "./llm/types";
import { buildCustomerAgentSystemPrompt, type BrainContext } from "./prompt";
import { composeSystemTail } from "./llm/system-blocks";
import { DEFAULT_PAYMENT_CONFIG } from "@/lib/payments/config";
import { modeAllowsOrders } from "./modes";
import { dialectProfile } from "./dialect";
import { fabricatesMoney, knownMenuPrices, offersNonMenuProduct } from "./money-guard";
// WO-LIVE6-PRICE-TRUTH — deterministic item→price REPAIR guard (flag price_truth_guard).
import { repairPriceTruth } from "./price-truth";
// WO-V1.0-GOAL-LOGIC (Slice 1, flag goal_logic) — front-of-turn intent reasoning + the Final
// Validator (numeral-provenance + banned-word scrub). Supersedes fabricatesMoney/price_truth
// as the money-truth layer when ON; flag OFF → none of it runs → byte-identical.
import { classifyGoal, type GoalRead } from "./goal-interpreter";
import { buildClarifyingQuestion } from "./clarification";
import { validateNumerals, stripBlockedNumerals } from "./numeral-provenance";
import { scrubBannedWords } from "./banned-words";
// WO-ACTION-CLAIM-GUARD (flag `action_claim_guard`, default OFF) — deterministic post-turn guard:
// blocks a reply that CLAIMS a draft modification when no draft mutation actually happened, and
// re-runs the model ONCE with a strict use-the-tools directive. Flag OFF → never invoked.
import {
  detectModificationClaim,
  draftFingerprint,
  claimNeedsMutationRetry,
  retrySucceeded,
  actionClaimClarify,
  ACTION_CLAIM_RETRY_DIRECTIVE,
} from "./action-claim-guard";
import { isExplicitOrderConfirmation } from "./order-confirm";
import { assertsAllergenSafety, normalizeAr, shouldEscalateOnSafetyClaim } from "./allergen-gate";
// WO escalate-mode — UNCONDITIONAL disease/diet no-reassure output floor. Extends
// the allergen-safety guard: a health/diet suitability claim in a draft is stripped
// and replaced with the honest careful line. No flag; only ADDS caution.
import { assertsDiseaseDietClaim, diseaseDietCarefulLine } from "./disease-diet-guard";
import { isExplicitHumanRequest } from "./human-request";
// WO-COMPANION-W1-CORE (§0/§6): companion banned-phrase guard + confirmation
// checkpoint. Consulted ONLY when brain.allergyCompanion is on (flag OFF → inert).
import { scanBannedAllergyPhrases, parseAllergyNote, computeDishTruthState, type DishTruthState } from "./allergen-companion";
import { isAllergyScanContext } from "./allergen-scan-context";
import { buildCheckpointRecap, repairBannedAllergyReply, companionNeutralRepairLine, type CheckpointDish } from "./allergen-companion-flow";
// WO-COMPANION-W2: feed the §6 recap the REAL two-axis MenuItem data so verified
// dishes surface honestly (computeDishTruthState itself unchanged — ruling C).
import { dishDataFromMenuItem } from "./dish-allergen-data";
// WO-ASKBACK — deterministic ask-back injection at the final settle: if this turn
// produced (or re-detected) a pending deterministic question — an address-zone
// ambiguity from the address_flow_v2 path — and the settled reply neither contains
// it nor carries real content, APPEND the question (or replace a contentless
// pleasantry-only reply with greeting+question). String ops only; only ADDS content.
import { pendingDeterministicQuestion, injectPendingQuestion } from "./askback-injection";
// WO-FINISH-LINE (PART A) — the deterministic order-recap renderer: after a draft
// mutation (a recap-trigger tool ran) the recap is RENDERED BY CODE from the priced
// draft, never model prose, so it is complete every turn and costs zero model calls.
// (PART B) — the turn contract: every reply must carry a question, a recap, or a
// handoff; else the deterministic next-step is appended (no promise-and-silence).
// (PART C) — a >8-item bulk/party request short-circuits to a human handoff instead
// of driving the tool loop into the iteration cap. All gated on brain.finishLine.
import { renderDraftRecap, isDraftPricedConsistent } from "./recap-render";
// WO-SIMPLIFY (PART D) — the pure social-closing detector feeds the turn-contract scoping.
import { isSocialClosingTurn } from "./turn-contract";
// WO-SIMPLIFY (PART E) — the SINGLE final-compose pass orders recap → one question → scoped
// contract once (finishLine only), so injectors never splice text independently anymore.
import { composeFinalReply, applyOutboundRegister } from "./reply-compose";
import { exceedsBulkThreshold, impliedItemCount, bulkHandoffReply, bulkHandoffReason } from "./bulk-threshold";
// WO-STATE-TRUTH (PART A) — the deterministic zone-selection net: when the customer's
// reply picks one of the offered ambiguity candidates, persist the zone-of-truth onto the
// draft so ambiguity stays silent and finalize prices the persisted zone (never re-matches
// raw text). Mirrors the ask-back settle: a deterministic net, no model call.
import { selectZoneFromReply, persistZoneToDraft, hasPersistedZone } from "./zone-state";
import { matchAddressToZones } from "@/lib/delivery/address";
// WO-LEAKGUARD (PART B) — address completeness is a deterministic flow: a zone-only delivery
// capture makes the frozen address ask the turn's single pending question, the recap CTA is
// suppressed while a finalize-required field is missing, and finalize failures map to frozen
// customer-safe lines (never raw validator text). (PART A) — a last-resort register net on the
// deterministic finalize early-returns, which do not flow through the single assembler.
import {
  needsStreetAddress,
  frozenAddressAsk,
  frozenGenericLine,
  classifyFinalizeFailure,
  finalizeFailureReply,
} from "./delivery-readiness";
import { isCustomerSafeText } from "./outbound-register";
import {
  emptyDraft,
  executeTool,
  nonOrderToolsForTenant,
  orderToolsForTenant,
  type OrderDraft,
  type Presentation,
  type PhotoRequest,
  type ToolCatalogOptions,
  type ToolContext,
  type ToolSignal,
} from "./tools";

export interface RespondInput {
  /** PUBLIC DEMO. Threaded to ToolContext so tool results cannot claim side effects
   *  (staff alert, human transfer, a registered order) that a demo turn never performs.
   *  Optional, default false — real tenants are unaffected. */
  demoRun?: boolean;
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
  /** WO-V1.0-GOAL-LOGIC: the per-turn perception read (perceiveTurn) — the Goal Interpreter's
   *  intent/understood signal. Passed only when goal_logic + perception are on; null otherwise
   *  (the interpreter then leans on its deterministic backstops). */
  perceptionRead?: GoalRead | null;
  /** WO-CONTEXT (PART A): the conversation session went cold (>2h idle) or this turn is an
   *  explicit reset. Any pending deterministic (askback) question from the prior session is
   *  stale and must not reach the returning customer. Absent/false → identical behavior. */
  sessionExpired?: boolean;
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
  /** Model invocations used by this customer turn. Deterministic paths report 0. */
  calls_used: number;
}

const MAX_ITERATIONS = 6;
const MONEY_TOOL_NAMES = new Set(["add_to_order", "remove_from_order", "set_fulfillment", "get_order_summary", "finalize_draft"]);
export const RULE6_ANNOTATION_PIVOT_LIVE_REASON = "annotation_pivot_rule6_live";
export const RULE6_ANNOTATION_PIVOT_SHADOW_REASON = "annotation_pivot_rule6_shadow";
export const RULE6_ANNOTATION_PIVOT_DIRECTIVE =
  "Goal-logic annotation: the quick perception pre-read was unsure about this customer message. " +
  "You have the full conversation history that the pre-read lacked. If the customer's intent is clear from history, continue normally. " +
  "If it is genuinely unclear, ask ONE specific clarifying question. Do not invent items, quantities, delivery details, or a final order; when truly ambiguous, ask.";

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
const ORDER_READBACK_RE = /(الإجمالي|الاجمالي|المجموع|تأكيد الطلب|تأكد الطلب|تؤكد الطلب|أجهّزلك|أجهزلك|أأكد|نأكد|أكدّ|تأكيد|أرسل الطلب|نكمل للدفع)/u;

function lastAssistantText(history: LlmMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && typeof m.content === "string") return m.content;
  }
  return "";
}

function messageText(m: LlmMessage | undefined): string {
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  return m.content
    .filter((b) => b.type === "text")
    .map((b) => b.type === "text" ? b.text : "")
    .join(" ");
}

const ITEM_SIZE_CLARIFIER_RE =
  /(?:اختار|اختاري|اختارلي|تختار|تختاري|تحب|حاب|حابب|حابه)\s+(?:الحجم|حجم)|(?:الحجم|حجم|احجام|الاحجام)|(?:عادي|دوبل|دبل|صغير|وسط|كبير)\s+(?:ولا|او)\s+(?:عادي|دوبل|دبل|صغير|وسط|كبير)/u;
const ITEM_CHOICE_CLARIFIER_RE =
  /(?:اختار|اختاري|اختارلي|تختار|تختاري|تحب|حاب|حابب|حابه)\s+(?:اختيار|الاختيار|من)|(?:اختيار|اختيارات|الاختيارات)/u;
const OPTION_PAIR_QUESTION_RE =
  /(?<![ء-ي])[\p{L}\d٠-٩]+(?:\s+[\p{L}\d٠-٩]+){0,2}\s+(?:ولا|او)\s+[\p{L}\d٠-٩]+(?:\s+[\p{L}\d٠-٩]+){0,2}\s*[؟?]/u;

export function isMidItemClarifier(history: LlmMessage[]): boolean {
  const last = history.at(-1);
  if (last?.role !== "assistant") return false;
  const text = normalizeAr(messageText(last));
  if (!text) return false;
  return ITEM_SIZE_CLARIFIER_RE.test(text) || ITEM_CHOICE_CLARIFIER_RE.test(text) || OPTION_PAIR_QUESTION_RE.test(text);
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
    // Was «لسه … من السيستم». Two faults in one Saudi line: «لسه» is Egyptian (Najdi is
    // «لين الحين»), and «السيستم» is on prompt.ts:369's BANNED WORDS list — the machinery
    // vocabulary a host must never use to a guest. Found by the dialect scan once it was
    // pointed at this file; it had been shipping to Saudi customers.
    : "لين الحين ما أكدت الطلب؛ لازم أرتّبه وأحسب الإجمالي أول. تحب أراجعه معك؟";
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
    // WO-SIMPLIFY (PART A) — the simple posture BYPASSES the §6 checkpoint ceremony (branch on the
    // flag; the companion checkpoint code is untouched). OFF → identical companion behavior.
    brain.allergySimple !== true &&
    brain.allergyCompanion === true &&
    typeof brain.sessionAllergyNote === "string" &&
    brain.sessionAllergyNote.trim().length > 0 &&
    brain.allergyAcknowledged !== true
  );
}

// Least-safe-wins ranking across the session allergens for one dish (the recap must
// show the most cautionary honest state, never the rosiest).
const TRUTH_RANK: Record<DishTruthState, number> = {
  escalation_required: 6,
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
function checkpointResult(brain: BrainContext, ctx: ToolContext, calls_used = 0): RespondResult {
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
    calls_used,
  };
}

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  // WO-COST-1 — cache breakpoint: the STATIC block (persona + rulebook + menu) is
  // byte-stable across turns and carries the cache_control breakpoint; the per-turn
  // DYNAMIC directives move into an uncached tail AFTER the breakpoint. composeSystemTail
  // reproduces the previous inline concatenation byte-for-byte, so the model still
  // receives systemStatic + systemTail — identical instructions, re-layered for caching.
  const systemStatic = buildCustomerAgentSystemPrompt(input.brain);
  const baseSystemTailParts = [
    input.perceptionDirective,
    input.cadenceDirective,
    input.geoDirective,
    input.imageDirective,
    input.mediaDirective,
    input.answerFirstDirective,
  ];
  let systemTail = composeSystemTail(baseSystemTailParts);
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;
  const knownPrices = knownMenuPrices(input.brain);

  const geoRouting = !!input.brain.geoRouting;
  const addressFlowV2 = !!input.brain.addressFlowV2;
  const ctx: ToolContext = {
    menuCategories: input.brain.menuCategories,
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    branches: input.brain.branches,
    geoRouting,
    addressFlowV2,
    draft: input.initialDraft ? structuredClone(input.initialDraft) : emptyDraft(currency),
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: input.brain.taxMode ?? "inclusive",
    taxRate: input.brain.taxRate ?? 0,
    paymentConfig: input.brain.paymentConfig ?? DEFAULT_PAYMENT_CONFIG,
    demoRun: input.demoRun === true,
    // KIV-304 — the tool layer had no dialect at all, so a Saudi tenant got Cairene tool
    // results (which the model relays verbatim). Threaded exactly like demoRun above;
    // tools.ts defaults to Egyptian, so an unset/legacy dialect is byte-identical.
    dialect: input.brain.dialect,
    resendReceipt: false,
    sessionAllergyNote: input.brain.sessionAllergyNote,
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
  // KIV-304 — the tool DEFINITIONS are re-sent on every request, so they carry the same
  // dialect leak as the results, and `set_payment_method` advertised فودافون كاش (an
  // Egyptian wallet) with a hardcoded enum regardless of the tenant's payment_config.
  const toolCatalog: ToolCatalogOptions = { dialect: input.brain.dialect, paymentConfig: ctx.paymentConfig };
  const tools = canOrder
    ? orderToolsForTenant(geoRouting, addressFlowV2, toolCatalog)
    : nonOrderToolsForTenant(toolCatalog);

  // WO-FINISH-LINE (PART C) — BULK THRESHOLD. A single request implying > 8 items
  // (a party order like «٢٠ بيتزا … حفله») is NOT a tool-building job — it drove the
  // model into the 6-iteration cap and dead-ended (DB-proven). Short-circuit BEFORE any
  // tool loop: honest handoff line + set the escalation (respond's handoff output) so
  // the team is alerted (customer-turn's notify path) and picks it up. No model call.
  // Flag OFF → never runs → byte-identical.
  if (input.brain.finishLine && canOrder && exceedsBulkThreshold(input.userMessage)) {
    const impliedCount = impliedItemCount(input.userMessage);
    const reason = bulkHandoffReason(impliedCount);
    ctx.escalation = { reason };
    ctx.signals.push({ type: "escalation", detail: { reason, source: "bulk_threshold", impliedCount } });
    return {
      reply: bulkHandoffReply(input.brain.dialect),
      draft: ctx.draft,
      escalate: true,
      escalationReason: reason,
      signals: ctx.signals,
      presentation: null,
      photoRequests: ctx.photoRequests,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      toolNames: [],
      stopReason: "bulk_handoff",
      model: "deterministic_bulk_threshold",
      adapter: adapter.name,
      resendReceipt: false,
      calls_used: 0,
    };
  }

  // WO-V1.0-GOAL-LOGIC (Slice 1) — FRONT-OF-TURN intent reasoning. Before composing a reply,
  // classify the inbound: AMBIGUOUS → ask ONE grounded question (short-circuit, no model call);
  // PRICE / ACTIONABLE → fall through to the model+tool loop (the Final Validator below enforces
  // numeral provenance so a price is never model-fabricated). Flag OFF → skipped → byte-identical.
  if (input.brain.goalLogic && canOrder) {
    const offerNames = input.brain.menuItems.filter((i) => /عرض/.test(i.name)).map((i) => i.name);
    // hasOrderContext: true open draft OR mid-item-collection (last AI turn was an
    // item clarifier). Week-1 soft signal; superseded by the session-store phase
    // field (roadmap W3).
    const hasOrderContext = !!input.initialDraft?.lines.length || isMidItemClarifier(input.history);
    const decision = classifyGoal({
      userMessage: input.userMessage,
      read: input.perceptionRead ?? null,
      state: {
        itemNames: input.brain.menuItems.map((i) => i.name),
        offerNames,
        atConfirmationPoint: atConfirmationPoint(input.history),
        hasOpenDraft: hasOrderContext,
      },
    });
    if (decision.action === "ask" && decision.reason === "read_not_understood" && input.brain.goalLogicRule6AnnotationPivot === true) {
      ctx.signals.push({
        type: "missing_data",
        detail: {
          reason: RULE6_ANNOTATION_PIVOT_LIVE_REASON,
          previousReason: "read_not_understood",
          kind: decision.kind,
          source: "goal_logic_rule6",
        },
      });
      systemTail = composeSystemTail([...baseSystemTailParts, RULE6_ANNOTATION_PIVOT_DIRECTIVE]);
    } else if (decision.action === "ask") {
      // ASK — one grounded clarifying question, banned-word-clean. No model loop, no canned line.
      const q = scrubBannedWords(
        buildClarifyingQuestion({ kind: decision.kind, candidates: decision.candidates, dialect: input.brain.dialect })
      ).text;
      ctx.signals.push({ type: "missing_data", detail: { reason: "goal_clarify", kind: decision.kind, candidates: decision.candidates } });
      return {
        reply: q,
        draft: ctx.draft,
        escalate: false,
        escalationReason: null,
        signals: ctx.signals,
        presentation: null,
        photoRequests: [],
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        toolNames: [],
        stopReason: "goal_clarify",
        model: "deterministic_goal_interpreter",
        adapter: "mock",
        resendReceipt: false,
        calls_used: 0,
      };
    }
    // decision.action === "price" | "act" → continue to the model loop; the validator is the net.
  }

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
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const toolNames: string[] = [];

  if (
    canOrder &&
    input.initialDraft?.lines.length &&
    isExplicitOrderConfirmation(input.userMessage) &&
    atConfirmationPoint(input.history)
  ) {
    // §6 checkpoint — intercept the fast-path finalize when an unacknowledged allergy
    // is in the session. Recap + require ack instead of committing the order.
    if (needsAllergyCheckpoint(input.brain)) return checkpointResult(input.brain, ctx, 0);
    toolNames.push("finalize_draft");
    const out = executeTool("finalize_draft", {}, ctx);
    if (!out.isError) {
      // WO-FINISH-LINE (PART A) — render the registered-order recap deterministically
      // (Arabic-Indic, complete, no truncation) instead of the tool's summary string.
      // Flag OFF → the tool content is byte-identical. WO-SIMPLIFY (PART E) hard guard — render
      // the confirmed recap ONLY from a consistent priced draft (else fall back to the tool
      // summary + emit draft_inconsistent_recap_skipped; a wrong/empty total never ships).
      // WO-SIMPLIFY (PART A) — the simple-allergy posture drops the recap allergy line.
      const recapConsistent = isDraftPricedConsistent(ctx.draft);
      if (input.brain.finishLine && !recapConsistent) {
        ctx.signals.push({ type: "missing_data", detail: { reason: "draft_inconsistent_recap_skipped", source: "recap_consistency_guard", phase: "confirmed" } });
      }
      const reply = input.brain.finishLine && recapConsistent
        ? renderDraftRecap(ctx.draft, { dialect: input.brain.dialect, allergyNote: input.brain.allergySimple ? null : ctx.sessionAllergyNote, phase: "confirmed" })
        : out.content;
      return {
        reply,
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
        calls_used: 0,
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
        calls_used: 0,
      };
    }
    // WO-LEAKGUARD (PART B) — finalize failures NEVER surface raw validator text. Classify the
    // refusal from the DRAFT STATE (not by parsing Arabic) and map each known failure to a FROZEN
    // customer-safe line: missing address → the frozen address ask; empty draft → an honest line;
    // a graceful delivery notice (below-min / invalid zone) passes through unchanged. An UNKNOWN
    // failure → the safe deferral + a finalize_failed_unknown signal (the raw text logged, never
    // sent). A final register net guarantees no internal text can slip through this early-return.
    const failureKind = classifyFinalizeFailure(ctx.draft, { toolContent: out.content });
    let finalizeReply = finalizeFailureReply(failureKind, ctx.draft, input.brain.dialect, out.content);
    if (failureKind === "missing_address") {
      ctx.signals.push({ type: "missing_data", detail: { reason: "delivery_address_required", source: "finalize_guard", question: finalizeReply } });
    }
    if (!finalizeReply) {
      ctx.signals.push({ type: "guard", detail: { reason: "finalize_failed_unknown", source: "finalize_guard", kind: failureKind, rejected: out.content } });
      finalizeReply = safeConfirmReply(input.brain.dialect);
    }
    if (!isCustomerSafeText(finalizeReply)) finalizeReply = frozenGenericLine(input.brain.dialect);
    return {
      reply: finalizeReply,
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
      calls_used: 0,
    };
  }

  let text = "";
  let stopReason = "end_turn";
  let model: string = adapter.name;
  let calls_used = 0;

  // WO-ACTION-CLAIM-GUARD — snapshot the draft BEFORE the model loop so the post-turn guard can
  // tell whether the draft actually changed this turn. Flag OFF → "" (never read) → no-op.
  const actionGuardOn = input.brain.actionClaimGuard === true && canOrder;
  const draftFpBefore = actionGuardOn ? draftFingerprint(ctx.draft) : "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await adapter.generate({ system: systemStatic, systemTail: systemTail || undefined, messages, tools }, "customer_agent");
    calls_used += 1;
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    usage.cacheReadTokens += res.usage.cacheReadTokens;
    usage.cacheCreationTokens = (usage.cacheCreationTokens ?? 0) + (res.usage.cacheCreationTokens ?? 0);
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
        return checkpointResult(input.brain, ctx, calls_used);
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

  // WO-ACTION-CLAIM-GUARD — the fabricated-action net. When the flag is ON and the reply CLAIMS a
  // draft modification but NO draft mutation actually happened this turn (no mutation tool ran AND
  // the fingerprint is unchanged), do NOT send: re-run the model turn ONCE with a strict
  // use-the-tools directive. If the retry actually mutates the draft → send the retry reply; if the
  // retry ALSO claims without mutating → discard and send a fixed honest clarify + log a guard
  // signal. Flag OFF → skipped entirely → byte-identical.
  if (actionGuardOn && text.trim()) {
    const itemNames = input.brain.menuItems.map((it) => it.name);
    const draftFpAfter = draftFingerprint(ctx.draft);
    if (
      claimNeedsMutationRetry({
        replyText: text,
        itemNames,
        executedTools: toolNames,
        beforeFingerprint: draftFpBefore,
        afterFingerprint: draftFpAfter,
      })
    ) {
      // Re-run the model turn ONCE with the strict directive appended to the (uncached) tail.
      const toolCountBeforeRetry = toolNames.length;
      systemTail = composeSystemTail([...baseSystemTailParts, ACTION_CLAIM_RETRY_DIRECTIVE]);
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const res = await adapter.generate({ system: systemStatic, systemTail: systemTail || undefined, messages, tools }, "customer_agent");
        calls_used += 1;
        usage.inputTokens += res.usage.inputTokens;
        usage.outputTokens += res.usage.outputTokens;
        usage.cacheReadTokens += res.usage.cacheReadTokens;
        usage.cacheCreationTokens = (usage.cacheCreationTokens ?? 0) + (res.usage.cacheCreationTokens ?? 0);
        if (res.text && res.text.trim()) text = res.text;
        stopReason = res.stopReason;
        model = res.model;
        if (!res.toolCalls.length) break;
        messages.push({ role: "assistant", content: res.rawContent });
        const results: LlmContentBlock[] = [];
        for (const call of res.toolCalls) {
          if (call.name === "finalize_draft" && needsAllergyCheckpoint(input.brain)) {
            return checkpointResult(input.brain, ctx, calls_used);
          }
          toolNames.push(call.name);
          const out = executeTool(call.name, call.input, ctx);
          results.push({ type: "tool_result", tool_use_id: call.id, content: out.content, is_error: out.isError });
        }
        messages.push({ role: "user", content: results });
      }
      const mutated = retrySucceeded({
        executedToolsSinceRetry: toolNames.slice(toolCountBeforeRetry),
        fingerprintBeforeRetry: draftFpAfter,
        fingerprintAfterRetry: draftFingerprint(ctx.draft),
      });
      if (!mutated) {
        // Retry still fabricated — never send a false ✅. Honest deterministic clarify + audit row.
        ctx.signals.push({ type: "guard", detail: { reason: "action_claim_without_mutation", reply: text } });
        text = actionClaimClarify(input.brain.dialect);
      }
      // Restore the base (directive-free) tail so downstream stays as it was.
      systemTail = composeSystemTail(baseSystemTailParts);
    }
  }

  // WO-GUARD-ORDER (safety-first precedence) — capture the model's FINAL text BEFORE any
  // money / confirmation / non-menu REPLACEMENT below. The bug: a reply that both fabricates
  // a price AND falsely certifies allergen-safety (or a disease/diet suitability) on a
  // genuine-safety turn was being wholesale-replaced by safeMoneyReply FIRST, so the safety
  // detectors further down saw the clean deferral and their escalation/notify signals never
  // fired — the safety event was lost. We keep every money guard exactly as-is (they still
  // fire their money_mismatch signal), then re-expose this ORIGINAL text to the UNCHANGED
  // safety guards so the safety detection, escalation and notify decisions run against what
  // the model actually said — and the safety line wins the final text (strictest outcome).
  const originalModelText = text;

  // Money-truth guard: when no pricing tool ran this turn, allow the model to
  // QUOTE real menu prices while describing the menu (Type 1), but still block a
  // fabricated/computed order total or any non-menu amount (Type 2). Order totals
  // in the actual order flow come from the tools (which set usedMoneyTool).
  const usedMoneyTool = toolNames.some((name) => MONEY_TOOL_NAMES.has(name));
  if (input.brain.goalLogic) {
    // WO-V1.0-GOAL-LOGIC — the FINAL VALIDATOR (numeral-provenance) SUPERSEDES price_truth +
    // fabricatesMoney as the money-truth layer. Every customer-facing numeral must trace to
    // {C}∪{M}∪{Q}∪{D}: a mis-bound item price is repaired to its {M} value (the «كاديا@١٥٠» class);
    // an untraceable stray numeral is stripped (block→regenerate, strip-for-stray); banned words
    // are scrubbed. No canned line, no second model call. Only on model free prose (no tool ran).
    if (text.trim() && !usedMoneyTool) {
      const custNums = (input.userMessage.match(/[0-9٠-٩۰-۹]+(?:[.,][0-9٠-٩۰-۹]+)?/g) ?? [])
        .map((s) => parseFloat(
          s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
           .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
           .replace(",", ".")))
        .filter((n) => Number.isFinite(n));
      const v = validateNumerals({
        text, currency, menuItems: input.brain.menuItems,
        // {M}∪{D} = knownPrices (menu + delivery fees/minimums + promo amounts); {C} = customer
        // numerals; {Q} = empty here (no money tool ran this turn → no engine number to trust).
        sources: { customer: custNums, tool: [], deliveryPromo: [...knownPrices] },
      });
      for (const r of v.repaired) ctx.signals.push({ type: "money_mismatch", detail: { reason: "provenance_repaired", item: r.item, quoted: r.quoted, real: r.real } });
      if (v.blocked.length) ctx.signals.push({ type: "money_mismatch", detail: { reason: "provenance_blocked", numerals: v.blocked } });
      text = stripBlockedNumerals(v.text, v.blocked, currency);
    }
  } else {
    // Legacy money-truth layer (flag OFF) — byte-identical.
    if (input.brain.priceTruthGuard && text.trim() && !usedMoneyTool) {
      const pt = repairPriceTruth(text, currency, input.brain.menuItems);
      for (const r of pt.repairs) {
        ctx.signals.push({ type: "money_mismatch", detail: { reason: "price_repaired", item: r.item, quoted: r.quoted, real: r.real } });
      }
      for (const s of pt.skipped) {
        ctx.signals.push({ type: "money_mismatch", detail: { reason: "price_repair_skipped", subreason: s.reason, item: s.item, quoted: s.quoted, real: s.real, validPrices: s.validPrices } });
      }
      text = pt.text;
    }
    if (text.trim() && !usedMoneyTool && fabricatesMoney(text, currency, knownPrices)) {
      ctx.signals.push({ type: "money_mismatch", detail: { reason: "money_without_tool", reply: text } });
      text = safeMoneyReply(input.brain.dialect);
    }
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
  // WO-GUARD-ORDER — SAFETY SEES THE ORIGINAL TEXT (strictest-outcome precedence). If the
  // model's ORIGINAL reply asserted allergen-safety or a disease/diet suitability claim, a
  // money / confirmation / non-menu guard above may have already replaced `text` (e.g. with
  // safeMoneyReply) and hidden that safety event from the detectors below. Restore the original
  // HERE — and ONLY when it actually carried such a claim — so the two UNCHANGED safety guards
  // that follow evaluate it, fire their signals + escalation/notify decision, and their honest
  // careful/repair line WINS the final delivered text over any money-deferral. Their
  // money_mismatch signal already fired above, so BOTH the money and the safety signals survive.
  // When the original carried no safety claim this is a no-op → money-only / neither behavior is
  // byte-identical, and a safety-only turn (no money replacement) restores to itself (no-op).
  if (assertsAllergenSafety(originalModelText) || assertsDiseaseDietClaim(originalModelText)) {
    text = originalModelText;
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
  // DISEASE/DIET NO-REASSURE OUTPUT FLOOR (WO escalate-mode) — UNCONDITIONAL, no flag.
  // Karim must NEVER reassure that a dish is suitable for a health/diet condition
  // (diabetes, blood pressure, cholesterol, "diet", sugar-free …) — that is a health-
  // suitability claim with no operator-verified data. Detect any such claim in the draft
  // and REPLACE it with the honest careful line that offers a human. Non-escalating audit
  // signal only (no ctx.escalation, no hold): this ADDS caution and removes no guard.
  if (text.trim() && assertsDiseaseDietClaim(text)) {
    ctx.signals.push({
      type: "missing_data",
      detail: { reason: "disease_diet_suitability_claim", source: "disease_diet_guard", reply: text },
    });
    text = diseaseDietCarefulLine(input.brain.dialect);
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

  // WO-V1.0-GOAL-LOGIC — the Final Validator's banned-word lock: the very last thing before the
  // reply leaves, scrub any waiter-jargon word from ANY source (the model, a demoted guard's
  // fallback like safeConfirmReply/safeMoneyReply, a legacy string) so a banned word can NEVER
  // reach the customer and can never seed the anchoring loop. Flag OFF → not run → byte-identical.
  if (input.brain.goalLogic && text.trim()) {
    const sc = scrubBannedWords(text);
    if (sc.scrubbed.length) {
      ctx.signals.push({ type: "off_menu", detail: { reason: "banned_word_scrubbed", words: sc.scrubbed } });
      text = sc.text;
    }
  }

  // WO-STATE-TRUTH (PART A) — ZONE-SELECTION NET. Before the ask-back settle, resolve a
  // pending zone ambiguity when THIS turn's message picks one of the offered candidates.
  // Runs when address_flow_v2 is on, the delivery draft has a written address, and no zone
  // is resolved yet (neither a persisted selection nor a legacy deliveryZone). selectZoneFromReply
  // re-derives the offered candidates from the stored address and returns a single confident
  // pick (a non-answer like «الهرم» stays null → the ask-back re-asks ONCE below). On a pick we
  // PERSIST the zone-of-truth, re-price, and surface the applied fee + recap so the customer
  // sees the number and the next turn is a real confirmation point. Deterministic; no model call.
  if (
    addressFlowV2 &&
    ctx.draft.fulfillment === "delivery" &&
    ctx.draft.address?.trim() &&
    !hasPersistedZone(ctx.draft) &&
    !ctx.draft.deliveryZone
  ) {
    const picked = selectZoneFromReply(input.userMessage, ctx.draft.address, input.brain.deliveryAreas);
    if (picked) {
      persistZoneToDraft(ctx.draft, picked);
      if (geoRouting) ctx.draft.branchId = picked.branchId ?? null;
      const recap = executeTool("get_order_summary", {}, ctx); // recomputes totals with the fee
      ctx.signals.push({
        type: "missing_data",
        detail: { reason: "zone_selected_persisted", source: "zone_state_net", zoneName: picked.name, deliveryFee: ctx.draft.deliveryFee },
      });
      const feeLine = `تمام، منطقتك «${picked.name}» — رسوم التوصيل ${ctx.draft.deliveryFee} ${ctx.draft.currency}.`;
      text = ctx.draft.lines.length ? `${feeLine}\n${recap.content}` : feeLine;
    }
  }

  // Did a safety/handoff event fire this turn? A safety line must never be overwritten by a
  // cheerful recap, and the recap-eligibility check consults it.
  const safetyEvent =
    !!ctx.escalation ||
    ctx.signals.some(
      (s) =>
        s.type === "escalation" ||
        s.type === "notify_without_hold" ||
        (s.type === "missing_data" &&
          ["allergen_safety_claim", "disease_diet_suitability_claim", "companion_banned_phrase_repaired", "allergy_checkpoint"].includes(
            String(s.detail?.reason ?? "")
          ))
    );

  // WO-ASKBACK — recover the turn's pending deterministic question (address-zone ambiguity):
  // prefer this turn's tool signal; else RE-DETECT a still-open ambiguity from the current draft
  // (address written, no zone resolved, address_flow_v2 on). WO-STATE-TRUTH (PART B suppression) —
  // once a zone is resolved the subject is SETTLED, so never treat a stale signal as pending.
  let pendingQuestion: string | null = null;
  if (!hasPersistedZone(ctx.draft) && !ctx.draft.deliveryZone) {
    pendingQuestion = pendingDeterministicQuestion(ctx.signals);
    if (!pendingQuestion && addressFlowV2 && ctx.draft.address?.trim()) {
      const rematch = matchAddressToZones(ctx.draft.address, input.brain.deliveryAreas);
      if (rematch.kind === "ambiguous") pendingQuestion = rematch.question;
    }
  }
  // WO-CONTEXT (PART A) — a cold session (>2h idle) or an explicit reset EXPIRES any pending
  // deterministic question so a stale zone ask never trails a returning customer's fresh turn.
  // Only fires when a candidate actually existed → the signal is precise (no false expiry).
  if (input.sessionExpired && pendingQuestion) {
    ctx.signals.push({ type: "missing_data", detail: { reason: "pending_question_expired", source: "session_freshness" } });
    pendingQuestion = null;
  }
  // WO-LEAKGUARD (PART B) — a zone-only DELIVERY capture (a resolved zone but no written
  // street address, like tonight's «التعاون هرم») makes the FROZEN address-detail ask the turn's
  // single deterministic pending question — rendered last by the ask-back machinery, and blocking
  // confirmation until street-level text exists. Lower precedence than a live zone ambiguity
  // (which already owns pendingQuestion above). Gated on address_flow_v2 and not on an expired
  // session (a returning cold session archives its draft upstream — no fresh readiness ask).
  if (!pendingQuestion && !input.sessionExpired && addressFlowV2 && needsStreetAddress(ctx.draft)) {
    pendingQuestion = frozenAddressAsk(input.brain.dialect);
    ctx.signals.push({ type: "missing_data", detail: { reason: "delivery_address_required", source: "delivery_readiness", question: pendingQuestion } });
  }

  if (input.brain.finishLine) {
    // WO-SIMPLIFY (PART E) — the SINGLE final-compose pass. It orders the reply ONCE
    // (recap → single trailing question → scoped contract), renders the recap ONLY from a
    // consistent priced draft (PART E hard guard → no empty/wrong total), suppresses the recap
    // on an info-collection turn (PART C), and never appends a handoff to a social-terminal turn
    // (PART D). The simple-allergy posture (PART A) passes allergyNote=null so the recap never
    // carries an allergy line. Flag OFF → this whole block is skipped → the legacy settle below.
    const composed = composeFinalReply({
      core: text,
      draft: ctx.draft,
      dialect: input.brain.dialect,
      allergyNote: input.brain.allergySimple ? null : ctx.sessionAllergyNote,
      canOrder,
      toolNames,
      safetyEvent,
      flagOn: true,
      pendingQuestion,
      escalated: !!ctx.escalation,
      previousOutbound: lastAssistantText(input.history),
      socialClosing: isSocialClosingTurn(input.userMessage),
      // The list/buttons this turn attached ARE the next step — the customer taps.
      hasPresentation: !!ctx.presentation,
    });
    for (const s of composed.signals) ctx.signals.push(s);
    text = composed.text;
  } else if (pendingQuestion) {
    // WO-ASKBACK — legacy FINAL SETTLE (flag OFF, byte-identical): inject the pending question
    // when the settled reply neither carries it nor is a contentless pleasantry.
    const injected = injectPendingQuestion(text, pendingQuestion);
    if (injected.mode !== "unchanged") {
      ctx.signals.push({
        type: "missing_data",
        detail: { reason: "askback_injected", source: "askback_final_settle", mode: injected.mode, question: pendingQuestion },
      });
      text = injected.text;
    }
  }
  // WO-LEAKGUARD (PART A) — the flag-OFF legacy settle does NOT run through the single
  // assembler, so apply the SAME outbound register net here (all tenants, unconditional):
  // a reply carrying a tool identifier / model directive / raw error marker is replaced by
  // the frozen turn-state fallback, the rejected text logged. The finishLine branch already
  // applied this inside composeFinalReply, so only the legacy path needs it (no double-run).
  if (!input.brain.finishLine && text.trim()) {
    const guarded = applyOutboundRegister(text, {
      dialect: input.brain.dialect,
      draft: ctx.draft,
      pending: pendingQuestion,
      safetyEvent,
    });
    if (guarded.signal) ctx.signals.push(guarded.signal);
    text = guarded.text;
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
    calls_used,
  };
}
