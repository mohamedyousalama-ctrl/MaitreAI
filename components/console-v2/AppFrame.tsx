"use client";

// ============================================================================
// console_v2 — AppFrame (item 4). The AUTHENTICATED chrome: the one rail beside
// the page content, on the emerald console background. Rendered by the /c/(app)
// server layout AFTER the tenant + role are resolved, so it just paints — the
// gate/redirect logic lives in the layout. Role is threaded to the rail so an
// operator sees only the operation surfaces. Assumes <LangShell> above it for
// language + direction (the whole /c group is wrapped once).
// ============================================================================

import type { ReactNode } from "react";
import { DataBootstrap } from "@/components/DataBootstrap";
import { useConsoleDataStore, isConsoleDataPresentable } from "@/lib/console-data-state";
import { useT } from "@/lib/i18n/lang";
import { Rail } from "./Rail";
import { AskKivoPalette } from "./AskKivoPalette";
import type { ConsoleRole } from "@/lib/console-v2/nav";

// Gate the page content on real tenant data being present, mirroring the old
// ConsoleLayout's ConsoleGate: DataBootstrap hydrates asynchronously, so until the
// store is DB_READY (or DEMO) we must NOT render the page — otherwise /c/shift can
// flash seed data or a previous tenant's persisted orders before the swap. The rail
// (chrome) still renders; only the main content waits.
function GatedMain({ children }: { children: ReactNode }) {
  const t = useT();
  const state = useConsoleDataStore((s) => s.state);
  if (isConsoleDataPresentable(state)) return <>{children}</>;
  const msg = state === "NO_TENANT" ? t("console.noTenant") : state === "DB_FAILED" ? t("console.dataFailed") : t("auth.loading");
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--kv-muted)", fontSize: 13, fontWeight: 700 }}>
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
    <div
      className="kv-console"
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        background: "var(--kv-bg-console)",
        color: "var(--kv-text)",
      }}
    >
      {/* Hydrate the per-tenant DB stores + realtime for every authed console_v2
          page (no-op in demo mode, where seed data stays). */}
      <DataBootstrap />
      <Rail tenantName={tenantName} role={role} />
      <main
        className="kv-scroll"
        style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: "24px 28px" }}
      >
        <GatedMain>{children}</GatedMain>
      </main>
      {/* Ask Kivo — the global ⌘K command palette (item 14). Mounted once here so
          its ⌘K/Ctrl+K listener works from every /c screen; renders only when open. */}
      <AskKivoPalette />
    </div>
  );
}
