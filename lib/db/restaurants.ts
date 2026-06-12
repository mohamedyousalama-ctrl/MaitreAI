// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — restaurant resolution for the webhook (server)
// Maps an inbound WhatsApp delivery to a tenant. Proper phone_number_id →
// restaurant mapping is Sprint 9 (WhatsApp live); for now we honor an explicit
// WHATSAPP_RESTAURANT_ID env override, else fall back to the single/most-recent
// active restaurant (dev). Returns null when there is no tenant to attach to.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveWebhookRestaurantId(
  admin: SupabaseClient
): Promise<string | null> {
  const envId = process.env.WHATSAPP_RESTAURANT_ID;
  if (envId) return envId;

  const { data } = await admin
    .from("restaurants")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string) ?? null;
}
