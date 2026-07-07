"use client";

// ============================================================================
// console_v2 — DARK-GLASS COMPONENT KIT (v35 handoff canon). The shared library
// every rebuilt page composes from. Chromatic Truth System: Layer-1 identity is
// fixed, Layer-2 state is the only animated layer, red is SAFETY-ONLY, GATHERING
// is never colored, money is displayed-never-derived. All visuals key off the
// `.kvx-*` classes defined once in globals.css (scoped to the `.kvx` shell root),
// so the OLD light console is never affected.
//
// Import: `import { StatTile, TruthChip, ProgressRing, ... } from "@/components/console-v2/kit"`
// ============================================================================

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Truth-state chip (Layer-2). GATHERING/SOON are never colored as a verdict.
// ---------------------------------------------------------------------------
export type TruthState = "live" | "gather" | "soon" | "pro" | "wo" | "degraded";
const TRUTH_LABEL: Record<TruthState, string> = {
  live: "LIVE", gather: "GATHERING", soon: "SOON", pro: "PRO", wo: "WO", degraded: "DEGRADED",
};
export function TruthChip({ state, label }: { state: TruthState; label?: string }) {
  return (
    <span className={`kvx-ts ${state}`}>
      {state === "live" && <span className="kvx-dot" />}
      {label ?? TRUTH_LABEL[state]}
    </span>
  );
}

