// ============================================================================
// MaitreAI — WhatsApp environment config (Sprint 6)
// Reads WhatsApp Cloud API credentials from server env vars. NEVER exposes the
// access token to the client; only boolean "is it set" checks are surfaced via
// the status API route. When nothing is configured the app stays in test mode
// and never crashes.
// ============================================================================

export interface WhatsAppEnv {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
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

/** Read raw WhatsApp env vars. Server-only — values may be empty strings. */
export function readWhatsAppEnv(): WhatsAppEnv {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
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
