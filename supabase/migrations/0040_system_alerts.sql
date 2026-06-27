-- ============================================================================
-- MaitreAI — system_alerts: critical-failure surface for the operator console.
--
-- Three critical failures today reach only console.error and no human:
--   • agent_error            — Karim/agent crashed or threw (respond-and-send)
--   • whatsapp_send_failed   — outbound WhatsApp send failed after retries
--   • inbound_persist_failed — an inbound message failed to persist (webhook 5xx)
--
-- This table records each so the console can show a dismissible banner and an
-- email can be sent. Tenant-scoped. Service-role only (deny-by-default RLS):
-- writes come from the admin client at the failure points; reads come from the
-- tenant-scoped /api/alerts route using the admin client + getServerTenant, so
-- no anon/authenticated grants are needed. Matches the 0038 lockdown posture.
-- ============================================================================

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  type text not null,                 -- agent_error | whatsapp_send_failed | inbound_persist_failed
  detail text,                        -- human-readable error message
  conversation_id uuid references public.conversations(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,           -- null = active (shown in banner)
  created_at timestamptz not null default now()
);

-- Banner query: active alerts for a tenant, newest first.
create index if not exists system_alerts_active_idx
  on public.system_alerts (restaurant_id, created_at desc)
  where dismissed_at is null;

-- Service-role only: revoke public grants + enable deny-by-default RLS. The
-- service role bypasses RLS in Postgres, so the admin-client read/write paths
-- keep working with no policies. Anon/authenticated have no access.
revoke all on public.system_alerts from anon, authenticated;
alter table public.system_alerts enable row level security;
