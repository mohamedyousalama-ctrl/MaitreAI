// ============================================================================
// MaitreAI — LLM adapter resolver (Sprint 8)
// Claude by default; the deterministic mock when ANTHROPIC_API_KEY is absent or
// AI_ADAPTER=mock is set (the test suite forces mock). The Claude adapter is
// imported lazily so its `server-only` + SDK dependencies never reach the
// mock/test path or a client bundle.
// ============================================================================

import type { LlmAdapter } from "./types";
import { mockAdapter } from "./mock";

/** True when real Claude calls should be made (key present and mock not forced). */
export function isClaudeConfigured(): boolean {
  return process.env.AI_ADAPTER !== "mock" && !!process.env.ANTHROPIC_API_KEY;
}

/** Which adapter is active, for logging/observability. */
export function activeAdapterName(): "claude" | "mock" {
  return isClaudeConfigured() ? "claude" : "mock";
}

export async function getAdapter(): Promise<LlmAdapter> {
  if (isClaudeConfigured()) {
    const { claudeAdapter } = await import("./claude");
    return claudeAdapter;
  }
  return mockAdapter;
}

export * from "./types";
export { modelFor, costUsd } from "./models";
