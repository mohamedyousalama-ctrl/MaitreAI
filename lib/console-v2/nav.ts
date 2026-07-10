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
  Truck,
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
  /** Manager-only surface. Operators (operation role) see ONLY the operation
   *  surfaces (Live Shift + Conversations, per OPERATION_HREFS); every other rail
   *  item is manager-only and hidden from an operator's rail (item 4). */
  managerOnly: boolean;
  /** WO-DELIVERY-D3: this item appears ONLY when the tenant has the delivery module
   *  on (delivery_runs OR delivery_geo_routing). Absent on every existing item, so the
   *  rail is byte-identical for a tenant without those flags. */
  requiresDeliveryModule?: boolean;
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
  // MAIN — the live operating surfaces. Shift + Conversations are the OPERATION
  // surfaces an operator may reach; Outcomes is manager-only.
  { key: "live-shift", labelKey: "nav.liveShift", icon: Radio, section: "main", href: "/c/shift", ready: true, managerOnly: false },
  { key: "conversations", labelKey: "nav.conversations", icon: MessagesSquare, section: "main", href: "/c/conversations", ready: true, managerOnly: false },
  { key: "outcomes", labelKey: "nav.outcomes", icon: Target, section: "main", href: "/c/outcomes", ready: true, managerOnly: true },
  // MODULES — supporting tools (manager-only)
  { key: "knowledge", labelKey: "nav.knowledge", icon: BookOpen, section: "modules", href: "/c/knowledge", ready: true, managerOnly: true },
  { key: "insights", labelKey: "nav.insights", icon: BarChart3, section: "modules", href: "/c/insights", ready: true, managerOnly: true },
  { key: "campaigns", labelKey: "nav.campaigns", icon: Megaphone, section: "modules", href: "/c/campaigns", ready: true, managerOnly: true },
  { key: "approvals", labelKey: "nav.approvals", icon: CheckCircle2, section: "modules", href: "/c/approvals", ready: true, managerOnly: true },
  // Ask Kivo is a GLOBAL overlay within the /c group (one command brain, two doors —
  // item 14), not a page route, so it carries no href; the rail entry opens the overlay.
  { key: "ask-kivo", labelKey: "nav.askKivo", icon: Sparkles, section: "modules", ready: true, managerOnly: true },
  // WO-DELIVERY-D3 — the التوصيل runs board. Flag-gated (requiresDeliveryModule): shown
  // ONLY when the tenant has delivery_runs or delivery_geo_routing on; otherwise absent
  // → the rail is byte-identical to today for every other tenant.
  { key: "deliveries", labelKey: "nav.deliveries", icon: Truck, section: "modules", href: "/c/deliveries", ready: true, managerOnly: true, requiresDeliveryModule: true },
  // CRM — customer relationships (manager-only)
  { key: "customers", labelKey: "nav.customers", icon: Users, section: "crm", href: "/c/customers", ready: true, managerOnly: true },
  // ADMIN — configuration + people (manager-only)
  { key: "settings", labelKey: "nav.settings", icon: Settings, section: "admin", href: "/c/settings", ready: true, managerOnly: true },
  { key: "team", labelKey: "nav.team", icon: UserCog, section: "admin", href: "/c/team", ready: true, managerOnly: true },
  { key: "onboarding", labelKey: "nav.onboarding", icon: Rocket, section: "admin", href: "/c/onboarding", ready: true, managerOnly: true },
];

export type ConsoleRole = "manager" | "operation";

/** Items for a section a given role may see, in declaration order. Operators get
 *  only the operation surfaces (managerOnly:false); managers get everything.
 *  `deliveryModuleOn` (default false) gates the delivery-module item ONLY — every
 *  existing item is untouched, so an unchanged caller yields the byte-identical rail. */
export function railItemsFor(section: RailSection, role: ConsoleRole, deliveryModuleOn = false): RailItem[] {
  return RAIL_ITEMS.filter(
    (i) =>
      i.section === section &&
      (role === "manager" || !i.managerOnly) &&
      (!i.requiresDeliveryModule || deliveryModuleOn)
  );
}

/** The role-aware landing target after login + workspace pick. Both roles land on
 *  Live Shift (manager with the full rail, operator on the floor). Returns the rail
 *  item so the caller can honor `ready`: while Shift is unbuilt the /c home renders
 *  a placeholder; the moment item 5 flips live-shift.ready, /c forwards to it — no
 *  code change at the call site, and never a redirect to a 404. */
export function landingItem(_role: ConsoleRole): RailItem {
  const shift = RAIL_ITEMS.find((i) => i.key === "live-shift");
  if (!shift) throw new Error("console_v2 nav: live-shift item missing");
  return shift;
}
