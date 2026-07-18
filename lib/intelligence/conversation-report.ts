// ============================================================================
// MaitreAI — Karim Pro P1: conversation-intelligence emitter — SERVER ONLY
// At a conversation's TERMINAL state, emit ONE structured record (migration
// 0023). Two clearly separated halves:
//   • DETERMINISTIC SPINE — from system-known facts only (order, escalation,
//     conversation row, message count, timestamps). TRUE, free, never inferred.
//   • INFERRED SOFT LAYER — ONE cheap LLM read of the transcript, stored under
//     `inferred` and explicitly labeled (model + timestamp + confidence). A read,
//     never a measurement. On any failure the record is still saved spine-only
//     (inferred: null) — the LLM NEVER blocks the record.
//
// Pro-gated: standard tenants emit NOTHING (the gate returns before any DB/LLM
// work), so there is zero added cost or behavior change for them. The record is
// silent + internal — the customer never sees it.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter, modelFor, recordUsageEvent } from "@/lib/ai/llm";
import type { LlmMessage, LlmUsage } from "@/lib/ai/llm/types";
import { isFeatureEnabled, type Tier } from "@/lib/tenant/tier";
import { updateCustomerMemory } from "./customer-memory";

export type TerminalTrigger = "finalized" | "escalated" | "abandoned";
type Outcome = "order_placed" | "escalated" | "abandoned" | "answered" | "no_outcome";

/** Committed order facts (finalize only) — read from the real order row/draft,
 *  never from model narration. order_placed is true only when an order exists. */
export interface ReportOrderFacts {
  id: string | null;
  total: number | null;
  fulfillment: "delivery" | "pickup" | null;
  paymentStatus?: string | null;
  /** The real payment METHOD (cod | vodafone_cash | …), not the status. */
  paymentMethod?: string | null;
  branchId?: string | null;
}

export interface EmitReportArgs {
  restaurantId: string;
  /** The tenant's tier (full 'pro' enables everything). */
  tier: Tier | string | null | undefined;
  /** Narrow per-feature flags — a standard tenant with conversation_intelligence
   *  on emits these records WITHOUT being flipped to 'pro'. */
  features?: Record<string, unknown> | null;
  conversationId: string;
  terminalTrigger: TerminalTrigger;
  order?: ReportOrderFacts | null;
  escalationReason?: string | null;
  /** Transcript for the soft-layer read, oldest→newest. */
  transcript: LlmMessage[];
}

const OUTCOME_BY_TRIGGER: Record<TerminalTrigger, Outcome> = {
  finalized: "order_placed",
  escalated: "escalated",
  abandoned: "abandoned",
};

/** The labeled inference object. Every field is a READ, not a fact. */
export interface InferredSoftLayer {
  sentiment: string | null;
  mood: string | null;
  friction_point: string | null;
  drop_off_reason: string | null;
  objection: string | null;
  notable_preferences: string[];
  allergy_notes: string[];
  learning_point: string | null;
  summary: string | null;
  confidence: number | null;
}

function plainText(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text?: string }).text ?? "") : ""))
      .join(" ");
  }
  return "";
}

/** Render the transcript for the soft-layer prompt (capped, role-labeled). */
function renderTranscript(transcript: LlmMessage[]): string {
  return transcript
    .slice(-40)
    .map((m) => ({ who: m.role === "user" ? "العميل" : "كريم", text: plainText(m.content).slice(0, 600).trim() }))
    .filter((m) => m.text.length > 0)
    .map((m) => `${m.who}: ${m.text}`)
    .join("\n");
}

const SOFT_LAYER_SYSTEM = [
  "أنت محلل يقرأ محادثة خدمة عملاء منتهية لمطعم. أعِد فقط كائن JSON واحد (بدون أي نص خارجه)،",
  "كل حقوله استنتاجات (reads) من المحادثة وليست حقائق مؤكدة. المفاتيح:",
  '{ "sentiment": "positive|neutral|negative", "mood": "<قصير>",',
  '  "friction_point": "<قصير أو null>", "drop_off_reason": "<قصير أو null>",',
  '  "objection": "<قصير أو null>", "notable_preferences": ["..."], "allergy_notes": ["..."],',
  '  "learning_point": "<سطر واحد يمكن للمطعم تحسينه>", "summary": "<جملة أو اثنتان>",',
  '  "confidence": 0.0 }',
  "إن لم تعرف قيمة، استخدم null أو []. الحقول النصية بالعربية. لا تخترع حقائق — هذه قراءة فقط.",
].join("\n");

function parseInferred(raw: string): InferredSoftLayer | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
    const conf = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : null;
    return {
      sentiment: str(o.sentiment),
      mood: str(o.mood),
      friction_point: str(o.friction_point),
      drop_off_reason: str(o.drop_off_reason),
      objection: str(o.objection),
      notable_preferences: arr(o.notable_preferences),
      allergy_notes: arr(o.allergy_notes),
      learning_point: str(o.learning_point),
      summary: str(o.summary),
      confidence: conf,
    };
  } catch {
    return null;
  }
}

/** ONE cheap LLM read of the transcript → labeled inference, or null on any
 *  failure (so a spine-only record is still saved). */
