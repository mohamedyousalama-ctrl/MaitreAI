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
  // Owner-side natural-language routing/parsing. Thinking disabled — this is a
  // short JSON classifier (low max_tokens); thinking would eat the output budget.
  admin_parse: {
    model: process.env.AI_MODEL_ADMIN_PARSE || "claude-opus-4-8",
    maxTokens: 1024,
    thinking: "disabled",
    priceIn: 5,
    priceOut: 25,
  },
  // Karim Pro P1 conversation-intelligence soft layer: ONE cheap read per
  // conversation (not per turn). A small Haiku-tier JSON inference — never the
  // customer agent — so the per-conversation cost stays tiny. Pro-gated.
  conversation_intel: {
    model: process.env.AI_MODEL_CONVERSATION_INTEL || "claude-haiku-4-5-20251001",
    maxTokens: 700,
    thinking: "disabled",
    priceIn: 1,
    priceOut: 5,
  },
  // Karim Pro P3 per-turn perception: ONE tiny Haiku read per turn (intent +
  // confidence/confusion + risk). Small output, cheap, fast — Pro-gated on the
  // narrow `perception` flag so it only ever runs on a perception test-bed.
  perception: {
    model: process.env.AI_MODEL_PERCEPTION || "claude-haiku-4-5-20251001",
    maxTokens: 200,
    thinking: "disabled",
    priceIn: 1,
    priceOut: 5,
  },
  // WO-MEDIA-INBOUND — one-shot vision READ of an inbound image (media_turn_trigger).
  // ONE cheap Haiku read per image (never per turn): describe the image as short
  // Arabic text so the customer agent can engage with it and later turns can see it,
  // WITHOUT the customer agent ever carrying image bytes. Vision-capable model; small
  // output; env-overridable. Cost lands on agent_runs (trigger "image_perception").
  image_perception: {
    model: process.env.AI_MODEL_IMAGE_PERCEPTION || "claude-haiku-4-5-20251001",
    maxTokens: 300,
    thinking: "disabled",
    priceIn: 1,
    priceOut: 5,
  },
};

export function modelFor(useCase: LlmUseCase): ModelConfig {
  return REGISTRY[useCase];
}

/** Cost in USD for a single call, from the use-case price table. */
export function costUsd(cfg: ModelConfig, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * cfg.priceIn + (outputTokens / 1_000_000) * cfg.priceOut;
}
