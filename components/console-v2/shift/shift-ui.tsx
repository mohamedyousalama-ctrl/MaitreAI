"use client";

// ============================================================================
// KIVO-SHIFT — «الوردية» presentational layer (WO-SHIFT-1). Scoped styles +
// primitives + the three card shapes (Section A andon row, Section B accept card,
// Section C accepted row). All copy is dictionary-driven; every number/id/price is
// wrapped in Bdi/Num (Western digits, never reversed); safety red (#B4232C) is used
// ONLY for an active safety hold; operational waits use amber and escalate by weight
// (never a permanent red). Money is displayed straight from the server value.
//
// LOCAL-ONLY, flagged for promotion: everything here is built inside KIVO-SHIFT's
// territory. If the PM wants any of it shared, it is promoted as a separate order.
// ============================================================================

import type { ReactNode, CSSProperties } from "react";
import { AlertTriangle, ShieldAlert, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi, Num } from "@/components/kivo";
import {
  formatElapsed,
  elapsedTier,
  type ActNowItem,
  type ShiftOrderState,
} from "./shift-model";

/** THE safety red — reserved for an active safety hold ONLY (WO rule #3). */
export const SAFETY_RED = "#B4232C";
export const SAFETY_TINT = "rgba(180,35,44,.12)";
export const SAFETY_STROKE = "rgba(180,35,44,.42)";

// ---------------------------------------------------------------------------
// Section-A display entry — extends the pure ActNowItem (sortActNow only reads
// id/kind/waitingMs) with the fields a card renders. Assembled by the page.
// ---------------------------------------------------------------------------
export interface ActNowEntry extends ActNowItem {
  reasonKey: DictKey;
  tone: "safety" | "amber";
  customerName?: string;
  orderNumber?: string;
  /** A fixed, neutral summary key (never authored safety reassurance). */
  summaryKey?: DictKey;
  /** A data-derived summary (e.g. an escalation reason) rendered via Bdi. */
  summaryData?: string | null;
  ownerLabelKey?: DictKey;
  ownerName?: string | null;
  primary?: "claim" | "accept" | "details";
  conversationId?: string;
  orderId?: string;
  controlEpoch?: number | null;
}

// ---------------------------------------------------------------------------
// Elapsed — «ينتظر منذ <n> <unit>». Renders nothing for an unverifiable time.
// The number is a Num between fixed Arabic words → no interpolation into a string.
// ---------------------------------------------------------------------------
export function Elapsed({ waitingMs, prefix = true }: { waitingMs: number | null; prefix?: boolean }) {
  const t = useT();
  const e = formatElapsed(waitingMs);
  if (!e) return null;
  const unitKey: DictKey = e.unit === "sec" ? "shift.v2.unit.sec" : e.unit === "min" ? "shift.v2.unit.min" : "shift.v2.unit.hr";
  const tier = elapsedTier(waitingMs);
  const color = tier === "urgent" ? "var(--amber)" : tier === "rising" ? "var(--gold)" : "var(--dim)";
  return (
    <span style={{ fontSize: 12.5, fontWeight: 700, color, whiteSpace: "nowrap" }}>
      {prefix ? t("shift.v2.waitingSince") : t("shift.v2.since")} <Num>{e.value}</Num> {t(unitKey)}
    </span>
  );
}

/** The one-and-only two-state acceptance chip. */
export function AcceptanceChip({ state }: { state: ShiftOrderState }) {
  const t = useT();
  const accepted = state === "accepted";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999,
        fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
        color: accepted ? "#0A8A5F" : "#b9822a",
        background: accepted ? "rgba(14,159,110,.14)" : "rgba(232,180,90,.18)",
        border: `1px solid ${accepted ? "rgba(14,159,110,.3)" : "rgba(232,180,90,.4)"}`,
      }}
    >
      {t(accepted ? "shift.v2.state.accepted" : "shift.v2.state.needsAccept")}
    </span>
  );
}

/** Safety marker on an order card — from data (a linked safety-held conversation). */
export function SafetyMark() {
  const t = useT();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: SAFETY_RED, background: SAFETY_TINT, border: `1px solid ${SAFETY_STROKE}` }}>
      <ShieldAlert size={13} /> {t("shift.v2.safetyMark")}
    </span>
  );
}

/** توصيل / استلام. */
export function Fulfil({ type }: { type: "delivery" | "pickup" }) {
  const t = useT();
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }}>
      {t(type === "pickup" ? "shift.v2.pickup" : "shift.v2.delivery")}
    </span>
  );
}

/** Money — DISPLAYED straight from the server value; never composed here. */
export function ServerMoney({ total, currency }: { total: number; currency: string }) {
  return (
    <span style={{ fontFamily: "var(--kvx-font-ui)", fontWeight: 900, fontSize: 15, color: "var(--txt)", whiteSpace: "nowrap" }}>
      <Num>{total.toLocaleString("en-US")}</Num> <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 700 }}>{currency}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons — floor 15px, touch targets ≥44 (48–56 for a full-width primary).
