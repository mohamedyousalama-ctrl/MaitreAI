// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: the monitor SWEEP (server-only).
//
// Runs the DB-backed health checks that can't be seen from outside the app and
// self-fires alerts through the existing recordCriticalAlert path (banner +
// WhatsApp-to-Mohamed + email scaffold). Triggered every ~5 min by the external
// scheduler (.github/workflows/uptime-monitor.yml → POST /api/monitor/sweep).
//
// Coverage:
//   • delivery_silence      — per open+live tenant: inbound gone quiet (Wesaya sig)
//   • webhook_signature_spike / webhook_unresolved_spike — burst of 401/unresolved
//   • agent_error_rate      — platform-wide Claude/agent error ratio over threshold
//   • daily_spend           — platform-wide Anthropic spend over the configured budget
//
// Discipline: never throws (a check failure is logged, others still run), and each
// alert is COOLDOWN-gated via monitor_alert_state so a persistent fault fires once
// per window, not in a storm. All reads use the admin (service-role) client.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCriticalAlert, type CriticalAlertType } from "@/lib/alerts/record";
import { resolveWebhookRestaurantId } from "@/lib/db/restaurants";
import { loadMonitorConfig, type MonitorConfig } from "./config";
import {
  evaluateDeliverySilence,
  evaluateWebhookSpike,
  evaluateErrorRate,
  evaluateDailySpend,
  withinCooldown,
} from "./checks";

export interface SweepSummary {
  ok: boolean;
  checked: number;          // tenants examined for delivery silence
  fired: string[];          // alert keys fired this run
  skippedCooldown: string[];// alert keys suppressed by cooldown
  pruned: number;           // webhook events pruned
  errors: string[];         // non-fatal check errors
}

