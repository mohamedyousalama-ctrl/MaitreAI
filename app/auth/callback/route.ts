// ============================================================================
// MaitreAI — Auth callback (Sprint 7)
// Exchanges a magic-link / PKCE code for a session cookie, then redirects into
// the app. The OTP-code flow on /login sets the session directly and does not
// need this route, but it is kept for the email magic-link path.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HOME_HREF } from "@/lib/feature-flags";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? HOME_HREF;

  if (code) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
