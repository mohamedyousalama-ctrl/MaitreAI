"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { useOrderStore } from "@/lib/order-store";
import { useHasHydrated } from "@/lib/store";
import { ChefHat } from "lucide-react";

export default function KitchenPage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);

  return (
    <div>
      <PageHeader title="المطبخ" subtitle="لوحة تذاكر التحضير المباشرة" icon={ChefHat} accentBg="bg-kitchen" />
      {!hydrated ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <KitchenBoard orders={orders} />
      )}
    </div>
  );
}
