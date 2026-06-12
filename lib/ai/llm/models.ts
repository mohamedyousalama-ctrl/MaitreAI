// ============================================================================
// MaitreAI — Per-use-case model registry (Sprint 8)
// The customer agent runs claude-sonnet-4-6 (cost/latency); admin/promo NL
// parsing can use a stronger model later. Every model string is env-overridable
// so we can re-point without a redeploy. Prices are per 1M tokens (USD) and feed
// the per-message cost we log to agent_runs (overage pricing visibility).
// ============================================================================

import type { LlmUseCase } from "./types";

export interface ModelConfig {
  model: string;
  maxTokens: number;
  thinking: "adaptive" | "disabled";
  effort?: "low" | "medium" | "high";
  priceIn: number; // USD / 1M input tokens
  priceOut: number; // USD / 1M output tokens
}

const REGISTRY: Record<LlmUseCase, ModelConfig> = {
  // WhatsApp customer replies: short, latency-sensitive, tool-driven.
  customer_agent: {
    model: process.env.AI_MODEL_CUSTOMER_AGENT || "claude-sonnet-4-6",
    maxTokens: 1024,
    thinking: "disabled",
    priceIn: 3,
    priceOut: 15,
  },
  // Owner-side natural-language parsing (menu/promo ingestion) — stronger model.
  admin_parse: {
    model: process.env.AI_MODEL_ADMIN_PARSE || "claude-opus-4-8",
    maxTokens: 4096,
    thinking: "adaptive",
    effort: "medium",
    priceIn: 5,
    priceOut: 25,
  },
};

export function modelFor(useCase: LlmUseCase): ModelConfig {
  return REGISTRY[useCase];
}

/** Cost in USD for a single call, from the use-case price table. */
export function costUsd(cfg: ModelConfig, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * cfg.priceIn + (outputTokens / 1_000_000) * cfg.priceOut;
}
