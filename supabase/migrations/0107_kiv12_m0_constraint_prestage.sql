-- ============================================================================
-- MaitreAI — 0107: KIV-12 / CTRL-03 — M-0 CONSTRAINT PRE-STAGE — NOT ADDITIVE
--
-- Governed by AGENT-WO-002A under the frozen control-plane specification
-- `WO-SPEC-KVD06-M0-M4-ADDITIVE-CONTROL-PLANE-001` (SHA-256 61f9d743…c491a4364)
-- and its binding adjudication of 11 August 2026 (SHA-256 8eb016e5…8c5df3a9e),
-- both held in docs/governance/.
--
-- M-0 is the CONSTRAINT PRE-STAGE. It adds exactly three constraints to
-- public.conversations and nothing else. It is deliberately NOT additive in the
-- Revision 14 sense: it creates no new table, column, function, trigger, policy,
-- grant or role, and it introduces no M-1 or M-2 material.
--
--   A. conversations_restaurant_id_id_key
--      UNIQUE (restaurant_id, id) — the tenant-scoped composite identity later
--      stages reference. It does not replace the existing `id` primary key.
--
--   B. conversations_channel_v1_check
--      CHECK (channel IN ('whatsapp','website')) — the inherited V1 database
--      channel compatibility contract. Product scope remains WhatsApp-only; this
--      constraint is the database-level boundary, not a product-scope change.
--
--   C. conversations_safety_state_check
--      CHECK (is_safety_hold = false OR ownership_state IN
--             ('SYSTEM_HOLD','HUMAN_ACTIVE','HUMAN_IDLE'))
--      A safety hold may only be carried by a governed held state. SYSTEM_HOLD,
--      HUMAN_ACTIVE and HUMAN_IDLE each remain valid with a safety hold.
--
-- All three are added VALID. There is no NOT VALID / VALIDATE split.
--
-- This migration performs NO data remediation. It contains no UPDATE, DELETE or
-- INSERT, and it does not repair pre-existing rows. Entry conformity was
-- established by the independently accepted KIV-11 / CTRL-02 preflight evidence
-- (PF5: no channel outside the permitted set; PF6: zero invalid held rows), not
-- by this file.
--
-- Idempotent: each constraint is added only if absent from public.conversations,
-- following the guarded-constraint pattern established in 0032.
--
-- APPLICATION: this repository has no migration runner. Merging this file does
-- not execute it. Applying it to any database is a separate, separately approved
-- event under the governed migration ceremony in docs/KIVO_AGENT_ROADMAP.md.
-- Not applied to production by the work order that authored it.
-- ============================================================================

-- A. Tenant-scoped composite identity.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_restaurant_id_id_key'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_restaurant_id_id_key
      unique (restaurant_id, id);
  end if;
end $$;

-- B. V1 database channel compatibility contract.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_channel_v1_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_channel_v1_check
      check (channel in ('whatsapp', 'website'));
  end if;
end $$;

-- C. A safety hold may only be carried by a governed held state.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_safety_state_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_safety_state_check
      check (
        is_safety_hold = false
        or ownership_state in ('SYSTEM_HOLD', 'HUMAN_ACTIVE', 'HUMAN_IDLE')
      );
  end if;
end $$;

-- Rollback (governed, manual — never run as part of a replay):
--   alter table public.conversations drop constraint if exists conversations_safety_state_check;
--   alter table public.conversations drop constraint if exists conversations_channel_v1_check;
--   alter table public.conversations drop constraint if exists conversations_restaurant_id_id_key;
