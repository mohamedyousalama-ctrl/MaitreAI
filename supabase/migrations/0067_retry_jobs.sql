-- ============================================================================
-- MaitreAI — Item 11: retry_jobs (durable retry queue)
--
-- A DB-backed queue so a failed side-effect (an LLM outcome classify, a customer
-- paid-notify) survives a process restart instead of dying in an in-memory loop.
-- Callers enqueue on failure; the /api/cron/retry-jobs drain claims due jobs and
-- retries with exponential backoff (lib/jobs/retry-queue). Terminal after
-- max_attempts → status 'dead' (a durable record for an operator, never a silent
-- drop).
--
--   kind        — the side-effect to re-attempt ('outcome_emit' | 'paid_notify').
--   payload     — jsonb args for the handler (ids, phone, text).
--   attempts    — failed attempts so far (backoff = base·2^(n-1), capped 1h).
--   next_at     — earliest eligible run (defaults now → next tick).
--   status      — pending | processing | done | dead.
--
-- Writes happen ONLY via the service role (enqueue + cron), so no client write
-- policy; per-tenant read for members mirrors other analytics/ops tables.
--
-- Migration number 0067 assumes merge order #281=0062, R6=0063, R4=0064,
-- standing=0065, tonight=0066 (state at branch time). PREPARE-ONLY.
-- ============================================================================

create table if not exists public.retry_jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  attempts      integer not null default 0,
  max_attempts  integer not null default 6,
  next_at       timestamptz not null default now(),
  status        text not null default 'pending'
                  check (status in ('pending','processing','done','dead')),
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The drain query: due pending jobs, oldest first.
create index if not exists retry_jobs_due_idx
  on public.retry_jobs(next_at)
  where status = 'pending';

alter table public.retry_jobs enable row level security;
drop policy if exists retry_jobs_read on public.retry_jobs;
create policy retry_jobs_read on public.retry_jobs
  for select using (restaurant_id is not null and public.is_member_of(restaurant_id));

-- Rollback (manual):
--   drop table if exists public.retry_jobs;
