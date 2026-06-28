"use client";

// ============================================================================
// UI2 — تقفيل وردية (COD end-of-shift close). Manager-only (route is RoleGuard-
// gated; every mutation is also manager-gated server-side). Per-driver cash
// reconciliation from /api/cod/ledger (expected / collected / outstanding /
// discrepancy / count, ≠0 flagged) + a "settle all" action (POST /api/cod/
// settle-all) + a printable settlement slip per settled batch
// (/api/cod/settlement/[id]/image). All figures are the SERVER ledger's — never
// recomputed client-side.
// ============================================================================

import { useState } from "react";
import { Calculator, Printer } from "lucide-react";
import { runActionOutcome } from "@/lib/console-toast";
import { useRiseIn } from "@/components/kivo";
import { useCodStore } from "@/lib/cod-store";

interface DriverRow { driverId: string | null; driverName: string; expected: number; collected: number; outstanding: number; discrepancy: number; unsettledCount: number }
interface SettlementRow { id: string; driverName: string | null; totalAmount: number; orderCount: number; note: string | null; createdAt: string }

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);
const money = (n: number) => `${toAr(Math.round(Number(n || 0)).toLocaleString("en-US")).replace(/,/g, "٬")} ج.م`;
const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "—" : `${toAr(d.getFullYear())}/${toAr(String(d.getMonth() + 1).padStart(2, "0"))}/${toAr(String(d.getDate()).padStart(2, "0"))}`; };

export function CloseShiftClient() {
  // LIVE0 L3 — read from the SHARED COD store (DB-backed + realtime) so a settle by
  // another manager reflects here live; `load` re-pulls the store.
  const drivers = useCodStore((s) => s.drivers) as DriverRow[];
  const settlements = useCodStore((s) => s.settlements) as SettlementRow[];
  const loaded = useCodStore((s) => s.loaded);
  const load = useCodStore((s) => s.reload);
  const [busy, setBusy] = useState(false);
  const head = useRiseIn(0);
  const body = useRiseIn(1);

  const settleable = drivers.filter((d) => d.driverId && d.outstanding > 0);
  const shiftTotal = drivers.reduce((s, d) => s + d.outstanding, 0);
  const settleableTotal = settleable.reduce((s, d) => s + d.outstanding, 0);

  const settleAll = () => {
    if (!settleable.length) return;
    if (!window.confirm(`تأكيد تقفيل الوردية: تسوية ${toAr(settleable.length)} مندوب بإجمالي ${money(settleableTotal)}؟`)) return;
    setBusy(true);
    void runActionOutcome("جارٍ تقفيل الوردية…", async () => {
      const res = await fetch("/api/cod/settle-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setBusy(false);
      if (res.ok) {
        await load();
        const n = Number(data.settledCount ?? 0);
        const t = Number(data.total ?? 0);
        if (n === 0) return { state: "info", message: "مفيش كاش معلّق للتسوية" };
        return { state: "success", message: `تم تقفيل ${toAr(n)} مندوب · ${money(t)}` };
      }
      if (res.status === 403) return { state: "failed", message: "للمدير فقط" };
      return { state: "failed", message: "تعذّر تقفيل الوردية" };
    });
  };

  const discColor = (d: number) => (d === 0 ? "var(--kv-faint)" : d < 0 ? "#c0492f" : "#9a6a14");
  const discLabel = (d: number) => (d === 0 ? "مطابق" : d < 0 ? `عجز ${money(Math.abs(d))}` : `زيادة ${money(d)}`);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ ...head.style, display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>
            <Calculator size={13} /> تقفيل وردية
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0" }}>تسوية كاش المندوبين</h1>
          <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0" }}>
            الكاش المحصّل المعلّق لكل مندوب — راجع الفرق، وقفّل الوردية لما يسلّموا.
          </p>
        </div>
        <div style={{ marginInlineStart: "auto", textAlign: "left" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>إجمالي معلّق</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-primary)" }}>{loaded ? money(shiftTotal) : "…"}</div>
        </div>
      </header>

      <section style={{ ...body.style, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--kv-border)" }}>
            <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>المندوبون — كاش معلّق</span>
            <button onClick={settleAll} disabled={busy || settleable.length === 0}
              style={{ height: 38, padding: "0 16px", border: 0, borderRadius: 11, background: busy || !settleable.length ? "var(--kv-card-soft)" : "var(--kv-grad-brand)", color: busy || !settleable.length ? "var(--kv-faint)" : "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: busy || !settleable.length ? "default" : "pointer" }}>
              {busy ? "..." : `قفّل الكل (${toAr(settleable.length)})`}
            </button>
          </div>
          {!loaded ? (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 600 }}>بنحمّل…</div>
          ) : drivers.length === 0 ? (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 600 }}>مفيش كاش معلّق — الوردية مقفولة.</div>
          ) : (
            drivers.map((d) => (
              <div key={d.driverId ?? "unassigned"} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1.2fr 70px", gap: 10, alignItems: "center", padding: "13px 18px", borderBottom: "1px solid var(--kv-border)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.driverName}</div>
                  <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 2 }}>{toAr(d.unsettledCount)} طلب{!d.driverId ? " · غير معيّن" : ""}</div>
                </div>
                <Cell label="متوقّع" value={money(d.expected)} />
                <Cell label="محصّل" value={money(d.collected)} strong />
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--kv-faint)" }}>الفرق</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: discColor(d.discrepancy), marginTop: 2 }}>{discLabel(d.discrepancy)}</div>
                </div>
                <div style={{ textAlign: "left", fontSize: 9, fontWeight: 700, color: !d.driverId ? "#c0492f" : "var(--kv-faint)" }}>
                  {!d.driverId ? "محتاج تعيين" : "جاهز"}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent settlements with printable slips */}
        {loaded && settlements.length > 0 && (
          <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--kv-border)", fontSize: 14, fontWeight: 800 }}>تسويات سابقة</div>
            {settlements.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--kv-border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{s.driverName || "غير معيّن"}</div>
                  <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 2 }}>{toAr(s.orderCount)} طلب · {fmtDate(s.createdAt)}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-primary)" }}>{money(s.totalAmount)}</div>
                <button onClick={() => window.open(`/api/cod/settlement/${s.id}/image`, "_blank")}
                  style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 11, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Printer size={13} /> إيصال
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--kv-faint)" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: strong ? 800 : 700, color: strong ? "var(--kv-text)" : "var(--kv-muted)", marginTop: 2 }}>{value}</div>
    </div>
  );
}
