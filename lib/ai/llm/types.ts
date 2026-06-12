// ============================================================================
// MaitreAI — LLM adapter contract (Sprint 8)
// One seam, two implementations: the real Claude adapter (default) and a
// deterministic mock used by the automated test suite (so tests stay free and
// reproducible). Nothing above this layer knows which adapter is in play.
// ============================================================================

/** Per-use-case routing key. Lets us run a cheaper/faster model for the
 *  customer agent and a stronger one for admin/promo NL parsing later. */
export type LlmUseCase = "customer_agent" | "admin_parse";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Content blocks for tool-use round-trips (Anthropic-shaped, adapter-neutral). */
export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
}

export interface LlmRequest {
  /** Cacheable system prompt (restaurant brain + dialect + guardrails). */
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  /** Override the use-case default. */
  maxTokens?: number;
}

export interface LlmResult {
  /** Concatenated text blocks (the customer-facing reply). */
  text: string;
  /** Any tool_use blocks the model emitted (drives the engine's tool loop). */
  toolCalls: LlmToolCall[];
  /** end_turn | tool_use | max_tokens | refusal | … */
  stopReason: string;
  usage: LlmUsage;
  model: string;
  /** Full assistant content, for replaying into the next turn of a tool loop. */
  rawContent: LlmContentBlock[];
}

export interface LlmAdapter {
  readonly name: "claude" | "mock";
  generate(req: LlmRequest, useCase: LlmUseCase): Promise<LlmResult>;
}
