// ============================================================================
// MaitreAI — WO-SIGNUP-ENV-SPLIT: dedicated Embedded Signup OAuth app.
//
// The Embedded Signup code→token exchange runs against a DEDICATED Meta app
// (SIGNUP_APP_ID / SIGNUP_APP_SECRET), separate from the messaging app. This
// split closes an incident-class trap: WHATSAPP_APP_SECRET is the messaging app's
// secret used to verify inbound webhook signatures (Wesaya), so it must NEVER be
// repurposed as the signup token-exchange secret — doing so would force one env
// var to be two different Meta apps' secrets and break inbound verification.
//
// This module NEVER falls back to WHATSAPP_* : if the signup app isn't configured
// the caller returns a clean not-configured response instead of silently borrowing
// the messaging secret. Pure (no server-only, no next) so it is unit-testable.
// ============================================================================

export const SIGNUP_GRAPH_API_VERSION = "v19.0";
export const SIGNUP_GRAPH_BASE = `https://graph.facebook.com/${SIGNUP_GRAPH_API_VERSION}`;

export interface SignupAppCreds {
  appId: string;
  appSecret: string;
}

/** The dedicated Embedded Signup app credentials, or null when either is unset.
 *  Reads ONLY SIGNUP_* — never the messaging app's WHATSAPP_* secret. */
export function signupAppCreds(): SignupAppCreds | null {
  const appId = (process.env.SIGNUP_APP_ID ?? "").trim();
  const appSecret = (process.env.SIGNUP_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

/** True when the dedicated signup app is fully configured. */
export function isSignupConfigured(): boolean {
  return signupAppCreds() !== null;
}

/** Build the Graph token-exchange URL (short-lived code → long-lived token) using
 *  ONLY the dedicated signup app. Returns null when the signup app isn't
 *  configured, so the caller degrades cleanly (not-configured) rather than sending
 *  the messaging secret to Meta's token endpoint. */
export function buildSignupTokenExchangeUrl(code: string): string | null {
  const creds = signupAppCreds();
  if (!creds) return null;
  const url = new URL(`${SIGNUP_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", creds.appId);
  url.searchParams.set("client_secret", creds.appSecret);
  url.searchParams.set("code", code);
  return url.toString();
}
