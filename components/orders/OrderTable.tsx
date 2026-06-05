"use client";

import type { Order } from "@/lib/types";
import { formatCurrency, formatOrderId, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaymentStatusBadge } from "@/components/ui/PaymentStatusBadge";
import { MessageCircle } from "lucide-react";

interface OrderTableProps {
  orders: Order[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

export function OrderTable({ orders, activeId, onSelect }: OrderTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs text-slate-400">
            <th className="px-4 py-3 text-start font-medium">الطلب</th>
            <th className="px-4 py-3 text-start font-medium">العميل</th>
            <th className="px-4 py-3 text-start font-medium">الفرع</th>
            <th className="px-4 py-3 text-start font-medium">الحالة</th>
            <th className="px-4 py-3 text-start font-medium">الدفع</th>
            <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
            <th className="px-4 py-3 text-start font-medium">الوقت</th>
            <th className="px-4 py-3 text-start font-medium">المصدر</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => onSelect?.(o.id)}
              className={cn(
                "cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50",
                activeId === o.id && "bg-orders/5"
              )}
            >
              <td className="px-4 py-3 font-semibold text-slate-800">{formatOrderId(o.id)}</td>
              <td className="px-4 py-3 text-slate-600">{o.customer}</td>
              <td className="px-4 py-3 text-slate-600">{o.branch}</td>
              <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
              <td className="px-4 py-3"><PaymentStatusBadge status={o.paymentStatus} /></td>
              <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(o.total)}</td>
              <td className="px-4 py-3 text-slate-500">{o.time}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 text-xs text-conversations">
                  <MessageCircle className="h-3.5 w-3.5" /> {o.source}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
