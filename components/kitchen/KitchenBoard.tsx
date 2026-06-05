import type { LocalOrder, KitchenStatusKey } from "@/lib/types";
import { KitchenTicket } from "./KitchenTicket";
import { cn } from "@/lib/utils";

interface Column {
  kitchen: KitchenStatusKey;
  title: string;
  dot: string;
  headBg: string;
}

const COLUMNS: Column[] = [
  { kitchen: "new", title: "جديد", dot: "bg-blue-500", headBg: "bg-blue-50" },
  { kitchen: "preparing", title: "قيد التحضير", dot: "bg-orange-500", headBg: "bg-orange-50" },
  { kitchen: "ready", title: "جاهز", dot: "bg-emerald-500", headBg: "bg-emerald-50" },
];

// Only paid orders that are still in the kitchen pipeline.
const KITCHEN_ORDER_STATUSES = new Set(["paid", "preparing", "ready"]);

export function KitchenBoard({ orders }: { orders: LocalOrder[] }) {
  const active = orders.filter((o) => KITCHEN_ORDER_STATUSES.has(o.orderStatus));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const tickets = active
          .filter((o) => o.kitchenStatus === col.kitchen)
          .sort((a, b) => a.createdAt - b.createdAt);
        return (
          <div key={col.kitchen} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50">
            <div className={cn("flex items-center justify-between rounded-t-2xl px-4 py-3", col.headBg)}>
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", col.dot)} />
                <h3 className="font-bold text-slate-800">{col.title}</h3>
              </div>
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-slate-600 shadow-sm">
                {tickets.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {tickets.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">لا توجد تذاكر</p>
              ) : (
                tickets.map((o) => <KitchenTicket key={o.id} order={o} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
