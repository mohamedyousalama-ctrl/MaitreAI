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
import { useConversationStore } from "@/lib/conversation-store";

export function DataBootstrap() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const tenant = await getBrowserTenant();
      if (!tenant || cancelled) return;
      await useRestaurantStore.getState().initFromDb(tenant.restaurantId);
      const stopConv = await useConversationStore.getState().initFromDb(tenant.restaurantId);
      if (cancelled) stopConv?.();
      else cleanup = () => stopConv?.();
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
