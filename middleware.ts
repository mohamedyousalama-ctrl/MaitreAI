// ============================================================================
// MaitreAI — Next.js middleware (Sprint 7)
// Enforces Supabase auth on app routes. In DEMO MODE (Supabase not configured)
// it no-ops so the existing localStorage app keeps working unchanged.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Run on everything except Next internals and static assets. Public routes
  // (login, auth, checkout, api) are allowed through inside updateSession.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
