// ============================================================================
// MaitreAI — WhatsApp environment config (Sprint 6)
// Reads WhatsApp Cloud API credentials from server env vars. NEVER exposes the
// access token to the client; only boolean "is it set" checks are surfaced via
// the status API route. When nothing is configured the app stays in test mode
// and never crashes.
//
// Per-tenant override (Piece 2): readWhatsAppEnv() first checks the request-scoped
// WhatsApp credentials context. The webhook sets that context AFTER resolving a
// tenant by its inbound phone_number_id, so the existing send path replies from
// that tenant's number. With no override (the default / today), it returns the
// env vars exactly as before — the env fallback is unchanged.
// ============================================================================

export interface WhatsAppEnv {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
}

// Per-request credentials override hook. config.ts is (transitively) bundled on
// the client too — via the checkout page — so it must NOT statically import the
// server-only AsyncLocalStorage context. Instead the server-only creds-context
// module registers its getter here at import time; on the client this stays null
// and readWhatsAppEnv() simply reads env. Provably no behavior change when unset.
type CredsOverrideGetter = () => WhatsAppEnv | null;
let credsOverrideGetter: CredsOverrideGetter | null = null;
export function _registerWhatsAppCredsOverride(getter: CredsOverrideGetter): void {
  credsOverrideGetter = getter;
}

/** Booleans describing which credentials are present (safe to send to client). */
export interface WhatsAppEnvStatus {
  accessToken: boolean;
  phoneNumberId: boolean;
  verifyToken: boolean;
  appSecret: boolean;
}

/** Connection mode derived from which credentials are present. */
export type WhatsAppMode = "connected" | "not_configured" | "test";

/** Graph API version used when (and if) real sending is enabled. */
export const WHATSAPP_GRAPH_VERSION = "v19.0";

/** Read the active WhatsApp credentials: the request-scoped per-tenant override
 *  if one is set (webhook resolved a tenant by phone_number_id), otherwise the
 *  raw env vars. Server-only — values may be empty strings. Env values are
 *  trimmed: a trailing space/newline pasted into the dashboard would otherwise
 *  silently break HMAC signature validation (different key bytes). */
export function readWhatsAppEnv(): WhatsAppEnv {
  const override = credsOverrideGetter?.() ?? null;
  if (override) return override;
  return {
    accessToken: (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim(),
    phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim(),
    verifyToken: (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim(),
    appSecret: (process.env.WHATSAPP_APP_SECRET ?? "").trim(),
  };
}

export function whatsAppEnvStatus(env: WhatsAppEnv = readWhatsAppEnv()): WhatsAppEnvStatus {
  return {
    accessToken: env.accessToken.length > 0,
    phoneNumberId: env.phoneNumberId.length > 0,
    verifyToken: env.verifyToken.length > 0,
    appSecret: env.appSecret.length > 0,
  };
}

/** Live sending requires at minimum an access token + phone number id. */
export function isWhatsAppConfigured(env: WhatsAppEnv = readWhatsAppEnv()): boolean {
  return env.accessToken.length > 0 && env.phoneNumberId.length > 0;
}

/**
 * Derive the connection mode:
 *  - connected:      token + phone id (+ verify token) present → would be live
 *  - test:           nothing configured at all → clean local dev/test mode
 *  - not_configured: a partial / inconsistent setup that needs attention
 */
export function whatsAppMode(env: WhatsAppEnv = readWhatsAppEnv()): WhatsAppMode {
  const s = whatsAppEnvStatus(env);
  if (s.accessToken && s.phoneNumberId && s.verifyToken) return "connected";
  if (!s.accessToken && !s.phoneNumberId && !s.verifyToken && !s.appSecret) return "test";
  return "not_configured";
}
