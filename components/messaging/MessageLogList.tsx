"use client";

import { cn } from "@/lib/utils";
import { CHANNEL_LABELS } from "@/lib/messaging/types";
import type { InboundLogEntry, OutboundLogEntry } from "@/lib/messaging/message-log-store";
import { ArrowDownLeft, ArrowUpRight, CreditCard } from "lucide-react";

const OUT_STATUS: Record<OutboundLogEntry["status"], { label: string; cls: string }> = {
  sent: { label: "تم الإرسال", cls: "bg-emerald-50 text-emerald-700" },
  simulated: { label: "محاكاة", cls: "bg-sky-50 text-sky-700" },
  skipped: { label: "وضع تجريبي", cls: "bg-amber-50 text-amber-700" },
  failed: { label: "فشل", cls: "bg-rose-50 text-rose-700" },
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? "ص" : "م";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${mer}`;
}

export function OutboundLogList({ entries }: { entries: OutboundLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">لا توجد رسائل صادرة بعد.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => {
        const st = OUT_STATUS[e.status];
        return (
          <li key={e.id} className="rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                {e.kind === "payment_link" ? (
                  <CreditCard className="h-3.5 w-3.5 text-promotions" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5 text-conversations" />
                )}
                {CHANNEL_LABELS[e.channel]} ← {e.to}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>
                {st.label}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{e.text}</p>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>{fmtTime(e.timestamp)}</span>
              {e.externalMessageId && <span dir="ltr">id: {e.externalMessageId}</span>}
            </div>
            {e.error && <p className="mt-1 text-[11px] text-rose-500">{e.error}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function InboundLogList({ entries }: { entries: InboundLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">لا توجد رسائل واردة بعد.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-xl border border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
              {CHANNEL_LABELS[e.channel]} → {e.customerName || e.from}
            </span>
            <span className="text-[11px] text-slate-400">{fmtTime(e.timestamp)}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{e.text}</p>
        </li>
      ))}
    </ul>
  );
}
