// ============================================================================
// Kivo Delivery Network — D1 remediation: what the driver link should SAY when
// it is no longer actionable. PURE (no I/O, no React) so the rule is testable.
//
// THE DEFECT THIS EXISTS TO FIX (KIV-36 / D1):
//   isExpired() collapses five different situations into one boolean —
//   delivered, failed, cancelled, and a merely time-expired link all return
//   true. /d/<token> then rendered ONE terminal panel for all of them:
//   «تم إنهاء هذا التوصيل ✅», green, with a success checkmark. So a driver who
//   reported a real problem and reloaded the page was told the delivery
//   completed successfully.
//
// This module does NOT change when a link stops being actionable — only what
// the driver is told. `driverTerminalState(d) !== "active"` is exactly
// equivalent to `isExpired(d)`, and scripts/test-delivery-problem-path.test.ts
// proves that equivalence exhaustively, so gating (status transitions, location
// pushes, reassignment/recovery) is bit-for-bit unchanged.
// ============================================================================

/** Why the driver link is (or is not) still actionable. */
export type DriverTerminalState =
  | "active"     // still working — render the normal driver UI
  | "delivered"  // completed successfully
  | "failed"     // driver reported a problem; NOT completed
  | "cancelled"  // called off
  | "expired";   // link timed out while still in progress — outcome unknown

/** Terminal statuses, in the order isExpired() tests them. */
const TERMINAL: Record<string, DriverTerminalState> = {
  delivered: "delivered",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * Classify a delivery for the DRIVER-FACING page.
 *
 * Status wins over the clock: a delivery that was marked `failed` and whose link
 * later timed out is still a *problem*, not an anonymous expiry — the driver must
 * never be shown a different outcome than the one they reported.
 */
export function driverTerminalState(
  d: { status?: string | null; expires_at?: string | null },
  now: number = Date.now()
): DriverTerminalState {
  const byStatus = TERMINAL[String(d.status ?? "")];
  if (byStatus) return byStatus;
  if (d.expires_at && new Date(d.expires_at).getTime() < now) return "expired";
  return "active";
}

/** Visual register. `success` is the ONLY thing allowed to look like completion. */
export type TerminalTone = "success" | "problem" | "neutral";

export interface TerminalPanel {
  tone: TerminalTone;
  title: string;
  body: string;
  /**
   * True ONLY for a genuinely delivered order. Render sites gate the checkmark
   * and green treatment on this flag rather than re-deriving it, so a new
   * terminal state can never accidentally inherit success semantics.
   */
  success: boolean;
}

const PANELS: Record<Exclude<DriverTerminalState, "active">, TerminalPanel> = {
  delivered: {
    tone: "success",
    title: "تم التوصيل بنجاح ✅",
    body: "شكراً لك. انتهى هذا التوصيل.",
    success: true,
  },
  failed: {
    tone: "problem",
    title: "تم تسجيل مشكلة في التوصيل",
    body: "لم يتم إتمام هذا التوصيل. تم تسجيل المشكلة وظهرت للمطعم.",
    success: false,
  },
  cancelled: {
    tone: "neutral",
    title: "تم إلغاء هذا التوصيل",
    body: "أُلغي هذا الطلب. لا حاجة لأي إجراء.",
    success: false,
  },
  expired: {
    tone: "neutral",
    title: "انتهت صلاحية هذا الرابط",
    body: "لم يعد هذا الرابط فعّالاً. تواصل مع المطعم إذا كان التوصيل ما زال مطلوباً.",
    success: false,
  },
};

/** The panel to render, or null while the delivery is still active. */
export function driverTerminalPanel(state: DriverTerminalState): TerminalPanel | null {
  return state === "active" ? null : PANELS[state];
}
