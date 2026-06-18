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
import {
  emptyDraft,
  executeTool,
  NON_ORDER_TOOLS,
  ORDER_TOOLS,
  type OrderDraft,
  type Presentation,
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
}

export interface RespondResult {
  reply: string;
  draft: OrderDraft;
  escalate: boolean;
  escalationReason: string | null;
  signals: ToolSignal[];
  /** Interactive options the model asked to present (WhatsApp buttons/list), if any. */
  presentation: Presentation | null;
  usage: LlmUsage;
  toolNames: string[];
  stopReason: string;
  model: string;
  adapter: "claude" | "mock";
}

const MAX_ITERATIONS = 6;
const MONEY_TOOL_NAMES = new Set(["add_to_order", "remove_from_order", "set_fulfillment", "get_order_summary", "finalize_draft"]);

function mentionsMoney(text: string, currency: string): boolean {
  const escapedCurrency = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(${escapedCurrency}|ج\\.م|ر\\.س|ريال|جنيه|الإجمالي|الاجمالي|المجموع|total|subtotal|\\d+[\\d,.]*\\s*(?:${escapedCurrency}|ج\\.م|ر\\.س))`,
    "iu"
  ).test(text);
}

function claimsOrderConfirmed(text: string): boolean {
  return /(تم\s+(?:تأكيد|تسجيل|استلام)\s+الطلب|طلبك\s+(?:اتأكد|تأكد|تسجل|تم)|order\s+(?:confirmed|placed))/iu.test(text);
}

function isExplicitOrderConfirmation(text: string): boolean {
  if (/(?:لا|لأ|مش|ما)\s*(?:تأكد|تكمل|تبعت|ترسل)|(?:الغ|إلغاء|cancel)/iu.test(text)) return false;
  return /(?:أكد|تأكيد|ابعته|ابعت|ارسله|رسل|كمّل|كمل|تمام|أيوه|ايوه|yes|confirm|send it)/iu.test(text);
}

function safeMoneyReply(dialect: string): string {
  return dialect === "egyptian"
    ? "أقدر أحسبهولك بدقة من السيستم، بس لازم أبني الطلب الأول. تحب أضيف إيه؟"
    : "أقدر أحسبه لك بدقة من السيستم، بس لازم أبني الطلب أول. وش تحب أضيف؟";
}

function safeConfirmReply(dialect: string): string {
  return dialect === "egyptian"
    ? "لسه ما أكدتش الطلب؛ لازم أبنيه وأحسب الإجمالي من السيستم الأول. تحب أراجعه معاك؟"
    : "لسه ما أكدت الطلب؛ لازم أبنيه وأحسب الإجمالي من السيستم أول. تحب أراجعه معك؟";
}

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  const system = buildCustomerAgentSystemPrompt(input.brain);
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;

  const ctx: ToolContext = {
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    draft: input.initialDraft ? structuredClone(input.initialDraft) : emptyDraft(currency),
    signals: [],
    escalation: null,
    presentation: null,
    taxMode: input.brain.taxMode ?? "inclusive",
    taxRate: input.brain.taxRate ?? 0,
  };

  const canOrder = modeAllowsOrders(input.brain.mode) && input.brain.isOpen;
  const tools = canOrder ? ORDER_TOOLS : NON_ORDER_TOOLS;

  const messages: LlmMessage[] = [...input.history, { role: "user", content: input.userMessage }];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const toolNames: string[] = [];

  if (canOrder && input.initialDraft?.lines.length && isExplicitOrderConfirmation(input.userMessage)) {
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

  const usedMoneyTool = toolNames.some((name) => MONEY_TOOL_NAMES.has(name));
  if (text.trim() && !usedMoneyTool && mentionsMoney(text, currency)) {
    ctx.signals.push({ type: "money_mismatch", detail: { reason: "money_without_tool", reply: text } });
    text = safeMoneyReply(input.brain.dialect);
  }
  if (text.trim() && !ctx.draft.finalized && claimsOrderConfirmed(text)) {
    ctx.signals.push({ type: "money_mismatch", detail: { reason: "confirmation_without_finalized_draft", reply: text } });
    text = safeConfirmReply(input.brain.dialect);
  }

  return {
    reply: text,
    draft: ctx.draft,
    escalate: !!ctx.escalation,
    escalationReason: ctx.escalation?.reason ?? null,
    signals: ctx.signals,
    presentation: ctx.presentation,
    usage,
    toolNames,
    stopReason,
    model,
    adapter: adapter.name,
  };
}
