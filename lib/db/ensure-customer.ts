// ============================================================================
// MaitreAI — R5 Customer launch rule (server only)
// The SINGLE canonical way any conversation/order path materializes a customer:
// upsert on (restaurant_id, phone) and return the id. Codifies the launch rule —
// "every conversation/order path ensures a customers row + a customer_id link" —
// so a customer_id is never left dangling and every path resolves the SAME row.
//
// Idempotent: repeated inbounds for the same phone hit the same row (unique
// (restaurant_id, phone)), refreshing last_seen_at and (optionally) the name.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure a customers row for (restaurantId, phone) and return its id. `name` is
 * set only when provided (never blanks an existing name). last_seen_at is
 * refreshed on every call. Throws on a genuine DB error (the caller's inbound
 * persist already treats a customer failure as fatal — a message with no customer
 * is not a state we accept).
 */
export async function ensureCustomerId(
  admin: SupabaseClient,
  restaurantId: string,
  phone: string,
  name?: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("customers")
    .upsert(
      {
        restaurant_id: restaurantId,
        phone,
        ...(name ? { name } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,phone" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
