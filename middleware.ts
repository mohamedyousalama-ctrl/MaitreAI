// ============================================================================
// MaitreAI — Next.js middleware (Sprint 7 · Phase 6 host-aware routing)
// Enforces Supabase auth on app routes. In DEMO MODE (Supabase not configured)
// it no-ops so the existing localStorage app keeps working unchanged.
//
// Phase 6: host-aware subdomain split (lib/domains.ts). On a tenant STOREFRONT
// host (e.g. wesayachicken.com) the root "/" is internally rewritten to
// the EXISTING public /order/[slug] page for that tenant — the customer never
// sees /order/wesaya, the hostname maps to the tenant. Every other host
// (maitre.chat, *.vercel.app) falls through to the normal auth flow UNCHANGED.
//
// Operator host "/" (e.g. console.wesayachicken.com): the root marketing landing is
// MaitreAI's OWN company site (logo, City Baker legal footer) and must not show
// on a client's operator domain. There, "/" redirects to /login; the auth helper
// then bounces an already-signed-in operator from /login to /dashboard (existing
// behavior), so authed staff still reach their app. maitre.chat keeps the landing.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";
import { hostMapping } from "@/lib/domains";

export async function middleware(request: NextRequest) {
  // T2 — FAIL CLOSED in production. Demo mode (Supabase not configured) is a
  // LOCAL-DEV convenience; in prod, missing Supabase env means auth can't be
  // enforced — the no-op below would serve the whole console with NO authentication.
  // A prod deploy with missing env is a deploy ERROR: refuse loudly (503) for every
  // matched route rather than silently running unauthenticated. Dev/test are
  // unaffected (the guard is prod-only); configured prod never reaches this.
  if (process.env.NODE_ENV === "production" && !isSupabaseConfigured()) {
    return new NextResponse("Service not configured.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const mapping = hostMapping(request.headers.get("host"));

  // Storefront host: serve the tenant's public storefront at the root path by
  // rewriting "/" → the existing /order/[slug] rendering. Internal rewrite, so
  // the visible URL stays "/". Public (the /order page needs no session); other
  // paths (incl. /api for checkout) pass straight through unchanged.
  if (mapping?.kind === "storefront" && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/order/${mapping.slug}`;
    return NextResponse.rewrite(url);
  }

  // Faysal demo host (faysal.maitre.chat / faysal.getkivo.io): this hostname exists
  // to carry ONE page to a client's phone, so it serves exactly that page and
  // nothing else. "/" renders the demo, "/api/faysal/*" answers its turns, and every
  // other path is a hard 404 — the operator console, the Wesaya storefront and all
  // ~36 other API families stay unreachable here even though the SAME deployment
  // serves them on other hosts.
  //
  // Why the lockdown is load-bearing: the link that goes to a clinic manager is
  // public, unauthenticated and forwardable. Without this branch, "short and clean"
  // would also mean "the whole product, on one guessable hostname". With it, the
  // public surface of that hostname is the demo page plus its own two endpoints,
  // which are already bounded by the per-IP limit and the durable daily spend
  // ceiling in app/api/faysal/_engine/limits.ts.
  //
  // It runs BEFORE the auth path on purpose: the demo has no Supabase session and
  // must never be sent through one. Static assets never reach here — the matcher
  // below excludes _next/static and _next/image, which is where next/font and every
  // client chunk the page needs are served from.
  if (mapping?.kind === "faysal") {
    const path = request.nextUrl.pathname;
    // Canonicalise: the page's own route redirects to the bare host, so the link a
    // client sees, copies and forwards is always the short one.
    if (path === "/faysal") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/faysal";
      return NextResponse.rewrite(url);
    }
    if (path === "/api/faysal/turn" || path === "/api/faysal/reset") {
      return NextResponse.next();
    }
    return new NextResponse("Not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        // Belt and braces with the page's own `robots` metadata: nothing on this
        // host may be indexed, including the 404 body.
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  // Operator host root: skip MaitreAI's marketing landing — send staff to login.
  // (An authed operator hitting /login is redirected to /dashboard by the auth
  // helper, so this never strands a logged-in user.) Applies even in demo mode so
  // the company landing never leaks onto the client's operator domain.
  if (mapping?.kind === "operator" && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Everything else (all current hosts): unchanged behavior.
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Run on everything except Next internals and static assets. Public routes
  // (login, auth, checkout, order, api) are allowed through inside updateSession.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