/** Firing gate: alert once per cooldown window. Best-effort, never throws. */
async function fireIfDue(
  admin: SupabaseClient,
  cfg: MonitorConfig,
  nowMs: number,
  lastFired: Map<string, number>,
  summary: SweepSummary,
  args: {
    alertKey: string;
    type: CriticalAlertType;
    restaurantId: string;
    detail: string;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const last = lastFired.get(args.alertKey) ?? null;
    if (withinCooldown(last, nowMs, cfg.cooldownMs)) {
      summary.skippedCooldown.push(args.alertKey);
      return;
    }
    await recordCriticalAlert(admin, {
      restaurantId: args.restaurantId,
      type: args.type,
      detail: args.detail,
      context: { ...(args.context ?? {}), alertKey: args.alertKey },
    });
    // Stamp the cooldown AFTER recording so a record failure doesn't silence the
    // next run (best-effort re-alert beats a swallowed one).
    await admin
      .from("monitor_alert_state")
      .upsert(
        { alert_key: args.alertKey, last_fired_at: new Date(nowMs).toISOString(), state: args.context ?? {}, updated_at: new Date(nowMs).toISOString() },
        { onConflict: "alert_key" }
      );
    lastFired.set(args.alertKey, nowMs);
    summary.fired.push(args.alertKey);
  } catch (e) {
    summary.errors.push(`fire:${args.alertKey}:${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Run the full monitor sweep. Never throws — returns a summary. */
export async function runMonitorSweep(admin: SupabaseClient): Promise<SweepSummary> {
  const cfg = loadMonitorConfig();
  const nowMs = Date.now();
  const summary: SweepSummary = { ok: true, checked: 0, fired: [], skippedCooldown: [], pruned: 0, errors: [] };

  // Preload cooldown memory once.
  const lastFired = new Map<string, number>();
  try {
    const { data } = await admin.from("monitor_alert_state").select("alert_key, last_fired_at");
    for (const r of (data ?? []) as { alert_key: string; last_fired_at: string }[]) {
      const t = new Date(r.last_fired_at).getTime();
      if (Number.isFinite(t)) lastFired.set(r.alert_key, t);
    }
  } catch (e) {
    summary.errors.push(`load_state:${e instanceof Error ? e.message : String(e)}`);
  }

  // A restaurant to attach PLATFORM-wide alerts (webhook/spend/error-rate) to, so
  // they also surface on the console banner. WhatsApp-to-Mohamed fires regardless.
  const platformRid =
    (process.env.ALERT_PLATFORM_RESTAURANT_ID ?? "").trim() ||
    (await resolveWebhookRestaurantId(admin).catch(() => null));

  // --- b. Webhook anomaly spikes (global) -----------------------------------
  try {
    const since = new Date(nowMs - cfg.webhookWindowMs).toISOString();
    const kinds: { kind: string; type: CriticalAlertType }[] = [
      { kind: "invalid_signature", type: "webhook_signature_spike" },
      { kind: "unresolved_phone_number_id", type: "webhook_unresolved_spike" },
    ];
    for (const k of kinds) {
      const { count } = await admin
        .from("monitor_webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("kind", k.kind)
        .gte("at", since);
      const verdict = evaluateWebhookSpike(count ?? 0, cfg.webhookSpikeCount);
      if (verdict.fire && platformRid) {
        await fireIfDue(admin, cfg, nowMs, lastFired, summary, {
          alertKey: k.type,
          type: k.type,
          restaurantId: platformRid,
          detail: `عدد ${verdict.count} خلال ${Math.round(cfg.webhookWindowMs / 60000)} دقيقة`,
          context: { count: verdict.count, windowMin: Math.round(cfg.webhookWindowMs / 60000) },
        });
      }
    }
  } catch (e) {
    summary.errors.push(`webhook_spike:${e instanceof Error ? e.message : String(e)}`);
  }

  // --- c. Platform-wide agent error rate ------------------------------------
  try {
    const since = new Date(nowMs - cfg.errorWindowMs).toISOString();
    const total = (await admin
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("trigger", "customer")
      .gte("created_at", since)).count ?? 0;
    const errCount = (await admin
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("trigger", "customer")
      .not("error", "is", null)
      .gte("created_at", since)).count ?? 0;
    const verdict = evaluateErrorRate({ errorCount: errCount, totalCount: total, minSample: cfg.errorMinSample, threshold: cfg.errorRate });
    if (verdict.fire && platformRid) {
      await fireIfDue(admin, cfg, nowMs, lastFired, summary, {
        alertKey: "agent_error_rate",
        type: "agent_error_rate",
        restaurantId: platformRid,
        detail: `نسبة الفشل ${Math.round(verdict.rate * 100)}% (${errCount}/${verdict.sample}) خلال ${Math.round(cfg.errorWindowMs / 60000)} دقيقة`,
        context: { rate: verdict.rate, errors: errCount, sample: verdict.sample },
      });
    }
  } catch (e) {
    summary.errors.push(`error_rate:${e instanceof Error ? e.message : String(e)}`);
  }

  // --- c. Platform-wide daily spend (only when a budget is configured) -------
  try {
    if (cfg.dailyBudgetUsd > 0) {
      // Start of the current day in Asia/Riyadh (UTC+3, no DST) — the business day.
      const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
      const riyadhNow = nowMs + RIYADH_OFFSET_MS;
      const startOfRiyadhDay = Math.floor(riyadhNow / 86_400_000) * 86_400_000 - RIYADH_OFFSET_MS;
      const since = new Date(startOfRiyadhDay).toISOString();
      const { data } = await admin
        .from("agent_runs")
        .select("cost_usd")
        .gte("created_at", since);
      const spend = (data ?? []).reduce((s, r) => s + (Number((r as { cost_usd?: number }).cost_usd) || 0), 0);
      const verdict = evaluateDailySpend(spend, cfg.dailyBudgetUsd);
      if (verdict.fire && platformRid) {
        await fireIfDue(admin, cfg, nowMs, lastFired, summary, {
          alertKey: "daily_spend",
          type: "daily_spend",
          restaurantId: platformRid,
          detail: `مصروف اليوم ${verdict.spendUsd.toFixed(2)}$ تجاوز الحد ${verdict.budgetUsd.toFixed(2)}$`,
          context: { spendUsd: verdict.spendUsd, budgetUsd: verdict.budgetUsd },
        });
      }
    }
  } catch (e) {
    summary.errors.push(`daily_spend:${e instanceof Error ? e.message : String(e)}`);
  }

  // --- b. Per-tenant delivery silence (the Wesaya signature) -----------------
  try {
    const { data: tenants } = await admin
      .from("restaurants")
      .select("id, name, is_open, agent_mode")
      .eq("active", true);
    for (const t of (tenants ?? []) as { id: string; name: string | null; is_open: boolean | null; agent_mode: string | null }[]) {
      const agentLive = t.agent_mode === "live" || t.agent_mode === "test";
      // Fetch this tenant's most recent inbound message time.
      const { data: lastRow } = await admin
        .from("messages")
        .select("created_at")
        .eq("restaurant_id", t.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastInboundAtMs = lastRow?.created_at ? new Date(lastRow.created_at as string).getTime() : null;
      summary.checked++;

      // Eligible = open + agent live/test + a channel that was live RECENTLY (not
      // dormant). Dormant (silent > dormantMs) tenants are simply quiet, not down.
      const notDormant = lastInboundAtMs != null && nowMs - lastInboundAtMs < cfg.dormantMs;
      const eligible = t.is_open === true && agentLive && notDormant;
      const verdict = evaluateDeliverySilence({ lastInboundAtMs, nowMs, eligible, thresholdMs: cfg.deliverySilenceMs });
      if (verdict.fire) {
        await fireIfDue(admin, cfg, nowMs, lastFired, summary, {
          alertKey: `delivery_silence:${t.id}`,
          type: "delivery_silence",
          restaurantId: t.id,
          detail: `ما وصلنا أي رسالة من العملاء منذ ${verdict.minutesSilent} دقيقة والمطعم مفتوح`,
          context: { minutesSilent: verdict.minutesSilent, restaurantName: t.name },
        });
      }
    }
  } catch (e) {
    summary.errors.push(`delivery_silence:${e instanceof Error ? e.message : String(e)}`);
  }

  // Prune the webhook ledger so it stays bounded.
  try {
    const cutoff = new Date(nowMs - cfg.webhookRetentionMs).toISOString();
    const { data } = await admin.from("monitor_webhook_events").delete().lt("at", cutoff).select("id");
    summary.pruned = (data ?? []).length;
  } catch (e) {
    summary.errors.push(`prune:${e instanceof Error ? e.message : String(e)}`);
  }

  summary.ok = summary.errors.length === 0;
  return summary;
}
