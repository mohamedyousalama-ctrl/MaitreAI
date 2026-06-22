"use client";

// ============================================================================
// MaitreAI — COD cash ledger (operator view).
// Per-driver cash position (expected / collected / outstanding / unsettled) with
// a one-tap "settle" action, plus today's COD summary. All amounts come from the
// server (orders.total, tool-computed) — this view never authors a figure.
// Discrepancies (collected ≠ expected) are shown, never hidden.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, cn } from "@/lib/utils";
import { Wallet, HandCoins, AlertTriangle, Banknote } from "lucide-react";

interface DriverLedgerRow {
  driverId: string | null;
  driverName: string;
  expected: number;
  collected: number;
  outstanding: number;
  discrepancy: number;
  unsettledCount: number;
}
interface Summary {
  date: string;
  expectedToday: number;
  collectedToday: number;
  outstanding: number;
  driversWithUnsettled: number;
}

export function CodLedgerClient() {
  const [drivers, setDrivers] = useState<DriverLedgerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cod/ledger");
      if (res.ok) {
        const j = await res.json();
        setDrivers(j.drivers ?? []);
        setSummary(j.summary ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const settle = async (driverId: string | null) => {
    if (!driverId) return;
    setSettling(driverId);
    try {
      const res = await fetch("/api/cod/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      if (res.ok) await load();
    } finally {
      setSettling(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="دفتر النقدية (الدفع عند الاستلام)"
        subtitle="المتوقع مقابل المُحصّل لكل سائق — ومن لم يُسلّم بعد"
        icon={Wallet}
        accentBg="bg-orders"
      />

      {/* Today's summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="متوقع اليوم" value={summary ? formatCurrency(summary.expectedToday) : "—"} icon={Banknote} />
        <SummaryCard label="مُحصّل اليوم" value={summary ? formatCurrency(summary.collectedToday) : "—"} icon={HandCoins} />
        <SummaryCard label="نقدية لدى السائقين" value={summary ? formatCurrency(summary.outstanding) : "—"} icon={Wallet} highlight />
        <SummaryCard label="سائقون لم يُسلّموا" value={summary ? String(summary.driversWithUnsettled) : "—"} icon={AlertTriangle} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-40 animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="card">
          <EmptyState
            title="لا توجد نقدية غير مُسلّمة"
            description="عندما يُحصّل سائق مبلغ دفع عند الاستلام، يظهر هنا حتى يُسلّمه."
            icon={Wallet}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drivers.map((d) => (
            <div key={d.driverId ?? "unassigned"} className="card flex flex-col p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">{d.driverName}</h3>
                <span className="rounded-full bg-orders/10 px-2 py-0.5 text-xs font-semibold text-orders">
                  {d.unsettledCount} طلب
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="المتوقع" value={formatCurrency(d.expected)} />
                <Row label="المُحصّل" value={formatCurrency(d.collected)} />
                <Row label="المعلّق (نقدية لديه)" value={formatCurrency(d.outstanding)} strong />
                {Math.abs(d.discrepancy) > 0.001 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-amber-100">
                    <span className="flex items-center gap-1 text-xs font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {d.discrepancy < 0 ? "عجز" : "زيادة"}
                    </span>
                    <span className="text-xs font-bold">{formatCurrency(d.discrepancy)}</span>
                  </div>
                )}
              </dl>

              <button
                onClick={() => settle(d.driverId)}
                disabled={!d.driverId || settling === d.driverId}
                className={cn(
                  "mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-orders px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90",
                  (!d.driverId || settling === d.driverId) && "opacity-60"
                )}
              >
                <HandCoins className="h-4 w-4" />
                {settling === d.driverId ? "جارٍ التسوية…" : "تسوية النقدية (تم التسليم)"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, highlight }: { label: string; value: string; icon: typeof Wallet; highlight?: boolean }) {
  return (
    <div className={cn("card flex items-center gap-3 p-4", highlight && "ring-1 ring-orders/30")}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orders/10 text-orders">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "font-bold text-slate-900" : "text-slate-700")}>{value}</dd>
    </div>
  );
}
