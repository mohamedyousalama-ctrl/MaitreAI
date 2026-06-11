"use client";

// ============================================================================
// MaitreAI — Sprint 7 Pass 2 — data bootstrap
// On mount (configured + signed-in tenant), hydrates the DB-backed stores for
// the current restaurant and wires realtime. No-op in demo mode. Renders nothing.
// Stores are wired in slice by slice (brain → conversations → orders → payments).
// ============================================================================

import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getBrowserTenant } from "@/lib/db/tenant";
import { useRestaurantStore } from "@/lib/store";

export function DataBootstrap() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;

    (async () => {
      const tenant = await getBrowserTenant();
      if (!tenant || cancelled) return;
      await useRestaurantStore.getState().initFromDb(tenant.restaurantId);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
