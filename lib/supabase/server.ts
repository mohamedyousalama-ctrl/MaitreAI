// ============================================================================
// MaitreAI — Supabase server client (Sprint 7)
// For Server Components / Route Handlers. Reads + refreshes the auth session
// from cookies. Returns null when Supabase isn't configured.
// ============================================================================

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export function createClient() {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll called from a Server Component — safe to ignore; the
          // middleware refreshes the session cookie on each request.
        }
      },
    },
  });
}
