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
    // Must be explicitly configured and carry a token ciphertext to be usable.
    if (!data.wa_configured_at || !data.wa_access_token_enc) return null;

    const accessToken = decryptSecret(data.wa_access_token_enc as string);
    if (!accessToken) return null;
    // App secret is optional (only needed once per-tenant signature checks land).
    const appSecret = data.wa_app_secret_enc ? decryptSecret(data.wa_app_secret_enc as string) : "";

    return {
      restaurantId: data.id as string,
      env: {
        accessToken,
        phoneNumberId: (data.wa_phone_number_id as string) || pnid,
        verifyToken: (data.wa_verify_token as string) ?? "",
        appSecret,
      },
    };
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
