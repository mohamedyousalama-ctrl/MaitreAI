// ============================================================================
// MaitreAI — Claude LLM adapter (Sprint 8) — SERVER ONLY
// Wraps the official Anthropic SDK behind the LlmAdapter seam. Reads
// ANTHROPIC_API_KEY from the environment. Single-shot generate(): the engine
// owns the tool-use loop (so it can gate money/menu/refund actions and log
// tokens per call). The system prompt is sent as a cache_control block so the
// large per-tenant brain is billed at cache-read rates across a conversation.
// ============================================================================

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmAdapter, LlmContentBlock, LlmResult, LlmToolCall } from "./types";
import { modelFor } from "./models";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env
  return client;
}

export const claudeAdapter: LlmAdapter = {
  name: "claude",
  async generate(req, useCase) {
    const cfg = modelFor(useCase);

    // Base, strongly-typed request. Thinking/effort are attached loosely so the
    // adapter doesn't break across SDK minor versions (effort is GA via
    // output_config; adaptive thinking is the only on-mode on 4.6+).
    const params: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: req.maxTokens ?? cfg.maxTokens,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
    };
    if (req.tools?.length) params.tools = req.tools;
    if (cfg.thinking === "adaptive") {
      params.thinking = { type: "adaptive" };
      if (cfg.effort) params.output_config = { effort: cfg.effort };
    }

    // WO-MONITORING-ALERTING (Part 2) — optional per-request timeout so a hung
    // Claude call fails FAST into the customer-facing fallback (respond-and-send)
    // instead of stalling the turn. Env-gated: when AGENT_TIMEOUT_MS is unset the
    // else branch is the VERBATIM original call (no second arg) — byte-identical on
    // the happy path. When set, the SDK aborts after the timeout and throws; a
    // successful response within the window is unchanged (the timeout only bounds
    // the wait, not the result).
    const client = getClient();
    const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS);
    const res = (await (Number.isFinite(timeoutMs) && timeoutMs > 0
      ? client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming, { timeout: timeoutMs })
      : client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming))) as Anthropic.Message;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolCalls: LlmToolCall[] = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

    return {
      text,
      toolCalls,
      stopReason: res.stop_reason ?? "end_turn",
      usage: {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
        cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
      },
      model: res.model,
      rawContent: res.content as unknown as LlmContentBlock[],
    };
  },
};
