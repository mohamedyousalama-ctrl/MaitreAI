"use client";

// ============================================================================
// MaitreAI — Pulse strip (Amendment 04 §M2): the always-visible truth bar.
// Bright-Corporate blue reskin. Pinned on every main screen EXCEPT /dashboard
// (the redesigned Home has its own control strip + KPI row, so the strip would
// be redundant there). Every value is truth-driven (F3): open/agent are the
// operator's own toggles; escalations / today's orders / revenue are read from
// live store state; channel dots show a known or honest-unknown state.
// ============================================================================

import { useOpsStore } from "@/lib/ops-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useRole } from "@/lib/use-role";
import { cn } from "@/lib/utils";
import { Power, Bot, AlertTriangle, ShoppingBag, Banknote, Printer, CreditCard } from "lucide-react";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Dot({ label, state }: { label: string; state: "ok" | "warn" | "off" }) {
  const color = state === "ok" ? "#16A34A" : state === "warn" ? "#F59E0B" : "#CBD5E1";
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#64748B]" title={label}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function PulseStrip() {
  const pathname = usePathname();
  const hydrated = useHasHydrated();
  const configured = isSupabaseConfigured();
  const role = useRole();
  const { isOpen, agentEnabled, setOpen, setAgentEnabled } = useOpsStore();
  const conversations = useConversationStore((s) => s.conversations);
  const orders = useOrderStore((s) => s.orders);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const branches = useRestaurantStore((s) => s.branches);

  const escalations = conversations.filter(
    (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
  ).length;
  const since = startOfToday();
  const todayOrders = orders.filter((o) => o.createdAt >= since);
  const ordersCount = todayOrders.length;
  const revenue = todayOrders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (o.total || 0), 0);
  const whatsappLive = branches.some((b) => b.whatsappConnected);

  const banner = !configured
    ? { text: "الوضع التجريبي — بيانات محلية", bg: "#EEF3FF", fg: "#1D4ED8" }
    : !agentEnabled
    ? { text: "المساعد متوقف — لا يرد على العملاء", bg: "#FEF2F2", fg: "#BE123C" }
    : !isOpen
    ? { text: "المطعم مغلق حالياً — لا تُستقبل الطلبات", bg: "#FEF2F2", fg: "#BE123C" }
    : null;

  // The Home (/dashboard) owns these controls — don't duplicate the strip there.
  if (pathname === "/dashboard" || !hydrated) return null;

  return (
    <div className="border-b border-[#E2E8F0] bg-white">
      {banner && (
        <div className="px-4 py-1.5 text-center text-xs font-semibold" style={{ backgroundColor: banner.bg, color: banner.fg }}>
          {banner.text}
        </div>
      )}
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 text-sm md:gap-3">
        <button
          onClick={() => setOpen(!isOpen)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            isOpen ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FEF2F2] text-[#BE123C]"
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {isOpen ? "مفتوح" : "مغلق"}
        </button>

        <button
          onClick={() => setAgentEnabled(!agentEnabled)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            agentEnabled ? "bg-[#EEF3FF] text-[#1D4ED8]" : "bg-[#F1F5F9] text-[#64748B]"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          {agentEnabled ? "المساعد يعمل" : "المساعد متوقف"}
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-[#E2E8F0]" />

        <Link
          href="/conversations"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            escalations > 0 ? "bg-[#FEF2F2] text-[#E11D48]" : "bg-[#F1F4F9] text-[#64748B]"
          )}
          title="محادثات تحتاج تدخل بشري"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          تصعيدات: {escalations}
        </Link>

        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#F1F4F9] px-2.5 py-1.5 text-xs font-semibold text-[#64748B]" title="طلبات اليوم">
          <ShoppingBag className="h-3.5 w-3.5" />
          طلبات اليوم: {ordersCount}
        </span>

        {role !== "operation" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#F1F4F9] px-2.5 py-1.5 text-xs font-semibold text-[#64748B]" title="إيرادات اليوم">
            <Banknote className="h-3.5 w-3.5" />
            {revenue} {currency}
          </span>
        )}

        <span className="mx-1 h-5 w-px shrink-0 bg-[#E2E8F0]" />

        <Link href="/settings" className="flex shrink-0 items-center gap-3 pl-1">
          <Dot label={whatsappLive ? "واتساب متصل" : "واتساب غير متصل"} state={whatsappLive ? "ok" : "off"} />
          <span className="flex items-center gap-1.5 text-xs text-[#64748B]" title="الطابعة غير مهيأة بعد">
            <Printer className="h-3.5 w-3.5 text-[#CBD5E1]" />
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[#64748B]" title="الدفع في الوضع التجريبي">
            <CreditCard className="h-3.5 w-3.5 text-[#F59E0B]" />
          </span>
        </Link>
      </div>
    </div>
  );
}
