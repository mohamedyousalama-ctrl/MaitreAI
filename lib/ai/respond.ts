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
  /**
   * Seed draft for this turn — the loaded persistent order session (Step 1).
   * When omitted (demo/stateless callers) the turn starts from an empty draft.
   */
  initialDraft?: OrderDraft;
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

// When a persistent session is loaded with items, the model must SEE the saved
// cart — otherwise it reconstructs the order from prose history and re-adds the
// same items, double-counting the total (a money-integrity break). We ride this
// truth in the (uncached) user turn, not the cached system prompt.
function savedOrderNote(d: OrderDraft): string {
  const lines = d.lines.map((l) => `${l.quantity}× ${l.name} = ${l.lineTotal} ${d.currency}`).join("، ");
  const parts = [`السلة الحالية: ${lines}`];
  if (d.fulfillment === "delivery" && d.deliveryZone) parts.push(`التوصيل: ${d.deliveryZone} (${d.deliveryFee} ${d.currency})`);
  else if (d.fulfillment === "pickup") parts.push("الاستلام من الفرع");
  parts.push(`الإجمالي: ${d.total} ${d.currency}`);
  return (
    `[حالة الطلب المحفوظة من النظام — هذه الأصناف مُضافة بالفعل في السلة. لا تُضِفها من جديد؛ ` +
    `فقط أكمل الطلب أو عدّله حسب رسالة العميل، واستخدم get_order_summary عند الحاجة. ${parts.join(" — ")}]`
  );
}

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  const system = buildCustomerAgentSystemPrompt(input.brain);
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;

  // Step 1: resume the persistent order session when one was loaded; otherwise
  // start empty. The executor mutates this draft in place (money tool-computed).
  const ctx: ToolContext = {
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    draft: input.initialDraft ?? emptyDraft(currency),
    signals: [],
    escalation: null,
    presentation: null,
    taxMode: input.brain.taxMode ?? "inclusive",
    taxRate: input.brain.taxRate ?? 0,
  };

  const canOrder = modeAllowsOrders(input.brain.mode) && input.brain.isOpen;
  const tools = canOrder ? ORDER_TOOLS : NON_ORDER_TOOLS;

  // Seed the turn with the user's message; when resuming a non-empty saved
  // session, attach the cart snapshot as a second text block so the model
  // continues the order instead of rebuilding (and double-counting) it. The
  // real message stays the FIRST block (mock/test adapters read that one).
  const seeded = input.initialDraft && input.initialDraft.lines.length > 0;
  const lastUser: LlmMessage = seeded
    ? {
        role: "user",
        content: [
          { type: "text", text: input.userMessage },
          { type: "text", text: savedOrderNote(input.initialDraft as OrderDraft) },
        ],
      }
    : { role: "user", content: input.userMessage };
  const messages: LlmMessage[] = [...input.history, lastUser];
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const toolNames: string[] = [];

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
