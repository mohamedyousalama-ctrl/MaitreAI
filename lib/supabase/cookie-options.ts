// ============================================================================
// MaitreAI — CSRF-1 (part c): explicit SameSite=Lax on session cookies.
//
// SameSite=Lax is defense-in-depth alongside the same-origin gate (part a/b):
// the browser withholds the session cookie from cross-site sub-requests (the
// classic CSRF vector) while still sending it on top-level navigations, so
// magic-link / OAuth return flows keep working. We set it EXPLICITLY rather than
// relying on the framework/browser default so the posture is legible and can't
// silently regress. Applied at the shared auth plumbing (server client + the
// middleware session refresh) — the two places session cookies are written.
// ============================================================================

import type { CookieOptions } from "@supabase/ssr";

/** Force SameSite=Lax on a Supabase-issued cookie, preserving all other opts. */
export function laxCookie(options?: CookieOptions): CookieOptions {
  return { ...options, sameSite: "lax" };
}
