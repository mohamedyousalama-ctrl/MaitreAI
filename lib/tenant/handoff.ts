// ============================================================================
// MaitreAI — Human-handoff hardening helpers (timeout/idle policy + safety gate)
// Pure, tenant-agnostic logic driven by tenant DATA (restaurants.feature_flags).
// Used by the inbound bridge to stop "silent death": a human-owned conversation
// that no operator tends must not answer the customer with nobody, forever.
//   • readHandoffConfig — reads the per-tenant idle policy (gate + minutes + action).
//   • isSafetyHold      — a hold whose escalation_reason is allergy/safety/medical;
//                         these NEVER auto-return to AI (re-alert only). Non-negotiable.
//   • isIdleBeyond      — has the human-owned conversation gone quiet past the window.
// No customer-facing behavior changes unless `handoff_timeout` is explicitly on.
// ============================================================================

export type HandoffIdleAction = "auto_return" | "realert_only";

export interface HandoffConfig {
  /** Gate — the whole timeout/auto-return feature. Default OFF (current behavior). */
  enabled: boolean;
  /** Idle window in minutes before the policy acts. Default 15. */
  idleMinutes: number;
  /** What to do on idle breach for a NON-safety hold. Default auto_return. */
  action: HandoffIdleAction;
}

/** Allergy / food-safety / medical hold — inferred from the free-text escalation
 *  reason the model (or a safety path) wrote. Generous on purpose: when in doubt
 *  about safety we MUST keep the human in the loop, so anything resembling an
 *  allergy/safety/medical reason is treated as a safety hold (never auto-returned).
 *  Ordinary handoffs (refund/complaint/agent_error/«عايز موظف») don't match → they
 *  are eligible for auto-return after idle. */
export const SAFETY_HOLD_RE =
  /حساسي|تحسس|مكسرات|فول سوداني|لاكتوز|جلوتين|سيلياك|أمان\s*غذائ|سلامة\s*(?:الغذاء|الطعام|الأكل)|تلوث\s*تحسس|طبي|دوائي|allerg|anaphyl|cross[-\s]?contam|gluten|celiac|lactose|peanut|medical|food\s*safety/i;

export function isSafetyHold(escalationReason: string | null | undefined): boolean {
  return !!escalationReason && SAFETY_HOLD_RE.test(escalationReason);
}

/** Read the per-tenant idle policy from feature_flags. Tolerant of missing/odd
 *  values so a misconfig can never throw — it just yields safe defaults (and the
 *  gate stays off unless explicitly true). */
export function readHandoffConfig(features: Record<string, unknown> | null | undefined): HandoffConfig {
  const enabled = !!features && features.handoff_timeout === true;
  const rawMin = Number(features?.handoff_idle_minutes);
  const idleMinutes = Number.isFinite(rawMin) && rawMin >= 1 && rawMin <= 1440 ? Math.floor(rawMin) : 15;
  const action: HandoffIdleAction = features?.handoff_idle_action === "realert_only" ? "realert_only" : "auto_return";
  return { enabled, idleMinutes, action };
}

/** True when a human-owned conversation has had no human-side activity for at
 *  least idleMinutes. `updatedAt` is the existing wait/SLA clock: stamped at the
 *  handoff flip and reset by operator replies, but NOT by the waiting customer's
 *  inbound messages — so (now − updatedAt) is the operator's quiet time. */
export function isIdleBeyond(updatedAt: string | null | undefined, idleMinutes: number, now: number = Date.now()): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t >= idleMinutes * 60 * 1000;
}
