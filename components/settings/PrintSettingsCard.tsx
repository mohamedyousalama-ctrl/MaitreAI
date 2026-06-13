"use client";

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";

type Width = "58mm" | "80mm" | "standard";
const WIDTH_OPTS: { value: Width; label: string }[] = [
  { value: "standard", label: "قياسي" },
  { value: "80mm", label: "حراري 80مم" },
  { value: "58mm", label: "حراري 58مم" },
];

/** §O #5 / A3 — per-tenant auto-print + paper-width (default auto-print OFF). */
export function PrintSettingsCard() {
  const [autoPrint, setAutoPrint] = useState(false);
  const [printWidth, setPrintWidth] = useState<Width>("standard");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/print")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.autoPrint === "boolean") setAutoPrint(d.autoPrint);
        if (d.printWidth) setPrintWidth(d.printWidth as Width);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(patch: { autoPrint?: boolean; printWidth?: Width }) {
    setSaving(true);
    try {
      await fetch("/api/settings/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      /* ignore — non-manager / offline */
    }
    setSaving(false);
  }

  return (
    <SettingsCard title="الطباعة" description="طباعة الإيصال وتذكرة المطبخ على طابعتك" icon={Printer} accentBg="bg-orders">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <p className="text-sm font-medium text-slate-700">الطباعة التلقائية للطلبات الجديدة</p>
          <p className="text-xs text-slate-400">يفتح تذكرة المطبخ تلقائياً عند وصول طلب جديد</p>
        </div>
        <button
          onClick={() => {
            const v = !autoPrint;
            setAutoPrint(v);
            void save({ autoPrint: v });
          }}
          disabled={!loaded || saving}
          aria-pressed={autoPrint}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", autoPrint ? "bg-[#3c7a52]" : "bg-slate-200")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", autoPrint ? "start-0.5" : "start-[22px]")} />
        </button>
      </div>
      <div className="pt-1">
        <p className="mb-2 text-sm font-medium text-slate-700">حجم ورق الطابعة</p>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
          {WIDTH_OPTS.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                setPrintWidth(o.value);
                void save({ printWidth: o.value });
              }}
              disabled={!loaded || saving}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                printWidth === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          يدعم الطابعات الحرارية (58/80مم) والعادية — الطباعة عبر متصفح الجهاز/مشاركة الهاتف، بدون تعريف خاص.
        </p>
      </div>
    </SettingsCard>
  );
}
