"use client";

// ============================================================================
// console_v2 — ActNowDot (§5 motion). The ONE fast-pulse element in the system:
// a 1.2s pulsing corner dot that means "ACT NOW". Per Kivo_Color_System.md §5 it
// is reserved for exactly two situations — awaiting-handoff over threshold (amber)
// and safety events (red) — and nothing else. Under prefers-reduced-motion it
// drops to a static solid dot (still visible; motion is the only thing removed).
// Budget (one moving element per card, ~3 per viewport) is the caller's to keep.
// ============================================================================

type ActNowKind = "handoff" | "safety";

const COLOR: Record<ActNowKind, string> = {
  handoff: "#e8b45a", // §2 amber — AWAITING HANDOFF, the only Shift alarm
  safety: "#ff6b5e", // §2 red — safety only
};

export function ActNowDot({ kind, size = 9 }: { kind: ActNowKind; size?: number }) {
  return (
    <span
      className="kvc-actnow"
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: COLOR[kind],
        flex: "0 0 auto",
      }}
    />
  );
}
