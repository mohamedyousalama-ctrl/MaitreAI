"use client";

// Kivo console topbar (SPEC 02 §2b). Search pill + date chip (both filter the
// page's loaded data via the console-ui store), a notifications bell that shows a
// red dot ONLY on a live intervention signal, and the real signed-in user avatar.

import Link from "next/link";
import { Bell } from "lucide-react";
import { useConversationStore } from "@/lib/conversation-store";
import { countEscalations } from "@/lib/escalation";
import { useHasHydrated } from "@/lib/store";
import { useConsoleUi } from "./console-ui-store";
import { ProfileMenu } from "./ProfileMenu";
import { AlertSoundToggle } from "./ConsoleAlerts";
import { GlobalSearch } from "./GlobalSearch";

export function ConsoleTopbar() {
  const hydrated = useHasHydrated();
  const conversations = useConversationStore((s) => s.conversations);
  const escalations = hydrated ? countEscalations(conversations) : 0;

  const dateScope = useConsoleUi((s) => s.dateScope);
  const setDateScope = useConsoleUi((s) => s.setDateScope);

  return (
    <header
      style={{
        height: 60,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 22px",
        borderBottom: "1px solid var(--kv-border)",
        background: "rgba(255,255,255,.7)",
        backdropFilter: "blur(8px)",
        // The topbar establishes a stacking context (backdrop-filter). Without an
        // explicit z-index, that context ranks at the same level as <main>, and
        // because <main> follows the topbar in DOM order, <main>'s content (whose
        // dashboard sections create their OWN stacking contexts via transform/
        // will-change for the rise-in animation) paints ON TOP — swallowing the
        // ProfileMenu dropdown that hangs down into <main>'s area, so clicks on
        // «تسجيل الخروج» landed on the dashboard heading instead of the logout
        // link. Lifting the topbar above <main> keeps the dropdown clickable.
        position: "relative",
        zIndex: 30,
      }}
    >
      {/* SR1 — global search (orders + customers + conversations), server-side. */}
      <GlobalSearch />

      <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Date scope chip — default today; toggles the query scope. */}
        <button
          type="button"
          onClick={() => setDateScope(dateScope === "today" ? "all" : "today")}
          style={{ height: 34, padding: "0 14px", borderRadius: 99, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
        >
          {dateScope === "today" ? "النهارده" : "كل الفترات"}
        </button>

        {/* DLV5 — per-operator audible-alert mute toggle (default on). */}
        <AlertSoundToggle />

        {/* Notifications bell → the intervention queue (Conversations). Red dot
            only on a live intervention signal. */}
        <Link href="/conversations" aria-label="التنبيهات" title="التنبيهات" style={{ position: "relative", width: 36, height: 36, borderRadius: 11, border: "1px solid var(--kv-border)", background: "var(--kv-card)", display: "grid", placeItems: "center", textDecoration: "none" }}>
          <Bell size={17} color="var(--kv-muted)" />
          {escalations > 0 && (
            <span style={{ position: "absolute", top: 8, insetInlineEnd: 8, width: 7, height: 7, borderRadius: "50%", background: "var(--kv-red)" }} />
          )}
        </Link>

        {/* Signed-in user avatar → profile menu + logout */}
        <ProfileMenu />
      </div>
    </header>
  );
}
