"use client";

// Kivo <ConsoleLayout> (SPEC 02 §2). The canonical authed-console shell reused by
// every Kivo console page. Applies `.kv-console` on its root so the Kivo font +
// RTL base are active (the shared app/layout.tsx body font is NOT Kivo — it's
// shared with the storefront — so console pages MUST render inside this wrapper).
// Hosts the real sidebar + topbar and mounts <DataBootstrap> so the per-tenant
// stores hydrate from the DB.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DataBootstrap } from "@/components/DataBootstrap";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleTopbar } from "./ConsoleTopbar";
import { AlertBanner } from "./AlertBanner";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";

// M1.1 — manager-only console surfaces. Operators may reach ONLY the
// OPERATION_HREFS (conversations/orders/deliveries); every other console route is
// manager-only. Defense-in-depth: the server APIs already gate writes; this stops
// an operator REACHING the surface by typing the URL. Menu stays manager-only in
// V1 (availability-only split deferred — see PR notes).
function isOperatorAllowed(pathname: string): boolean {
  for (const href of OPERATION_HREFS) {
    if (pathname === href || pathname.startsWith(href + "/")) return true;
  }
  return false;
}

/** Blocks operators (and loading/unresolved) from manager-only routes. Manager
 *  and demo mode pass through unchanged. */
function RoleGuard({ children }: { children: React.ReactNode }) {
  const role = useRole();
  const pathname = usePathname();
  const router = useRouter();

  // A manager-only route is anything an operator is NOT explicitly allowed.
  const managerOnly = !isOperatorAllowed(pathname ?? "");
  // Operators / unresolved get bounced to an allowed page; loading waits.
  const denied = managerOnly && (role === "operation" || role === "unresolved");

  useEffect(() => {
    if (denied) router.replace("/conversations");
  }, [denied, router]);

  if (role === "manager") return <>{children}</>; // manager (and demo) → full access
  if (!managerOnly) return <>{children}</>; // operator-allowed route → render for anyone

  // Manager-only route, not (yet) a confirmed manager → never render the surface.
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--kv-faint)", fontSize: 13, fontWeight: 700 }}>
      {role === "loading" ? "جارٍ التحميل…" : "جارٍ التحويل…"}
    </div>
  );
}

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
          <RoleGuard>{children}</RoleGuard>
        </main>
      </div>
    </div>
  );
}
