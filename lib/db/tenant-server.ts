// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution (server only)
// ============================================================================

import "server-only";
import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveTenant, ACTIVE_RESTAURANT_COOKIE, type Tenant } from "./tenant";

/** Server Components / Route Handlers. */
export async function getServerTenant(): Promise<Tenant | null> {
  const activeRid = cookies().get(ACTIVE_RESTAURANT_COOKIE)?.value ?? null;
  return resolveTenant(createServerClient(), activeRid);
}
