"use client";

// ============================================================================
// console_v2 — AppFrame. The AUTHENTICATED chrome, rebuilt to the v35 DARK
// MISTY-SLATE GLASS shell: a glass `Device` on the misty-slate page, the 84px
// icon rail, and the scrolling main content region. The `.kvx` root establishes
// the dark token scope (globals.css) — it does NOT touch the OLD light console,
// which lives outside `.kvx`. Rendered by the /c/(app) server layout after the
// tenant + role resolve. Role is threaded to the rail (operators see only their
// surfaces). <LangShell> above provides language + direction.
// ============================================================================

import type { ReactNode } from "react";
import { DataBootstrap } from "@/components/DataBootstrap";
import { useConsoleDataStore, isConsoleDataPresentable } from "@/lib/console-data-state";
import { useT } from "@/lib/i18n/lang";
import { Device, IconRail } from "./kit";
import { AskKivoPalette } from "./AskKivoPalette";
import type { ConsoleRole } from "@/lib/console-v2/nav";

// Gate the page content on real tenant data being present (mirrors the old
// ConsoleGate): until the store is DB_READY (or DEMO) we must NOT render the
// page — else /c/shift can flash seed data before the swap. The rail still paints.
function GatedMain({ children }: { children: ReactNode }) {
  const t = useT();
  const state = useConsoleDataStore((s) => s.state);
  if (isConsoleDataPresentable(state)) return <>{children}</>;
  const msg = state === "NO_TENANT" ? t("console.noTenant") : state === "DB_FAILED" ? t("console.dataFailed") : t("auth.loading");
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--dim)", fontSize: 13, fontWeight: 700 }}>
      {msg}
    </div>
  );
}

export function AppFrame({
  tenantName,
  role,
  children,
}: {
  tenantName?: string;
  role: ConsoleRole;
  children: ReactNode;
}) {
  return (
    <div className="kvx">
      {/* Hydrate the per-tenant DB stores + realtime for every authed page. */}
      <DataBootstrap />
      <Device>
        <IconRail tenantName={tenantName} role={role} />
        <main className="kvx-main kv-scroll">
          <GatedMain>{children}</GatedMain>
        </main>
        {/* Ask Kivo — global ⌘K palette, mounted once so its listener works everywhere. */}
        <AskKivoPalette />
      </Device>
    </div>
  );
}
