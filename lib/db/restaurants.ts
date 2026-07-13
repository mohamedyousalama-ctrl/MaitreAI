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
// resolveWebhookRestaurantId(): the env fallback — honors an explicit
// WHATSAPP_RESTAURANT_ID. Production fails closed when it is unset; local/test
// keeps the single/most-recent active restaurant convenience fallback.
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
  // A usable env REQUIRES a non-empty phone_number_id. For the webhook path the
  // fallback is the inbound phone_number_id (always present); for the by-id path
  // there is no inbound PNID, so a partially-configured row (token + configured_at
  // set but PNID missing) must be treated as UNUSABLE → null, NOT returned with an
  // empty phoneNumberId. Otherwise readWhatsAppEnv would prefer this non-null
  // override, isWhatsAppConfigured() would go false, and the send would be
  // "skipped" (test-mode) instead of falling back to the global env creds —
  // silently suppressing a console-initiated send.
  const phoneNumberId = ((row.wa_phone_number_id as string) || fallbackPnid || "").trim();
  if (!phoneNumberId) return null;
  // App secret is optional (only needed once per-tenant signature checks land).
  // Guard its decrypt SEPARATELY: a malformed optional app-secret ciphertext must
  // NOT collapse an otherwise-valid tenant env (valid token + phone_number_id) to
  // null. If the whole resolver fell through to env fallback here, that tenant
  // would silently send from the GLOBAL creds — the cross-tenant bug. So on an
  // app-secret decrypt failure we treat it as an empty optional secret and keep
  // the tenant env. Access-token failures stay fatal (handled above → null).
  let appSecret = "";
  if (row.wa_app_secret_enc) {
    try {
      appSecret = decryptSecret(row.wa_app_secret_enc);
    } catch {
      appSecret = "";
    }
  }
  return {
    accessToken,
    phoneNumberId,
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

export interface TenantTemplateCreds {
  wabaId: string;
  accessToken: string;
}

/**
 * WO-5 — resolve a tenant's WhatsApp Business Account (WABA) id + decrypted
 * access token for TEMPLATE MANAGEMENT (message_templates sync), by restaurant_id.
 * Returns null when the tenant has no usable per-tenant WABA creds — the sync
 * route then falls back to MANUAL entry rather than ever calling a GLOBAL WABA
 * (which would upsert another account's templates under this tenant's id — the
 * cross-tenant bug). Reuses the ONE decrypt path (decryptSecret); reads a
 * service-role `_enc` column, so `admin` MUST be a service-role client. NEVER
 * throws: any lookup/decrypt failure is swallowed into a null return.
 */
export async function resolveTenantTemplateCreds(
  admin: SupabaseClient,
  restaurantId: string
): Promise<TenantTemplateCreds | null> {
  const id = (restaurantId ?? "").trim();
  if (!id) return null;
  try {
    const { data } = await admin
      .from("restaurants")
      .select("wa_waba_id, wa_access_token_enc, wa_configured_at")
      .eq("id", id)
      .maybeSingle();
    if (!data?.wa_configured_at || !data.wa_waba_id || !data.wa_access_token_enc) return null;
    const accessToken = decryptSecret(data.wa_access_token_enc as string);
    if (!accessToken) return null;
    return { wabaId: String(data.wa_waba_id), accessToken };
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
  if (process.env.NODE_ENV === "production") return null;

  const { data } = await admin
    .from("restaurants")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string) ?? null;
}

export function resolveWebhookAlertRestaurantId(): string | null {
  const explicit =
    (process.env.ALERT_PLATFORM_RESTAURANT_ID ?? "").trim() ||
    (process.env.WHATSAPP_RESTAURANT_ID ?? "").trim();
  return explicit || null;
}
