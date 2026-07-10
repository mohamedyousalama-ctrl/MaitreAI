// Unit tests for the WO-MONITORING-ALERTING pure checks + alert guidance.
// Proves the alert-decision logic (cooldown, delivery silence, spike, error rate,
// spend, deep health) and that every synthetic alert type ships plain-Arabic
// what/action guidance. Pure — no DB, no clock.
// Run: node --experimental-strip-types scripts/test-monitoring.test.ts
import {
  withinCooldown,
  evaluateDeepHealth,
  evaluateDeliverySilence,
  evaluateWebhookSpike,
  evaluateErrorRate,
  evaluateDailySpend,
} from "../lib/monitoring/checks.ts";
import { alertGuidance } from "../lib/alerts/guidance.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const MIN = 60_000;
const NOW = 1_700_000_000_000;

// ── withinCooldown ─────────────────────────────────────────────────────────
ok("never-fired is not in cooldown", withinCooldown(null, NOW, 60 * MIN) === false);
ok("just-fired IS in cooldown", withinCooldown(NOW - 5 * MIN, NOW, 60 * MIN) === true);
ok("past cooldown window is not suppressed", withinCooldown(NOW - 61 * MIN, NOW, 60 * MIN) === false);
ok("zero cooldown disables suppression", withinCooldown(NOW - 1, NOW, 0) === false);

// ── deep health ────────────────────────────────────────────────────────────
ok("healthy when env+db ok", evaluateDeepHealth({ envReady: true, dbReachable: true }).ok === true);
ok("down when db unreachable", evaluateDeepHealth({ envReady: true, dbReachable: false }).ok === false);
ok("db-unreachable reason", evaluateDeepHealth({ envReady: true, dbReachable: false }).reason === "db_unreachable");
ok("down when env unsane", evaluateDeepHealth({ envReady: false, dbReachable: true }).ok === false);

// ── delivery silence (the Wesaya signature) ─────────────────────────────────
const silence = (over: boolean, eligible = true) =>
  evaluateDeliverySilence({
    lastInboundAtMs: NOW - (over ? 45 : 5) * MIN,
    nowMs: NOW,
    eligible,
    thresholdMs: 30 * MIN,
  });
ok("fires when open+live and silent past threshold", silence(true).fire === true);
ok("reports minutes silent", silence(true).minutesSilent === 45);
ok("no fire when silence under threshold", silence(false).fire === false);
ok("no fire when not eligible (closed/paused/dormant)", silence(true, false).fire === false);
ok("no fire when never any inbound (fail-safe)",
  evaluateDeliverySilence({ lastInboundAtMs: null, nowMs: NOW, eligible: true, thresholdMs: 30 * MIN }).fire === false);

// ── webhook spike ───────────────────────────────────────────────────────────
ok("spike fires at threshold", evaluateWebhookSpike(5, 5).fire === true);
ok("spike fires above threshold", evaluateWebhookSpike(9, 5).fire === true);
ok("no spike below threshold", evaluateWebhookSpike(4, 5).fire === false);
ok("zero threshold never fires", evaluateWebhookSpike(100, 0).fire === false);

// ── agent error rate ────────────────────────────────────────────────────────
ok("error rate fires over threshold with enough sample",
  evaluateErrorRate({ errorCount: 6, totalCount: 10, minSample: 4, threshold: 0.5 }).fire === true);
ok("error rate no-fire below threshold",
  evaluateErrorRate({ errorCount: 3, totalCount: 10, minSample: 4, threshold: 0.5 }).fire === false);
ok("error rate suppressed on tiny sample (1/1 ≠ alert)",
  evaluateErrorRate({ errorCount: 1, totalCount: 1, minSample: 4, threshold: 0.5 }).fire === false);
ok("error rate no-fire on zero traffic",
  evaluateErrorRate({ errorCount: 0, totalCount: 0, minSample: 4, threshold: 0.5 }).fire === false);

// ── daily spend ─────────────────────────────────────────────────────────────
ok("spend fires when over budget", evaluateDailySpend(12, 10).fire === true);
ok("spend no-fire under budget", evaluateDailySpend(8, 10).fire === false);
ok("spend OFF when budget unset (0)", evaluateDailySpend(9999, 0).fire === false);
ok("spend handles negative/NaN spend safely", evaluateDailySpend(NaN, 10).fire === false);

// ── guidance: every synthetic alert type is actionable in Arabic ────────────
const SYNTHETIC = [
  "delivery_silence", "webhook_signature_spike", "webhook_unresolved_spike",
  "agent_error_rate", "daily_spend", "uptime_down",
];
for (const t of SYNTHETIC) {
  const g = alertGuidance(t);
  ok(`guidance exists for ${t}`, !!g && g.what.length > 0 && g.action.length > 0);
  // Arabic content sanity (contains Arabic letters).
  ok(`guidance for ${t} is Arabic`, !!g && /[؀-ۿ]/.test(g.what + g.action));
}
ok("unknown type → null guidance (falls back to raw detail)", alertGuidance("some_unknown_type") === null);

console.log(`\nMONITORING UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
