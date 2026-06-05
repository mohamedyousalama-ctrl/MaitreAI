"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrderTable } from "@/components/orders/OrderTable";
import { OrderCard } from "@/components/orders/OrderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOrderStore } from "@/lib/order-store";
import { usePaymentStore } from "@/lib/payment-store";
import { useHasHydrated } from "@/lib/store";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import type { OrderStatusKey } from "@/lib/types";
import { ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS: ("all" | OrderStatusKey)[] = [
  "all",
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export default function OrdersPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const sweepExpired = usePaymentStore((s) => s.sweepExpired);
  const [filter, setFilter] = useState<"all" | OrderStatusKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    sweepExpired();
  }, [sweepExpired]);

  const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  const filtered = filter === "all" ? sorted : sorted.filter((o) => o.orderStatus === filter);
  const selected = orders.find((o) => o.id === selectedId);

  return (
    <div>
      <PageHeader title="الطلبات" subtitle="كل الطلبات المحلية الواردة عبر واتساب" icon={ShoppingBag} accentBg="bg-orders" />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f
                ? "bg-orders text-white shadow-card"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {f === "all" ? "الكل" : ORDER_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {!hydrated ? (
        <div className="card h-72 animate-pulse bg-slate-50" />
      ) : (
        <div className={cn("grid gap-6", selected ? "lg:grid-cols-[1fr_400px]" : "grid-cols-1")}>
          <div className="card overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState title="لا توجد طلبات" description="ستظهر الطلبات هنا عند تأكيدها من المحادثات." icon={ShoppingBag} />
            ) : (
              <OrderTable orders={filtered} activeId={selectedId ?? undefined} onSelect={setSelectedId} />
            )}
          </div>

          {selected && (
            <div className="card h-fit p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">تفاصيل الطلب</h2>
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <OrderCard order={selected} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
