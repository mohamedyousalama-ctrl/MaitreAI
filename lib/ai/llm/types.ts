// ============================================================================
// MaitreAI — LLM adapter contract (Sprint 8)
// One seam, two implementations: the real Claude adapter (default) and a
// deterministic mock used by the automated test suite (so tests stay free and
// reproducible). Nothing above this layer knows which adapter is in play.
// ============================================================================

/** Per-use-case routing key. Lets us run a cheaper/faster model for the
 *  customer agent and a stronger one for admin/promo NL parsing later. */
export type LlmUseCase = "customer_agent" | "admin_parse" | "conversation_intel" | "perception" | "image_perception";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Tokens WRITTEN to the prompt cache this call (Anthropic cache_creation_input_tokens),
   *  priced at the cache-write rate. Optional so deterministic/mock paths (all zero) stay
   *  byte-identical; the real adapter always populates it (WO-COST-1 honest ledger). */
  cacheCreationTokens?: number;
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

/** Content blocks for tool-use round-trips (Anthropic-shaped, adapter-neutral).
 *  The `image` block reuses the adapter's straight passthrough to the Anthropic SDK
 *  (claude.ts sends `messages` verbatim) — it is NOT a new vision pipeline, just the
 *  content shape the SDK already accepts. Used ONLY by the one-shot inbound-image
 *  vision READ (lib/ai/image-perception.ts, image_perception use case); the customer
 *  agent turn itself never carries image blocks (it sees the derived TEXT read). */
export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
}

export interface LlmRequest {
  /** Cacheable STATIC system prompt (persona + rulebook + menu). Carries the single
   *  cache_control breakpoint; must be byte-stable across turns of the same tenant +
   *  menu-version so it is billed at cache-read rates (WO-COST-1). */
  system: string;
  /** Per-turn DYNAMIC directives appended AFTER the cache breakpoint (uncached), so a
   *  firing directive never busts the cached static block. The model receives
   *  system + systemTail concatenated — identical instructions, re-layered. */
  systemTail?: string;
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
