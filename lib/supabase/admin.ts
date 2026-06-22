// ============================================================================
// MaitreAI — Supabase admin client (Sprint 7) — SERVER ONLY
// Uses the service-role key, which BYPASSES RLS. Only ever import this from
// trusted server code (the WhatsApp webhook, tenant seeding). Never expose the
// service-role key to the client.
// ============================================================================

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True when trusted server operations (webhook persistence, seeding) can run. */
export function isAdminConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;
}

export function createAdminClient() {
  if (!isAdminConfigured()) return null;
  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Service-role DB reads must always be fresh: Next.js patches global fetch and
    // caches GET requests by default, which would freeze polled GET routes (e.g.
    // the live delivery tracker). no-store keeps every query current. POST flows
    // (webhook/agent) are already dynamic, so this is behavior-neutral for them.
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
