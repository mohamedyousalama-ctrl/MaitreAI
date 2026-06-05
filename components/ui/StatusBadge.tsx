import { cn } from "@/lib/utils";
import type { OrderStatus, ConversationStatus } from "@/lib/types";

// Maps each domain status to a tailwind color scheme.
const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  "جديد": "bg-blue-50 text-blue-700 ring-blue-200",
  "بانتظار الدفع": "bg-amber-50 text-amber-700 ring-amber-200",
  "مدفوع": "bg-purple-50 text-purple-700 ring-purple-200",
  "قيد التحضير": "bg-orange-50 text-orange-700 ring-orange-200",
  "جاهز": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "خرج للتوصيل": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "مكتمل": "bg-green-50 text-green-700 ring-green-200",
  "ملغي": "bg-red-50 text-red-700 ring-red-200",
};

const CONVERSATION_STATUS_STYLES: Record<ConversationStatus, string> = {
  "AI نشط": "bg-blue-50 text-blue-700 ring-blue-200",
  "بانتظار الدفع": "bg-amber-50 text-amber-700 ring-amber-200",
  "يحتاج تدخل موظف": "bg-red-50 text-red-700 ring-red-200",
  "تم التحويل لموظف": "bg-orange-50 text-orange-700 ring-orange-200",
  "طلب مكتمل": "bg-green-50 text-green-700 ring-green-200",
};

interface StatusBadgeProps {
  status: OrderStatus | ConversationStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style =
    (ORDER_STATUS_STYLES as Record<string, string>)[status] ??
    (CONVERSATION_STATUS_STYLES as Record<string, string>)[status] ??
    "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        style,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
