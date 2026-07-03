// ============================================================================
// MaitreAI — WO-1: conversation_outcomes writer (the keystone) — SERVER ONLY
// Emitted at ONE point only: the TRUE close of a conversation (ownership_state
// → CLOSED, via POST /api/conversations/[id]/close) — the SAME event the
// outcome_coverage view counts. One WRITTEN-ONCE row per conversation.
//
//   • DETERMINISTIC SPINE — system-known facts only, all self-fetched here:
//     customer_id, order_id + order_value (the ENGINE order total, read from the
//     orders row — never recomputed), duration (from the conversation's own
//     timestamps), handled_by + human_names (from messages.sender + operator
//     identity), ad_source (from the stored referral). restaurant_id is derived
//     from the conversation row (never trusted from the caller) so a caller bug
//     can't misattribute a row across tenants (RLS keys on restaurant_id).
//   • MODEL-CLASSIFIED LAYER — ONE cheap LLM read (retry x3) fills outcome,
//     intent, lost_reason, objection_quote (<=120, verbatim customer text only),
//     items_mentioned, sentiment. Labeled classifier='llm_v1'.
//
// WRITTEN-ONCE LAW: unique(conversation_id); insert-only; a re-close of a
// reopened conversation is a logged no-op (the reopen-after-close edge is out of
// scope — see the PR body). FAIL-OPEN: classifier failure after all retries → NO
// row (a gap) + system_alerts, never an invented outcome.
//
// GATE FIRST: the flag read+check is the literal FIRST statement — zero other
// queries (no messages/orders/LLM) run before it. So with the flag OFF the close
// path does exactly one feature-flag read and nothing else. Never throws.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapter } from "@/lib/ai/llm";
import type { LlmMessage } from "@/lib/ai/llm/types";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { resolveMemberNames } from "@/lib/db/member-names";
import { recordCriticalAlert } from "@/lib/alerts/record";

const MAX_CLASSIFY_ATTEMPTS = 3;
const OBJECTION_MAX = 120;

const OUTCOMES = ["confirmed", "lost", "abandoned", "complaint", "info_only"] as const;
const LOST_REASONS = ["price", "out_of_stock", "delivery_time", "zone_unavailable", "payment", "no_response", "other"] as const;
const SENTIMENTS = ["positive", "neutral", "negative"] as const;

export type OutcomeValue = (typeof OUTCOMES)[number];

export interface OutcomeClassification {
  outcome: OutcomeValue;
  intent: string | null;
  lost_reason: (typeof LOST_REASONS)[number] | null;
  objection_quote: string | null;
  items_mentioned: string[];
  sentiment: (typeof SENTIMENTS)[number] | null;
}

type MsgRow = { sender: string | null; meta: Record<string, unknown> | null; text?: string | null; created_at?: string | null };

// ---------------------------------------------------------------------------
// PURE HELPERS (exported for tests)
// ---------------------------------------------------------------------------

/** handled_by from message senders: 'mixed' when both AI and human replied,
 *  'human' when only a human, 'karim' otherwise. Customer/system are ignored. */
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

