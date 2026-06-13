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

export async function respond(input: RespondInput): Promise<RespondResult> {
  const adapter = await getAdapter();
  const system = buildCustomerAgentSystemPrompt(input.brain);
  const currency = input.brain.profile.currency || dialectProfile(input.brain.dialect).currencyDefault;

  const ctx: ToolContext = {
    menuItems: input.brain.menuItems,
    modifiers: input.brain.modifiers,
    deliveryAreas: input.brain.deliveryAreas,
    draft: emptyDraft(currency),
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
