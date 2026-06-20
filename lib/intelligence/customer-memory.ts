// ============================================================================
// MaitreAI — Karim Pro P2: customer-memory updater — SERVER ONLY
// When a conversation reaches a terminal state (P1 emits a conversation_report),
// rebuild that customer's durable memory record (migration 0026). Two halves,
// kept strictly separate (the honesty convention):
//   • DERIVED FROM FACTS — recomputed from the real orders table every time
//     (order_count, total_spent, favorites, fulfillment pref, channels, recency,
//     value tier). Recompute-from-source means re-processing a report NEVER
//     drifts the counts — it is idempotent by construction.
//   • LABELED INFERENCE — merged from the report's `inferred` read, kept under a
//     labeled `inferred` jsonb, bounded/capped, NEVER promoted to fact. Sentiment
//     history is keyed by conversation_id so re-processing replaces (not appends).
//
// Gated on the NARROW `customer_memory` feature flag — independent of tier and of
// the conversation_intelligence (P1) flag. A tenant with P1 on but P2 off (e.g.
// Wesaya) gets NOTHING here. Never throws — memory must never break a turn.
//
// SCOPE: DATA + operator-read only. NOTHING here feeds Karim's customer-facing
// replies — no greeting-by-name, no "the usual?". That is a separate, separately
// gated step. allergy_notes are OPERATOR HINTS ONLY and never assert safety.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureExplicitlyEnabled, type Tier } from "@/lib/tenant/tier";
import type { InferredSoftLayer } from "./conversation-report";

export interface UpdateCustomerMemoryArgs {
  restaurantId: string;
  customerId: string | null;
  conversationId: string;
  tier: Tier | string | null | undefined;
  features?: Record<string, unknown> | null;
  /** The labeled inference from the just-emitted report (or null). */
  inferred: InferredSoftLayer | null;
}

interface OrderFactRow {
  id: string;
  items: unknown;
  total: number | string | null;
  fulfillment: string | null;
  source: string | null;
  payment_status: string | null;
  order_status: string | null;
  created_at: string;
}

interface SentimentEntry {
  conversation_id: string;
  sentiment: string;
  at: string;
}

const MS_30D = 30 * 24 * 60 * 60 * 1000;
const VIP_ORDERS = 5;
const VIP_SPEND = 1000; // tenant currency units (e.g. ج.م)
const FAVORITES_CAP = 5;
const LIST_CAP = 20;
const SENTIMENT_CAP = 10;

/** Union two string lists, trimmed + de-duplicated + capped (stable order). */
function mergeList(existing: unknown, incoming: string[], cap = LIST_CAP): string[] {
  const base = Array.isArray(existing) ? existing.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...base, ...incoming]) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

/** Upsert one sentiment read keyed by conversation_id (re-processing replaces the
 *  same conversation's entry → idempotent), newest last, capped. */
function mergeSentiment(existing: unknown, entry: SentimentEntry | null): SentimentEntry[] {
  const base = (Array.isArray(existing) ? existing : []).filter(
    (e): e is SentimentEntry =>
      !!e && typeof e === "object" && typeof (e as SentimentEntry).conversation_id === "string"
  );
  const kept = entry ? base.filter((e) => e.conversation_id !== entry.conversation_id) : base;
  const next = entry ? [...kept, entry] : kept;
  return next.slice(-SENTIMENT_CAP);
}

/** Rank favorite items by total quantity across the customer's real order lines. */
function rankFavorites(orders: OrderFactRow[]): { name: string; qty: number }[] {
  const tally = new Map<string, number>();
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items as Array<{ name?: unknown; quantity?: unknown }>) {
      const name = typeof it?.name === "string" ? it.name.trim() : "";
      const qty = Number(it?.quantity) || 0;
      if (!name || qty <= 0) continue;
      tally.set(name, (tally.get(name) ?? 0) + qty);
    }
  }
  return [...tally.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, FAVORITES_CAP);
}