// ---------------------------------------------------------------------------
export const btnBase: CSSProperties = {
  fontFamily: "var(--kvx-font-ar)", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0,
};
export const primaryFull: CSSProperties = {
  ...btnBase, width: "100%", height: 52, borderRadius: 14, fontSize: 16,
  background: "linear-gradient(135deg,#3fd39b,#0E9F6E)", color: "#062018",
};
export const primaryBtn: CSSProperties = {
  ...btnBase, height: 46, padding: "0 18px", borderRadius: 12, fontSize: 15,
  background: "linear-gradient(135deg,#3fd39b,#0E9F6E)", color: "#062018",
};
export const claimBtn: CSSProperties = {
  ...btnBase, height: 46, padding: "0 18px", borderRadius: 12, fontSize: 15,
  background: "linear-gradient(135deg,#f0c674,#e8b45a)", color: "#3a2600",
};
export const safetyBtn: CSSProperties = {
  ...btnBase, height: 46, padding: "0 18px", borderRadius: 12, fontSize: 15,
  background: SAFETY_RED, color: "#fff",
};
export const ghostBtn: CSSProperties = {
  ...btnBase, height: 44, padding: "0 16px", borderRadius: 12, fontSize: 15,
  background: "var(--inset2)", color: "var(--dim)", border: "1px solid var(--stroke)",
};

export function DisabledReason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)", marginTop: 6 }}>{reason}</div>;
}

// ---------------------------------------------------------------------------
// Card shells
// ---------------------------------------------------------------------------
export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", gap: 10,
        background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 16,
        padding: "13px 15px", borderInlineStart: accent ? `3px solid ${accent}` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function OrderIdentity({ orderNumber, name, onClick }: { orderNumber?: string; name?: string; onClick?: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ ...btnBase, justifyContent: "flex-start", background: "transparent", padding: 0, minWidth: 0, cursor: onClick ? "pointer" : "default", textAlign: "start", flexWrap: "wrap" }}
    >
      <span style={{ fontSize: 16, fontWeight: 900, color: "var(--txt)", display: "inline-flex", alignItems: "center", gap: 8 }}>
        {orderNumber && <span style={{ fontFamily: "var(--kvx-font-ui)" }}>#<Num>{orderNumber}</Num></span>}
        {name && <Bdi>{name}</Bdi>}
      </span>
    </button>
  );
}

/** A live safety dot (the only pulsing red) — for Section A safety rows. */
export function SafetyDot() {
  return <span aria-hidden className="kvsh-pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: SAFETY_RED, boxShadow: `0 0 8px ${SAFETY_RED}` }} />;
}

export function ReasonHead({ icon, text, tone }: { icon?: ReactNode; text: string; tone: "safety" | "amber" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon}
      <span style={{ fontSize: 15, fontWeight: 900, color: tone === "safety" ? SAFETY_RED : "var(--txt)" }}>{text}</span>
    </div>
  );
}

export { AlertTriangle, ChevronLeft };

// ---------------------------------------------------------------------------
// Scoped stylesheet — layout, responsive (phone default / tablet split at
// ≥1000px, queue on the RIGHT in RTL), sticky bars, bottom nav, and the single
// safety pulse. Everything scoped under `.kvsh` so nothing global is touched.
// ---------------------------------------------------------------------------
const CSS = `
.kvsh { display: block; }
.kvsh-statusbar {
  position: sticky; top: 0; z-index: 40;
  background: rgba(12,16,22,.86); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--stroke);
  padding: 9px 12px; margin: -4px -4px 14px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.kvsh-sb-seg { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kvsh-sb-center { flex: 1; justify-content: center; }
.kvsh-grid { display: flex; flex-direction: column; gap: 22px; }
.kvsh-side { display: none; }
.kvsh-section { display: flex; flex-direction: column; gap: 9px; }
.kvsh-bottomnav {
  position: sticky; bottom: 0; z-index: 40; margin: 18px -4px -4px;
  background: rgba(12,16,22,.92); backdrop-filter: blur(10px);
  border-top: 1px solid var(--stroke);
  display: flex; align-items: stretch;
}
.kvsh-navitem {
  flex: 1; min-height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  background: transparent; border: 0; cursor: pointer;
  font-family: var(--kvx-font-ar); font-size: 12px; font-weight: 800; color: var(--faint);
}
.kvsh-navitem.active { color: var(--teal); }
.kvsh-pulse { animation: kvsh-pulse 1.15s ease-in-out infinite; }
@keyframes kvsh-pulse { 0%,100% { opacity: 1; } 50% { opacity: .38; } }
@media (prefers-reduced-motion: reduce) { .kvsh-pulse { animation: none; } }
@media (min-width: 1000px) {
  /* Counter tablet: split — queue (1fr, first child) on the RIGHT in RTL,
     detail/context panel (360px) on the LEFT. Bottom nav hides (the rail is used). */
  .kvsh-grid { display: grid; grid-template-columns: 1fr 360px; gap: 22px; align-items: start; }
  .kvsh-side { display: block; position: sticky; top: 74px; }
  .kvsh-bottomnav { display: none; }
}
`;

export function ShiftStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
