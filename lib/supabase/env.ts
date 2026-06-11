// ============================================================================
// MaitreAI — Supabase env (Sprint 7)
// Public URL + anon key are exposed to the client by design (they are not
// secrets). The service-role key is server-only and read elsewhere. When the
// public vars are absent the app stays in DEMO MODE: no auth enforcement, the
// existing localStorage UI keeps working, and the build stays green.
// ============================================================================

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True once a Supabase project is wired up (auth + persistence become active). */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
