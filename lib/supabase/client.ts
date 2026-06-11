// ============================================================================
// MaitreAI — Supabase browser client (Sprint 7)
// Used by client components for auth + (Pass 2) realtime queries. Returns null
// when Supabase isn't configured so callers can fall back to demo behavior
// instead of crashing.
// ============================================================================

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
