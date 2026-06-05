import type { Conversation, Customer, IntentHistoryEntry, LocalOrder } from "@/lib/types";
import { AiInsightsPanel } from "./AiInsightsPanel";
import { formatCurrency } from "@/lib/utils";
import { Phone, Star, Store, User } from "lucide-react";

interface CustomerContextPanelProps {
  conversation: Conversation;
  customer?: Customer;
  lastIntent?: IntentHistoryEntry;
  createdOrder?: LocalOrder;
  onConfirmOrder?: () => void;
  onSendPaymentLink?: () => void;
  onMarkPaid?: () => void;
}

export function CustomerContextPanel({
  conversation,
  customer,
  lastIntent,
  createdOrder,
  onConfirmOrder,
  onSendPaymentLink,
  onMarkPaid,
}: CustomerContextPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* Customer profile */}
      <div className="flex flex-col items-center text-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white"
          style={{ backgroundColor: conversation.avatarColor }}
        >
          {conversation.customer.charAt(0)}
        </span>
        <h3 className="mt-3 text-lg font-bold text-slate-900">{conversation.customer}</h3>
        <p className="flex items-center gap-1 text-sm text-slate-500">
          <Phone className="h-3.5 w-3.5" /> {conversation.phone}
        </p>
        {customer && (
          <span className="mt-2 rounded-full bg-customers/10 px-3 py-1 text-xs font-semibold text-customers">
            {customer.segment}
          </span>
        )}
      </div>

      {/* AI insights + order/payment controls */}
      <div className="mt-4">
        <AiInsightsPanel
          conversation={conversation}
          lastIntent={lastIntent}
          createdOrder={createdOrder}
          onConfirmOrder={onConfirmOrder}
          onSendPaymentLink={onSendPaymentLink}
          onMarkPaid={onMarkPaid}
        />
      </div>

      {/* Customer stats */}
      {customer && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat icon={User} label="إجمالي الطلبات" value={String(customer.totalOrders)} />
          <Stat icon={Star} label="إجمالي الإنفاق" value={formatCurrency(customer.totalSpent)} />
          <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">الصنف المفضل</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{customer.favoriteItem}</p>
          </div>
        </div>
      )}

      {/* Branch */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-sm">
        <Store className="h-4 w-4 text-branches" />
        <span className="text-slate-600">{conversation.branch}</span>
      </div>

      {/* Notes */}
      {customer?.notes && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <p className="text-xs font-bold text-amber-700">ملاحظات العميل</p>
          <p className="mt-1 text-sm text-slate-700">{customer.notes}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="mt-1 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}