/** Distinct operator member ids that authored a human turn (meta.author_member_id). */
export function humanMemberIds(messages: MsgRow[]): string[] {
  const ids = new Set<string>();
  for (const m of messages) {
    if (m.sender !== "human") continue;
    const id = (m.meta as { author_member_id?: unknown } | null)?.author_member_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/** Parse + validate the classifier's JSON. Null unless a VALID enum `outcome` is
 *  present. objection_quote truncated to <=120 chars. */
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

/** Build the LLM transcript (oldest→newest) from the conversation's messages:
 *  customer → user, ai/human → assistant, system notes dropped. */
export function buildTranscript(messages: MsgRow[]): LlmMessage[] {
  return messages
    .filter((m) => (m.sender === "customer" || m.sender === "ai" || m.sender === "human") && (m.text ?? "").trim())
    .map((m) => ({ role: m.sender === "customer" ? ("user" as const) : ("assistant" as const), content: (m.text ?? "").trim() }));
}

// ---------------------------------------------------------------------------
// LLM CLASSIFIER (one attempt) — injectable for tests via deps.classify
// ---------------------------------------------------------------------------

function renderTranscript(transcript: LlmMessage[]): string {
  return transcript
    .slice(-40)
    .map((m) => ({ who: m.role === "user" ? "العميل" : "كريم", text: (typeof m.content === "string" ? m.content : "").slice(0, 600).trim() }))
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
// EMITTER — called ONLY from the close route, after the CLOSED transition is durable
// ---------------------------------------------------------------------------

export interface OutcomeEmitArgs {
  /** The authenticated tenant (asserted against the conversation's own restaurant_id). */
  restaurantId: string;
  conversationId: string;
}

export interface OutcomeEmitDeps {
  classify?: (transcript: LlmMessage[]) => Promise<OutcomeClassification | null>;
  resolveNames?: (admin: SupabaseClient, ids: (string | null | undefined)[]) => Promise<Map<string, string>>;
}

/**
 * Emit exactly one written-once conversation_outcomes row for a just-closed
 * conversation. NEVER throws — an emit failure must never fail the close.
 */
export async function emitConversationOutcome(
  admin: SupabaseClient,
  args: OutcomeEmitArgs,
  deps: OutcomeEmitDeps = {}
): Promise<void> {
  const classify = deps.classify ?? classifyOutcome;
  const resolveNames = deps.resolveNames ?? resolveMemberNames;

  try {
    // GATE FIRST — read ONLY the tenant's flags and check. Zero other queries run
    // before this: with the flag OFF the close path does exactly this one read.
    const { data: flagRow } = await admin
      .from("restaurants")
      .select("feature_flags")
      .eq("id", args.restaurantId)
      .single();
    if (!isFeatureExplicitlyEnabled("conversation_outcomes", (flagRow?.feature_flags ?? null) as Record<string, unknown> | null)) return;

    const { conversationId } = args;

    // WRITTEN-ONCE pre-check: a row already exists → do nothing + log (skip LLM).
    const { data: existing } = await admin
      .from("conversation_outcomes")
      .select("id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (existing) {
      console.log(`[outcomes] already recorded for conversation ${conversationId} — written-once, skipping`);
      return;
    }

    // ---- DETERMINISTIC SPINE (self-fetched) ----
    const { data: conv } = await admin
      .from("conversations")
      .select("restaurant_id, customer_id, created_at, updated_at, ad_source_id, ad_source_type")
      .eq("id", conversationId)
      .single();
    if (!conv) return;

    // SECURITY (cross-tenant guard): the row's tenant is the CONVERSATION's own
    // restaurant_id, never the caller's claim. Abort on mismatch — RLS keys on
    // restaurant_id, so a wrong value would leak the row to another tenant.
    const restaurantId = conv.restaurant_id as string;
    if (restaurantId !== args.restaurantId) {
      console.error(`[outcomes] restaurant_id mismatch (caller=${args.restaurantId} conv=${restaurantId}) — aborting`);
      return;
    }

    const { data: msgRows } = await admin
      .from("messages")
      .select("sender, meta, text, created_at")
      .eq("conversation_id", conversationId)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
    const messages = (msgRows ?? []) as MsgRow[];

    const handledBy = deriveHandledBy(messages);
    const memberIds = humanMemberIds(messages);
    const nameMap = memberIds.length ? await resolveNames(admin, memberIds) : new Map<string, string>();
    const humanNames = memberIds.map((id) => nameMap.get(id)).filter((n): n is string => !!n);

    // duration = (updated_at at close) − created_at — DB-sourced, reproducible, and
    // aligned with outcome_coverage which groups by date(updated_at). The close
    // transition was committed just before this, so updated_at is the close time.
    const startedAt = (conv.created_at as string | null) ?? null;
    const endedAt = (conv.updated_at as string | null) ?? null;
    const durationSeconds =
      startedAt && endedAt ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000)) : null;

    // order_value: the ENGINE order total, read straight from the latest order row
    // for this conversation — never recomputed. Null when there is no order.
    const { data: ord } = await admin
      .from("orders")
      .select("id, total")
      .eq("conversation_id", conversationId)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const orderId = (ord?.id as string | null) ?? null;
    const orderValue = (ord?.total as number | null) ?? null;

    const adSource = (conv.ad_source_id as string | null) ?? (conv.ad_source_type as string | null) ?? null;

    // ---- MODEL-CLASSIFIED (retry up to MAX_CLASSIFY_ATTEMPTS) ----
    const transcript = buildTranscript(messages);
    let classification: OutcomeClassification | null = null;
    for (let attempt = 1; attempt <= MAX_CLASSIFY_ATTEMPTS && !classification; attempt++) {
      classification = await classify(transcript);
    }

    // FAIL-OPEN: no valid classification → NO row (a gap). Log to system_alerts.
    if (!classification) {
      await recordCriticalAlert(admin, {
        restaurantId,
        type: "outcome_classify_failed",
        detail: `outcome classifier failed after ${MAX_CLASSIFY_ATTEMPTS} attempts — no outcome row written (gap)`,
        conversationId,
      });
      return;
    }

    const row = {
      restaurant_id: restaurantId,
      conversation_id: conversationId,
      customer_id: (conv.customer_id as string | null) ?? null,
      outcome: classification.outcome,
      intent: classification.intent,
      lost_reason: classification.lost_reason,
      objection_quote: classification.objection_quote,
      items_mentioned: classification.items_mentioned,
      sentiment: classification.sentiment,
      classifier: "llm_v1",
      order_id: orderId,
      order_value: orderValue,
      ad_source: adSource,
      handled_by: handledBy,
      human_names: humanNames,
      duration_seconds: durationSeconds,
    };

    // INSERT-ONLY. unique(conversation_id) makes a concurrent double-emit fail with
    // 23505 — caught and logged as a written-once no-op, never an update.
    const { error } = await admin.from("conversation_outcomes").insert(row);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        console.log(`[outcomes] concurrent double-emit for conversation ${conversationId} — written-once, ignored`);
      } else {
        console.error("[outcomes] insert failed:", error.message);
      }
    }
  } catch (e) {
    console.error("[outcomes] emit threw (swallowed):", e);
  }
}
