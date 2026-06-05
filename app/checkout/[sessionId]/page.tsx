"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { usePaymentStore } from "@/lib/payment-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { PAYMENT_METHOD_LABELS, isSessionActive } from "@/lib/payments";
import { formatCurrency, cn } from "@/lib/utils";
import type { PaymentMethodKey } from "@/lib/types";
import {
  ShieldCheck,
  Bot,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from "lucide-react";

const METHODS: PaymentMethodKey[] = ["mada", "applepay", "card"];

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

export default function CheckoutPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const hydrated = useHasHydrated();

  const session = usePaymentStore((s) => s.sessions.find((x) => x.id === sessionId));
  const markOpened = usePaymentStore((s) => s.markOpened);
  const simulateSuccess = usePaymentStore((s) => s.simulateSuccess);
  const simulateFailure = usePaymentStore((s) => s.simulateFailure);
  const expireSession = usePaymentStore((s) => s.expireSession);
  const restaurantName = useRestaurantStore((s) => s.profile.name);

  const [method, setMethod] = useState<PaymentMethodKey>("mada");
  const [processing, setProcessing] = useState(false);
  const [remaining, setRemaining] = useState(0);

  // Mark the session opened once on load.
  useEffect(() => {
    if (hydrated && session && isSessionActive(session.status)) markOpened(session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sessionId]);

  // Live countdown; auto-expire when it hits zero.
  useEffect(() => {
    if (!session || !isSessionActive(session.status)) return;
    const tick = () => {
      const left = session.expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) expireSession(session.id);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session, expireSession]);

  if (!hydrated) {
    return <Centered><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></Centered>;
  }

  if (!session) {
    return (
      <Centered>
        <ResultCard
          icon={AlertTriangle}
          tone="amber"
          title="جلسة دفع غير موجودة"
          message="هذا الرابط غير صالح أو تم حذفه."
        />
      </Centered>
    );
  }

  const pay = () => {
    setProcessing(true);
    // Simulate a brief provider round-trip.
    setTimeout(() => simulateSuccess(session.id, method), 800);
  };
  const fail = () => {
    setProcessing(true);
    setTimeout(() => simulateFailure(session.id), 600);
  };

  // Resolved states
  if (session.status === "paid") {
    return (
      <Centered>
        <ResultCard
          icon={CheckCircle2}
          tone="emerald"
          title="تم الدفع بنجاح 🎉"
          message={`تم استلام مبلغ ${formatCurrency(session.amount)} لطلب #${session.orderNumber}. بدأ تجهيز طلبك.`}
        />
      </Centered>
    );
  }
  if (session.status === "failed") {
    return (
      <Centered>
        <ResultCard
          icon={XCircle}
          tone="red"
          title="فشلت عملية الدفع"
          message={`لم تكتمل عملية الدفع لطلب #${session.orderNumber}. يمكنك طلب رابط جديد من المحادثة.`}
        />
      </Centered>
    );
  }
  if (session.status === "expired" || session.status === "cancelled") {
    return (
      <Centered>
        <ResultCard
          icon={Clock}
          tone="amber"
          title="انتهت صلاحية الرابط"
          message={`انتهت صلاحية رابط الدفع لطلب #${session.orderNumber}. اطلب رابطاً جديداً من المحادثة.`}
        />
      </Centered>
    );
  }

  // Active checkout
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Brand header */}
        <div className="bg-gradient-to-l from-brain to-conversations px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold leading-none">MaitreAI</p>
                <p className="mt-0.5 text-xs text-white/80">دفع آمن</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> محمي
            </span>
          </div>
        </div>

        {/* Order summary */}
        <div className="space-y-3 px-6 py-5">
          <Row label="المطعم" value={restaurantName} />
          <Row label="رقم الطلب" value={`#${session.orderNumber}`} />
          <Row label="العميل" value={session.customerName} />
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">المبلغ المطلوب</span>
            <span className="text-2xl font-bold text-slate-900">{formatCurrency(session.amount)}</span>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-amber-600">
            <Clock className="h-3.5 w-3.5" /> ينتهي الرابط خلال {fmtCountdown(remaining)}
          </div>

          {/* Methods */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">اختر طريقة الدفع</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-xl border px-2 py-3 text-center text-xs font-semibold transition",
                    method === m ? "border-brain bg-brain/5 text-brain" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Demo card placeholder (no real fields) */}
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-400">
            بيئة تجريبية — لا تُدخل بيانات بطاقة حقيقية
          </div>

          {/* Actions */}
          <button
            onClick={pay}
            disabled={processing}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brain px-4 py-3.5 text-base font-bold text-white shadow-card transition hover:opacity-90 disabled:opacity-60"
          >
            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}
            {processing ? "جارٍ المعالجة..." : `ادفع الآن ${formatCurrency(session.amount)}`}
          </button>
          <button
            onClick={fail}
            disabled={processing}
            className="w-full rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            محاكاة فشل الدفع
          </button>

          <Link href="/conversations" className="flex items-center justify-center gap-1 pt-1 text-xs text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-3.5 w-3.5" /> العودة إلى التطبيق (عرض توضيحي)
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">{children}</div>;
}

const TONES: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-500",
  red: "bg-red-50 text-red-500",
  amber: "bg-amber-50 text-amber-500",
};

function ResultCard({
  icon: Icon,
  tone,
  title,
  message,
}: {
  icon: typeof CheckCircle2;
  tone: keyof typeof TONES;
  title: string;
  message: string;
}) {
  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
      <span className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-2xl", TONES[tone])}>
        <Icon className="h-8 w-8" />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      <Link
        href="/conversations"
        className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        <ArrowLeft className="h-4 w-4" /> العودة إلى التطبيق
      </Link>
    </div>
  );
}
