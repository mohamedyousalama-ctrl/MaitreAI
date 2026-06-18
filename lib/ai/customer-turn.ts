// ============================================================================
// MaitreAI — Customer-turn orchestrator (Sprint 9, S9-1) — SERVER ONLY
// The single place that runs one Customer-Agent Brain turn against the live
// adapter AND persists the outcome (AI reply + agent_runs cost row + signals +
// escalation→human flip). Extracted from /api/agent/respond so BOTH the
// secret-guarded HTTP route (scripts/eval) and the WhatsApp webhook bridge
// (lib/messaging/respond-and-send) share exactly one Brain path — no drift, no
// double-counting. Money is computed by the order tools, never the model.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrain } from "@/lib/db/brain";
import { respond } from "@/lib/ai/respond";
import { deriveSystemMode } from "@/lib/ai/modes";
import { costUsd, modelFor } from "@/lib/ai/llm";
import { seedAiTone } from "@/lib/seed-data";
import type { BrainContext } from "@/lib/ai/prompt";
import type { LlmMessage, LlmUsage } from "@/lib/ai/llm/types";
import type { OrderDraft, Presentation, ToolSignal } from "@/lib/ai/tools";
import type { AiToneConfig } from "@/lib/types";
import { dialectProfile } from "@/lib/ai/dialect";

/** Typed error so callers can map to the right HTTP status / timeline note. */
export class CustomerTurnError extends Error {
  constructor(public code: "restaurant_not_found" | "agent_error", message?: string) {
    super(message ?? code);
    this.name = "CustomerTurnError";
  }
}

export interface CustomerTurnInput {
  restaurantId: string;
  /** When set, the AI reply is persisted into this conversation and logged against it. */
  conversationId: string | null;
  /** Prior turns (oldest first), excluding the message being answered. */
  history: LlmMessage[];
  /** The customer message to answer. */
  userMessage: string;
  /** Persist the AI reply as a message row (default true when conversationId is set). */
  persistReply?: boolean;
}

export interface CustomerTurnOutcome {
  reply: string;
  escalate: boolean;
  escalationReason: string | null;
  draft: OrderDraft;
  signals: ToolSignal[];
  presentation: Presentation | null;
  toolNames: string[];
  model: string;
  adapter: "claude" | "mock";
  mode: string;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number;
  agentRunId: string | null;
  /** Id of the persisted AI reply message row (null when not persisted). */
  replyMessageId: string | null;
}

function isOpenDraft(value: unknown): value is OrderDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OrderDraft>;
  return Array.isArray(draft.lines) && draft.lines.length > 0 && draft.finalized !== true;
}

/**
 * Run one Brain turn and persist its outcome using the admin (service-role)
 * client. Throws CustomerTurnError("restaurant_not_found") / ("agent_error").
 * On an agent error an error agent_runs row is logged before re-throwing.
 */
