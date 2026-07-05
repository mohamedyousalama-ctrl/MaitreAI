// ============================================================================
// console_v2 — the one-rail navigation model (PR 1 app shell).
//
// ONE rail, four sections: MAIN / MODULES / CRM / ADMIN. This is the data; the
// <Rail> component renders it. Items carry a labelKey (i18n, never an inline
// string) and a lucide icon.
//
// `ready` is the honesty switch. A page's PR flips its own item to ready:true and
// gives it an href only when that page actually ships. Until then the item renders
// as a non-navigating SOON row — so the rail can NEVER link into a route that
// 404s, and the shell tells the truth about what exists (the same discipline the
// truth-state chips apply to data). PR 1 ships every item as not-ready by design.
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

// The full console_v2 surface (kickoff items 5–16). Every item is ready:false in
// PR 1; each page PR flips its own entry and sets href.
export const RAIL_ITEMS: RailItem[] = [
  // MAIN — the live operating surfaces
  { key: "live-shift", labelKey: "nav.liveShift", icon: Radio, section: "main", ready: false },
  { key: "conversations", labelKey: "nav.conversations", icon: MessagesSquare, section: "main", ready: false },
  { key: "outcomes", labelKey: "nav.outcomes", icon: Target, section: "main", ready: false },
  // MODULES — supporting tools
  { key: "knowledge", labelKey: "nav.knowledge", icon: BookOpen, section: "modules", ready: false },
  { key: "insights", labelKey: "nav.insights", icon: BarChart3, section: "modules", ready: false },
  { key: "campaigns", labelKey: "nav.campaigns", icon: Megaphone, section: "modules", ready: false },
  { key: "approvals", labelKey: "nav.approvals", icon: CheckCircle2, section: "modules", ready: false },
  { key: "ask-kivo", labelKey: "nav.askKivo", icon: Sparkles, section: "modules", ready: false },
  // CRM — customer relationships
  { key: "customers", labelKey: "nav.customers", icon: Users, section: "crm", ready: false },
  // ADMIN — configuration + people
  { key: "settings", labelKey: "nav.settings", icon: Settings, section: "admin", ready: false },
  { key: "team", labelKey: "nav.team", icon: UserCog, section: "admin", ready: false },
  { key: "onboarding", labelKey: "nav.onboarding", icon: Rocket, section: "admin", ready: false },
];

/** Items for a section, in declaration order. */
export function railItemsFor(section: RailSection): RailItem[] {
  return RAIL_ITEMS.filter((i) => i.section === section);
}
