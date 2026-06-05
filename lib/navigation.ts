import {
  LayoutDashboard,
  MessageCircle,
  ShoppingBag,
  ChefHat,
  UtensilsCrossed,
  Store,
  Megaphone,
  BrainCircuit,
  Users,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "./types";

export interface NavItem {
  href: string;
  label: string; // Arabic label
  en: string; // English reference label
  icon: LucideIcon;
  module: ModuleKey | "ai-review";
  accent: string; // tailwind text color class for the accent
  accentBg: string; // tailwind bg tint
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", en: "Dashboard", icon: LayoutDashboard, module: "dashboard", accent: "text-dashboard", accentBg: "bg-dashboard" },
  { href: "/conversations", label: "المحادثات", en: "Conversations", icon: MessageCircle, module: "conversations", accent: "text-conversations", accentBg: "bg-conversations" },
  { href: "/orders", label: "الطلبات", en: "Orders", icon: ShoppingBag, module: "orders", accent: "text-orders", accentBg: "bg-orders" },
  { href: "/kitchen", label: "المطبخ", en: "Kitchen", icon: ChefHat, module: "kitchen", accent: "text-kitchen", accentBg: "bg-kitchen" },
  { href: "/menu", label: "المنيو", en: "Menu", icon: UtensilsCrossed, module: "menu", accent: "text-menu", accentBg: "bg-menu" },
  { href: "/branches", label: "الفروع", en: "Branches", icon: Store, module: "branches", accent: "text-branches", accentBg: "bg-branches" },
  { href: "/promotions", label: "العروض", en: "Promotions", icon: Megaphone, module: "promotions", accent: "text-promotions", accentBg: "bg-promotions" },
  { href: "/restaurant-brain", label: "عقل المطعم", en: "Restaurant Brain", icon: BrainCircuit, module: "brain", accent: "text-brain", accentBg: "bg-brain" },
  { href: "/customers", label: "العملاء", en: "Customers", icon: Users, module: "customers", accent: "text-customers", accentBg: "bg-customers" },
  { href: "/ai-review", label: "مركز مراجعة الذكاء", en: "AI Review Center", icon: Sparkles, module: "ai-review", accent: "text-promotions", accentBg: "bg-promotions" },
  { href: "/settings", label: "الإعدادات", en: "Settings", icon: Settings, module: "settings", accent: "text-settings", accentBg: "bg-settings" },
];
