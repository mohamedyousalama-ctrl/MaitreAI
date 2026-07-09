// ============================================================================
// MaitreAI — WhatsApp webhook routing decision (PURE, no deps). Isolates the
// "which creds serve this inbound number" rule so it is unit-testable and provably
// narrow. No I/O, no server-only, no env reads — the caller passes the resolved
// tenant flag + the inbound phone_number_id + the configured global env number.
// ============================================================================

export type WebhookRouting = "per_tenant" | "env_fallback" | "drop";

/**
 * Decide how to route an inbound WhatsApp delivery:
 *
 *   - a tenant resolved by phone_number_id            → "per_tenant" (its own creds)
 *   - NO phone_number_id at all (legacy handshake)    → "env_fallback" (global env)
 *   - phone_number_id === the configured GLOBAL        → "env_fallback"
 *       WHATSAPP_PHONE_NUMBER_ID (non-empty)               (the global/legacy number,
 *                                                           e.g. Wesaya, is a valid
 *                                                           target — NOT a drop)
 *   - any OTHER unmapped phone_number_id              → "drop" (per-tenant isolation:
 *                                                           never serve an unknown
 *                                                           number from other creds)
 *
 * The global-number branch applies ONLY when globalPhoneNumberId is configured
 * (non-empty) AND matches exactly — an unset/blank global env changes nothing
 * (any present-but-unmapped number still drops).
 */
export function decideWebhookRouting(
  hasTenant: boolean,
  phoneNumberId: string | null | undefined,
  globalPhoneNumberId: string | null | undefined,
): WebhookRouting {
  if (hasTenant) return "per_tenant";
  const pnid = (phoneNumberId ?? "").trim();
  if (!pnid) return "env_fallback";
  const gpid = (globalPhoneNumberId ?? "").trim();
  if (gpid && pnid === gpid) return "env_fallback";
  return "drop";
}
