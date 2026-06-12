"use client";

// Client-side member role (Amendment 04 K2/A5). Operation sees a reduced nav
// (المحادثات · الطلبات) and no revenue; manager sees everything. In demo mode
// (no tenant) we default to manager so the full app is explorable.
import { useEffect, useState } from "react";
import { getBrowserTenant } from "@/lib/db/tenant";

export type AppRole = "manager" | "operation";

export function useRole(): AppRole {
  const [role, setRole] = useState<AppRole>("manager");
  useEffect(() => {
    let alive = true;
    getBrowserTenant()
      .then((t) => alive && setRole((t?.role as AppRole) ?? "manager"))
      .catch(() => alive && setRole("manager"));
    return () => {
      alive = false;
    };
  }, []);
  return role;
}

/** Tabs an operation-role member may use (A5/K2): conversations + orders only. */
export const OPERATION_HREFS = new Set(["/conversations", "/orders"]);
