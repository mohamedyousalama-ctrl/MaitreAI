// ============================================================================
// MaitreAI — Deterministic mock LLM adapter (Sprint 8)
// Used by the automated test suite and as the fallback when ANTHROPIC_API_KEY
// is absent (or AI_ADAPTER=mock). It is fully deterministic and free — no
// network, no tokens. It returns a stable, dialect-aware acknowledgement and
// emits NO tool calls. The richer order-building tool behavior is exercised
// against the real adapter; the mock keeps flows runnable and tests green.
// ============================================================================

import type { LlmAdapter, LlmMessage, LlmResult } from "./types";

function lastUserText(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const t = m.content.find((b) => b.type === "text");
    if (t && t.type === "text") return t.text;
  }
  return "";
}

export const mockAdapter: LlmAdapter = {
  name: "mock",
  async generate(req): Promise<LlmResult> {
    const text = lastUserText(req.messages).trim();
    // Deterministic, content-derived reply so tests can assert on it.
    const reply = text
      ? `«وضع المحاكاة» استلمت رسالتك: ${text.slice(0, 80)}`
      : "«وضع المحاكاة» أهلاً بك.";
    return {
      text: reply,
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      model: "mock",
      rawContent: [{ type: "text", text: reply }],
    };
  },
};
