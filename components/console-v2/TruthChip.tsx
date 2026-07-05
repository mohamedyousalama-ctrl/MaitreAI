"use client";

// ============================================================================
// console_v2 — the truth-state chip (PR 1 app shell). Four states:
//
//   LIVE      — real data flowing.                 emerald + pulsing dot
//   GATHERING — backend exists, no data yet.       slate + clock (show skeleton, NO numbers)
//   DEGRADED  — the source is up but unhealthy.    amber + alert (R2 8-probe board)
//   SOON      — feature not built yet.             slate + dashed (label only)
//
// This is the app-shell evolution of the shipped 3-state StatePill (kivo/StatePill),
// adding DEGRADED so the R2 health board can show a probe that's reachable-but-sick
// distinct from one that simply has no data. It is the visible face of the truth
// laws: a surface that can't trace a number to a live backend renders GATHERING /
// SOON here — it NEVER fabricates a LIVE number. Labels come from the dictionary.
// ============================================================================

import { Clock, AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";

export type TruthState = "live" | "gathering" | "degraded" | "soon";

const LABEL_KEY: Record<TruthState, DictKey> = {
  live: "truth.live",
  gathering: "truth.gathering",
  degraded: "truth.degraded",
  soon: "truth.soon",
};

const STYLE: Record<TruthState, CSSProperties> = {
  live: { background: "rgba(14,159,110,.12)", color: "var(--kv-deep)" },
  gathering: { background: "rgba(100,116,139,.12)", color: "var(--kv-slate)" },
  degraded: { background: "rgba(216,151,43,.14)", color: "var(--kv-amber)" },
  soon: { background: "rgba(100,116,139,.10)", color: "var(--kv-faint)" },
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
