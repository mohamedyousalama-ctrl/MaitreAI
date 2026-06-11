// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution
// Resolves the signed-in user's restaurant_id + role. Server helper reads from
// the cookie session; a thin browser helper does the same client-side. Returns
// null in demo mode (Supabase not configured) or when the user has no tenant.
// ============================================================================

import type { MemberRole } from "./types";

export interface Tenant {
  userId: string;
  restaurantId: string;
  role: MemberRole;
}

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

async function resolve(
  supabase: ReturnType<typeof createServerClient> | ReturnType<typeof createBrowserClient>
): Promise<Tenant | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("restaurant_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { userId: user.id, restaurantId: data.restaurant_id as string, role: data.role as MemberRole };
}

/** Server Components / Route Handlers. */
export async function getServerTenant(): Promise<Tenant | null> {
  return resolve(createServerClient());
}

/** Client components. */
export async function getBrowserTenant(): Promise<Tenant | null> {
  return resolve(createBrowserClient());
}
