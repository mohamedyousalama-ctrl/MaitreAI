// ============================================================================
// MaitreAI — Next.js middleware (Sprint 7 · Phase 6 host-aware routing)
// Enforces Supabase auth on app routes. In DEMO MODE (Supabase not configured)
// it no-ops so the existing localStorage app keeps working unchanged.
//
// Phase 6: host-aware subdomain split (lib/domains.ts). On a tenant STOREFRONT
// host (e.g. order.wesayachicken.com) the root "/" is internally rewritten to
// the EXISTING public /order/[slug] page for that tenant — the customer never
// sees /order/wesaya, the hostname maps to the tenant. The OPERATOR host
// (app.wesayachicken.com) and every other host (maitre.chat, *.vercel.app) fall
// through to the normal auth flow UNCHANGED — path-based /order/[slug] and the
// operator app keep working exactly as today.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";
import { hostMapping } from "@/lib/domains";

export async function middleware(request: NextRequest) {
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

  // Everything else (operator host + all current hosts): unchanged behavior.
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Run on everything except Next internals and static assets. Public routes
  // (login, auth, checkout, order, api) are allowed through inside updateSession.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
