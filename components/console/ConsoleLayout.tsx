"use client";

// Kivo <ConsoleLayout> (SPEC 02 §2). The canonical authed-console shell reused by
// every Kivo console page. Applies `.kv-console` on its root so the Kivo font +
// RTL base are active (the shared app/layout.tsx body font is NOT Kivo — it's
// shared with the storefront — so console pages MUST render inside this wrapper).
// Hosts the real sidebar + topbar and mounts <DataBootstrap> so the per-tenant
// stores hydrate from the DB.

import { DataBootstrap } from "@/components/DataBootstrap";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleTopbar } from "./ConsoleTopbar";
import { AlertBanner } from "./AlertBanner";

export function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kv-console"
      dir="rtl"
      lang="ar"
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--kv-bg-console)",
      }}
    >
      <DataBootstrap />
      <ConsoleSidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <ConsoleTopbar />
        {/* Global critical-failure banner — manager-visible, real failures only. */}
        <AlertBanner />
        <main className="kv-scroll" style={{ flex: 1, overflowY: "auto", padding: "34px 24px 60px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
