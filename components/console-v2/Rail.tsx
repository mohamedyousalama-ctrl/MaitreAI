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
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { RAIL_SECTIONS, railItemsFor, type RailItem } from "@/lib/console-v2/nav";
import { TruthChip } from "./TruthChip";

function RailRow({ item, active }: { item: RailItem; active: boolean }) {
  const t = useT();
  const Icon = item.icon;
  const label = t(item.labelKey);

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
      {!item.ready && <TruthChip state="soon" />}
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

export function Rail({ tenantName }: { tenantName?: string }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const isActive = (item: RailItem) =>
    !!item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <aside
      className="kv-scroll"
      style={{
        width: 234,
        flex: "none",
        height: "100%",
        overflowY: "auto",
        background: "linear-gradient(180deg,#ffffff,#f6faf8)",
        borderInlineStart: "1px solid var(--kv-border)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand + real tenant */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 4px" }}>
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
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--kv-faint)",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tenantName}
            </div>
          )}
        </div>
      </div>

      {RAIL_SECTIONS.map(({ section, labelKey }) => {
        const items = railItemsFor(section);
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
    </aside>
  );
}
