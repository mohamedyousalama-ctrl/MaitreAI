import {
  LayoutDashboard,
  MessageCircle,
  ShoppingBag,
  UtensilsCrossed,
  Settings,
  Sparkles,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "./types";

export interface NavItem {
  href: string;
  label: string; // Arabic label
  en: string; // English reference label
  icon: LucideIcon;
  module: ModuleKey | "ai-review";
  accent: string;
  accentBg: string;
  /** Extra path prefixes that keep this tab active (folded sections, §M2/K1). */
  match?: string[];
  /** Show in the desktop rail only — kept out of the mobile bottom bar (§M2). */
  railOnly?: boolean;
}

// The K1 five-tab shell (Amendment 04 §M2). Folded:
//  • المنيو + ذاكرة المطعم + مراجعة المساعد → one «المنيو والذاكرة» tab (sectioned).
//  • الفروع → الإعدادات section · العروض → console + a section from الرئيسية.
//  • العملاء → conversation context drawer + global search. No top-level tabs.
export const navItems: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", en: "Home", icon: LayoutDashboard, module: "dashboard", accent: "text-dashboard", accentBg: "bg-dashboard" },
  { href: "/maitre", label: "المساعد", en: "Assistant", icon: Sparkles, module: "dashboard", accent: "text-dashboard", accentBg: "bg-dashboard" },
  { href: "/conversations", label: "المحادثات", en: "Conversations", icon: MessageCircle, module: "conversations", accent: "text-conversations", accentBg: "bg-conversations" },
  { href: "/orders", label: "الطلبات", en: "Orders", icon: ShoppingBag, module: "orders", accent: "text-orders", accentBg: "bg-orders" },
  {
    href: "/menu",
    label: "المنيو والذاكرة",
    en: "Menu & Memory",
    icon: UtensilsCrossed,
    module: "menu",
    accent: "text-menu",
    accentBg: "bg-menu",
    match: ["/menu", "/restaurant-brain", "/ai-review"],
  },
  { href: "/promotions", label: "العروض", en: "Promotions", icon: Megaphone, module: "promotions", accent: "text-promotions", accentBg: "bg-promotions", railOnly: true },
  { href: "/settings", label: "الإعدادات", en: "Settings", icon: Settings, module: "settings", accent: "text-settings", accentBg: "bg-settings", match: ["/settings", "/branches"] },
];
