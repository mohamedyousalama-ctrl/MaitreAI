// ============================================================================
// Kivo — server-side sign-out. POST here to end the session.
//
// Why a server route (not just the browser client): the old logout called the
// BROWSER supabase client's signOut() then router.push('/login') (a soft
// client nav). With @supabase/ssr's cookie-based sessions that is unreliable —
// the auth cookies are read by the server middleware, and a soft nav can race
// the cookie removal so middleware still sees a user and bounces /login →
// /dashboard (i.e. "logout does nothing"). Signing out on the SERVER clears the
// auth cookies on THIS response, then we 303-redirect to /login: a hard
// navigation with the cookies already gone, so there is no way back into the
// console without logging in again.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function endSession(request: Request) {
  const supabase = createClient();
  // Configured: revoke the session AND clear the auth cookies on the response
  // (the server client's cookie setAll runs against this Route Handler's
  // response). Demo mode (null client): nothing to clear — just bounce to login.
  if (supabase) {
    await supabase.auth.signOut();
  }
  // 303 → the browser issues a GET to the post-signout page (hard navigation,
  // fresh request). Defaults to the old console's /login; console_v2 passes
  // ?next=/c/login so sign-out lands back on the new login. Only same-origin
  // relative paths are honored (never an open redirect).
  const nextParam = new URL(request.url).searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/login";
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}

export async function POST(request: Request) {
  return endSession(request);
}

// Allow GET too, so a plain link (or a manual hit) also signs out cleanly.
export async function GET(request: Request) {
  return endSession(request);
}
