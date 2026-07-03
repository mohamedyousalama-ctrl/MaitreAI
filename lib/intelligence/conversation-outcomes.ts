// ============================================================================
// MaitreAI — WO-1: conversation_outcomes writer (the keystone) — SERVER ONLY
// At a conversation's terminal state, emit exactly ONE written-once outcome row.
//
//   • DETERMINISTIC SPINE — system-known facts only: conversation_id, customer_id,
//     order_id, order_value (the ENGINE order total, read from orders — never
//     recomputed here), duration, handled_by + human_names (derived from
//     messages.sender + operator identity), ad_source (from the stored referral).
//   • MODEL-CLASSIFIED LAYER — ONE cheap LLM read fills outcome, intent,
//     lost_reason, objection_quote (≤120 chars, verbatim customer text only),
//     items_mentioned, sentiment. Labeled via classifier='llm_v1'.
//
// WRITTEN-ONCE LAW: the DB has unique(conversation_id); this code is INSERT-ONLY
// and never updates an existing row (a double-emit is a logged no-op).
//
// FAIL-OPEN: if the classifier fails after all retries we DO NOT write a row with
// a guessed/null outcome — a missing row is a gap. We alert system_alerts so the
// gap is visible and can be re-run. Missing rows are gaps, never invented.
//
// Flag-gated INDEPENDENTLY on the strict `conversation_outcomes` feature (default
// OFF for ALL tenants, not implied by tier='pro') — so it can be enabled and
// verified on one dev tenant first. Self-contained + NEVER throws.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter, modelFor } from "@/lib/ai/llm";
import type { LlmMessage } from "@/lib/ai/llm/types";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { resolveMemberNames } from "@/lib/db/member-names";
import { recordCriticalAlert } from "@/lib/alerts/record";
import type { EmitReportArgs } from "./conversation-report";

const MAX_CLASSIFY_ATTEMPTS = 3;
const OBJECTION_MAX = 120;

const OUTCOMES = ["confirmed", "lost", "abandoned", "complaint", "info_only"] as const;
const LOST_REASONS = ["price", "out_of_stock", "delivery_time", "zone_unavailable", "payment", "no_response", "other"] as const;
const SENTIMENTS = ["positive", "neutral", "negative"] as const;

export type OutcomeValue = (typeof OUTCOMES)[number];

/** The model-classified fields (a READ, never a fact). `outcome` is required — a
 *  classification with no valid outcome is a failure, not a row. */
export interface OutcomeClassification {
  outcome: OutcomeValue;
  intent: string | null;
  lost_reason: (typeof LOST_REASONS)[number] | null;
  objection_quote: string | null;
  items_mentioned: string[];
  sentiment: (typeof SENTIMENTS)[number] | null;
}

type MsgRow = { sender: string | null; meta: Record<string, unknown> | null };

// ---------------------------------------------------------------------------
// PURE HELPERS (exported for tests)
// ---------------------------------------------------------------------------

/** Derive handled_by from the message senders. 'mixed' when both the AI and a
 *  human replied; 'human' when only a human replied; 'karim' otherwise. System
 *  notes and customer messages are ignored (they aren't "handling"). */
export function deriveHandledBy(messages: MsgRow[]): "karim" | "human" | "mixed" {
  let hasAi = false;
  let hasHuman = false;
  for (const m of messages) {
    if (m.sender === "ai") hasAi = true;
    else if (m.sender === "human") hasHuman = true;
  }
  if (hasHuman && hasAi) return "mixed";
  if (hasHuman) return "human";
  return "karim";
}

