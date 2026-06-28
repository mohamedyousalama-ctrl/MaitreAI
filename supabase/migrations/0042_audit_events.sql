-- ============================================================================
-- MaitreAI — MO4 actor audit trail (append-only).
-- One table all member-actions write to (who did what), so the 7-operator
-- "who took / advanced / closed this?" question is answerable. COD keeps its own
-- richer financial trail (cod_cash_events / cod_settlements) — NOT duplicated here.
--
-- Writes: service-role (admin) ONLY — audit rows are system-trusted, never
-- member-writable (consistent with the M1.7 lockdown). Reads: members of the
-- tenant may SELECT their restaurant's trail. Append-only: no UPDATE/DELETE policy.
--
-- ⚠️ PREPARE ONLY — review before applying to prod (Wesaya). Not auto-applied.
-- ============================================================================

create table if not exists public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  -- actor_member_id = the acting members.id (display key, matches MO1's assigned_member_id).
  -- ON DELETE SET NULL so the trail survives a member being removed.
  actor_member_id uuid references public.members(id) on delete set null,
  -- actor_user_id = the stable auth user id (survives member removal; mirrors the COD trail).
  actor_user_id   uuid,
  actor_role      text,
  action          text not null,  -- conversation_claimed | conversation_returned | conversation_closed | order_status_changed
  entity_type     text not null,  -- 'conversation' | 'order'
  entity_id       uuid not null,
  metadata        jsonb not null default '{}'::jsonb,  -- e.g. { "from": "...", "to": "..." }
  created_at      timestamptz not null default now()
);

create index if not exists audit_events_rid_created_idx on public.audit_events (restaurant_id, created_at desc);
create index if not exists audit_events_entity_idx       on public.audit_events (entity_type, entity_id);

alter table public.audit_events enable row level security;

-- Members of the tenant may READ their restaurant's trail.
drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read on public.audit_events
  for select using (public.is_member_of(restaurant_id));

-- No INSERT/UPDATE/DELETE policy → members cannot write or mutate audit rows.
-- The service-role (admin) client bypasses RLS for inserts (the only writer).
-- Append-only by construction.

-- ── Rollback (commented) ────────────────────────────────────────────────────
-- drop policy if exists audit_events_read on public.audit_events;
-- drop table if exists public.audit_events;
