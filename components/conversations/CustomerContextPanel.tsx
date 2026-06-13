import type { Conversation, Customer, IntentHistoryEntry, LocalOrder, PaymentSession } from "@/lib/types";
import { AiInsightsPanel } from "./AiInsightsPanel";
import { ConversationStatusChip } from "./ConversationStatusChip";
import { formatCurrency } from "@/lib/utils";
import { Phone, Star, Store, User, AlertTriangle } from "lucide-react";

interface CustomerContextPanelProps {
  conversation: Conversation;
  customer?: Customer;
  lastIntent?: IntentHistoryEntry;
  createdOrder?: LocalOrder;
  paymentSession?: PaymentSession;
  onConfirmOrder?: () => void;
  onSendPaymentLink?: () => void;
  onMarkPaid?: () => void;
}

export function CustomerContextPanel({
  conversation,
  customer,
  lastIntent,
  createdOrder,
  paymentSession,
  onConfirmOrder,
  onSendPaymentLink,
  onMarkPaid,
}: CustomerContextPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-white/55 p-4 backdrop-blur-xl">
      {/* Customer profile */}
      <div className="flex flex-col items-center rounded-2xl bg-white/70 p-4 text-center shadow-glass ring-1 ring-[#ece0d2]/60">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
          style={{ backgroundColor: conversation.avatarColor }}
        >
          {conversation.customer.charAt(0)}
        </span>
        <h3 className="mt-3 text-lg font-bold text-[#2a211b]">{conversation.customer}</h3>
        <p dir="ltr" className="flex items-center gap-1 text-sm text-[#9b8b7c]">
          <Phone className="h-3.5 w-3.5" /> {conversation.phone}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <ConversationStatusChip conversation={conversation} />
          {customer && (
            <span className="rounded-full bg-[#eef7f1] px-3 py-0.5 text-[11px] font-semibold text-[#3c7a52]">{customer.segment}</span>
          )}
        </div>
      </div>

      {/* Escalation reason — surfaced for the operator (truth-driven). */}
      {conversation.escalationReason && (
        <div className="flex items-start gap-2 rounded-2xl bg-[#fbeae5]/70 p-3 text-[#a8432a] ring-1 ring-[#eccabd]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-xs font-bold">سبب التصعيد</p>
            <p className="mt-0.5 text-sm">{conversation.escalationReason}</p>
          </div>
        </div>
      )}

      {/* AI insights + order/payment controls */}
      <AiInsightsPanel
        conversation={conversation}
        lastIntent={lastIntent}
        createdOrder={createdOrder}
        paymentSession={paymentSession}
        onConfirmOrder={onConfirmOrder}
        onSendPaymentLink={onSendPaymentLink}
        onMarkPaid={onMarkPaid}
      />

      {/* Customer stats */}
      {customer && (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={User} label="إجمالي الطلبات" value={String(customer.totalOrders)} />
          <Stat icon={Star} label="إجمالي الإنفاق" value={formatCurrency(customer.totalSpent)} />
          <div className="col-span-2 rounded-xl bg-white/70 p-3 ring-1 ring-[#ece0d2]/60">
            <p className="text-xs text-[#9b8b7c]">الصنف المفضل</p>
            <p className="mt-0.5 text-sm font-semibold text-[#2a211b]">{customer.favoriteItem}</p>
          </div>
        </div>
      )}

      {/* Branch */}
      {conversation.branch && (
        <div className="flex items-center gap-2 rounded-xl bg-white/70 p-3 text-sm ring-1 ring-[#ece0d2]/60">
          <Store className="h-4 w-4 text-[#b5502e]" />
          <span className="text-[#6a5c4e]">{conversation.branch}</span>
        </div>
      )}

      {/* Notes */}
      {customer?.notes && (
        <div className="rounded-xl bg-[#fbefd9]/60 p-3 ring-1 ring-[#ecd9b0]">
          <p className="text-xs font-bold text-[#9a6c1e]">ملاحظات العميل</p>
          <p className="mt-1 text-sm text-[#5a4a3a]">{customer.notes}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-[#ece0d2]/60">
      <Icon className="h-4 w-4 text-[#c2a98f]" />
      <p className="mt-1 text-xs text-[#9b8b7c]">{label}</p>
      <p className="text-sm font-bold text-[#2a211b]">{value}</p>
    </div>
  );
}