function mostFrequent(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Rebuild a customer's memory record after a terminal conversation. Pro-gated on
 * the narrow `customer_memory` flag, idempotent (facts recomputed from source),
 * and fully self-contained — any failure is swallowed so it can never affect the
 * customer-facing turn or the report emit that calls it.
 */
export async function updateCustomerMemory(
  admin: SupabaseClient,
  args: UpdateCustomerMemoryArgs
): Promise<void> {
  // GATE — STRICT, explicit flag only. Deliberately NOT enabled by tier='pro'
  // and NOT by the conversation_intelligence (P1) flag: P2 is a separate switch,
  // so a tenant with P1 on but P2 off (e.g. Wesaya) — and even a full 'pro'
  // tenant that has not explicitly turned P2 on — build NOTHING here.
  if (!isFeatureExplicitlyEnabled("customer_memory", args.features)) return;
  if (!args.customerId) return; // no identity → nothing to attach memory to

  try {
    const { restaurantId, customerId } = args;

    // ---- DERIVED FROM FACTS (recomputed from real orders, never narrated) ----
    const { data: orderRows } = await admin
      .from("orders")
      .select("id, items, total, fulfillment, source, payment_status, order_status, created_at")
      .eq("restaurant_id", restaurantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    const orders = (orderRows ?? []) as OrderFactRow[];
    // Committed orders (exclude cancelled) drive counts/favorites/recency.
    const committed = orders.filter((o) => o.order_status !== "cancelled");
    const paid = committed.filter((o) => o.payment_status === "paid");

    const orderCount = committed.length;
    const totalSpent = paid.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const avgOrderValue = paid.length ? Math.round((totalSpent / paid.length) * 100) / 100 : null;
    const firstSeen = committed[0]?.created_at ?? null;
    const lastSeen = committed[committed.length - 1]?.created_at ?? null;
    const lastOrderId = committed[committed.length - 1]?.id ?? null;
    const fulfillmentPrefRaw = mostFrequent(
      committed.map((o) => o.fulfillment ?? "").filter((f) => f === "delivery" || f === "pickup")
    );
    const fulfillmentPref = fulfillmentPrefRaw === "delivery" || fulfillmentPrefRaw === "pickup" ? fulfillmentPrefRaw : null;
    const favorites = rankFavorites(committed);
    const channelsUsed = [...new Set(orders.map((o) => o.source || "whatsapp"))];

    // VIP / at-risk — DERIVED from facts (count + recency), never invented.
    const lastSeenMs = lastSeen ? Date.parse(lastSeen) : 0;
    const lapsed = lastSeenMs > 0 && Date.now() - lastSeenMs > MS_30D;
    const valueTier =
      orderCount <= 1 ? "new" : lapsed ? "at_risk" : orderCount >= VIP_ORDERS || totalSpent >= VIP_SPEND ? "vip" : "regular";

    // ---- LABELED INFERENCE (merged from the report read; bounded; never fact) ----
    const { data: prevRow } = await admin
      .from("customer_memory")
      .select("inferred")
      .eq("restaurant_id", restaurantId)
      .eq("customer_id", customerId)
      .maybeSingle();
    const prevInferred = (prevRow?.inferred as Record<string, unknown> | null) ?? {};

    const inf = args.inferred;
    const nowIso = new Date().toISOString();
    const sentimentEntry: SentimentEntry | null =
      inf?.sentiment ? { conversation_id: args.conversationId, sentiment: inf.sentiment, at: nowIso } : null;
    // notable_flags are READS, not facts — derived from this conversation's friction.
    const incomingFlags = [inf?.friction_point, inf?.drop_off_reason, inf?.objection].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );

    const inferred = {
      preferences: mergeList(prevInferred.preferences, inf?.notable_preferences ?? []),
      allergy_notes: mergeList(prevInferred.allergy_notes, inf?.allergy_notes ?? []),
      sentiment_history: mergeSentiment(prevInferred.sentiment_history, sentimentEntry),
      notable_flags: mergeList(prevInferred.notable_flags, incomingFlags),
      last_summary: inf?.summary ?? (prevInferred.last_summary as string | null) ?? null,
    };

    const record = {
      restaurant_id: restaurantId,
      customer_id: customerId,
      order_count: orderCount,
      total_spent: totalSpent,
      avg_order_value: avgOrderValue,
      first_seen: firstSeen,
      last_seen: lastSeen,
      last_order_id: lastOrderId,
      fulfillment_pref: fulfillmentPref,
      favorite_items: favorites,
      channels_used: channelsUsed,
      value_tier: valueTier,
      inferred,
      inferred_updated_at: inf ? nowIso : (prevRow ? undefined : null),
      updated_at: nowIso,
    };

    // One record per (restaurant_id, customer_id). Recompute-from-source upsert →
    // re-processing the same report yields identical factual fields (no drift).
    await admin.from("customer_memory").upsert(record, { onConflict: "restaurant_id,customer_id" });
  } catch {
    // Memory must NEVER break the conversation / report emit. Swallow silently.
  }
}
