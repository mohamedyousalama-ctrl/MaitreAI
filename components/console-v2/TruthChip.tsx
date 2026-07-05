"use client";

// ============================================================================
// console_v2 — the truth-state chip. The canon vocabulary (Kivo_Color_System.md
// §6): LIVE=emerald · GATHERING=shimmer slate · SOON=slate · PRO=violet · WO=amber.
//
//   LIVE      — real data flowing.                 emerald + pulsing dot
//   GATHERING — backend exists, no data yet.       slate + clock (skeleton, NO numbers)
//   DEGRADED  — the source is up but unhealthy.    amber + alert (R2 8-probe board)
//   SOON      — feature not built yet.              slate + dashed (label only)
//   PRO       — gated behind a Pro feature.         violet (§2 intelligence/Pro)
//   WO        — pending a work order (spec'd, unbuilt). amber
//
// DEGRADED is the widget data-health state (feed down); PRO/WO are feature-availability
// states — added per reconciliation ruling #5 (the mocks use them). Hexes are the
// canon §2 palette. The visible face of the truth laws: a surface that can't trace
// a number to a live backend renders GATHERING/SOON — never a fabricated LIVE number.
// ============================================================================

import { Clock, AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

export type TruthState = "live" | "gathering" | "degraded" | "soon" | "pro" | "wo";

const LABEL_KEY: Record<TruthState, DictKey> = {
  live: "truth.live",
  gathering: "truth.gathering",
  degraded: "truth.degraded",
  soon: "truth.soon",
  pro: "truth.pro",
  wo: "truth.wo",
};

// Canon §2 hexes: emerald #0E9F6E · slate #9aa7b8 · amber #e8b45a · violet #a878f0.
const STYLE: Record<TruthState, CSSProperties> = {
  live: { background: "rgba(14,159,110,.14)", color: "#0A8A5F" },
  gathering: { background: "rgba(154,167,184,.16)", color: "#5b6b7a" },
  degraded: { background: "rgba(232,180,90,.18)", color: "#b9822a" },
  soon: { background: "rgba(154,167,184,.12)", color: "#7c8794" },
  pro: { background: "rgba(168,120,240,.16)", color: "#7d4fd0" },
  wo: { background: "rgba(232,180,90,.18)", color: "#b9822a" },
};

export function TruthChip({
  state,
  label,
  className,
}: {
  state: TruthState;
  /** Override the dictionary label (rare; e.g. a probe name). */
  label?: string;
  className?: string;
}) {
  const t = useT();
  const text = label ?? t(LABEL_KEY[state]);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--kv-r-pill)",
        fontFamily: "var(--kv-font)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        border: state === "soon" ? "1px dashed rgba(100,116,139,.35)" : "none",
        ...STYLE[state],
      }}
    >
      {state === "live" && (
        <span
          className="kv-pulse"
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--kv-primary)", flex: "0 0 auto" }}
        />
      )}
      {state === "gathering" && <Clock size={12} strokeWidth={2.5} aria-hidden style={{ flex: "0 0 auto" }} />}
      {state === "degraded" && <AlertTriangle size={12} strokeWidth={2.5} aria-hidden style={{ flex: "0 0 auto" }} />}
      {text}
    </span>
  );
}
