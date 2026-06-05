import type { Customer } from "@/lib/types";
import { formatCurrency, cn } from "@/lib/utils";
import { Phone, Star, Clock, ShoppingBag } from "lucide-react";

const SEGMENT_STYLE: Record<Customer["segment"], string> = {
  "عميل مميز": "bg-purple-50 text-promotions ring-purple-100",
  "عميل متكرر": "bg-cyan-50 text-customers ring-cyan-100",
  "عميل جديد": "bg-blue-50 text-blue-600 ring-blue-100",
  "خامل": "bg-slate-100 text-slate-500 ring-slate-200",
};

export function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <div className="card flex flex-col p-5 transition hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-customers/10 text-lg font-bold text-customers">
            {customer.name.charAt(0)}
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{customer.name}</h3>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="h-3 w-3" /> {customer.phone}
            </p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", SEGMENT_STYLE[customer.segment])}>
          {customer.segment}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="flex items-center gap-1 text-xs text-slate-500"><ShoppingBag className="h-3 w-3" /> الطلبات</p>
          <p className="mt-0.5 font-bold text-slate-800">{customer.totalOrders}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="flex items-center gap-1 text-xs text-slate-500"><Star className="h-3 w-3" /> الإنفاق</p>
          <p className="mt-0.5 font-bold text-slate-800">{formatCurrency(customer.totalSpent)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-center justify-between">
          <span className="text-slate-500">الصنف المفضل</span>
          <span className="font-semibold text-slate-700">{customer.favoriteItem}</span>
        </p>
        <p className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-slate-500"><Clock className="h-3 w-3" /> آخر طلب</span>
          <span className="text-slate-600">{customer.lastOrder}</span>
        </p>
      </div>

      {customer.notes && (
        <p className="mt-3 rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-amber-700">{customer.notes}</p>
      )}
    </div>
  );
}
