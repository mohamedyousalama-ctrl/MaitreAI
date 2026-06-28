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
import { useOrderStore } from "@/lib/order-store";
import { usePaymentStore } from "@/lib/payment-store";
import { useConsoleOps } from "@/lib/console-ops-store";
import { useCodStore } from "@/lib/cod-store";
import { useDispatchStore } from "@/lib/dispatch-store";
import { useMembersStore } from "@/lib/members-store";
import { useConsoleDataStore } from "@/lib/console-data-state";

export function DataBootstrap() {
  useEffect(() => {
    // Demo/unconfigured (dev): leave the store in its initial DEMO state.
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const setDataState = useConsoleDataStore.getState().set;
    setDataState("DB_LOADING");

    (async () => {
      // M1.3 — explicit tenant gate: no resolved tenant → NO_TENANT (block; never
      // render seed as real). A store load failure → DB_FAILED. Success → DB_READY.
      let tenant: Awaited<ReturnType<typeof getBrowserTenant>> = null;
      try {
        tenant = await getBrowserTenant();
      } catch {
        if (!cancelled) setDataState("DB_FAILED");
        return;
      }
      if (cancelled) return;
      if (!tenant) {
        setDataState("NO_TENANT");
        return;
      }
      try {
        // LIVE0 L2 — restaurant/brain store now returns a realtime cleanup too.
        const stopBrain = await useRestaurantStore.getState().initFromDb(tenant.restaurantId);
        const stopConv = await useConversationStore.getState().initFromDb(tenant.restaurantId);
        const stopOrders = await useOrderStore.getState().initFromDb(tenant.restaurantId);
        const stopPay = await usePaymentStore.getState().initFromDb(tenant.restaurantId);
        // LIVE0 L1 — shared ops store (Karim active / open-closed / slug), live.
        const stopOps = await useConsoleOps.getState().initFromDb(tenant.restaurantId);
        // LIVE0 L3 — shared COD ledger store, live across managers (read-only;
        // tenant-scoped by RLS). Loaded for the tenant like the other stores.
        const stopCod = await useCodStore.getState().initFromDb(tenant.restaurantId);
        // LIVE0 L4 — shared dispatch store (deliveries + drivers), live; replaces
        // the التوصيل 6s poll.
        const stopDispatch = await useDispatchStore.getState().initFromDb(tenant.restaurantId);
        // LIVE0 L5a — shared members store (team roster + assignee names), live.
        const stopMembers = await useMembersStore.getState().initFromDb(tenant.restaurantId);
        if (cancelled) {
          stopBrain?.();
          stopConv?.();
          stopOrders?.();
          stopPay?.();
          stopOps?.();
          stopCod?.();
          stopDispatch?.();
          stopMembers?.();
          return;
        }
        setDataState("DB_READY", tenant.restaurantId);
        cleanup = () => {
          stopBrain?.();
          stopConv?.();
          stopOrders?.();
          stopPay?.();
          stopOps?.();
          stopCod?.();
          stopDispatch?.();
          stopMembers?.();
        };
      } catch {
        if (!cancelled) setDataState("DB_FAILED", tenant.restaurantId);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
