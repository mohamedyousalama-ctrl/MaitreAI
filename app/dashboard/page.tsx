"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { ModuleCard } from "@/components/ui/ModuleCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderStatusBadge, OrderPaymentBadge } from "@/components/orders/OrderStatusBadges";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated } from "@/lib/store";
import { aiDailySummary, systemStatus } from "@/lib/mock-data";
import { formatCurrency, formatOrderId } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingBag,
  DollarSign,
  MessageCircle,
  CreditCard,
  TrendingUp,
  Timer,
  Sparkles,
  CheckCircle2,
  XCircle,
  Bot,
  ArrowLeft,
} from "lucide-react";

export default function DashboardPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const todayOrders = orders.filter((o) => o.createdAt >= todayMs && o.orderStatus !== "cancelled");
  const paidToday = todayOrders.filter((o) => o.paymentStatus === "paid");
  const revenue = paidToday.reduce((s, o) => s + o.total, 0);
  const aov = paidToday.length ? Math.round(revenue / paidToday.length) : 0;
  const openConversations = conversations.filter((c) => c.status !== "طلب مكتمل").length;
  const recentOrders = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentConversations = conversations.slice(0, 4);

  const kpis = [
    { key: "ordersToday", label: "طلبات اليوم", value: String(todayOrders.length), icon: ShoppingBag, accent: "bg-orders" },
    { key: "revenueToday", label: "إيرادات اليوم", value: formatCurrency(revenue), icon: DollarSign, accent: "bg-brain" },
    { key: "openConversations", label: "محادثات مفتوحة", value: String(openConversations), icon: MessageCircle, accent: "bg-conversations" },
    { key: "paidOrders", label: "طلبات مدفوعة", value: String(paidToday.length), icon: CreditCard, accent: "bg-promotions" },
    { key: "avgOrderValue", label: "متوسط قيمة الطلب", value: formatCurrency(aov), icon: TrendingUp, accent: "bg-dashboard" },
    { key: "avgResponseTime", label: "متوسط زمن الرد", value: "8 ثانية", icon: Timer, accent: "bg-kitchen" },
  ];

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة عامة على أداء مطعم الذواقة اليوم"
        icon={LayoutDashboard}
        accentBg="bg-dashboard"
      />

      {/* AI daily summary */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-l from-brain to-conversations p-[1px] shadow-card">
        <div className="rounded-2xl bg-gradient-to-l from-emerald-50 to-green-50 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brain text-white shadow-card">
              <Bot className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">ملخص الموظف الذكي اليومي</h2>
                <Sparkles className="h-4 w-4 text-brain" />
              </div>
              <p className="mt-1 font-semibold text-brain">{aiDailySummary.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{aiDailySummary.body}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <MetricCard key={kpi.key} label={kpi.label} value={hydrated ? kpi.value : "…"} icon={kpi.icon} accentBg={kpi.accent} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent conversations */}
        <ModuleCard
          title="أحدث المحادثات"
          icon={MessageCircle}
          accentBg="bg-conversations"
          className="lg:col-span-1"
          action={
            <Link href="/conversations" className="flex items-center gap-1 text-xs font-semibold text-conversations">
              عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <ul className="space-y-3">
            {recentConversations.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: c.avatarColor }}
                >
                  {c.customer.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{c.customer}</p>
                  <p className="truncate text-xs text-slate-500">{c.lastMessage}</p>
                </div>
                <StatusBadge status={c.status} className="scale-90" />
              </li>
            ))}
          </ul>
        </ModuleCard>

        {/* Recent orders */}
        <ModuleCard
          title="أحدث الطلبات"
          icon={ShoppingBag}
          accentBg="bg-orders"
          className="lg:col-span-2"
          action={
            <Link href="/orders" className="flex items-center gap-1 text-xs font-semibold text-orders">
              عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-slate-400">
                  <th className="pb-2 text-start font-medium">الطلب</th>
                  <th className="pb-2 text-start font-medium">العميل</th>
                  <th className="pb-2 text-start font-medium">الحالة</th>
                  <th className="pb-2 text-start font-medium">الدفع</th>
                  <th className="pb-2 text-start font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-50">
                    <td className="py-2.5 font-semibold text-slate-700">{formatOrderId(o.orderNumber)}</td>
                    <td className="py-2.5 text-slate-600">{o.customerName}</td>
                    <td className="py-2.5"><OrderStatusBadge status={o.orderStatus} className="scale-90 origin-right" /></td>
                    <td className="py-2.5"><OrderPaymentBadge status={o.paymentStatus} className="scale-90 origin-right" /></td>
                    <td className="py-2.5 font-semibold text-slate-800">{formatCurrency(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModuleCard>
      </div>

      {/* System status */}
      <div className="mt-6">
        <ModuleCard title="حالة النظام" icon={CheckCircle2} accentBg="bg-brain">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {systemStatus.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                {s.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                  <p className={s.ok ? "text-xs text-emerald-600" : "text-xs text-red-500"}>{s.status}</p>
                </div>
              </div>
            ))}
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}