/** Distinct operator member ids that authored a human turn (from meta.author_member_id). */
export function humanMemberIds(messages: MsgRow[]): string[] {
  const ids = new Set<string>();
  for (const m of messages) {
    if (m.sender !== "human") continue;
    const id = (m.meta as { author_member_id?: unknown } | null)?.author_member_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/** Parse + validate the classifier's JSON. Returns null unless a VALID enum
 *  `outcome` is present (a missing/invalid outcome is a classification failure,
 *  not a row). objection_quote is truncated to ≤120 chars. */
export function parseOutcomeClassification(raw: string): OutcomeClassification | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

    const outcome = o.outcome;
    if (typeof outcome !== "string" || !(OUTCOMES as readonly string[]).includes(outcome)) return null;

    const inEnum = <T extends readonly string[]>(v: unknown, set: T): T[number] | null =>
      typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T[number]) : null;
    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];

    const q = str(o.objection_quote);
    return {
      outcome: outcome as OutcomeValue,
      intent: str(o.intent),
      lost_reason: inEnum(o.lost_reason, LOST_REASONS),
      objection_quote: q ? q.slice(0, OBJECTION_MAX) : null,
      items_mentioned: arr(o.items_mentioned),
      sentiment: inEnum(o.sentiment, SENTIMENTS),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM CLASSIFIER (one attempt) — injectable for tests via deps.classify
// ---------------------------------------------------------------------------

function plainText(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text?: string }).text ?? "") : ""))
      .join(" ");
  }
  return "";
}

function renderTranscript(transcript: LlmMessage[]): string {
  return transcript
    .slice(-40)
    .map((m) => ({ who: m.role === "user" ? "العميل" : "كريم", text: plainText(m.content).slice(0, 600).trim() }))
    .filter((m) => m.text.length > 0)
    .map((m) => `${m.who}: ${m.text}`)
    .join("\n");
}

const CLASSIFY_SYSTEM = [
  "أنت مصنِّف يقرأ محادثة طلب/خدمة عملاء منتهية لمطعم. أعِد فقط كائن JSON واحد (بدون أي نص خارجه).",
  "المفاتيح والقيَم المسموحة:",
  '{ "outcome": "confirmed|lost|abandoned|complaint|info_only",',
  '  "intent": "<وصف قصير لِما أراده العميل، أو null>",',
  '  "lost_reason": "price|out_of_stock|delivery_time|zone_unavailable|payment|no_response|other أو null",',
  '  "objection_quote": "<اقتباس حرفي من كلام العميل فقط، ≤120 حرف، أو null>",',
  '  "items_mentioned": ["..."], "sentiment": "positive|neutral|negative أو null" }',
  "قواعد: outcome إجباري وواحد من القيم الخمس فقط. objection_quote يجب أن يكون منقولاً حرفياً من رسائل العميل (لا تُعِد صياغته ولا تخترعه).",
  "إن لم تعرف قيمة اختيارية استخدم null أو []. لا تخترع حقائق — هذه قراءة/تصنيف فقط.",
].join("\n");

