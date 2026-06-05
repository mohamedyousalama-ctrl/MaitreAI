import type { Order, OrderStatus } from "@/lib/types";
import { KitchenTicket } from "./KitchenTicket";
import { cn } from "@/lib/utils";

interface Column {
  status: OrderStatus;
  title: string;
  dot: string;
  headBg: string;
}

const COLUMNS: Column[] = [
  { status: "جديد", title: "جديد", dot: "bg-blue-500", headBg: "bg-blue-50" },
  { status: "قيد التحضير", title: "قيد التحضير", dot: "bg-orange-500", headBg: "bg-orange-50" },
  { status: "جاهز", title: "جاهز", dot: "bg-emerald-500", headBg: "bg-emerald-50" },
];

export function KitchenBoard({ orders }: { orders: Order[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const tickets = orders.filter((o) => o.status === col.status);
        return (
          <div key={col.status} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/50">
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