/** Attribution chip — 🤖 Karim (AI/blue) or ✋ name (human/amber). Mixed = render both. */
export function HandledByChip({ by, name }: { by: "karim" | "human"; name?: string }) {
  return (
    <span className={`kvx-hby ${by}`}>
      {by === "karim" ? "🤖" : "✋"}
      {by === "karim" ? "كريم" : (name ? <bdi>{name}</bdi> : "")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section header anatomy (mandatory on every block): gradient icon badge +
// title + uppercase sub + optional right-aligned state chip.
// ---------------------------------------------------------------------------
export type Tier = "gold" | "green" | "blue" | "coral" | "violet";
const TIER_GRAD: Record<Tier, string> = {
  gold: "var(--g-gold)", green: "var(--g-green)", blue: "var(--g-blue)", coral: "var(--g-coral)", violet: "var(--g-violet)",
};
export function SectionHeader({ icon, title, sub, tier = "blue", right }: {
  icon: ReactNode; title: string; sub?: string; tier?: Tier; right?: ReactNode;
}) {
  return (
    <div className="kvx-shead">
      <span className="kvx-sic" style={{ background: TIER_GRAD[tier] }}>{icon}</span>
      <span className="kvx-sh-tt"><b>{title}</b>{sub && <span>{sub}</span>}</span>
      {right}
    </div>
  );
}

/** Glass panel wrapper. */
export function Panel({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={`kvx-panel${className ? " " + className : ""}`} style={style}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Vivid stat tile (left accent + count value + fact line). `value` is DISPLAYED,
// never derived here — pass the engine-computed figure.
// ---------------------------------------------------------------------------
export function StatTile({ tier, label, value, fact, countUp, variant = "vivid" }: {
  tier: Tier; label: string; value: ReactNode; fact?: ReactNode; countUp?: number;
  /** "vivid" = flooded gradient block (default). "accent" = dark surface + colored strip. */
  variant?: "vivid" | "accent";
}) {
  return (
    <div className={`kvx-stile ${tier}${variant === "accent" ? " accent" : ""}`}>
      <div className="kvx-slbl">{label}</div>
      <div className="kvx-sn">{countUp != null ? <CountUp to={countUp} /> : value}</div>
      {fact && <div className="kvx-sfact">{fact}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count-up number (Layer-2 motion). Honors prefers-reduced-motion (snaps).
// ---------------------------------------------------------------------------
export function CountUp({ to, format }: { to: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    const start = performance.now(), dur = 900, from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [to]);
  const v = Math.round(n);
  return <bdi dir="ltr" style={{ unicodeBidi: "isolate" }}>{format ? format(v) : v.toLocaleString("en-US")}</bdi>;
}

// ---------------------------------------------------------------------------
// SVG progress ring (dashoffset). `pct` 0..1. Optional center content.
// ---------------------------------------------------------------------------
export function ProgressRing({ pct, size = 52, stroke = 5, color = "var(--teal)", children }: {
  pct: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size }}>
      <svg className="kvx-ring" width={size} height={size}>
        <circle className="kvx-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="kvx-fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={color} strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      {children && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard row (gold #1 + bobbing crown).
// ---------------------------------------------------------------------------
export function LeaderRow({ rank, avatar, name, meta, value }: {
  rank: number; avatar: ReactNode; name: ReactNode; meta?: ReactNode; value?: ReactNode;
}) {
  const first = rank === 1;
  return (
    <div className={`kvx-lrow${first ? " first" : ""}`}>
      <span style={{ position: "relative", fontWeight: 900, fontSize: 12, width: 16, textAlign: "center", color: first ? "var(--ink)" : "var(--faint)" }}>
        {first && <span className="kvx-crown">👑</span>}{rank}
      </span>
      <span className="kvx-pav" style={{ background: first ? "rgba(0,0,0,.14)" : "var(--inset2)", color: first ? "var(--ink)" : "var(--dim)", boxShadow: first ? "0 0 0 2px rgba(0,0,0,.14)" : undefined }}>{avatar}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: first ? "var(--ink)" : "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}{meta && <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: first ? "var(--ink-soft)" : "var(--faint)" }}>{meta}</span>}</span>
      {value != null && <span style={{ fontFamily: "var(--kvx-font-ui)", fontWeight: 900, fontSize: 12, color: first ? "var(--ink)" : "var(--gold)" }}>{value}</span>}
    </div>
  );
}

/** At-risk spotlight (coral, shine sweep). */
export function Spotlight({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="kvx-spot" style={style}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Loyalty card anatomy: ring-avatar → statline → favchip → LIFETIME spend hero
// → tier line. `spend` is engine-computed money — displayed, never derived.
// ---------------------------------------------------------------------------
export function LoyaltyCard({ tier, avatar, ringPct, name, phone, tierLabel, orders, visits, usual, spend, spendLabel = "LIFETIME", atRisk }: {
  tier: "vip" | "reg" | "new" | "risk"; avatar: ReactNode; ringPct?: number; name: ReactNode; phone?: ReactNode;
  tierLabel: string; orders: ReactNode; visits: ReactNode; usual?: ReactNode; spend: ReactNode; spendLabel?: string; atRisk?: boolean;
}) {
  return (
    <div className={`kvx-gc ${tier}`}>
      {atRisk && <span className="kvx-warnDot" />}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {ringPct != null ? (
          <ProgressRing pct={ringPct} size={46} stroke={4} color="rgba(11,26,20,.55)"><span style={{ fontWeight: 900, fontSize: 13, color: "var(--ink)" }}>{avatar}</span></ProgressRing>
        ) : (
          <span style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(0,0,0,.14)", fontWeight: 900, color: "var(--ink)" }}>{avatar}</span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--ink)", fontFamily: "var(--kvx-font-ar)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          {phone && <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-soft)" }}>{phone}</div>}
        </div>
        <span style={{ fontSize: 8.5, fontWeight: 900, color: "var(--ink)", background: "var(--ink-chip)", borderRadius: 7, padding: "3px 7px" }}>{tierLabel}</span>
      </div>
      <div className="kvx-hair" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, fontWeight: 800, color: "var(--ink-soft)" }}>
        <span>{orders} طلب</span><span>·</span><span>{visits} زيارة</span>
        {usual && <span className="kvx-favchip" style={{ marginInlineStart: "auto" }}>📷 {usual}</span>}
      </div>
      <div className="kvx-sp" style={{ marginTop: 9 }}><small>{spendLabel}</small>{spend}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locked-gold switch. `locked` renders the gold, unclickable safety state.
// ---------------------------------------------------------------------------
export function LockedSwitch({ on, locked, onToggle }: { on: boolean; locked?: boolean; onToggle?: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-disabled={locked}
      className={`kvx-sw${on ? " on" : ""}${locked ? " locked" : ""}`}
      onClick={() => { if (!locked) onToggle?.(); }} style={{ border: 0 }} />
  );
}

// ---------------------------------------------------------------------------
// Aurora drawer (432–452px, rotating conic aurora header). Safety variant = red.
// ---------------------------------------------------------------------------
export function AuroraDrawer({ open, onClose, safety, children }: { open: boolean; onClose: () => void; safety?: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="kvx-scrim" onClick={onClose} />
      <aside className="kvx-drawer" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="kvx-aurora" style={safety ? { background: "conic-gradient(from 0deg,rgba(255,107,94,.5),rgba(255,150,64,.35),rgba(255,107,94,.5))" } : undefined} />
        <div className="kv-scroll" style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: 18 }}>{children}</div>
      </aside>
    </>
  );
}

/** Mini-modal (82–84vh, room-tinted). */
export function MiniModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="kvx-scrim" onClick={onClose} />
      <div className="kvx-modal kv-scroll" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>{children}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Toasts (bottom-center). Minimal store via a module event target.
// ---------------------------------------------------------------------------
type Toast = { id: number; text: string; tone?: "ok" | "blue" | "amber" };
let toastSeq = 1;
const toastListeners = new Set<(t: Toast) => void>();
export function pushToast(text: string, tone?: Toast["tone"]) {
  const t: Toast = { id: toastSeq++, text, tone };
  toastListeners.forEach((l) => l(t));
}
export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => { setItems((p) => [...p, t]); setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 3000); };
    toastListeners.add(on);
    return () => { toastListeners.delete(on); };
  }, []);
  return (
    <div className="kvx-toasts">
      {items.map((t) => <div key={t.id} className="kvx-toast" style={t.tone === "blue" ? { borderColor: "rgba(75,139,255,.5)" } : t.tone === "amber" ? { borderColor: "rgba(232,180,90,.55)" } : undefined}>{t.text}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page layout primitive: 348px context column + 1fr hero (stacks < 1100px).
// ---------------------------------------------------------------------------
export function PageGrid({ context, hero }: { context: ReactNode; hero: ReactNode }) {
  return (
    <div className="kvx-grid">
      <div className="kvx-col">{context}</div>
      <div style={{ minWidth: 0 }}>{hero}</div>
    </div>
  );
}

export { IconRail, HeaderRow, Device } from "./shell";