/** ONE cheap LLM read → validated classification, or null on any failure. */
export async function classifyOutcome(transcript: LlmMessage[]): Promise<OutcomeClassification | null> {
  const text = renderTranscript(transcript);
  if (!text.trim()) return null;
  try {
    const adapter = await getAdapter();
    const res = await adapter.generate(
      { system: CLASSIFY_SYSTEM, messages: [{ role: "user", content: text }], maxTokens: 500 },
      "conversation_intel"
    );
    return parseOutcomeClassification(res.text ?? "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// EMITTER
// ---------------------------------------------------------------------------

export interface OutcomeEmitDeps {
  /** Injectable classifier (defaults to the real one-attempt LLM read). */
  classify?: (transcript: LlmMessage[]) => Promise<OutcomeClassification | null>;
  /** Injectable member-name resolver (defaults to the real one). */
  resolveNames?: (admin: SupabaseClient, ids: (string | null | undefined)[]) => Promise<Map<string, string>>;
}

/**
 * Emit exactly one written-once conversation_outcomes row for a terminal
 * conversation. Independently gated on the strict `conversation_outcomes` flag.
 * Never throws (self-contained; the customer turn is never affected).
 */
export async function emitConversationOutcome(
  admin: SupabaseClient,
  args: EmitReportArgs,
  deps: OutcomeEmitDeps = {}
): Promise<void> {
  // Strict gate — default OFF for ALL tenants (not implied by tier='pro').
  if (!isFeatureExplicitlyEnabled("conversation_outcomes", (args.features ?? null) as Record<string, unknown> | null)) return;

  const classify = deps.classify ?? classifyOutcome;
  const resolveNames = deps.resolveNames ?? resolveMemberNames;

  try {
    const { restaurantId, conversationId } = args;

    // WRITTEN-ONCE pre-check: if a row already exists, do nothing + log (and skip
    // the LLM cost). The unique constraint is the atomic backstop for races below.
    const { data: existing } = await admin
      .from("conversation_outcomes")
      .select("id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (existing) {
      console.log(`[outcomes] already recorded for conversation ${conversationId} — written-once, skipping`);
      return;
    }

    // ---- DETERMINISTIC SPINE ----
    const { data: conv } = await admin
      .from("conversations")
      .select("customer_id, created_at, ad_source_id, ad_source_type")
      .eq("id", conversationId)
      .single();

    const { data: msgRows } = await admin
      .from("messages")
      .select("sender, meta")
      .eq("conversation_id", conversationId);
    const messages = (msgRows ?? []) as MsgRow[];

    const handledBy = deriveHandledBy(messages);
    const memberIds = humanMemberIds(messages);
    const nameMap = memberIds.length ? await resolveNames(admin, memberIds) : new Map<string, string>();
    const humanNames = memberIds.map((id) => nameMap.get(id)).filter((n): n is string => !!n);

    const startedAt = (conv?.created_at as string | null) ?? null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000))
      : null;

    // order_value: the ENGINE order total, read straight from the orders row —
    // never recomputed here. Null when there is no order.
    const orderId = args.order?.id ?? null;
    let orderValue: number | null = null;
    if (orderId) {
      const { data: ord } = await admin.from("orders").select("total").eq("id", orderId).maybeSingle();
      orderValue = (ord?.total as number | null) ?? null;
    }

    const adSource =
      (conv?.ad_source_id as string | null) ?? (conv?.ad_source_type as string | null) ?? null;

    // ---- MODEL-CLASSIFIED (retry up to MAX_CLASSIFY_ATTEMPTS) ----
    let classification: OutcomeClassification | null = null;
    for (let attempt = 1; attempt <= MAX_CLASSIFY_ATTEMPTS && !classification; attempt++) {
      classification = await classify(args.transcript);
    }

    // FAIL-OPEN: no valid classification → do NOT write a guessed row. Log the gap
    // to system_alerts (visible + re-runnable). Missing rows are gaps, never invented.
    if (!classification) {
      await recordCriticalAlert(admin, {
        restaurantId,
        type: "outcome_classify_failed",
        detail: `outcome classifier failed after ${MAX_CLASSIFY_ATTEMPTS} attempts — no outcome row written (gap)`,
        conversationId,
        context: { terminalTrigger: args.terminalTrigger },
      });
      return;
    }

    const row = {
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      customer_id: (conv?.customer_id as string | null) ?? null,
      // model-classified (labeled by classifier)
      outcome: classification.outcome,
      intent: classification.intent,
      lost_reason: classification.lost_reason,
      objection_quote: classification.objection_quote,
      items_mentioned: classification.items_mentioned,
      sentiment: classification.sentiment,
      classifier: "llm_v1",
      // deterministic spine
      order_id: orderId,
      order_value: orderValue,
      ad_source: adSource,
      handled_by: handledBy,
      human_names: humanNames,
      duration_seconds: durationSeconds,
    };

    // INSERT-ONLY. The unique(conversation_id) constraint makes a concurrent
    // double-emit fail with 23505 — caught and logged as a written-once no-op,
    // never an update.
    const { error } = await admin.from("conversation_outcomes").insert(row);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        console.log(`[outcomes] concurrent double-emit for conversation ${conversationId} — written-once, ignored`);
      } else {
        console.error("[outcomes] insert failed:", error.message);
      }
    }
  } catch (e) {
    // Emission must NEVER break the conversation. Swallow silently.
    console.error("[outcomes] emit threw (swallowed):", e);
  }
}
