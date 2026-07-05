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
import { Rail } from "./Rail";
import type { ConsoleRole } from "@/lib/console-v2/nav";

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
      <Rail tenantName={tenantName} role={role} />
      <main
        className="kv-scroll"
        style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: "24px 28px" }}
      >
        {children}
      </main>
    </div>
  );
}
