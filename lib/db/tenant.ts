// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — tenant resolution (browser + shared)
// Resolves the signed-in user's restaurant_id + role. Browser-safe: does NOT
// import next/headers. The server variant lives in tenant-server.ts.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole } from "./types";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

export interface Tenant {
  userId: string;
  restaurantId: string;
  role: MemberRole;
}

export async function resolveTenant(supabase: SupabaseClient | null): Promise<Tenant | null> {
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

/** Client components. */
export async function getBrowserTenant(): Promise<Tenant | null> {
  return resolveTenant(createBrowserClient());
}
