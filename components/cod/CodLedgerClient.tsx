"use client";

// ============================================================================
// MaitreAI — COD cash ledger (operator view) — Kivo-styled.
// Per-driver cash position (expected / collected / outstanding / unsettled) with
// a one-tap "settle" action, plus today's COD summary. All amounts come from the
// server (orders.total, tool-computed) — this view never authors a figure.
// Discrepancies (collected ≠ expected) are shown, never hidden.
// Styling uses the Kivo token system (var(--kv-*)); logic is unchanged.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
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
    <div dir="rtl" style={{ maxWidth: 1320, margin: "0 auto", color: "var(--kv-text)" }}>
      {/* header (inline Kivo — replaces the terracotta PageHeader) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 99, background: "var(--kv-primary-tint)", color: "var(--kv-deep)", fontSize: 11, fontWeight: 800 }}>
          <Wallet size={13} /> دفتر النقدية · الدفع عند الاستلام
        </span>
        <div style={{ width: "100%" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 0" }}>الكاش والتحصيل</h1>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--kv-muted)", marginTop: 4 }}>المتوقع مقابل المُحصّل لكل سائق — ومن لم يُسلّم بعد</p>
        </div>
      </div>

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
            <div key={i} className="h-40 animate-pulse rounded-[16px] border" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)" }} />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <div className="rounded-[16px] border" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
          <EmptyState
            title="لا توجد نقدية غير مُسلّمة"
            description="عندما يُحصّل سائق مبلغ دفع عند الاستلام، يظهر هنا حتى يُسلّمه."
            icon={Wallet}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drivers.map((d) => (
            <div key={d.driverId ?? "unassigned"} className="flex flex-col rounded-[16px] border p-4" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold" style={{ color: "var(--kv-text)" }}>{d.driverName}</h3>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--kv-primary-tint)", color: "var(--kv-deep)" }}>
                  {d.unsettledCount} طلب
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="المتوقع" value={formatCurrency(d.expected)} />
                <Row label="المُحصّل" value={formatCurrency(d.collected)} />
                <Row label="المعلّق (نقدية لديه)" value={formatCurrency(d.outstanding)} strong />
                {Math.abs(d.discrepancy) > 0.001 && (
                  <div className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: "rgba(216,151,43,.12)", color: "var(--kv-amber)", boxShadow: "inset 0 0 0 1px rgba(216,151,43,.3)" }}>
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
                  "mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition",
                  (!d.driverId || settling === d.driverId) && "opacity-60"
                )}
                style={{ background: "var(--kv-grad-brand)", boxShadow: "0 8px 18px -8px rgba(14,159,110,.6)" }}
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
    <div className="flex items-center gap-3 rounded-[16px] border p-4" style={{ borderColor: highlight ? "rgba(14,159,110,.3)" : "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--kv-primary-tint)", color: "var(--kv-primary)" }}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs" style={{ color: "var(--kv-muted)" }}>{label}</p>
        <p className="text-lg font-bold" style={{ color: "var(--kv-text)" }}>{value}</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: "var(--kv-muted)" }}>{label}</dt>
      <dd className="tabular-nums" style={{ color: "var(--kv-text)", fontWeight: strong ? 700 : 400 }}>{value}</dd>
    </div>
  );
}
