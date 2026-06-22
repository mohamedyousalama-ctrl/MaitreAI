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
import { modeAllowsOrders } from "./modes";
import { dialectProfile } from "./dialect";
import { fabricatesMoney, knownMenuPrices, offersNonMenuProduct } from "./money-guard";
import { assertsAllergenSafety } from "./allergen-gate";
import {
  emptyDraft,
  executeTool,
  NON_ORDER_TOOLS,
  ORDER_TOOLS,
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
}

const MAX_ITERATIONS = 6;
const MONEY_TOOL_NAMES = new Set(["add_to_order", "remove_from_order", "set_fulfillment", "get_order_summary", "finalize_draft"]);

function claimsOrderConfirmed(text: string): boolean {
  return /(تم\s+(?:تأكيد|تسجيل|استلام)\s+الطلب|طلبك\s+(?:اتأكد|تأكد|تسجل|تم)|order\s+(?:confirmed|placed))/iu.test(text);
}

function isExplicitOrderConfirmation(text: string): boolean {
  if (/(?:لا|لأ|مش|ما)\s*(?:تأكد|تاكد|تأكيد|تاكيد|تكمل|تبعت|ترسل)|(?:الغ|إلغاء|cancel)/iu.test(text)) return false;
  return /(?:أكد|اكد|تأكيد|تاكيد|ابعته|ابعت|ارسله|رسل|كمّل|كمل|تمام|أيوه|ايوه|yes|confirm|send it)/iu.test(text);
}

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

// Allergen-safety guard reply (Fix 3): the agent must NEVER certify allergen safety;
// it acknowledges the health stakes and hands to the kitchen/team to verify.
function safeAllergenReply(dialect: string): string {
  return dialect === "egyptian"
    ? "صحتك أهم حاجة عندنا 🙏 مش هقدر أأكد إن الصنف ده آمن من ناحية الحساسية من غير ما المطبخ يتأكد — هحوّلك لفريق المطعم يساعدوك تختار بأمان."
    : "صحتك أهم شي عندنا 🙏 ما أقدر أأكد إن الصنف هذا آمن من ناحية الحساسية بدون ما المطبخ يتأكد — بحوّلك لفريق المطعم يساعدونك تختار بأمان.";
}

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  const system =
    buildCustomerAgentSystemPrompt(input.brain) +
    (input.perceptionDirective ? `\n\n${input.perceptionDirective}` : "") +
    (input.cadenceDirective ? `\n\n${input.cadenceDirective}` : "");
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;
  const knownPrices = knownMenuPrices(input.brain);

  const ctx: ToolContext = {
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    draft: input.initialDraft ? structuredClone(input.initialDraft) : emptyDraft(currency),
    signals: [],
    escalation: null,
    presentation: null,
    photoRequests: [],
    taxMode: input.brain.taxMode ?? "inclusive",
    taxRate: input.brain.taxRate ?? 0,
  };

  const canOrder = modeAllowsOrders(input.brain.mode) && input.brain.isOpen;
  const tools = canOrder ? ORDER_TOOLS : NON_ORDER_TOOLS;

  const messages: LlmMessage[] = [...input.history, { role: "user", content: input.userMessage }];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const toolNames: string[] = [];

  if (
    canOrder &&
    input.initialDraft?.lines.length &&
    isExplicitOrderConfirmation(input.userMessage) &&
    atConfirmationPoint(input.history)
  ) {
    toolNames.push("finalize_draft");
    const out = executeTool("finalize_draft", {}, ctx);
    const reply = out.isError ? safeConfirmReply(input.brain.dialect) : out.content;
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
  // Allergen-safety OUTPUT GUARD (Fix 3, flag-gated): NEVER let the agent certify an
  // item is allergen-safe («مفيهوش بندق» / «آمن» / nut-free) — there is no operator-
  // verified allergen data, so any such claim is unsafe. Replace it with an escalate-
  // safe reply and hand to a human. Safety beats the sale, always. Off → no-op.
  if (text.trim() && input.brain.deterministicAllergenSafety && assertsAllergenSafety(text)) {
    ctx.signals.push({ type: "escalation", detail: { reason: "allergen_safety_claim", reply: text } });
    ctx.escalation = ctx.escalation ?? { reason: "سلامة الحساسية: المساعد حاول تأكيد سلامة صنف بدون بيانات مؤكدة — يحتاج تأكيد المطبخ" };
    text = safeAllergenReply(input.brain.dialect);
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
  };
}
