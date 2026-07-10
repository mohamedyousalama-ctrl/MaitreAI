"use client";

// ============================================================================
// console_v2 — dark-glass SHELL primitives (v35 canon). The Device frame, the
// 84px icon rail, and the header row. The rail is icons-only with hover
// tooltips (the label), grouped by section with dividers; the active item keys
// off the pathname; Ask Kivo opens the global ⌘K palette; not-ready items are
// dimmed (never a link to a 404). Tenant switch (→ /c/select) + sign-out sit at
// the foot, always reachable.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ArrowLeftRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { RAIL_SECTIONS, railItemsFor, type RailItem, type ConsoleRole } from "@/lib/console-v2/nav";
import { useAskKivoStore } from "@/lib/console-v2/ask-kivo-store";

/** The dark glass device frame: misty-slate page → glass device → [rail | main]. */
export function Device({ children }: { children: ReactNode }) {
  return (
    <div className="kvx-page">
      <div className="kvx-device">{children}</div>
    </div>
  );
}

function RailIcon({ item, active, onAsk }: { item: RailItem; active: boolean; onAsk: () => void }) {
  const t = useT();
  const Icon = item.icon as LucideIcon;
  const label = t(item.labelKey);
  const inner = (
    <>
      <Icon size={18} strokeWidth={1.9} />
      <span className="kvx-rt">{label}</span>
      <span className="kvx-tip">{label}</span>
    </>
  );
  if (item.key === "ask-kivo") {
    return <button type="button" className="kvx-ric" onClick={onAsk} aria-label={label}>{inner}</button>;
  }
  if (!item.ready || !item.href) {
    return <div className="kvx-ric soon" aria-label={label}>{inner}</div>;
  }
  return <Link href={item.href} className={`kvx-ric${active ? " on" : ""}`} aria-label={label}>{inner}</Link>;
}

export function IconRail({ role = "manager", deliveryModuleOn = false }: { tenantName?: string; role?: ConsoleRole; deliveryModuleOn?: boolean }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const openAsk = useAskKivoStore((s) => s.setOpen);
  const isActive = (item: RailItem) => !!item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <aside className="kvx-rail kv-scroll">
      <Link href="/c" className="kvx-brand" aria-label="Kivo"><KivoMark size={24} tone="white" title="Kivo" /></Link>
      {RAIL_SECTIONS.map(({ section }, i) => {
        const items = railItemsFor(section, role, deliveryModuleOn);
        if (items.length === 0) return null;
        return (
          <div key={section} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            {i > 0 && <div className="kvx-rdiv" />}
            {items.map((item) => <RailIcon key={item.key} item={item} active={isActive(item)} onAsk={() => openAsk(true)} />)}
          </div>
        );
      })}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", width: "100%", paddingTop: 8 }}>
        <div className="kvx-rdiv" />
        <Link href="/c/select" className="kvx-ric" aria-label={t("nav.switchWorkspace")}>
          <ArrowLeftRight size={17} strokeWidth={1.9} />
          <span className="kvx-tip">{t("nav.switchWorkspace")}</span>
        </Link>
        <form action="/auth/signout?next=/c/login" method="post" style={{ width: 52, display: "flex", justifyContent: "center" }}>
          <button type="submit" className="kvx-ric" aria-label={t("action.signOut")} style={{ width: 52 }}>
            <LogOut size={17} strokeWidth={1.9} />
            <span className="kvx-tip">{t("action.signOut")}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Header row: page title + optional job-line + right-side status chips/actions. */
export function HeaderRow({ title, jobLine, right }: { title: ReactNode; jobLine?: ReactNode; right?: ReactNode }) {
  return (
    <header className="kvx-headrow">
      <h1 style={{ fontSize: 17, fontWeight: 800, color: "var(--txt)", margin: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        {title}
        {jobLine && <small style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>{jobLine}</small>}
      </h1>
      {right && <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 10 }}>{right}</div>}
    </header>
  );
}
