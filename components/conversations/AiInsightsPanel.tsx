"use client";

import { useState } from "react";
import Link from "next/link";
import type { Conversation, IntentHistoryEntry, LocalOrder, PaymentSession } from "@/lib/types";
import { INTENT_LABELS } from "@/lib/ai/engine";
import { AIConfidenceBadge } from "@/components/ui/AIConfidenceBadge";
import { OrderStatusBadge, OrderPaymentBadge } from "@/components/orders/OrderStatusBadges";
import { PAYMENT_SESSION_LABELS, PAYMENT_METHOD_LABELS, isSessionActive } from "@/lib/payments";
import { formatCurrency, formatOrderId, formatClock, cn } from "@/lib/utils";
import {
  Sparkles,
  Bot,
  User,
  Lightbulb,
  BookOpen,
  AlertTriangle,
  Tag,
  ShoppingBag,
  Code2,
  ChevronDown,
  CheckCircle2,
  Link2,
  CreditCard,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface AiInsightsPanelProps {
  conversation: Conversation;
  lastIntent?: IntentHistoryEntry;
  createdOrder?: LocalOrder;
  paymentSession?: PaymentSession;
  onConfirmOrder?: () => void;
  onSendPaymentLink?: () => void;
  onMarkPaid?: () => void;
}

export function AiInsightsPanel({
  conversation,
  lastIntent,
  createdOrder,
  paymentSession,
  onConfirmOrder,
  onSendPaymentLink,
  onMarkPaid,
}: AiInsightsPanelProps) {
  const [debugOpen, setDebugOpen] = useState(false);
  const isHuman = conversation.owner === "human";
  const intent = conversation.currentIntent;
  const entities = conversation.entities;
  const sources = lastIntent?.sourcesUsed ?? [];
  const draft = conversation.draftOrder;
  const draftTotal = draft?.items.reduce((sum, it) => sum + it.price * it.quantity, 0) ?? 0;

  const entityChips: { label: string; value: string }[] = [];
  if (entities) {
    entities.items.forEach((i) => entityChips.push({ label: "صنف", value: `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}` }));
    entities.modifiers.forEach((m) => entityChips.push({ label: "تعديل", value: m }));
    if (entities.branch) entityChips.push({ label: "فرع", value: entities.branch });
    if (entities.deliveryArea) entityChips.push({ label: "منطقة", value: entities.deliveryArea });
    entities.allergens.forEach((a) => entityChips.push({ label: "حساسية", value: a }));
  }

  return (
    <div className="rounded-2xl bg-white/70 p-4 shadow-glass ring-1 ring-[#ece0d2]/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#b5502e]">
          <Sparkles className="h-4 w-4" /> رؤى المساعد
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            isHuman ? "bg-[#fbefd9] text-[#9a6c1e]" : "bg-[#e7f3ec] text-[#3c7a52]"
          )}
        >
          {isHuman ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
          {isHuman ? "موظف بشري" : "ذكاء اصطناعي"}
        </span>
      </div>

      {/* Intent + confidence */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#faf6ef] p-3 ring-1 ring-[#ece0d2]/50">
          <p className="text-xs text-[#9b8b7c]">النية</p>
          <p className="mt-0.5 text-sm font-bold text-[#2a211b]">{intent ? INTENT_LABELS[intent] : "—"}</p>
        </div>
        <div className="rounded-xl bg-[#faf6ef] p-3 ring-1 ring-[#ece0d2]/50">
          <p className="text-xs text-[#9b8b7c]">الثقة</p>
          <div className="mt-1">
            {typeof conversation.aiConfidence === "number" ? (
              <AIConfidenceBadge value={conversation.aiConfidence} />
            ) : (
              <span className="text-sm text-[#b9a892]">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Suggested action */}
      {conversation.suggestedAction && (
        <div className="mt-2 rounded-xl border border-purple-100 bg-purple-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-promotions">
            <Lightbulb className="h-3.5 w-3.5" /> الإجراء المقترح
          </div>
          <p className="mt-1 text-sm text-slate-700">{conversation.suggestedAction}</p>
        </div>
      )}

      {/* Escalation reason */}
      {conversation.escalationReason && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/60 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div>
            <p className="text-xs font-bold text-red-600">سبب التصعيد</p>
            <p className="mt-0.5 text-sm text-slate-700">{conversation.escalationReason}</p>
          </div>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <BookOpen className="h-3.5 w-3.5" /> المصادر المستخدمة
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entities */}
      {entityChips.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Tag className="h-3.5 w-3.5" /> الكيانات المكتشفة
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entityChips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                <span className="text-[10px] text-slate-400">{c.label}</span>
                {c.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Draft order preview */}
      {draft && draft.items.length > 0 && (
        <div className="mt-3 rounded-xl border border-orders/20 bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-orders">
            <ShoppingBag className="h-3.5 w-3.5" /> مسودة الطلب
          </div>
          <ul className="mt-2 space-y-1">
            {draft.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between text-sm">
                <div>
                  <span className="text-slate-700">
                    {it.name} <span className="text-slate-400">×{it.quantity}</span>
                  </span>
                  {it.modifiers.length > 0 && <p className="text-xs text-slate-400">{it.modifiers.join("، ")}</p>}
                </div>
                <span className="text-slate-600">{formatCurrency(it.price * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs font-semibold text-slate-600">الإجمالي التقديري</span>
            <span className="text-sm font-bold text-slate-900">{formatCurrency(draftTotal)}</span>
          </div>
          {onConfirmOrder && (
            <button
              onClick={onConfirmOrder}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-orders px-3 py-2.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" /> تأكيد الطلب
            </button>
          )}
          <p className="mt-1.5 text-[10px] text-slate-400">* مسودة مبدئية — يتم إنشاء طلب فعلي عند التأكيد.</p>
        </div>
      )}

      {/* Created order + payment placeholder */}
      {createdOrder && (
        <div className="mt-3 rounded-xl border border-orders/20 bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-orders">
              <ShoppingBag className="h-3.5 w-3.5" /> الطلب {formatOrderId(createdOrder.orderNumber)}
            </div>
            <OrderStatusBadge status={createdOrder.orderStatus} className="scale-90 origin-left" />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <OrderPaymentBadge status={createdOrder.paymentStatus} className="scale-90 origin-right" />
            <span className="font-bold text-slate-900">{formatCurrency(createdOrder.total)}</span>
          </div>

          {/* Payment session state */}
          {createdOrder.paymentStatus === "paid" ? (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> تم الدفع
              </span>
              <span className="text-xs text-emerald-600">
                {paymentSession?.method ? PAYMENT_METHOD_LABELS[paymentSession.method] : "دفع"}
                {paymentSession?.paidAt ? ` · ${formatClock(paymentSession.paidAt)}` : ""}
              </span>
            </div>
          ) : createdOrder.orderStatus !== "cancelled" ? (
            <div className="mt-3 flex flex-col gap-2">
              {paymentSession && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">حالة جلسة الدفع</span>
                  <span className="font-semibold text-slate-700">{PAYMENT_SESSION_LABELS[paymentSession.status]}</span>
                </div>
              )}

              {paymentSession && isSessionActive(paymentSession.status) && (
                <Link
                  href={`/checkout/${paymentSession.id}`}
                  target="_blank"
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-brain/30 bg-brain/5 px-3 py-2 text-sm font-semibold text-brain hover:bg-brain/10"
                >
                  <ExternalLink className="h-4 w-4" /> فتح صفحة الدفع
                </Link>
              )}

              {onSendPaymentLink && (
                <button
                  onClick={onSendPaymentLink}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-promotions px-3 py-2 text-sm font-semibold text-white shadow-card hover:opacity-90"
                >
                  {paymentSession && !isSessionActive(paymentSession.status) ? (
                    <>
                      <RefreshCw className="h-4 w-4" /> إعادة إرسال رابط الدفع
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" /> إرسال رابط الدفع
                    </>
                  )}
                </button>
              )}

              {onMarkPaid && (
                <button
                  onClick={onMarkPaid}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  <CreditCard className="h-3.5 w-3.5" /> تأكيد الدفع يدوياً (إداري)
                </button>
              )}
            </div>
          ) : null}
          <p className="mt-1.5 text-[10px] text-slate-400">* دفع تجريبي محلي — لا يوجد مزود دفع فعلي.</p>
        </div>
      )}

      {/* AI debug */}
      {lastIntent && (
        <div className="mt-3">
          <button
            onClick={() => setDebugOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5" /> AI Debug
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", debugOpen && "rotate-180")} />
          </button>
          {debugOpen && (
            <pre dir="ltr" className="mt-1 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-300">
              {JSON.stringify(
                {
                  intent: lastIntent.detectedIntent,
                  confidence: lastIntent.confidence,
                  entities: {
                    items: lastIntent.entities.items,
                    modifiers: lastIntent.entities.modifiers,
                    branch: lastIntent.entities.branch,
                    deliveryArea: lastIntent.entities.deliveryArea,
                    allergens: lastIntent.entities.allergens,
                  },
                  sources: lastIntent.sourcesUsed,
                  suggestedAction: lastIntent.suggestedAction,
                },
                null,
                2
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
