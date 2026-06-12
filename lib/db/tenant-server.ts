// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution (server only)
// ============================================================================

import "server-only";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveTenant, type Tenant } from "./tenant";

/** Server Components / Route Handlers. */
export async function getServerTenant(): Promise<Tenant | null> {
  return resolveTenant(createServerClient());
}
