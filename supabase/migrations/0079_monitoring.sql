-- ============================================================================
-- MaitreAI — WO-MONITORING-ALERTING: monitor state + webhook event ledger.
--
-- Kivo had ZERO monitoring: the Wesaya WhatsApp outage ran for hours and was
-- caught by a human sending a test message. This migration adds the two small,
-- service-role-only tables the monitor sweep (lib/monitoring/sweep.ts, triggered
-- every ~5 min by the external scheduler → /api/monitor/sweep) needs:
--
--   • monitor_alert_state  — per-alert COOLDOWN memory. One row per alert_key
--     (e.g. "delivery_silence:<restaurantId>", "uptime_down", "daily_spend").
--     The sweep reads last_fired_at to decide whether an alert is still in its
--     cooldown window (spam discipline: an alert storm at 3am is as useless as
--     silence). This is a SECOND layer on top of recordCriticalAlert's existing
--     active-alert dedupe — cooldown here suppresses even the RECORD attempt.
--
--   • monitor_webhook_events — a lightweight ledger the webhook writes ONE row to
--     ONLY on an anomaly (401 invalid-signature, or an unresolved_phone_number_id
--     drop — the two Meta-side incident signatures). The happy webhook path never
--     writes here (additive; happy path byte-identical). The sweep counts recent
--     rows to detect a SPIKE, then prunes old rows so the table stays bounded.
--
-- Posture (matches 0040 system_alerts): service-role only, deny-by-default RLS.
-- The service role bypasses RLS, so the admin-client sweep + webhook writes keep
-- working with no policies; anon/authenticated have no access.
-- ============================================================================

-- 1. Per-alert cooldown memory ----------------------------------------------
create table if not exists public.monitor_alert_state (
  alert_key    text primary key,          -- "<type>" (global) | "<type>:<restaurantId>"
  last_fired_at timestamptz not null default now(),
  -- last observed value/context (e.g. { "minutesSilent": 22 }) for diagnostics.
  state        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- 2. Webhook anomaly ledger (written only on 401 / unresolved drop) ----------
create table if not exists public.monitor_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  at              timestamptz not null default now(),
  kind            text not null,          -- 'invalid_signature' | 'unresolved_phone_number_id'
  phone_number_id text,                   -- Meta phone_number_id when known (never a secret)
  restaurant_id   uuid references public.restaurants(id) on delete set null
);
-- Spike query + prune both scan by time; index it.
create index if not exists monitor_webhook_events_at_idx
  on public.monitor_webhook_events (at desc);

-- Service-role only: revoke public grants + deny-by-default RLS (0040 posture).
revoke all on public.monitor_alert_state    from anon, authenticated;
revoke all on public.monitor_webhook_events from anon, authenticated;
alter table public.monitor_alert_state    enable row level security;
alter table public.monitor_webhook_events enable row level security;
