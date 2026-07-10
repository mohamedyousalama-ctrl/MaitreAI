// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: pure monitor CHECKS (no DB, no next/server).
//
// The sweep (./sweep.ts) fetches facts; THIS module decides. Every function is a
// pure fact→verdict transform (the whatsapp-health.ts pattern) so the alerting
// logic is exhaustively unit-testable without a database or clock. Thresholds are
// parameters (the sweep supplies them from env), never hard-coded here.
//
// Spam discipline (WO): each verdict is gated by `withinCooldown` in the sweep, so
// a persistent fault fires ONCE per cooldown window, never in a storm.
// ============================================================================

/** True while an alert is still inside its cooldown window (→ suppress re-fire).
 *  A null last-fired (never alerted) is NOT in cooldown. A non-finite/negative
 *  cooldown disables cooldown (always allowed). */
export function withinCooldown(
  lastFiredAtMs: number | null,
  nowMs: number,
  cooldownMs: number
): boolean {
  if (lastFiredAtMs == null) return false;
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return false;
  return nowMs - lastFiredAtMs < cooldownMs;
}

// --- a. Uptime (deep health) ------------------------------------------------
export interface DeepHealthFacts {
  envReady: boolean;   // required env/config present (isEnvReady)
  dbReachable: boolean; // a trivial DB read succeeded
}
/** Deep health is DOWN if either the env is unsane or the DB is unreachable. */
export function evaluateDeepHealth(f: DeepHealthFacts): { ok: boolean; reason: string | null } {
  if (!f.envReady) return { ok: false, reason: "env_not_ready" };
  if (!f.dbReachable) return { ok: false, reason: "db_unreachable" };
  return { ok: true, reason: null };
}

// --- b. Delivery silence (the Wesaya signature) -----------------------------
// The sweep owns the "should this tenant have traffic now" decision and passes it
// as `eligible` (open + agent live/test + a channel that was live recently, i.e.
// NOT dormant). This pure function only decides whether the current silence has
// crossed the alert threshold. `eligible` already implies a known-live channel, so
// a null lastInbound under eligibility never fires (fail-safe: never invent an
// outage for a tenant we've never actually heard from).
export interface DeliverySilenceFacts {
  /** ms since epoch of the tenant's most recent INBOUND message, or null if none. */
  lastInboundAtMs: number | null;
  nowMs: number;
  /** Is the tenant currently taking traffic (open AND agent live/test AND not dormant)? */
  eligible: boolean;
  /** Silence longer than this (ms) during eligibility → alert. */
  thresholdMs: number;
}
export function evaluateDeliverySilence(f: DeliverySilenceFacts): {
  fire: boolean;
  minutesSilent: number | null;
  reason: string | null;
} {
  if (!f.eligible) return { fire: false, minutesSilent: null, reason: "not_eligible" };
  if (f.lastInboundAtMs == null) return { fire: false, minutesSilent: null, reason: "no_prior_inbound" };
  const silentMs = f.nowMs - f.lastInboundAtMs;
  const minutesSilent = Math.floor(silentMs / 60000);
  if (silentMs >= f.thresholdMs) return { fire: true, minutesSilent, reason: "silence_exceeded" };
  return { fire: false, minutesSilent, reason: null };
}

// --- b. Webhook anomaly spike ----------------------------------------------
export function evaluateWebhookSpike(count: number, threshold: number): {
  fire: boolean;
  count: number;
} {
  return { fire: threshold > 0 && count >= threshold, count };
}

// --- c. Agent error rate ----------------------------------------------------
export interface ErrorRateFacts {
  errorCount: number;
  totalCount: number;
  /** Don't alert on a tiny sample (1/1 = 100% but meaningless). */
  minSample: number;
  /** Error ratio at/above this (0..1) → alert. */
  threshold: number;
}
export function evaluateErrorRate(f: ErrorRateFacts): {
  fire: boolean;
  rate: number;
  sample: number;
} {
  const sample = f.totalCount;
  if (sample < f.minSample || sample <= 0) return { fire: false, rate: 0, sample };
  const rate = f.errorCount / sample;
  return { fire: rate >= f.threshold, rate, sample };
}

// --- c. Daily spend / budget ------------------------------------------------
export function evaluateDailySpend(spendUsd: number, budgetUsd: number): {
  fire: boolean;
  spendUsd: number;
  budgetUsd: number;
  pct: number;
} {
  const safeSpend = Number.isFinite(spendUsd) && spendUsd > 0 ? spendUsd : 0;
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    // No budget configured → never alert (feature off).
    return { fire: false, spendUsd: safeSpend, budgetUsd: 0, pct: 0 };
  }
  const pct = safeSpend / budgetUsd;
  return { fire: safeSpend >= budgetUsd, spendUsd: safeSpend, budgetUsd, pct };
}