export async function runCustomerTurn(
  admin: SupabaseClient,
  input: CustomerTurnInput
): Promise<CustomerTurnOutcome> {
  const { restaurantId, conversationId } = input;
  const persistReply = input.persistReply ?? !!conversationId;

  // Explicit columns (NOT select("*")) — exclude the secret credential columns
  // (wa_access_token_enc / wa_app_secret_enc); the Brain never needs raw secrets.
  const { data: r } = await admin
    .from("restaurants")
    .select(
      "agent_mode,is_open,ai_tone,dialect,name,currency,timezone,business_type,auto_accept_orders,agent_persona_name,tax_mode,tax_rate"
    )
    .eq("id", restaurantId)
    .single();
  if (!r) throw new CustomerTurnError("restaurant_not_found");
  const row = r as Record<string, unknown>;

  const brain = await loadBrain(admin, restaurantId);

  const mode = deriveSystemMode({
    supabaseConfigured: true,
    agentMode: String(row.agent_mode ?? "setup"),
    isOpen: !!row.is_open,
    llmHealthy: true,
  });

  const aiTone: AiToneConfig = { ...seedAiTone, ...((row.ai_tone as Partial<AiToneConfig>) ?? {}) };

  // §E7 handover note — a human's prior commitment the Brain must honor on resume.
  let handoverNote: string | undefined;
  let initialDraft: OrderDraft | null = null;
  if (conversationId) {
    const { data: conv } = await admin
      .from("conversations")
      .select("handover_note")
      .eq("id", conversationId)
      .single();
    handoverNote = (conv?.handover_note as string | null) ?? undefined;

    const { data: priorDraftRows } = await admin
      .from("messages")
      .select("meta")
      .eq("conversation_id", conversationId)
      .eq("sender", "ai")
      .order("created_at", { ascending: false })
      .limit(8);
    const row = (priorDraftRows ?? []).find((message) =>
      isOpenDraft((message.meta as Record<string, unknown> | null)?.draft)
    );
    initialDraft = row ? ((row.meta as Record<string, unknown>).draft as OrderDraft) : null;
  }

  const dialect = String(row.dialect ?? "egyptian");
  const ctx: BrainContext = {
    profile: {
      name: String(row.name ?? ""),
      currency: String(row.currency || dialectProfile(dialect).currencyDefault),
      timezone: String(row.timezone ?? "Asia/Riyadh"),
      businessType: String(row.business_type ?? ""),
    },
    dialect,
    menuItems: brain.menuItems,
    modifiers: brain.modifiers,
    branches: brain.branches,
    deliveryAreas: brain.deliveryAreas,
    policies: brain.policies,
    faqs: brain.faqs,
    aiTone,
    mode,
    isOpen: !!row.is_open,
    autoAccept: !!row.auto_accept_orders,
    handoverNote,
    personaName: (row.agent_persona_name as string | null) ?? undefined,
    taxMode: String(row.tax_mode ?? "inclusive"),
    taxRate: Number(row.tax_rate ?? 0),
  };

  const t0 = Date.now();
  let result;
  try {
    result = await respond({ brain: ctx, history: input.history, userMessage: input.userMessage, initialDraft });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("agent_runs").insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "customer",
      input: input.userMessage,
      error: message,
    });
    throw new CustomerTurnError("agent_error", message);
  }
  const latencyMs = Date.now() - t0;

  const cfg = modelFor("customer_agent");
  const cost = costUsd(cfg, result.usage.inputTokens, result.usage.outputTokens);

  // Persist the AI reply (optimistically "sent"; the channel sender downgrades
  // it to "failed" and notes the timeline if real delivery fails).
  let replyMessageId: string | null = null;
  if (persistReply && conversationId) {
    const { data: msg } = await admin
      .from("messages")
      .insert({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        direction: "outbound",
        sender: "ai",
        text: result.reply,
        status: "sent",
        meta: { model: result.model, escalate: result.escalate, draft: result.draft, presentation: result.presentation },
      })
      .select("id")
      .single();
    replyMessageId = (msg?.id as string) ?? null;
    await admin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }

  const { data: run } = await admin
    .from("agent_runs")
    .insert({
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      trigger: "customer",
      input: input.userMessage,
      output: result.reply,
      tools_used: result.toolNames,
      model: result.model,
      adapter: result.adapter,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cache_read_tokens: result.usage.cacheReadTokens,
      cost_usd: cost,
      latency_ms: latencyMs,
      tokens: result.usage.inputTokens + result.usage.outputTokens,
      confidence: result.escalate ? 50 : null,
    })
    .select("id")
    .single();

  if (result.signals.length) {
    await admin.from("conversation_signals").insert(
      result.signals.map((s) => ({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        type: s.type,
        detail: s.detail,
      }))
    );
  }

  // On escalation the AI stops owning the conversation (Amendment 03 §E).
  if (result.escalate && conversationId) {
    await admin
      .from("conversations")
      .update({ owner: "human", status: "يحتاج تدخل موظف", escalation_reason: result.escalationReason })
      .eq("id", conversationId);
  }

  return {
    reply: result.reply,
    escalate: result.escalate,
    escalationReason: result.escalationReason,
    draft: result.draft,
    signals: result.signals,
    presentation: result.presentation,
    toolNames: result.toolNames,
    model: result.model,
    adapter: result.adapter,
    mode,
    usage: result.usage,
    costUsd: cost,
    latencyMs,
    agentRunId: (run?.id as string) ?? null,
    replyMessageId,
  };
}
