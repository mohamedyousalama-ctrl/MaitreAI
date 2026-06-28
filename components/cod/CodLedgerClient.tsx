"use client";

// ============================================================================
// MaitreAI — COD cash ledger (operator view) — Kivo-styled.
// Per-driver cash position (expected / collected / outstanding / unsettled) with
// a one-tap "settle" action, plus today's COD summary. All amounts come from the
// server (orders.total, tool-computed) — this view never authors a figure.
// Discrepancies (collected ≠ expected) are shown, never hidden.
// Styling uses the Kivo token system (var(--kv-*)); logic is unchanged.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, cn } from "@/lib/utils";
import { useRole } from "@/lib/use-role";
import { useCodStore } from "@/lib/cod-store";
import { runAction } from "@/lib/console-toast";
import { Wallet, HandCoins, AlertTriangle, Banknote, ChevronDown, Loader2 } from "lucide-react";

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
interface HeldOrderItem {
  driverId: string | null;
  orderId: string;
  orderNumber: string | null;
  expected: number;
  collected: number;
  status: string | null;
  collectedAt: string | null;
  customer: string | null;
}
interface SettlementRow {
  id: string;
  driverName: string | null;
  totalAmount: number;
  orderCount: number;
  settledByRole: string | null;
  note: string | null;
  createdAt: string;
}
const ROLE_AR: Record<string, string> = { manager: "مدير", operation: "موظف" };

// Order-status labels (Arabic) for the itemized rows.
const ORDER_STATUS_AR: Record<string, string> = {
  pending_confirmation: "جديد",
  pending_payment: "بانتظار الدفع",
  paid: "مؤكد",
  preparing: "بيتجهّز",
  ready: "جاهز",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};
function timeAr(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  } catch {
    return "—";
  }
}