async function inferSoftLayer(
  transcript: LlmMessage[]
): Promise<{ inferred: InferredSoftLayer | null; model: string | null; usage: LlmUsage | null; latencyMs: number | null }> {
  const text = renderTranscript(transcript);
  if (!text.trim()) return { inferred: null, model: null, usage: null, latencyMs: null };
  try {
    const adapter = await getAdapter();
    const t0 = Date.now();
    const res = await adapter.generate(
      { system: SOFT_LAYER_SYSTEM, messages: [{ role: "user", content: text }], maxTokens: 700 },
      "conversation_intel"
    );
    const inferred = parseInferred(res.text ?? "");
    return { inferred, model: res.model || modelFor("conversation_intel").model, usage: res.usage, latencyMs: Date.now() - t0 };
  } catch {
    return { inferred: null, model: null, usage: null, latencyMs: null };
  }
}

/**
 * Emit a conversation-intelligence record for a terminal state. Pro-gated and
 * fully self-contained: it NEVER throws — any failure is swallowed so the
 * customer-facing turn is never affected by intelligence emission. Keeps exactly
 * ONE current record per conversation: re-reaching a terminal state SUPERSEDES
 * the earlier record (upsert on conversation_id), never a duplicate, so the
 * conversion funnel never double-counts a thread.
 */
export async function emitConversationReport(
  admin: SupabaseClient,
  args: EmitReportArgs
): Promise<void> {
  // GATE — the isolation guarantee. Emit only when this tenant has the
  // conversation_intelligence feature (explicit narrow flag, or full 'pro').
  // Otherwise return before ANY DB read or LLM call — zero added cost/latency.
  if (!isFeatureEnabled("conversation_intelligence", { tier: args.tier, features: args.features })) return;

  try {
    const { restaurantId, conversationId, terminalTrigger } = args;
    const order = args.order ?? null;

    // ---- DETERMINISTIC SPINE (system-sourced) ----
    const { data: conv } = await admin
      .from("conversations")
      .select("customer_id, last_intent, channel, created_at")
      .eq("id", conversationId)
      .single();

    const { count: msgCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    const startedAt = (conv?.created_at as string | null) ?? null;
    const endedAt = new Date().toISOString();
    const durationSeconds =
      startedAt ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)) : null;

    const orderPlaced = terminalTrigger === "finalized" && !!order?.id;

    // ---- INFERRED SOFT LAYER (one cheap LLM read; labeled) ----
    const { inferred, model, usage, latencyMs } = await inferSoftLayer(args.transcript);
    if (usage && model) {
      await recordUsageEvent({
        admin,
        tenantId: restaurantId,
        conversationId,
        orderId: order?.id ?? null,
        surface: "conversation_intel.report",
        useCase: "conversation_intel",
        model,
        usage,
        latencyMs,
        trigger: "system",
        meta: { terminal_trigger: terminalTrigger, parsed: !!inferred },
      });
    }

    const record = {
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      customer_id: (conv?.customer_id as string | null) ?? null,
      order_id: order?.id ?? null,
      branch_id: order?.branchId ?? null,
      channel: (conv?.channel as string | null) ?? "whatsapp",

      // spine
      primary_intent: (conv?.last_intent as string | null) ?? null,
      outcome: OUTCOME_BY_TRIGGER[terminalTrigger],
      terminal_trigger: terminalTrigger,
      order_placed: orderPlaced,
      order_total: orderPlaced ? order?.total ?? null : null,
      fulfillment: order?.fulfillment ?? null,
      // F1.7 Fix 2 — store the real payment METHOD here, not the status. Falls back
      // to null for legacy orders with no method (never to a status string).
      payment_method: order?.paymentMethod ?? null,
      escalated: terminalTrigger === "escalated",
      escalation_reason: args.escalationReason ?? null,
      turn_count: msgCount ?? 0,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      updated_at: endedAt,

      // inferred (labeled)
      inferred: inferred ?? null,
      inferred_model: inferred ? model : null,
      inferred_at: inferred ? endedAt : null,
    };

    // ONE CURRENT record per conversation (supersede). A thread can re-reach a
    // terminal state (abandon → resume → escalate); the LATEST terminal is the
    // truth, so upserting on conversation_id REPLACES the prior record rather
    // than inserting a sibling. This keeps downstream aggregates — especially the
    // conversion funnel — from double-counting a single thread. The DB default
    // keeps created_at as the first-seen time; updated_at/ended_at advance here.
    await admin
      .from("conversation_reports")
      .upsert(record, { onConflict: "conversation_id" });

    // Karim Pro P2 — customer memory. Rebuild this customer's durable memory from
    // the orders facts + this report's labeled inference. Gated INDEPENDENTLY on
    // the narrow `customer_memory` flag (NOT implied by conversation_intelligence):
    // a tenant with P1 on but P2 off gets nothing here. Self-gated + never throws.
    await updateCustomerMemory(admin, {
      restaurantId,
      customerId: (conv?.customer_id as string | null) ?? null,
      conversationId,
      tier: args.tier,
      features: args.features,
      inferred,
    });
  } catch {
    // Intelligence emission must NEVER break the conversation. Swallow silently.
  }
}
