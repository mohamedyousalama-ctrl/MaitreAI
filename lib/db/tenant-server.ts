// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution (server only)
// ============================================================================

import "server-only";
import { cookies, headers } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveTenant, ACTIVE_RESTAURANT_COOKIE, type Tenant } from "./tenant";
import { hostMapping } from "@/lib/domains";

/** Server Components / Route Handlers. */
export async function getServerTenant(): Promise<Tenant | null> {
  // Host-pinned tenant takes precedence over the cookie so that a branded
  // console subdomain (e.g. console.wesayachicken.com) always resolves to its
  // configured restaurant regardless of any previously-set cookie.
  // resolveTenant() still verifies membership — a non-member gets null.
  const host = headers().get("host") ?? "";
  const m = hostMapping(host);
  const hostRid = m?.kind === "operator" ? (m.restaurantId ?? null) : null;
  const cookieRid = cookies().get(ACTIVE_RESTAURANT_COOKIE)?.value ?? null;
  return resolveTenant(createServerClient(), hostRid ?? cookieRid);
}
