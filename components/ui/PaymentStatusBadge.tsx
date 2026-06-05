import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/types";
import { CreditCard, CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";

const STYLES: Record<PaymentStatus, { cls: string; icon: typeof CreditCard }> = {
  "مدفوع": { cls: "bg-purple-50 text-purple-700 ring-purple-200", icon: CheckCircle2 },
  "بانتظار الدفع": { cls: "bg-amber-50 text-amber-700 ring-amber-200", icon: Clock },
  "غير مدفوع": { cls: "bg-slate-50 text-slate-600 ring-slate-200", icon: XCircle },
  "مسترجع": { cls: "bg-red-50 text-red-700 ring-red-200", icon: RotateCcw },
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const { cls, icon: Icon } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        cls,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}
