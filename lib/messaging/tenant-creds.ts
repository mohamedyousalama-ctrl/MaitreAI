// ============================================================================
// MaitreAI — DRYRUN-2 (audit F1) — bind a tenant's WhatsApp creds for a
// console-initiated send. SERVER ONLY.
//
// The webhook already binds per-tenant creds (webhook/route.ts → resolveWebhookTenant
// → runWithWhatsAppCreds), so its persist→Brain→send chain replies from the
// tenant's own number. Console-initiated sends (manual staff reply, resume-to-
// Karim, receipt image) previously called the outbound layer bare and fell back
// to the GLOBAL env creds. This wrapper closes that gap by loading + decrypting
// the tenant's creds by restaurant_id (reusing the ONE decrypt path in
// db/restaurants.ts — no duplicated crypto) and binding them via the SAME
// runWithWhatsAppCreds mechanism the webhook uses.
//
// FALLBACK (no-regression guarantee): if the tenant has NO usable per-tenant
// creds, resolveTenantWhatsAppEnvById returns null and runWithWhatsAppCreds(null,…)
// is a transparent pass-through to env — byte-identical to today. The fix is
// "tenant creds win WHEN PRESENT," never "global env removed."
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantWhatsAppEnvById } from "@/lib/db/restaurants";
import { runWithWhatsAppCreds } from "@/lib/messaging/creds-context";

/**
 * Run `fn` with the tenant's WhatsApp creds bound (when configured), else with
 * the global-env fallback (null override → pass-through). `admin` MUST be a
 * service-role client (the creds `_enc` columns are service-role-only).
 */
export async function runWithTenantWhatsAppCreds<T>(
  admin: SupabaseClient,
  restaurantId: string,
  fn: () => Promise<T>
): Promise<T> {
  const env = await resolveTenantWhatsAppEnvById(admin, restaurantId);
  return runWithWhatsAppCreds(env, fn);
}
