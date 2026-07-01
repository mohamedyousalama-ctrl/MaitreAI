// ============================================================================
// MaitreAI — restaurant resolution for the webhook (server, service-role)
// Maps an inbound WhatsApp delivery to a tenant.
//
// resolveWebhookTenant(): per-tenant routing — look up the restaurant whose
// wa_phone_number_id matches the inbound metadata, and (only if it has fully
// configured + decryptable credentials) return that tenant's id + decrypted
// creds so the reply goes out from its own number. Returns null on ANY of: no
// match, not configured, missing/blank ciphertext, or decryption failure — so
// the caller cleanly falls back to the env behavior. NEVER logs/returns secrets
// except inside the returned WhatsAppEnv (which is consumed server-side only).
//
// resolveWebhookRestaurantId(): the EXISTING env fallback — honors an explicit
// WHATSAPP_RESTAURANT_ID, else the single/most-recent active restaurant. Used
// whenever per-tenant resolution yields null, so Wesaya's current number keeps
// working unchanged.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/secrets";
import type { WhatsAppEnv } from "@/lib/messaging/config";

export interface ResolvedTenant {
  restaurantId: string;
  env: WhatsAppEnv;
}

/**
 * Shared decrypt: turn a restaurants row's WhatsApp `_enc` columns into a usable
 * WhatsAppEnv, or null when the tenant is not fully configured / a ciphertext is
 * missing / decryption fails. The single crypto path for BOTH the webhook's
 * phone_number_id resolution and the console-initiated by-id resolution — so the
 * decrypt rules (configured + token present + decryptable) live in ONE place.
 */
interface WaCredsRow {
  wa_phone_number_id?: string | null;
  wa_verify_token?: string | null;
  wa_access_token_enc?: string | null;
  wa_app_secret_enc?: string | null;
  wa_configured_at?: string | null;
}
function rowToWhatsAppEnv(row: WaCredsRow, fallbackPnid: string): WhatsAppEnv | null {
  if (!row.wa_configured_at || !row.wa_access_token_enc) return null;
  const accessToken = decryptSecret(row.wa_access_token_enc);
  if (!accessToken) return null;
  // App secret is optional (only needed once per-tenant signature checks land).
  const appSecret = row.wa_app_secret_enc ? decryptSecret(row.wa_app_secret_enc) : "";
  return {
    accessToken,
    phoneNumberId: (row.wa_phone_number_id as string) || fallbackPnid,
    verifyToken: (row.wa_verify_token as string) ?? "",
    appSecret,
  };
}

/**
 * DRYRUN-2 — resolve a tenant's decrypted WhatsApp creds BY restaurant_id (for
 * console-initiated sends: manual staff reply, resume-to-Karim, receipt image).
 * Returns null to signal "fall back to env" whenever the tenant has no usable
 * per-tenant credentials — so a tenant that hasn't configured its own number
 * stays byte-identical to today's global-env behavior. Reads the service-role
 * `_enc` columns, so `admin` MUST be a service-role client. NEVER throws: any
 * lookup/decrypt failure is swallowed into a null return (fall back to env).
 */
export async function resolveTenantWhatsAppEnvById(
  admin: SupabaseClient,
  restaurantId: string
): Promise<WhatsAppEnv | null> {
  const id = (restaurantId ?? "").trim();
  if (!id) return null;
  try {
    const { data } = await admin
      .from("restaurants")
      .select("wa_phone_number_id, wa_verify_token, wa_access_token_enc, wa_app_secret_enc, wa_configured_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return rowToWhatsAppEnv(data as WaCredsRow, (data.wa_phone_number_id as string) ?? "");
  } catch {
    return null;
  }
}

/**
 * Resolve a tenant by the inbound WhatsApp `phone_number_id` and return its
 * decrypted credentials, or null to signal "fall back to env". Reads the
 * service-role-only `_enc` columns (admin client required). All failures —
 * including a decryptSecret throw — are swallowed into a null return so a webhook
 * is NEVER dropped with a 500 over a credential problem.
 */
export async function resolveWebhookTenant(
  admin: SupabaseClient,
  phoneNumberId: string | null | undefined
): Promise<ResolvedTenant | null> {
  const pnid = (phoneNumberId ?? "").trim();
  if (!pnid) return null;

  try {
    const { data } = await admin
      .from("restaurants")
      .select("id, wa_phone_number_id, wa_verify_token, wa_access_token_enc, wa_app_secret_enc, wa_configured_at")
      .eq("wa_phone_number_id", pnid)
      .maybeSingle();

    if (!data) return null;
    const env = rowToWhatsAppEnv(data as WaCredsRow, pnid);
    if (!env) return null;
    return { restaurantId: data.id as string, env };
  } catch {
    // Lookup or decryption failed → fall back to env (never drop the message).
    return null;
  }
}

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
