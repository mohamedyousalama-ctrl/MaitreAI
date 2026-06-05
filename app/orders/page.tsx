"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrderTable } from "@/components/orders/OrderTable";
import { OrderCard } from "@/components/orders/OrderCard";
import { orders } from "@/lib/mock-data";
import { ShoppingBag, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["الكل", "جديد", "بانتظار الدفع", "قيد التحضير", "جاهز", "مكتمل", "ملغي"];

export default function OrdersPage() {
  const [filter, setFilter] = useState("الكل");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = filter === "الكل" ? orders : orders.filter((o) => o.status === filter);
  const selected = orders.find((o) => o.id === selectedId);

  return (
    <div>
      <PageHeader title="الطلبات" subtitle="كل الطلبات الواردة عبر واتساب" icon={ShoppingBag} accentBg="bg-orders" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
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
            {f}
          </button>
        ))}
      </div>

      <div className={cn("grid gap-6", selected ? "lg:grid-cols-[1fr_380px]" : "grid-cols-1")}>
        <div className="card overflow-hidden">
          <OrderTable orders={filtered} activeId={selectedId ?? undefined} onSelect={setSelectedId} />
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
    </div>
  );
}
