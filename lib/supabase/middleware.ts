// ============================================================================
// MaitreAI — Supabase auth middleware helper (Sprint 7)
// Refreshes the session cookie on every request and enforces access:
//   - unauthenticated users on a protected route → /login
//   - authenticated users with no restaurant membership → /onboarding (stub)
// Public routes (login, auth callback, checkout, api, static) are never gated.
// Only runs when Supabase is configured; otherwise the app is in demo mode.
// ============================================================================

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { HOME_HREF } from "@/lib/feature-flags";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Routes that must stay reachable without a session. "/" and "/contact" are the
// public landing/legal pages (no login wall — platform reviewers must see them).
const PUBLIC_PREFIXES = ["/", "/contact", "/login", "/auth", "/checkout", "/api"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Helper to redirect while preserving refreshed auth cookies.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (isPublic(pathname)) {
    // Already signed in and hitting /login → send to the app.
    if (user && pathname === "/login") return redirectTo(HOME_HREF);
    return response;
  }

  // Protected route.
  if (!user) return redirectTo("/login");

  // Signed in but no restaurant yet → onboarding (stub this sprint).
  if (pathname !== "/onboarding") {
    const { count } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!count) return redirectTo("/onboarding");
  }

  return response;
}