export function CodLedgerClient() {
  const isManager = useRole() === "manager";
  // LIVE0 L3 — read the ledger from the SHARED COD store (DB-backed + realtime), so
  // a settle by another manager reflects here live. `load` re-pulls the store.
  const drivers = useCodStore((s) => s.drivers) as DriverLedgerRow[];
  const summary = useCodStore((s) => s.summary) as Summary | null;
  const items = useCodStore((s) => s.items) as HeldOrderItem[];
  const settlements = useCodStore((s) => s.settlements) as SettlementRow[];
  const loaded = useCodStore((s) => s.loaded);
  const load = useCodStore((s) => s.reload);
  const loading = !loaded;
  const [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  // R6 — driver pending settlement confirmation (dialog open when non-null).
  const [confirmDriver, setConfirmDriver] = useState<DriverLedgerRow | null>(null);

  // R6 — settle only AFTER the manager confirms in the dialog. Feedback flows
  // through the R1 primitive: pending → success/failed(+retry). NO optimistic
  // settle — the ledger refreshes (and the history row appears) only when the
  // server confirms; on failure the driver stays unsettled.
  const doSettle = async (driverId: string) => {
    setSettling(driverId);
    await runAction(
      { pending: "جارٍ التسوية…", success: "تمت التسوية", error: "تعذّرت التسوية", retry: true },
      async () => {
        const res = await fetch("/api/cod/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId }),
        });
        if (res.ok) await load(); // refresh ONLY on confirmed success
        return res; // runAction reads res.ok for the real result
      }
    );
    setSettling(null);
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
          {drivers.map((d) => {
            const key = d.driverId ?? "unassigned";
            const isOpen = expanded === key;
            const driverItems = items.filter((it) => (it.driverId ?? "unassigned") === key);
            return (
            <div key={key} className="flex flex-col rounded-[16px] border p-4" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold" style={{ color: "var(--kv-text)" }}>{d.driverName}</h3>
                {/* count badge → toggles the itemized order breakdown (read-only) */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition"
                  style={{ background: "var(--kv-primary-tint)", color: "var(--kv-deep)" }}
                >
                  {d.unsettledCount} طلب
                  <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
                </button>
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

              {/* Itemized per-order breakdown (read-only). Expand-in-place; the
                  rows are the same held collections that sum to the aggregate above. */}
              {isOpen && (
                <div className="mt-3 flex flex-col gap-1.5 rounded-[12px] border p-2" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)" }}>
                  {driverItems.length === 0 ? (
                    <p className="px-1 py-2 text-center text-xs" style={{ color: "var(--kv-muted)" }}>لا تفاصيل متاحة.</p>
                  ) : (
                    driverItems.map((it) => (
                      <OrderCashRow key={`${it.orderId}:${it.collected}`} it={it} canEdit={isManager} onSaved={load} />
                    ))
                  )}
                </div>
              )}

              <button
                onClick={() => setConfirmDriver(d)}
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
            );
          })}
        </div>
      )}

      {/* Settlement history (read-only) — past hand-ins from cod_settlements.
          Collapsed by default so it doesn't clutter the active ledger. */}
      <div className="mt-6 rounded-[16px] border" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card)", boxShadow: "var(--kv-shadow-panel)" }}>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="flex w-full items-center justify-between p-4 text-right"
        >
          <span className="text-sm font-bold" style={{ color: "var(--kv-text)" }}>
            سجل التسويات {settlements.length > 0 && <span style={{ color: "var(--kv-muted)", fontWeight: 600 }}>({settlements.length})</span>}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--kv-muted)", transform: showHistory ? "rotate(180deg)" : "none" }} />
        </button>
        {showHistory && (
          <div className="border-t px-4 pb-4 pt-2" style={{ borderColor: "var(--kv-border)" }}>
            {settlements.length === 0 ? (
              <p className="py-4 text-center text-xs" style={{ color: "var(--kv-muted)" }}>لا توجد تسويات سابقة بعد.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {settlements.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-[10px] p-2.5" style={{ background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)" }}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold" style={{ color: "var(--kv-text)" }}>{s.driverName ?? "غير معيّن"}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--kv-muted)" }}>
                        {timeAr(s.createdAt)} · {s.settledByRole ? (ROLE_AR[s.settledByRole] ?? s.settledByRole) : "—"}
                        {s.note ? ` · ${s.note}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end">
                      <span className="text-sm font-bold" style={{ color: "var(--kv-deep)" }}>{formatCurrency(s.totalAmount)}</span>
                      <span className="text-[10px]" style={{ color: "var(--kv-muted)" }}>{s.orderCount} طلب</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* R6 — confirm-before-settle dialog (manager reviews amounts/discrepancy). */}
      {confirmDriver && (
        <SettleConfirmDialog
          driver={confirmDriver}
          onCancel={() => setConfirmDriver(null)}
          onConfirm={() => {
            const id = confirmDriver.driverId;
            setConfirmDriver(null);
            if (id) void doSettle(id);
          }}
        />
      )}
    </div>
  );
}

// R6 — settlement confirmation dialog. Accessible: role="dialog" + aria-modal,
// confirm button focused on open, Escape/overlay-click closes (Audit-14 basics).
// Displays ONLY already-computed values (driverLedger) — no money is recomputed.
function SettleConfirmDialog({
  driver,
  onConfirm,
  onCancel,
}: {
  driver: DriverLedgerRow;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const disc = driver.discrepancy;
  const hasDisc = Math.abs(disc) > 0.001;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0" style={{ background: "rgba(13,52,38,.45)" }} onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-dialog-title"
        className="relative w-full max-w-sm rounded-[16px] p-5"
        style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)" }}
      >
        <h2 id="settle-dialog-title" className="text-base font-bold" style={{ color: "var(--kv-text)" }}>
          تأكيد تسوية النقدية
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--kv-muted)" }}>
          راجِع المبالغ قبل تأكيد استلام الكاش من المندوب.
        </p>
        <div className="mt-4 flex flex-col gap-2 rounded-[12px] border p-3" style={{ borderColor: "var(--kv-border)", background: "var(--kv-card-soft)" }}>
          <DialogRow label="المندوب" value={driver.driverName} />
          <DialogRow label="عدد الطلبات" value={String(driver.unsettledCount)} />
          <DialogRow label="المتوقع" value={formatCurrency(driver.expected)} />
          <DialogRow label="المُحصّل" value={formatCurrency(driver.collected)} />
          {hasDisc && (
            <DialogRow label={disc < 0 ? "عجز" : "زيادة"} value={formatCurrency(disc)} valueColor={disc < 0 ? "#c0492f" : "#0a8a5f"} />
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "var(--kv-grad-brand)", boxShadow: "0 8px 18px -8px rgba(14,159,110,.6)" }}
          >
            تأكيد التسوية
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: "var(--kv-border)", color: "var(--kv-muted)" }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--kv-muted)" }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: valueColor ?? "var(--kv-text)" }}>{value}</span>
    </div>
  );
}

// One held-order row in the itemized breakdown. Read-only for everyone; managers
// additionally get an "actual cash collected" input that records the real amount
// via the EXISTING /api/cod/collect (recordCollection) — expected_cash is never
// sent or editable; the server is the authoritative manager gate.
function OrderCashRow({ it, canEdit, onSaved }: { it: HeldOrderItem; canEdit: boolean; onSaved: () => Promise<void> | void }) {
  const [val, setVal] = useState(String(it.collected));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  const parsed = Number(val);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  const changed = valid && Math.abs(parsed - it.collected) > 0.001;
  // Discrepancy previewed against the entered value (falls back to stored).
  const disc = (valid ? parsed : it.collected) - it.expected;
  const hasDisc = Math.abs(disc) > 0.001;

  async function save() {
    if (!canEdit || !valid || !changed || saving) return;
    setSaving(true);
    setErr(false);
    try {
      const r = await fetch("/api/cod/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: it.orderId, cashCollected: parsed }),
      });
      if (r.ok) await onSaved();
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[9px] p-2" style={{ background: "var(--kv-card)", border: "1px solid var(--kv-border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "var(--kv-text)" }}>طلب {it.orderNumber ?? "—"}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--kv-primary-tint)", color: "var(--kv-deep)" }}>
          {it.status ? (ORDER_STATUS_AR[it.status] ?? it.status) : "—"}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: "var(--kv-muted)" }}>
        <span>{it.customer ?? "عميل"}</span>
        <span>{timeAr(it.collectedAt)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span style={{ color: "var(--kv-muted)" }}>متوقع {formatCurrency(it.expected)}</span>
        {!canEdit && <span className="font-semibold" style={{ color: "var(--kv-text)" }}>مُحصّل {formatCurrency(it.collected)}</span>}
      </div>

      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[11px] font-semibold" style={{ color: "var(--kv-muted)" }}>النقدية الفعلية</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-24 rounded-lg px-2 py-1 text-xs"
            style={{ border: "1px solid var(--kv-border)", background: "var(--kv-card-soft)", color: "var(--kv-text)" }}
          />
          <button
            type="button"
            onClick={save}
            disabled={!valid || !changed || saving}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-50"
            style={{ background: "var(--kv-grad-brand)" }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            حفظ
          </button>
        </div>
      )}

      {/* discrepancy — short (عجز) / over (زيادة), always visible when nonzero */}
      {hasDisc && (
        <div className="mt-1.5 flex items-center justify-between rounded-lg px-2 py-1 text-[10.5px] font-semibold" style={{ background: "rgba(216,151,43,.12)", color: "var(--kv-amber)", boxShadow: "inset 0 0 0 1px rgba(216,151,43,.3)" }}>
          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {disc < 0 ? "عجز" : "زيادة"}</span>
          <span>{formatCurrency(Math.abs(disc))}</span>
        </div>
      )}
      {err && <p className="mt-1 text-[10.5px] font-semibold" style={{ color: "var(--kv-red)" }}>تعذّر الحفظ — حاول تاني.</p>}
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
