"use client";

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { cn } from "@/lib/utils";
import { Receipt } from "lucide-react";

/** Sprint 10 — tax mode (default inclusive, no change) + rate + registration no. */
export function TaxSettingsCard() {
  const [taxMode, setTaxMode] = useState<"inclusive" | "added">("inclusive");
  const [taxRate, setTaxRate] = useState(0);
  const [taxRegNo, setTaxRegNo] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/tax")
      .then((r) => r.json())
      .then((d) => {
        if (d.taxMode) setTaxMode(d.taxMode);
        if (typeof d.taxRate === "number") setTaxRate(d.taxRate);
        if (typeof d.taxRegNo === "string") setTaxRegNo(d.taxRegNo);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/settings/tax", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  return (
    <SettingsCard title="الضريبة" description="وضع ضريبة القيمة المضافة على الأسعار" icon={Receipt} accentBg="bg-settings">
      <div className="pt-1">
        <p className="mb-2 text-sm font-medium text-slate-700">طريقة الحساب</p>
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
          {([
            { v: "inclusive", label: "شاملة السعر" },
            { v: "added", label: "تُضاف للسعر" },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => {
                setTaxMode(o.v);
                void save({ taxMode: o.v });
              }}
              disabled={!loaded || saving}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
                taxMode === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {taxMode === "added" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              النسبة %
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                onBlur={() => save({ taxRate })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-settings"
              />
            </label>
            <label className="text-xs text-slate-500">
              الرقم الضريبي (اختياري)
              <input
                type="text"
                value={taxRegNo}
                onChange={(e) => setTaxRegNo(e.target.value)}
                onBlur={() => save({ taxRegNo })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-settings"
              />
            </label>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {taxMode === "inclusive" ? "السعر المعروض هو السعر النهائي — لا تُضاف ضريبة (الوضع الافتراضي)." : `تُضاف ${taxRate}% كبند ضريبة على المجموع، وتظهر في الإيصال.`}
        </p>
      </div>
    </SettingsCard>
  );
}
