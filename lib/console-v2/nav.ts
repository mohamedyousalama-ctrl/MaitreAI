// ============================================================================
// console_v2 — the one-rail navigation model (PR 1 app shell).
//
// ONE rail, four sections: MAIN / MODULES / CRM / ADMIN. This is the data; the
// <Rail> component renders it. Items carry a labelKey (i18n, never an inline
// string) and a lucide icon.
//
// NAMESPACE (ruling #2): the whole console_v2 group lives under the /c prefix
// (/c/shift, /c/conversations, …). This gives it its own URL space so there are
// ZERO build-time collisions with the old (console) group at its existing URLs —
// the CONSOLE_V2 flag gates the entire /c group PER TENANT at runtime, and no old
// route is removed until the single V1-exit CUTOVER PR. hrefs are pre-declared to
// their final /c path here as the one source of truth; `ready` still gates linking.
//
// `ready` is the honesty switch. A page's PR flips its own item to ready:true only
// when that page actually ships at its /c path. Until then the item renders as a
// non-navigating SOON row (RailRow ignores href while ready:false) — so the rail
// can NEVER link into a route that 404s, and the shell tells the truth about what
// exists (the same discipline the truth-state chips apply to data). PR 1 ships
// every item as not-ready by design.
// ============================================================================

import {
  Radio,
  MessagesSquare,
  Target,
  BookOpen,
  BarChart3,
  Megaphone,
  CheckCircle2,
  Sparkles,
  Users,
  Settings,
  UserCog,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import type { DictKey } from "@/lib/i18n/dictionary";

export type RailSection = "main" | "modules" | "crm" | "admin";

export interface RailItem {
  /** Stable id (also the console_v2 item number's slug). */
  key: string;
  labelKey: DictKey;
  icon: LucideIcon;
  section: RailSection;
  /** Set only once the page ships (its own PR). Absent while not ready. */
  href?: string;
  /** False until the page's PR lands — renders as a non-navigating SOON row. */
  ready: boolean;
}

/** Section header dictionary keys, in render order (MAIN → MODULES → CRM → ADMIN). */
export const RAIL_SECTIONS: { section: RailSection; labelKey: DictKey }[] = [
  { section: "main", labelKey: "nav.section.main" },
  { section: "modules", labelKey: "nav.section.modules" },
  { section: "crm", labelKey: "nav.section.crm" },
  { section: "admin", labelKey: "nav.section.admin" },
];

// The full console_v2 surface (kickoff items 5–16), namespaced under /c. Every
// item is ready:false in PR 1; each page PR flips its own entry to ready:true when
// the page ships at its href. hrefs are declared now as the canonical target.
export const RAIL_ITEMS: RailItem[] = [
  // MAIN — the live operating surfaces
  { key: "live-shift", labelKey: "nav.liveShift", icon: Radio, section: "main", href: "/c/shift", ready: false },
  { key: "conversations", labelKey: "nav.conversations", icon: MessagesSquare, section: "main", href: "/c/conversations", ready: false },
  { key: "outcomes", labelKey: "nav.outcomes", icon: Target, section: "main", href: "/c/outcomes", ready: false },
  // MODULES — supporting tools
  { key: "knowledge", labelKey: "nav.knowledge", icon: BookOpen, section: "modules", href: "/c/knowledge", ready: false },
  { key: "insights", labelKey: "nav.insights", icon: BarChart3, section: "modules", href: "/c/insights", ready: false },
  { key: "campaigns", labelKey: "nav.campaigns", icon: Megaphone, section: "modules", href: "/c/campaigns", ready: false },
  { key: "approvals", labelKey: "nav.approvals", icon: CheckCircle2, section: "modules", href: "/c/approvals", ready: false },
  // Ask Kivo is a GLOBAL overlay within the /c group (one command brain, two doors —
  // item 14), not a page route, so it carries no href; the rail entry opens the overlay.
  { key: "ask-kivo", labelKey: "nav.askKivo", icon: Sparkles, section: "modules", ready: false },
  // CRM — customer relationships
  { key: "customers", labelKey: "nav.customers", icon: Users, section: "crm", href: "/c/customers", ready: false },
  // ADMIN — configuration + people
  { key: "settings", labelKey: "nav.settings", icon: Settings, section: "admin", href: "/c/settings", ready: false },
  { key: "team", labelKey: "nav.team", icon: UserCog, section: "admin", href: "/c/team", ready: false },
  { key: "onboarding", labelKey: "nav.onboarding", icon: Rocket, section: "admin", href: "/c/onboarding", ready: false },
];

/** Items for a section, in declaration order. */
export function railItemsFor(section: RailSection): RailItem[] {
  return RAIL_ITEMS.filter((i) => i.section === section);
}
