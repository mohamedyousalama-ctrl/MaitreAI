"use client";

import { Clock } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/**
 * The 3-state truth primitive (SPEC 00 §8). This is how the build-guide §4
 * truth-system is enforced in code: any data a page can't trace to a real
 * backend source MUST render through `gathering` or `coming` — never as a
 * fabricated `live` number.
 *
 *  - live      → real, flowing data.            badge + pulsing dot.
 *  - gathering → backend exists, no data yet.   badge + clock; show skeleton, NO numbers.
 *  - coming    → feature not built yet.         dashed/hatched; badge only.
 */
export type TruthState = "live" | "gathering" | "coming";

const DEFAULT_LABELS: Record<TruthState, string> = {
  live: "مباشر",
  gathering: "لسه بنجمع بيانات",
  coming: "قريباً",
};

const BADGE_STYLE: Record<TruthState, CSSProperties> = {
  live: { background: "rgba(14,159,110,.12)", color: "#0a8a5f" },
  gathering: { background: "rgba(100,116,139,.12)", color: "#51637a" },
  coming: { background: "rgba(100,116,139,.14)", color: "#6b7a88" },
};

export function StatePill({
  state,
  label,
  className,
}: {
  state: TruthState;
  /** Override the default Arabic label (e.g. «شغّال» for live). */
  label?: string;
  className?: string;
}) {
  const text = label ?? DEFAULT_LABELS[state];

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
        ...BADGE_STYLE[state],
      }}
    >
      {state === "live" && (
        <span
          className="kv-pulse"
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#0E9F6E",
            flex: "0 0 auto",
          }}
        />
      )}
      {state === "gathering" && (
        <Clock size={12} strokeWidth={2.5} aria-hidden style={{ flex: "0 0 auto" }} />
      )}
      {text}
    </span>
  );
}

/**
 * Companion skeleton block for the `gathering` state (SPEC 00 §8). Renders a
 * shimmering placeholder — never numbers — while the backend has no data yet.
 */
export function KvSkeletonBlock({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`kv-skeleton ${className ?? ""}`}
      aria-hidden
      style={{ height: 14, borderRadius: 7, ...style }}
    />
  );
}

/**
 * Companion panel for the `coming` state (SPEC 00 §8): dashed border over a
 * hatched background. Wrap a "قريباً" placeholder; carries no fabricated data.
 */
export function KvComingPanel({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        border: "1.5px dashed rgba(100,116,139,.35)",
        borderRadius: "var(--kv-r-md)",
        backgroundColor: "#fbfcfc",
        backgroundImage:
          "repeating-linear-gradient(135deg,rgba(100,116,139,.035),rgba(100,116,139,.035) 11px,transparent 11px,transparent 22px)",
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
