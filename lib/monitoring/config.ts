// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: monitor thresholds (env-driven, one place).
//
// Every threshold has a SAFE default so the sweep works with zero configuration,
// and each is overridable via env for tuning without a deploy-code change. Spend
// alerting is OFF by default (budget 0) — it only activates when a budget is set,
// so we never alert on spend we haven't been told to watch.
// ============================================================================

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export interface MonitorConfig {
  deliverySilenceMs: number;   // silence (open + live) beyond this → alert
  dormantMs: number;           // a channel silent longer than this is dormant, not down
  webhookWindowMs: number;     // window for counting webhook anomalies
  webhookSpikeCount: number;   // anomalies in the window at/above this → alert
  errorWindowMs: number;       // window for the agent error-rate rollup
  errorRate: number;           // error ratio (0..1) at/above this → alert
  errorMinSample: number;      // don't alert below this many turns in-window
  dailyBudgetUsd: number;      // 0 = spend alerting off
  cooldownMs: number;          // per-alert cooldown (spam discipline)
  webhookRetentionMs: number;  // prune monitor_webhook_events older than this
}

export function loadMonitorConfig(): MonitorConfig {
  const MIN = 60_000;
  return {
    deliverySilenceMs: num("MONITOR_DELIVERY_SILENCE_MIN", 30) * MIN,
    dormantMs: num("MONITOR_DORMANT_HOURS", 24) * 60 * MIN,
    webhookWindowMs: num("MONITOR_WEBHOOK_WINDOW_MIN", 15) * MIN,
    webhookSpikeCount: num("MONITOR_WEBHOOK_SPIKE_COUNT", 5),
    errorWindowMs: num("MONITOR_ERROR_WINDOW_MIN", 15) * MIN,
    errorRate: (() => {
      const v = Number(process.env.MONITOR_ERROR_RATE);
      return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.5;
    })(),
    errorMinSample: num("MONITOR_ERROR_MIN_SAMPLE", 4),
    dailyBudgetUsd: (() => {
      const v = Number(process.env.MONITOR_DAILY_BUDGET_USD);
      return Number.isFinite(v) && v > 0 ? v : 0;
    })(),
    cooldownMs: num("MONITOR_COOLDOWN_MIN", 60) * MIN,
    webhookRetentionMs: num("MONITOR_WEBHOOK_RETENTION_MIN", 1440) * MIN,
  };
}
