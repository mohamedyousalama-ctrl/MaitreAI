import type { SupabaseClient } from "@supabase/supabase-js";
import { costUsd, modelFor } from "./models";
import type { LlmUsage, LlmUseCase } from "./types";

type UsageCostClient = Pick<SupabaseClient, "from">;

export interface RecordUsageEventArgs {
  admin: UsageCostClient | null;
  tenantId: string;
  conversationId?: string | null;
  orderId?: string | null;
  surface: string;
  useCase: LlmUseCase;
  model: string;
  usage: LlmUsage;
  latencyMs?: number | null;
  trigger: string;
  meta?: Record<string, unknown>;
}

function intMeter(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export async function recordUsageEvent(args: RecordUsageEventArgs): Promise<number> {
  const inputTokens = intMeter(args.usage.inputTokens);
  const outputTokens = intMeter(args.usage.outputTokens);
  const cacheReadTokens = intMeter(args.usage.cacheReadTokens);
  const cacheCreationTokens = intMeter(args.usage.cacheCreationTokens);
  const cost = costUsd(modelFor(args.useCase), inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

  if (!args.admin) return cost;

  try {
    const { error } = await args.admin.from("usage_cost_events").insert({
      tenant_id: args.tenantId,
      conversation_id: args.conversationId ?? null,
      order_id: args.orderId ?? null,
      surface: args.surface,
      model: args.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_creation_tokens: cacheCreationTokens,
      cost_usd: cost,
      latency_ms: args.latencyMs == null ? null : intMeter(args.latencyMs),
      trigger: args.trigger,
      meta: {
        use_case: args.useCase,
        ...(args.meta ?? {}),
      },
    });
    if (error) console.error("[usage_cost_events] insert failed", error);
  } catch (e) {
    console.error("[usage_cost_events] insert failed", e);
  }

  return cost;
}
