"use client";

// ============================================================================
// MaitreAI — Pulse strip (Amendment 04 §M2): the always-visible truth bar.
// Terracotta reskin. Pinned on every main screen EXCEPT /dashboard (the
// redesigned Home owns the open/assistant controls + KPIs there). Every value is
// truth-driven (F3): open/agent are the operator's own toggles; escalations /
// today's orders / revenue are read from live store state; channel dots show a
// known or honest-unknown state.
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
  const color = state === "ok" ? "#5C8A6B" : state === "warn" ? "#C5871F" : "#C9BFAE";
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#7C7163]" title={label}>
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
    ? { text: "الوضع التجريبي — بيانات محلية", bg: "#F7F2EA", fg: "#7C7163" }
    : !agentEnabled
    ? { text: "المساعد متوقف — لا يرد على العملاء", bg: "#FBEAE5", fg: "#BE5238" }
    : !isOpen
    ? { text: "المطعم مغلق حالياً — لا تُستقبل الطلبات", bg: "#FBEAE5", fg: "#BE5238" }
    : null;

  // The Home (/dashboard) owns these controls — don't duplicate the strip there.
  if (pathname === "/dashboard" || !hydrated) return null;

  return (
    <div className="border-b border-[#F0E9DD] bg-white">
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
            isOpen ? "bg-[#EAF1E9] text-[#436B50]" : "bg-[#FBEAE5] text-[#BE5238]"
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {isOpen ? "مفتوح" : "مغلق"}
        </button>

        <button
          onClick={() => setAgentEnabled(!agentEnabled)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            agentEnabled ? "bg-[#F7EBD2] text-[#946312]" : "bg-[#F7F2EA] text-[#7C7163]"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          {agentEnabled ? "المساعد يعمل" : "المساعد متوقف"}
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-[#F0E9DD]" />

        <Link
          href="/conversations"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            escalations > 0 ? "bg-[#FBEAE5] text-[#BE5238]" : "bg-[#F7F2EA] text-[#7C7163]"
          )}
          title="محادثات تحتاج تدخل بشري"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          تصعيدات: {escalations}
        </Link>

        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#F7F2EA] px-2.5 py-1.5 text-xs font-semibold text-[#7C7163]" title="طلبات اليوم">
          <ShoppingBag className="h-3.5 w-3.5" />
          طلبات اليوم: {ordersCount}
        </span>

        {role !== "operation" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#F7F2EA] px-2.5 py-1.5 text-xs font-semibold text-[#7C7163]" title="إيرادات اليوم">
            <Banknote className="h-3.5 w-3.5" />
            {revenue} {currency}
          </span>
        )}

        <span className="mx-1 h-5 w-px shrink-0 bg-[#F0E9DD]" />

        <Link href="/settings" className="flex shrink-0 items-center gap-3 pl-1">
          <Dot label={whatsappLive ? "واتساب متصل" : "واتساب غير متصل"} state={whatsappLive ? "ok" : "off"} />
          <span className="flex items-center gap-1.5 text-xs text-[#7C7163]" title="الطابعة غير مهيأة بعد">
            <Printer className="h-3.5 w-3.5 text-[#C9BFAE]" />
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[#7C7163]" title="الدفع في الوضع التجريبي">
            <CreditCard className="h-3.5 w-3.5 text-[#C5871F]" />
          </span>
        </Link>
      </div>
    </div>
  );
}
