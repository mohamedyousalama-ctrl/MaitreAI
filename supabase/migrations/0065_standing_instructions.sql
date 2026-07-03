-- ============================================================================
-- MaitreAI — Item 9: standing_instructions (versioned operator guidance)
--
-- Durable, operator-authored guidance injected into Karim's system prompt as a
-- SUBORDINATE, escaped section (gated by the `standing_instructions` feature
-- flag, default OFF). Governance-first:
--   • VERSIONED  — version int per restaurant (a new revision = a new row).
--   • ACTIVE     — active boolean gates whether it's injected.
--   • CREATED/APPROVED — created_by + approved_by (soft member/user refs) so a
--                  standing rule carries who authored and who approved it.
--   • RETIRE-NOT-DELETE — retired_at timestamptz; a rule is retired (active=false
--                  + retired_at set), never hard-deleted, so the history survives.
--   • BOUNDED    — body length capped (<= 2000) so a runaway instruction can't
--                  bloat/overwhelm the prompt.
--
-- RLS: per-tenant read for members; writes go through the service role (the
-- authoring API), mirroring conversation_outcomes.
--
-- Migration number 0065 assumes merge order #281=0062, R6=0063, R4=0064 (state at
-- branch time); renumber at merge if the landed order differs. PREPARE-ONLY.
-- ============================================================================

create table if not exists public.standing_instructions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version       integer not null default 1,
  body          text not null check (char_length(body) <= 2000 and char_length(btrim(body)) > 0),
  active        boolean not null default true,
  created_by    uuid,
  approved_by   uuid,
  created_at    timestamptz not null default now(),
  retired_at    timestamptz
);

create index if not exists standing_instructions_active_idx
  on public.standing_instructions(restaurant_id)
  where active and retired_at is null;

alter table public.standing_instructions enable row level security;
drop policy if exists standing_instructions_read on public.standing_instructions;
create policy standing_instructions_read on public.standing_instructions
  for select using (public.is_member_of(restaurant_id));

-- Rollback (manual):
--   drop table if exists public.standing_instructions;
