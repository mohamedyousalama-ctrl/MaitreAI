// ============================================================================
// MaitreAI — Auth callback (Sprint 7)
// Exchanges a magic-link / PKCE code for a session cookie, then redirects into
// the app. The OTP-code flow on /login sets the session directly and does not
// need this route, but it is kept for the email magic-link path.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only a same-origin relative path is honored (a crafted ?next=//evil.com must
  // never become an open redirect). Default to the old console home.
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/dashboard";
  // A console_v2 (/c) sign-in must fail back to /c/login, never the old /login.
  const loginOnFail = next.startsWith("/c") ? "/c/login" : "/login";

  if (code) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}${loginOnFail}?error=auth`);
}
