"use client";

// ============================================================================
// MaitreAI — Pulse strip (Amendment 04 §M2): the always-visible truth bar.
// Pinned on every main screen. Every value is truth-driven (F3): open/agent are
// the operator's own toggles; escalations / today's orders / revenue are read
// from live store state (0 is shown as 0, never faked); channel dots show a
// known state or an honest "unknown", never a false green. A system-mode banner
// appears whenever the app is not in plain live-open operation.
// ============================================================================

import { useOpsStore } from "@/lib/ops-store";
import Link from "next/link";
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
  const color = state === "ok" ? "#4e9466" : state === "warn" ? "#e0912e" : "#c2a98f";
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#6a5c4e]" title={label}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function PulseStrip() {
  const hydrated = useHasHydrated();
  const configured = isSupabaseConfigured();
  const role = useRole();
  const { isOpen, agentEnabled, setOpen, setAgentEnabled } = useOpsStore();
  const conversations = useConversationStore((s) => s.conversations);
  const orders = useOrderStore((s) => s.orders);
  const currency = useRestaurantStore((s) => s.profile.currency);
  const branches = useRestaurantStore((s) => s.branches);

  // Truth-driven metrics from live store state.
  const escalations = conversations.filter(
    (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
  ).length;
  const since = startOfToday();
  const todayOrders = orders.filter((o) => o.createdAt >= since);
  const ordersCount = todayOrders.length;
  const revenue = todayOrders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((s, o) => s + (o.total || 0), 0);
  const whatsappLive = branches.some((b) => b.whatsappConnected);

  // System mode (F3): only "live" shows no banner.
  const banner = !configured
    ? { text: "الوضع التجريبي — بيانات محلية", bg: "#fbefd9", fg: "#9a6c1e" }
    : !agentEnabled
    ? { text: "المساعد متوقف — لا يرد على العملاء", bg: "#f7e3df", fg: "#a8432a" }
    : !isOpen
    ? { text: "المطعم مغلق حالياً — لا تُستقبل الطلبات", bg: "#f7e3df", fg: "#a8432a" }
    : null;

  // Avoid SSR/CSR mismatch on persisted toggles.
  if (!hydrated) return null;

  return (
    <div className="border-b border-[#ece0d2] bg-white">
      {banner && (
        <div className="px-4 py-1.5 text-center text-xs font-semibold" style={{ backgroundColor: banner.bg, color: banner.fg }}>
          {banner.text}
        </div>
      )}
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 text-sm md:gap-3">
        {/* Open / closed (manager toggle, two-tap) */}
        <button
          onClick={() => setOpen(!isOpen)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            isOpen ? "bg-[#e7f1ea] text-[#3c7a52]" : "bg-[#f7e3df] text-[#a8432a]"
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {isOpen ? "مفتوح" : "مغلق"}
        </button>

        {/* Agent on / off (manager toggle) */}
        <button
          onClick={() => setAgentEnabled(!agentEnabled)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            agentEnabled ? "bg-[#f0e7da] text-[#b5502e]" : "bg-[#efe5d8] text-[#9b8b7c]"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          {agentEnabled ? "المساعد يعمل" : "المساعد متوقف"}
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-[#ece0d2]" />

        {/* Escalations → filtered conversations (§R2) */}
        <Link
          href="/conversations"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            escalations > 0 ? "bg-[#f7e3df] text-[#cc3a33]" : "bg-[#faf6ef] text-[#6a5c4e]"
          )}
          title="محادثات تحتاج تدخل بشري"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          تصعيدات: {escalations}
        </Link>

        {/* Today's orders */}
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#faf6ef] px-2.5 py-1.5 text-xs font-semibold text-[#6a5c4e]" title="طلبات اليوم">
          <ShoppingBag className="h-3.5 w-3.5" />
          طلبات اليوم: {ordersCount}
        </span>

        {/* Today's revenue — manager only (revenue hidden for operation, §M2) */}
        {role !== "operation" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#faf6ef] px-2.5 py-1.5 text-xs font-semibold text-[#6a5c4e]" title="إيرادات اليوم">
            <Banknote className="h-3.5 w-3.5" />
            {revenue} {currency}
          </span>
        )}

        <span className="mx-1 h-5 w-px shrink-0 bg-[#ece0d2]" />

        {/* Channel/status dots — honest states; tap → settings/diagnostics (§R2) */}
        <Link href="/settings" className="flex shrink-0 items-center gap-3 pl-1">
          <Dot label={whatsappLive ? "واتساب متصل" : "واتساب غير متصل"} state={whatsappLive ? "ok" : "off"} />
          <span className="flex items-center gap-1.5 text-xs text-[#6a5c4e]" title="الطابعة غير مهيأة بعد">
            <Printer className="h-3.5 w-3.5 text-[#c2a98f]" />
          </span>
          <span className="flex items-center gap-1.5 text-xs text-[#6a5c4e]" title="الدفع في الوضع التجريبي">
            <CreditCard className="h-3.5 w-3.5 text-[#e0912e]" />
          </span>
        </Link>
      </div>
    </div>
  );
}
