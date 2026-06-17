// ============================================================================
// MaitreAI — Customer Memory (Learning System Piece 4) — SERVER ONLY
// Per-customer, tenant-scoped memory so the agent recognizes a returning diner.
// REUSES the customers table (orders_count, ltv, name, …) and DERIVES order
// history from the orders table — no duplication. A small preferences table holds
// observed traits (favorite items, modifiers). This is KNOWLEDGE for warm recall,
// NOT a source of prices/availability (those stay in the tools) and allergen
// safety is still verified from the menu, never invented from memory.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderDraft } from "@/lib/ai/tools";

export interface CustomerProfile {
  name?: string;
  ordersCount: number;
  usualItems: string[]; // most-ordered item names (from real orders)
  preferences: { type: string; value: string; confidence: number }[];
  usualAddress?: string | null;
  language?: string | null;
}

/**
 * After an order finalizes, update the customer's profile: order count, last
 * order, lifetime value, usual delivery area, and observed preferences (favorite
 * items + modifiers, weighted by how often they recur). Call only on a NEW order
 * (not an idempotent re-persist) so counts stay truthful.
 */
export async function updateCustomerProfileFromOrder(
  admin: SupabaseClient,
  args: { restaurantId: string; customerId: string | null; draft: OrderDraft }
): Promise<void> {
  const { restaurantId, customerId, draft } = args;
  if (!customerId) return;

  const { data: c } = await admin
    .from("customers")
    .select("orders_count,ltv")
    .eq("id", customerId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!c) return;

  const patch: Record<string, unknown> = {
    orders_count: Number(c.orders_count ?? 0) + 1,
    ltv: Math.round((Number(c.ltv ?? 0) + Number(draft.total ?? 0)) * 100) / 100,
    last_order_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (draft.fulfillment === "delivery" && draft.deliveryZone) patch.usual_address = draft.deliveryZone;
  await admin.from("customers").update(patch).eq("id", customerId);

  // Observed preferences (truthful weighting via confidence = times seen).
  const wants: { type: string; value: string }[] = [];
  for (const l of draft.lines) {
    wants.push({ type: "favorite_item", value: l.name });
    for (const m of l.modifiers) wants.push({ type: "modifier", value: m.name });
  }
  const { data: existing } = await admin
    .from("customer_preferences")
    .select("id,type,value,confidence")
    .eq("customer_id", customerId);
  const map = new Map((existing ?? []).map((p) => [`${p.type}|${p.value}`, p as { id: string; confidence: number }]));
  const seen = new Set<string>();
  for (const w of wants) {
    const k = `${w.type}|${w.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const ex = map.get(k);
    if (ex) {
      await admin.from("customer_preferences").update({ confidence: ex.confidence + 1, updated_at: new Date().toISOString() }).eq("id", ex.id);
    } else {
      await admin.from("customer_preferences").insert({ restaurant_id: restaurantId, customer_id: customerId, type: w.type, value: w.value, source: "observed", confidence: 1 });
    }
  }
}

/**
 * Load a compact profile for a RETURNING customer (>=1 finalized order), tenant-
 * scoped, for injecting into the agent's context. Returns null for a new customer
 * (no profile → the prompt is unchanged) — and is always scoped to one restaurant,
 * so a customer's data never crosses tenants.
 */
export async function loadCustomerProfile(
  admin: SupabaseClient,
  args: { restaurantId: string; customerId?: string | null; phone?: string | null }
): Promise<CustomerProfile | null> {
  const { restaurantId, customerId, phone } = args;
  let q = admin
    .from("customers")
    .select("id,name,language,orders_count,ltv,last_order_at,usual_address")
    .eq("restaurant_id", restaurantId);
  if (customerId) q = q.eq("id", customerId);
  else if (phone) q = q.eq("phone", phone);
  else return null;
  const { data: c } = await q.maybeSingle();
  if (!c || Number(c.orders_count ?? 0) < 1) return null; // new customer → no recall

  const { data: prefs } = await admin
    .from("customer_preferences")
    .select("type,value,confidence")
    .eq("customer_id", c.id)
    .order("confidence", { ascending: false })
    .limit(12);

  const { data: orders } = await admin
    .from("orders")
    .select("items")
    .eq("customer_id", c.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const freq = new Map<string, number>();
  for (const o of (orders ?? []) as { items?: { name: string; quantity?: number }[] }[]) {
    for (const it of o.items ?? []) freq.set(it.name, (freq.get(it.name) ?? 0) + Number(it.quantity ?? 1));
  }
  const usualItems = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  return {
    name: (c.name as string) || undefined,
    ordersCount: Number(c.orders_count ?? 0),
    usualItems,
    preferences: ((prefs ?? []) as { type: string; value: string; confidence: number }[]).map((p) => ({ type: p.type, value: p.value, confidence: p.confidence })),
    usualAddress: (c.usual_address as string | null) ?? null,
    language: (c.language as string | null) ?? null,
  };
}
