"use client";

// ============================================================================
// console_v2 — the one rail (PR 1 app shell). A single navigation rail with four
// sections (MAIN / MODULES / CRM / ADMIN), driven by lib/console-v2/nav. Ready
// items render as links with an active indicator; not-ready items render as a
// non-navigating row with a SOON truth-chip, so the rail never links to a route
// that 404s. Brand mark + wordmark sit at the top. RTL-safe (logical properties).
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ChevronsUpDown } from "lucide-react";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { RAIL_SECTIONS, railItemsFor, type RailItem, type ConsoleRole } from "@/lib/console-v2/nav";
import { useAskKivoStore } from "@/lib/console-v2/ask-kivo-store";
import { TruthChip } from "./TruthChip";

function RailRow({ item, active }: { item: RailItem; active: boolean }) {
  const t = useT();
  const openAsk = useAskKivoStore((s) => s.setOpen);
  const Icon = item.icon;
  const label = t(item.labelKey);
  // Ask Kivo is the one rail entry that opens the GLOBAL ⌘K palette, not a route.
  const isAskKivo = item.key === "ask-kivo";

  const inner = (
    <>
      {active && (
        <span
          aria-hidden
          style={{ position: "absolute", insetInlineStart: 0, top: 8, bottom: 8, width: 3, borderRadius: 99, background: "var(--kv-primary)" }}
        />
      )}
      <Icon size={18} strokeWidth={2.1} style={{ flex: "none" }} />
      <span style={{ flex: 1 }}>{label}</span>
      {isAskKivo ? (
        <kbd style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)", background: "var(--kv-primary-tint)", border: "1px solid var(--kv-border)", borderRadius: 6, padding: "1px 6px" }}>⌘K</kbd>
      ) : (!item.ready && <TruthChip state="soon" />)}
    </>
  );

  const baseStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 11,
    height: 40,
    padding: "0 12px",
    borderRadius: 13,
    fontSize: 13.5,
    fontWeight: 700,
    textDecoration: "none",
  };

  // Ask Kivo → a button that opens the global palette (no navigation).
  if (isAskKivo) {
    return (
      <button
        type="button"
        onClick={() => openAsk(true)}
        style={{ ...baseStyle, width: "100%", border: 0, background: "transparent", color: "var(--kv-muted)", fontFamily: "var(--kv-font)", fontWeight: 700, cursor: "pointer", textAlign: "start" }}
      >
        {inner}
      </button>
    );
  }

  // Not-ready → inert row (no href, muted). Ready → real Link.
  if (!item.ready || !item.href) {
    return (
      <div style={{ ...baseStyle, color: "var(--kv-faint)", cursor: "default" }}>{inner}</div>
    );
  }

  return (
    <Link
      href={item.href}
      style={{
        ...baseStyle,
        color: active ? "var(--kv-deep)" : "var(--kv-muted)",
        background: active
          ? "linear-gradient(90deg,rgba(14,159,110,.14),rgba(14,159,110,.04))"
          : "transparent",
      }}
    >
      {inner}
    </Link>
  );
}

export function Rail({ tenantName, role = "manager" }: { tenantName?: string; role?: ConsoleRole }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const isActive = (item: RailItem) =>
    !!item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <aside
      style={{
        width: 234,
        flex: "none",
        height: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg,#ffffff,#f6faf8)",
        borderInlineStart: "1px solid var(--kv-border)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand + real tenant. The tenant row is a "switch workspace" control → /c/select
          so a manager on multiple restaurants is never stranded on one. */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 4px", flex: "none" }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: "var(--kv-grad-brand)",
            display: "grid",
            placeItems: "center",
            flex: "none",
            boxShadow: "0 12px 22px -14px rgba(10,138,95,.8)",
          }}
        >
          <KivoMark size={24} tone="white" title="Kivo" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "var(--kv-text)", lineHeight: 1.1 }}>Kivo</div>
          {tenantName && (
            <Link
              href="/c/select"
              title={t("nav.switchWorkspace")}
              aria-label={t("nav.switchWorkspace")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 3,
                maxWidth: 150,
                padding: "2px 7px",
                marginInlineStart: -7,
                borderRadius: 8,
                textDecoration: "none",
                color: "var(--kv-faint)",
                background: "transparent",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tenantName}
              </span>
              <ChevronsUpDown size={12} strokeWidth={2.2} style={{ flex: "none" }} />
            </Link>
          )}
        </div>
      </div>

      {/* Scrollable nav — the ONLY scrolling region, so sign-out below stays pinned. */}
      <div className="kv-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", marginInline: -4, paddingInline: 4 }}>
        {RAIL_SECTIONS.map(({ section, labelKey }) => {
          const items = railItemsFor(section, role);
          if (items.length === 0) return null;
          return (
            <div key={section}>
              <div
                style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", padding: "0 12px", margin: "16px 0 7px", letterSpacing: ".02em" }}
              >
                {t(labelKey)}
              </div>
              <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {items.map((item) => (
                  <RailRow key={item.key} item={item} active={isActive(item)} />
                ))}
              </nav>
            </div>
          );
        })}
      </div>

      {/* Sign out — pinned, ALWAYS visible (never scrolls out of reach). A real form
          POST to the server route (clears auth cookies), then a hard nav to /c/login. */}
      <form
        action="/auth/signout?next=/c/login"
        method="post"
        style={{ flex: "none", paddingTop: 12, marginTop: 4, borderTop: "1px solid var(--kv-border)" }}
      >
        <button
          type="submit"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            width: "100%",
            height: 40,
            padding: "0 12px",
            borderRadius: 13,
            border: 0,
            background: "transparent",
            color: "var(--kv-muted)",
            fontFamily: "var(--kv-font)",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <LogOut size={18} strokeWidth={2.1} style={{ flex: "none" }} />
          <span style={{ flex: 1, textAlign: "start" }}>{t("action.signOut")}</span>
        </button>
      </form>
    </aside>
  );
}
