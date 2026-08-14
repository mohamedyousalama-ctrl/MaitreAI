-- ============================================================================
-- MaitreAI — 0108: KIV-13 / CTRL-04 — M-1 ADDITIVE — SCOPE-1
--
-- Governed by AGENT-WO-002A under:
--   * WO-SPEC-KVD06-SECURE-CONTROL-V1 REVISION 14 (exact source, SHA-256
--     f5eda59d06bdb4e72af183ab70deaec5dbb0041a02b6c5ba59bad21e456f6c37)
--   * WO-SPEC-KVD06-M0-M4-ADDITIVE-CONTROL-PLANE-001.CLEARED.md
--   * its binding adjudication of 11 August 2026
--   * the founder-approved KIV-13 M1 Binding Adjudication of 13 August 2026
--
-- M-1 IS ADDITIVE (Revision 14 §15.4). This file:
--   REVOKES nothing from any existing principal.
--   CHANGES the owner of no existing object.
--   ENABLES/FORCES RLS on no existing table.
--   ADDS, ALTERS or DROPS no trigger on any existing table.
--   ADDS no NOT NULL / CHECK / UNIQUE / FK to any populated existing table.
--   WRITES no existing row. The MIV initialization writes ONLY the new MIV table.
--
-- Creates (Revision 14 §15.4 M-1, as reconciled by the 13 August adjudication):
--   role kivo_control_owner, granted to no role
--   schema USAGE and the additive SELECT/INSERT/UPDATE grants of adjudication §2D
--   the seven preserved owner policies of adjudication §2B
--   member_identity_versions + ux_miv_open_version + three immutability triggers
--     + its four policies (adjudication §2C), and the population-relative initialization
--   A0 public.control_operations + ux_a0_evidence_core + its four evidence triggers
--   A2 public.conversation_audit_failures + fk_a2_parent_core + its four evidence triggers
--   EIGHT NULLABLE columns on A1 public.conversation_assignment_events
--   type public.kv_control_result and the sixteen control functions F1..F16 with SA1 grants
--
-- EXPLICITLY NOT IN M-1: the M-2 audit-bridge repair; any change to
-- public.log_assignment_event(); tg_members_identity_version on public.members; the four A1
-- evidence triggers (M-5); A1 backfill/hardening/ownership/revocation; fk_a1_parent_core;
-- A3, control_alert_intents, F17, F18, F19 or any other SCOPE-2 material; R-3/R-4; M-5+.
--
-- SA1 (Revision 14 §8.3) is the actor authority and is implemented. SA2 is WITHDRAWN by the
-- CLEARED specification and is NOT implemented — consistent with Revision 14 §8.3 SA6, which
-- forbids issuing a migration containing SA2 before VP-1 has been executed.
--
-- APPLICATION: this repository has no migration runner. Merging this file does not execute
-- it. Applying it to any database is a separate, separately approved event under the governed
-- migration ceremony. Not applied to production by the work order that authored it.
-- ============================================================================

-- 0108 depends on 0107's conversations_restaurant_id_id_key and on pgcrypto's digest.
do $$
begin
  if pg_catalog.to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception '0108 requires pgcrypto function extensions.digest(bytea,text)';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_restaurant_id_id_key'
      and conrelid = 'public.conversations'::regclass
  ) then
    raise exception '0108 requires 0107 conversations_restaurant_id_id_key to exist first';
  end if;
end $$;

-- ===========================================================================
-- 1. NEW PRINCIPAL — Revision 14 R1/R2/R19
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'kivo_control_owner') then
    create role kivo_control_owner
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication;
  end if;
end $$;
-- R2 / R19: kivo_control_owner is granted to no role in the FINAL state. The only membership
-- that may survive this migration is the one PostgreSQL creates automatically when a
-- non-superuser CREATEROLE executor runs CREATE ROLE: grantor = bootstrap superuser,
-- ADMIN TRUE, SET FALSE, INHERIT FALSE. That record is not removable by the executor and
-- confers no ability to act as kivo_control_owner. Section 1B adds temporary capability on
-- top of it; section 16 removes every trace of that temporary capability.

-- ===========================================================================
-- 1B. TRANSACTIONAL BOOTSTRAP — TEMPORARY, REMOVED BY SECTION 16 BEFORE SUCCESS
--     PostgreSQL 16+ requires the executing role to be able to SET ROLE to a new owner
--     before ALTER ... OWNER TO succeeds, and requires the new owner to hold CREATE on the
--     containing schema. A Supabase-style non-superuser executor (rolsuper=false,
--     rolcreaterole=true) receives neither from the automatic CREATE ROLE grant, which is
--     recorded as ADMIN TRUE / SET FALSE / INHERIT FALSE. Without this section the first
--     ownership transfer fails with SQLSTATE 42501 "must be able to SET ROLE".
--
--     SET is required for the ownership transfers themselves. INHERIT is required because
--     later statements in this migration act on objects kivo_control_owner already owns:
--     the MIV initialization INSERT under FORCE row level security, the GRANTs in sections 5
--     and 15, and the A0/A2 foreign keys that reference the MIV table.
--
--     Both capabilities are transaction-scoped in effect: section 16 removes them, and any
--     failure anywhere in this migration rolls the whole thing back, including the role.
-- ===========================================================================
do $$
begin
  execute format('grant kivo_control_owner to %I with inherit true, set true', current_user);
end $$;
grant create on schema public to kivo_control_owner;   -- bootstrap-only; revoked in section 16

-- ===========================================================================
-- 2. ADDITIVE PRIVILEGES FOR THE NEW PRINCIPAL ONLY — adjudication §2D
--    Nothing is revoked from anon, authenticated, service_role or postgres.
-- ===========================================================================
grant usage on schema public     to kivo_control_owner;
grant usage on schema auth       to kivo_control_owner;
grant usage on schema extensions to kivo_control_owner;
grant execute on function extensions.digest(bytea, text) to kivo_control_owner;  -- R8

grant select on public.conversations to kivo_control_owner;
grant select on public.members       to kivo_control_owner;
grant select on public.restaurants   to kivo_control_owner;
grant select on public.customers     to kivo_control_owner;

-- messages: least privilege — exactly three identity columns, no content. R12 / §12.
grant select (id, restaurant_id, conversation_id) on public.messages to kivo_control_owner;

-- A1: the control plane writes canonical evidence rows and reads them back.
grant select, insert on public.conversation_assignment_events to kivo_control_owner;

-- conversations: exactly the eight INSERT and nine UPDATE columns of §12 / adjudication §2D.
grant insert (id, restaurant_id, customer_id, channel, status, ownership_state, owner,
              is_safety_hold) on public.conversations to kivo_control_owner;
grant update (ownership_state, owner, assigned_member_id, is_safety_hold, escalation_reason,
              handover_note, status, updated_at, allergy_note)
      on public.conversations to kivo_control_owner;
-- control_epoch is deliberately NOT granted: trg_bump_control_epoch sets it in BEFORE UPDATE.

-- ===========================================================================
-- 3. THE SEVEN PRESERVED OWNER POLICIES — adjudication §2B
--    Permissive additions on existing tables. No RLS state is enabled or forced here,
--    and no existing policy is altered or dropped.
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='conversations' and policyname='conversations_control_owner_rw') then
    create policy conversations_control_owner_rw on public.conversations
      for all to kivo_control_owner using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='members' and policyname='members_control_owner_sel') then
    create policy members_control_owner_sel on public.members
      for select to kivo_control_owner using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='restaurants' and policyname='restaurants_control_owner_sel') then
    create policy restaurants_control_owner_sel on public.restaurants
      for select to kivo_control_owner using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='customers' and policyname='customers_control_owner_sel') then
    create policy customers_control_owner_sel on public.customers
      for select to kivo_control_owner using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='messages' and policyname='messages_control_owner_sel') then
    create policy messages_control_owner_sel on public.messages
      for select to kivo_control_owner using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='conversation_assignment_events'
                 and policyname='a1_control_owner_ins') then
    create policy a1_control_owner_ins on public.conversation_assignment_events
      for insert to kivo_control_owner with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='conversation_assignment_events'
                 and policyname='a1_control_owner_sel') then
    create policy a1_control_owner_sel on public.conversation_assignment_events
      for select to kivo_control_owner using (true);
  end if;
end $$;

-- ===========================================================================
-- 4. SHARED EVIDENCE-IMMUTABILITY TRIGGER FUNCTIONS — KIV18 (Revision 14 §18)
-- ===========================================================================
create or replace function public.kv_tg_evidence_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'KIV18 % attempted on %.% — evidence is append-only',
    tg_op, tg_table_schema, tg_table_name;
end $$;

create or replace function public.kv_tg_evidence_no_truncate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'KIV18 TRUNCATE attempted on %.% — evidence is append-only',
    tg_table_schema, tg_table_name;
end $$;

-- ===========================================================================
-- 5. MIV — public.member_identity_versions (Revision 14 §4.2 Option A)
-- ===========================================================================
create table if not exists public.member_identity_versions (
  member_id     uuid        not null,
  version       integer     not null,
  restaurant_id uuid        not null,
  user_id       uuid        not null,
  role          text        not null,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz null,
  constraint miv_pkey                primary key (member_id, version),                    -- MIV-1
  constraint miv_identity_key        unique (member_id, version, restaurant_id, user_id, role), -- MIV-2
  constraint miv_role_check          check (role in ('manager','operation')),             -- MIV-3
  constraint miv_version_check       check (version >= 1),                                -- MIV-4
  constraint miv_valid_time_check    check (valid_to is null or valid_to > valid_from),   -- MIV-5
  constraint fk_miv_member           foreign key (member_id) references public.members(id)
                                     on update restrict on delete restrict                -- FK-MIV-1
);

-- IX-MIV-1: a named PARTIAL UNIQUE INDEX, not a constraint. At most one open version per member.
create unique index if not exists ux_miv_open_version
  on public.member_identity_versions (member_id) where valid_to is null;

alter table public.member_identity_versions owner to kivo_control_owner;                  -- R3
alter table public.member_identity_versions enable row level security;                    -- R4
alter table public.member_identity_versions force row level security;                     -- R4

-- MIV immutability: permit exactly one change — closing an open version. KIV18 otherwise.
create or replace function public.kv_tg_miv_close_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_id     is distinct from old.member_id
     or new.version    is distinct from old.version
     or new.restaurant_id is distinct from old.restaurant_id
     or new.user_id    is distinct from old.user_id
     or new.role       is distinct from old.role
     or new.valid_from is distinct from old.valid_from then
    raise exception 'KIV18 member_identity_versions is immutable except for closing an open version';
  end if;
  if old.valid_to is not null then
    raise exception 'KIV18 member_identity_versions version is already closed';
  end if;
  if new.valid_to is null then
    raise exception 'KIV18 member_identity_versions update must close the open version';
  end if;
  return new;
end $$;

drop trigger if exists tg_miv_close_only  on public.member_identity_versions;
drop trigger if exists tg_miv_no_delete   on public.member_identity_versions;
drop trigger if exists tg_miv_no_truncate on public.member_identity_versions;
create trigger tg_miv_close_only  before update   on public.member_identity_versions
  for each row execute function public.kv_tg_miv_close_only();
create trigger tg_miv_no_delete   before delete   on public.member_identity_versions
  for each row execute function public.kv_tg_evidence_immutable();
create trigger tg_miv_no_truncate before truncate on public.member_identity_versions
  for each statement execute function public.kv_tg_evidence_no_truncate();

-- MIV policies — adjudication §2C. Exactly one owner UPDATE policy; no DELETE policy. R10.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='member_identity_versions' and policyname='miv_control_owner_ins') then
    create policy miv_control_owner_ins on public.member_identity_versions
      for insert to kivo_control_owner with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='member_identity_versions' and policyname='miv_control_owner_sel') then
    create policy miv_control_owner_sel on public.member_identity_versions
      for select to kivo_control_owner using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='member_identity_versions' and policyname='miv_control_owner_upd') then
    create policy miv_control_owner_upd on public.member_identity_versions
      for update to kivo_control_owner
      using (valid_to is null)
      with check (valid_to is not null and valid_to > valid_from);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='member_identity_versions' and policyname='miv_member_sel') then
    create policy miv_member_sel on public.member_identity_versions
      for select to authenticated using (public.is_member_of(restaurant_id));
  end if;
end $$;

grant select on public.member_identity_versions to authenticated;                          -- R5

-- MIV INITIALIZATION — population-relative. N = count(public.members) at application time.
-- No historical count is an execution invariant (CLEARED Correction 3). Writes ONLY MIV.
insert into public.member_identity_versions (member_id, version, restaurant_id, user_id, role)
select m.id, 1, m.restaurant_id, m.user_id, m.role
from public.members m
where not exists (
  select 1 from public.member_identity_versions v where v.member_id = m.id
);

-- ===========================================================================
-- 6. A0 — public.control_operations (Revision 14 §4.3, 23 columns)
-- ===========================================================================
create table if not exists public.control_operations (
  id                   uuid        not null default gen_random_uuid() primary key,
  restaurant_id        uuid        not null,
  operation_id         uuid        not null,
  conversation_id      uuid        not null,
  operation_name       text        not null,
  request_fingerprint  text        not null,
  transition_id        uuid        not null,
  operation_status     text        not null,
  changed              boolean     not null,
  from_mode            text        not null,
  to_mode              text        not null,
  epoch_before         bigint      not null,
  epoch_after          bigint      not null,
  audit_kind           text        not null,
  audit_id             uuid        null,
  alert_intent_id      uuid        null,
  actor_kind           text        not null,
  actor_member_id      uuid        null,
  actor_member_version integer     null,
  actor_user_id        uuid        null,
  actor_label          text        null,
  actor_role           text        null,
  created_at           timestamptz not null default now(),
  constraint a0_1_operation_identity unique (restaurant_id, operation_id),
  constraint a0_2_transition_unique  unique (transition_id),
  constraint a0_3_operation_name check (operation_name in
    ('claim','escalate','reassign','return_to_kivo','release_hold','clear_stale_assignee',
     'close','set_human_idle','reopen_closed','timeout_return','create_safety_conversation')),
  constraint a0_4_operation_status check (operation_status in ('applied','noop','alerted')),
  constraint a0_5_audit_kind check (audit_kind in ('event','failure','none')),
  constraint a0_6_fingerprint check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint a0_7_actor_kind check (actor_kind in ('member','system')),
  constraint a0_8_applied_changed check ((operation_status = 'applied') = changed),
  constraint a0_9_nonapplied_unchanged
    check ((operation_status in ('noop','alerted')) = (not changed)),
  constraint a0_10_changed_epoch check (not changed or epoch_after = epoch_before + 1),
  constraint a0_11_unchanged_epoch
    check (changed or (epoch_after = epoch_before and from_mode = to_mode)),
  constraint a0_12_outcome_shape check (
       (operation_status = 'applied' and audit_kind in ('event','failure')
          and audit_id is not null and alert_intent_id is null)
    or (operation_status = 'noop' and audit_kind = 'none'
          and audit_id is null and alert_intent_id is null)
    or (operation_status = 'alerted' and audit_kind = 'none'
          and audit_id is null and alert_intent_id is not null)),
  constraint a0_13_actor_coherence check (
       (actor_kind = 'member' and actor_member_id is not null and actor_member_version is not null
          and actor_user_id is not null and actor_role is not null)
    or (actor_kind = 'system' and actor_member_id is null and actor_member_version is null
          and actor_user_id is null and actor_role is null)),
  constraint a0_14_modes check (
    from_mode in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_ACTIVE','HUMAN_IDLE','AI_RESUME_PENDING',
                  'SYSTEM_HOLD','CLOSED')
    and to_mode in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_ACTIVE','HUMAN_IDLE','AI_RESUME_PENDING',
                    'SYSTEM_HOLD','CLOSED')),
  constraint a0_15_actor_role check (actor_role is null or actor_role in ('manager','operation')),
  constraint a0_16_alerted_operation
    check (operation_status <> 'alerted' or operation_name = 'timeout_return'),
  constraint a0_17_actor_label_null check (actor_label is null),
  constraint a0_18_scope1_no_alert_intent check (alert_intent_id is null),
  constraint fk_a0_1_conversation foreign key (restaurant_id, conversation_id)
    references public.conversations (restaurant_id, id) on update restrict on delete restrict,
  constraint fk_a0_2_actor_identity foreign key
    (actor_member_id, actor_member_version, restaurant_id, actor_user_id, actor_role)
    references public.member_identity_versions (member_id, version, restaurant_id, user_id, role)
    match simple on update restrict on delete restrict
);

-- UX-A0-1: the child evidence-equality target. Every column is NOT NULL.
create unique index if not exists ux_a0_evidence_core
  on public.control_operations
     (transition_id, restaurant_id, conversation_id, operation_id, from_mode, to_mode,
      epoch_before, epoch_after, actor_kind);

create index if not exists a0_restaurant_created_idx
  on public.control_operations (restaurant_id, created_at desc);
create index if not exists a0_conversation_created_idx
  on public.control_operations (conversation_id, created_at desc);
create index if not exists a0_actor_member_idx
  on public.control_operations (actor_member_id);

alter table public.control_operations owner to kivo_control_owner;                          -- R3
alter table public.control_operations enable row level security;                            -- R4
alter table public.control_operations force row level security;                             -- R4

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='control_operations' and policyname='a0_control_owner_ins') then
    create policy a0_control_owner_ins on public.control_operations
      for insert to kivo_control_owner with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='control_operations' and policyname='a0_control_owner_sel') then
    create policy a0_control_owner_sel on public.control_operations
      for select to kivo_control_owner using (true);
  end if;
end $$;

-- ===========================================================================
-- 7. A2 — public.conversation_audit_failures (Revision 14 §4.5, 20 columns)
-- ===========================================================================
create table if not exists public.conversation_audit_failures (
  id                   uuid        not null default gen_random_uuid() primary key,
  transition_id        uuid        not null,
  operation_id         uuid        not null,
  restaurant_id        uuid        not null,
  conversation_id      uuid        not null,
  attempted_event_type text        not null,
  from_mode            text        not null,
  to_mode              text        not null,
  epoch_before         bigint      not null,
  epoch_after          bigint      not null,
  actor_kind           text        not null,
  actor_member_id      uuid        null,
  actor_member_version integer     null,
  actor_user_id        uuid        null,
  actor_label          text        null,
  actor_role           text        null,
  failure_category     text        not null,
  failure_sqlstate     text        not null,
  failure_fingerprint  text        not null,
  occurred_at          timestamptz not null default now(),
  constraint a2_1_transition_unique unique (transition_id),
  constraint a2_2_actor_kind check (actor_kind in ('member','system')),
  constraint a2_3_to_mode check (to_mode in ('HOLD_UNCLAIMED','SYSTEM_HOLD','HUMAN_ACTIVE')),
  constraint a2_4_failure_category check (failure_category in
    ('audit_insert_constraint','audit_insert_privilege','audit_insert_io','audit_insert_other')),
  constraint a2_5_sqlstate check (failure_sqlstate ~ '^[0-9A-Z]{5}$'),
  constraint a2_6_fingerprint check (failure_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint a2_7_epoch check (epoch_after = epoch_before + 1),
  constraint a2_8_actor_coherence check (
       (actor_kind = 'member' and actor_member_id is not null and actor_member_version is not null
          and actor_user_id is not null and actor_role is not null)
    or (actor_kind = 'system' and actor_member_id is null and actor_member_version is null
          and actor_user_id is null and actor_role is null)),
  constraint a2_9_actor_role check (actor_role is null or actor_role in ('manager','operation')),
  constraint a2_10_actor_label_null check (actor_label is null),
  constraint fk_a2_1_conversation foreign key (restaurant_id, conversation_id)
    references public.conversations (restaurant_id, id) on update restrict on delete restrict,
  constraint fk_a2_2_actor_identity foreign key
    (actor_member_id, actor_member_version, restaurant_id, actor_user_id, actor_role)
    references public.member_identity_versions (member_id, version, restaurant_id, user_id, role)
    match simple on update restrict on delete restrict,
  -- fk_a2_parent_core: VALID (not NOT VALID) because A2 starts empty and every A2 row has a
  -- parent by construction. Nine-column evidence equality onto ux_a0_evidence_core.
  constraint fk_a2_parent_core foreign key
    (transition_id, restaurant_id, conversation_id, operation_id, from_mode, to_mode,
     epoch_before, epoch_after, actor_kind)
    references public.control_operations
    (transition_id, restaurant_id, conversation_id, operation_id, from_mode, to_mode,
     epoch_before, epoch_after, actor_kind)
    deferrable initially deferred
);

create index if not exists a2_restaurant_occurred_idx
  on public.conversation_audit_failures (restaurant_id, occurred_at desc);
create index if not exists a2_actor_member_idx
  on public.conversation_audit_failures (actor_member_id);
create index if not exists a2_restaurant_conversation_idx
  on public.conversation_audit_failures (restaurant_id, conversation_id);
create index if not exists a2_operation_idx
  on public.conversation_audit_failures (operation_id);

alter table public.conversation_audit_failures owner to kivo_control_owner;                 -- R3
alter table public.conversation_audit_failures enable row level security;                   -- R4
alter table public.conversation_audit_failures force row level security;                    -- R4

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='conversation_audit_failures' and policyname='a2_control_owner_ins') then
    create policy a2_control_owner_ins on public.conversation_audit_failures
      for insert to kivo_control_owner with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='conversation_audit_failures' and policyname='a2_control_owner_sel') then
    create policy a2_control_owner_sel on public.conversation_audit_failures
      for select to kivo_control_owner using (true);
  end if;
end $$;

-- ===========================================================================
-- 8. EVIDENCE TRIGGERS ON A0 AND A2 — 13 August adjudication §2A
--    The four A1 evidence triggers remain M-5 ONLY and are not created here.
-- ===========================================================================
create or replace function public.kv_tg_a0_audit_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a1 integer;
  v_a2 integer;
begin
  select count(*) into v_a1 from public.conversation_assignment_events
   where transition_id = new.transition_id;
  select count(*) into v_a2 from public.conversation_audit_failures
   where transition_id = new.transition_id;

  if new.operation_status = 'applied' and new.audit_kind = 'event' then
    if v_a1 <> 1 or v_a2 <> 0 then
      raise exception 'KIV20 audit exclusivity: applied/event requires exactly one A1 row and zero A2 rows';
    end if;
    if not exists (select 1 from public.conversation_assignment_events
                    where transition_id = new.transition_id and id = new.audit_id) then
      raise exception 'KIV20 audit exclusivity: audit_id does not identify the A1 row';
    end if;
  elsif new.operation_status = 'applied' and new.audit_kind = 'failure' then
    if v_a2 <> 1 or v_a1 <> 0 then
      raise exception 'KIV20 audit exclusivity: applied/failure requires exactly one A2 row and zero A1 rows';
    end if;
    if not exists (select 1 from public.conversation_audit_failures
                    where transition_id = new.transition_id and id = new.audit_id) then
      raise exception 'KIV20 audit exclusivity: audit_id does not identify the A2 row';
    end if;
  elsif new.operation_status = 'noop' and new.audit_kind = 'none' then
    if v_a1 <> 0 or v_a2 <> 0 or new.audit_id is not null or new.alert_intent_id is not null then
      raise exception 'KIV20 audit exclusivity: noop/none requires zero A1, zero A2 and null audit ids';
    end if;
  else
    -- 'alerted' is SCOPE-2 only and is independently blocked by a0_18_scope1_no_alert_intent.
    raise exception 'KIV20 audit exclusivity: unsupported outcome shape % / % in SCOPE-1',
      new.operation_status, new.audit_kind;
  end if;
  return null;
end $$;

create or replace function public.kv_tg_a2_parent_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.control_operations%rowtype;
  v_expected_event text;
begin
  select * into p from public.control_operations where transition_id = new.transition_id;  -- G1
  if not found then
    raise exception 'KIV20 A2 parent guard: exactly one A0 parent is required';
  end if;
  if p.actor_member_id      is distinct from new.actor_member_id      then                 -- G2
    raise exception 'KIV20 A2 parent guard: actor_member_id differs from parent'; end if;
  if p.actor_member_version is distinct from new.actor_member_version then                 -- G3
    raise exception 'KIV20 A2 parent guard: actor_member_version differs from parent'; end if;
  if p.actor_user_id        is distinct from new.actor_user_id        then                 -- G4
    raise exception 'KIV20 A2 parent guard: actor_user_id differs from parent'; end if;
  if p.actor_role           is distinct from new.actor_role           then                 -- G5
    raise exception 'KIV20 A2 parent guard: actor_role differs from parent'; end if;
  if p.actor_label is not null or new.actor_label is not null then                         -- G6
    raise exception 'KIV20 A2 parent guard: actor_label must be null on both sides'; end if;
  if p.operation_status <> 'applied' then                                                  -- G7
    raise exception 'KIV20 A2 parent guard: parent operation_status must be applied'; end if;
  if p.audit_kind <> 'failure' or p.audit_id is distinct from new.id then                  -- G8
    raise exception 'KIV20 A2 parent guard: parent audit_kind/audit_id mismatch'; end if;
  v_expected_event := case p.operation_name                                                -- G9 / §9.3
    when 'claim' then 'CLAIMED'
    when 'escalate' then 'ESCALATED'
    when 'reassign' then 'REASSIGNED'
    when 'return_to_kivo' then 'HANDED_TO_AI'
    when 'release_hold' then 'HOLD_RELEASED'
    when 'clear_stale_assignee' then 'STALE_ASSIGNEE_CLEARED'
    when 'close' then 'CLOSED'
    when 'set_human_idle' then 'IDLE'
    when 'reopen_closed' then 'REOPENED'
    when 'timeout_return' then 'TIMEOUT_RETURNED'
    when 'create_safety_conversation' then 'ESCALATED'
  end;
  if new.attempted_event_type is distinct from v_expected_event then
    raise exception 'KIV20 A2 parent guard: attempted_event_type does not match map(operation_name)';
  end if;
  return null;
end $$;

drop trigger if exists tg_a0_no_update           on public.control_operations;
drop trigger if exists tg_a0_no_delete           on public.control_operations;
drop trigger if exists tg_a0_no_truncate         on public.control_operations;
drop trigger if exists tg_a0_audit_exclusivity   on public.control_operations;
create trigger tg_a0_no_update  before update   on public.control_operations
  for each row execute function public.kv_tg_evidence_immutable();
create trigger tg_a0_no_delete  before delete   on public.control_operations
  for each row execute function public.kv_tg_evidence_immutable();
create trigger tg_a0_no_truncate before truncate on public.control_operations
  for each statement execute function public.kv_tg_evidence_no_truncate();
create constraint trigger tg_a0_audit_exclusivity
  after insert on public.control_operations
  deferrable initially deferred
  for each row execute function public.kv_tg_a0_audit_exclusivity();

drop trigger if exists tg_a2_no_update    on public.conversation_audit_failures;
drop trigger if exists tg_a2_no_delete    on public.conversation_audit_failures;
drop trigger if exists tg_a2_no_truncate  on public.conversation_audit_failures;
drop trigger if exists tg_a2_parent_guard on public.conversation_audit_failures;
create trigger tg_a2_no_update  before update   on public.conversation_audit_failures
  for each row execute function public.kv_tg_evidence_immutable();
create trigger tg_a2_no_delete  before delete   on public.conversation_audit_failures
  for each row execute function public.kv_tg_evidence_immutable();
create trigger tg_a2_no_truncate before truncate on public.conversation_audit_failures
  for each statement execute function public.kv_tg_evidence_no_truncate();
create constraint trigger tg_a2_parent_guard
  after insert on public.conversation_audit_failures
  deferrable initially deferred
  for each row execute function public.kv_tg_a2_parent_guard();

-- ===========================================================================
-- 9. A1 — EIGHT NULLABLE COLUMNS ONLY (Revision 14 §4.4, AD2)
--    No NOT NULL, no CHECK, no FK, no backfill, no trigger, no ownership or RLS change,
--    no privilege revocation. The legacy writer's nine-column insert still succeeds.
-- ===========================================================================
alter table public.conversation_assignment_events
  add column if not exists transition_id        uuid,
  add column if not exists operation_id         uuid,
  add column if not exists actor_kind           text,
  add column if not exists is_canonical         boolean,
  add column if not exists actor_member_version integer,
  add column if not exists actor_user_id        uuid,
  add column if not exists actor_label          text,
  add column if not exists actor_role           text;

-- ===========================================================================
-- 10. RESULT TYPE (Revision 14 §17). No actor_label field: no approved source (§8.1).
-- ===========================================================================
do $$
begin
  if to_regtype('public.kv_control_result') is null then
    create type public.kv_control_result as (
      conversation_id uuid, restaurant_id uuid, operation_id uuid, transition_id uuid,
      operation_name text, from_mode text, to_mode text,
      epoch_before bigint, epoch_after bigint,
      changed boolean, replayed boolean, operation_status text,
      audit_kind text, audit_id uuid, alert_intent_id uuid,
      actor_kind text, actor_member_id uuid, actor_member_version integer, actor_role text);
  end if;
end $$;
alter type public.kv_control_result owner to kivo_control_owner;

-- ===========================================================================
-- 11. F16 — INTERNAL ACTOR RESOLUTION (Revision 14 §17, SA1/SA4)
-- ===========================================================================
create or replace function public.kv_control_assert_actor(
  p_restaurant_id uuid,
  p_actor_kind text,
  p_require_manager boolean)
returns table (member_id uuid, member_version integer, member_role text, actor_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_id   uuid;
  v_role text;
  v_ver  integer;
begin
  if p_actor_kind not in ('member','system') then
    raise exception 'KIV14 actor_kind must be member or system';
  end if;

  -- 'system': one row, all four values NULL, satisfying A0-13, A1-6 and A2-8 uniformly.
  if p_actor_kind = 'system' then
    member_id := null; member_version := null; member_role := null; actor_user_id := null;
    return next;
    return;
  end if;

  -- 'member': SA4 — auth.uid() must resolve, else fail closed.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'KIV12 member actor requires an authenticated subject';
  end if;
  select m.id, m.role into v_id, v_role
    from public.members m
   where m.user_id = v_uid and m.restaurant_id = p_restaurant_id;
  if v_id is null then
    raise exception 'KIV12 actor is not a member of the resolved tenant';
  end if;
  if p_require_manager and v_role <> 'manager' then
    raise exception 'KIV12 operation requires the manager role';
  end if;

  -- member_version is the version of that member's OPEN MIV row (unique by ux_miv_open_version).
  select v.version into v_ver
    from public.member_identity_versions v
   where v.member_id = v_id and v.valid_to is null;
  if v_ver is null then
    raise exception 'KIV12 actor has no open member identity version';
  end if;

  member_id := v_id; member_version := v_ver; member_role := v_role; actor_user_id := v_uid;
  return next;
end $$;

-- ===========================================================================
-- 12. F15 — INTERNAL UNIVERSAL TRANSITION CORE (Revision 14 §3.2, §7, §17)
-- ===========================================================================
create or replace function public.kv_control_transition(
  p_conversation_id uuid,
  p_expected_restaurant_id uuid,
  p_operation_id uuid,
  p_operation_name text,
  p_to_mode text,
  p_safety boolean,
  p_to_member_id uuid,
  p_handover_note text,
  p_close_reason text,
  p_trigger_message_id uuid,
  p_escalation_reason text,
  p_allergy_note text,
  p_reason text,
  p_actor_kind text)
returns public.kv_control_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  c              public.conversations%rowtype;
  r              public.kv_control_result;
  a_id           uuid;  a_ver integer;  a_role text;  a_uid uuid;
  v_fields       text[];
  v_f            text;
  v_buf          bytea := ''::bytea;
  v_fp           text;
  v_prior        public.control_operations%rowtype;
  v_transition   uuid := gen_random_uuid();
  v_event        text;
  v_noop         boolean;
  v_target_state text;
  v_target_owner text;
  v_epoch_before bigint;
  v_epoch_after  bigint;
  v_audit_id     uuid;
  v_require_mgr  boolean := false;
  v_outer_fp     text;
begin
  -- ---- D1 identity / tenant resolution -> ONE generic KIV11 -------------------------
  -- Combined predicate. A nonexistent conversation and a wrong-tenant conversation are
  -- indistinguishable to the caller: the API is not an existence oracle.
  select * into c from public.conversations
   where id = p_conversation_id and restaurant_id = p_expected_restaurant_id;
  if not found then
    raise exception 'KIV11 tenant or conversation identity did not resolve';
  end if;

  -- ---- D2 actor resolution and authorization -> KIV12 -------------------------------
  v_require_mgr := p_operation_name in ('reassign','release_hold','clear_stale_assignee');
  select t.member_id, t.member_version, t.member_role, t.actor_user_id
    into a_id, a_ver, a_role, a_uid
    from public.kv_control_assert_actor(p_expected_restaurant_id, p_actor_kind, v_require_mgr) t;

  -- Operation-specific actor authority is part of D2 and is evaluated BEFORE D4, D5 and D6.
  -- An unauthorized member never receives a successful no-op merely because the conversation
  -- already sits at the operation target.
  if p_actor_kind = 'member' and a_role <> 'manager' then
    if p_operation_name in ('return_to_kivo','set_human_idle') then
      if c.assigned_member_id is distinct from a_id then
        raise exception 'KIV12 % requires the current assignee or a manager', p_operation_name;
      end if;
    elsif p_operation_name = 'close' then
      -- assignee when human-owned; manager when unassigned, AI-owned or system-owned
      if c.owner = 'human' and c.assigned_member_id is not null then
        if c.assigned_member_id is distinct from a_id then
          raise exception 'KIV12 close requires the current assignee or a manager';
        end if;
      else
        raise exception 'KIV12 close of an unassigned, AI-owned or system-owned conversation requires a manager';
      end if;
    end if;
  end if;

  -- ---- D3 parameter validity -> KIV14 ------------------------------------------------
  if p_operation_name in ('escalate','create_safety_conversation') then
    if p_escalation_reason is null or length(btrim(p_escalation_reason)) = 0 then
      raise exception 'KIV14 escalation reason must be a non-empty trimmed string';
    end if;
  end if;
  if p_operation_name = 'reassign' then
    if not exists (select 1 from public.members m
                    where m.id = p_to_member_id and m.restaurant_id = p_expected_restaurant_id) then
      raise exception 'KIV12 target member is not a member of the resolved tenant';
    end if;
  end if;
  if p_operation_name = 'reopen_closed' then
    if not exists (select 1 from public.messages g
                    where g.id = p_trigger_message_id
                      and g.conversation_id = p_conversation_id
                      and g.restaurant_id = p_expected_restaurant_id) then
      raise exception 'KIV11 trigger message does not belong to this conversation';
    end if;
  end if;

  -- ---- D4 operation lock (L3) --------------------------------------------------------
  perform pg_advisory_xact_lock(hashtextextended(
    'op:' || p_expected_restaurant_id::text || ':' || p_operation_id::text, 0));

  -- ---- request fingerprint (Revision 14 §16.2) ---------------------------------------
  -- AUTHORITATIVE REQUEST IDENTITY.
  -- Operations whose §16.2 fingerprint fields are not all present in this function's governed
  -- signature (create_safety_conversation: customer and channel; timeout_return: the five
  -- expected inputs) are entered only through F14 / F13, which compute the canonical
  -- fingerprint from the ORIGINAL caller inputs and hand it here transaction-locally. It is
  -- NEVER reconstructed from conversation epoch, updated_at, ownership state, tenant feature
  -- flags or any other post-validation mutable state, so an exact retry always replays against
  -- the exact original identity and concurrent state changes can never make it spuriously
  -- KIV19. The value is consumed once and cleared so it cannot leak to a later operation in
  -- the same transaction.
  v_outer_fp := nullif(current_setting('kv.request_fingerprint', true), '');
  if v_outer_fp is not null then
    perform set_config('kv.request_fingerprint', '', true);
  end if;
  if p_operation_name in ('timeout_return','create_safety_conversation') then
    if v_outer_fp is null or v_outer_fp !~ '^[0-9a-f]{64}$' then
      raise exception 'KIV14 % must be invoked through its governed entry point',
        p_operation_name;
    end if;
    v_fp := v_outer_fp;
  else
  v_fields := array[
      p_operation_name, p_expected_restaurant_id::text, p_conversation_id::text,
      p_operation_id::text, p_actor_kind, a_id::text, a_uid::text ]
    || case p_operation_name
         when 'claim'                then array[p_reason]
         when 'escalate'             then array[case when p_safety then 't' else 'f' end,
                                                p_escalation_reason, p_reason]
         when 'reassign'             then array[p_to_member_id::text, p_reason]
         when 'return_to_kivo'       then array[p_reason]
         when 'release_hold'         then array[p_handover_note, p_reason]
         when 'clear_stale_assignee' then array[p_reason]
         when 'close'                then array[p_close_reason, p_reason]
         when 'set_human_idle'       then array[p_reason]
         when 'reopen_closed'        then array[p_trigger_message_id::text, p_reason]
         else array[p_reason]
       end;
  foreach v_f in array v_fields loop
    if v_f is null then
      v_buf := v_buf || pg_catalog.convert_to('ffffffff', 'UTF8');
    else
      -- §16.2: text is NFC. normalize() is a core SQL built-in under UTF8; no extension and
      -- no new object is introduced by using it.
      v_f := normalize(v_f, NFC);
      v_buf := v_buf
        || pg_catalog.convert_to(
             lpad(to_hex(octet_length(pg_catalog.convert_to(v_f,'UTF8'))), 8, '0'), 'UTF8')
        || pg_catalog.convert_to(v_f, 'UTF8');
    end if;
  end loop;
  v_fp := encode(extensions.digest(v_buf, 'sha256'), 'hex');
  end if;

  -- ---- D5 replay against A0, the sole operation-identity authority -> KIV19 ----------
  select * into v_prior from public.control_operations
   where restaurant_id = p_expected_restaurant_id and operation_id = p_operation_id;
  if found then
    if v_prior.request_fingerprint <> v_fp then
      raise exception 'KIV19 operation_id reused with a different request fingerprint';
    end if;
    r := (v_prior.conversation_id, v_prior.restaurant_id, v_prior.operation_id,
          v_prior.transition_id, v_prior.operation_name, v_prior.from_mode, v_prior.to_mode,
          v_prior.epoch_before, v_prior.epoch_after, v_prior.changed, true,
          v_prior.operation_status, v_prior.audit_kind, v_prior.audit_id,
          v_prior.alert_intent_id, v_prior.actor_kind, v_prior.actor_member_id,
          v_prior.actor_member_version, v_prior.actor_role)::public.kv_control_result;
    return r;
  end if;

  -- ---- D4 row lock and post-lock re-read ---------------------------------------------
  select * into c from public.conversations
   where id = p_conversation_id and restaurant_id = p_expected_restaurant_id for update;
  if not found then
    raise exception 'KIV11 tenant or conversation identity did not resolve';
  end if;
  v_epoch_before := c.control_epoch;

  -- ---- operation contracts (Revision 14 §7) -------------------------------------------
  v_event := case p_operation_name
    when 'claim' then 'CLAIMED'                    when 'escalate' then 'ESCALATED'
    when 'reassign' then 'REASSIGNED'              when 'return_to_kivo' then 'HANDED_TO_AI'
    when 'release_hold' then 'HOLD_RELEASED'       when 'clear_stale_assignee' then 'STALE_ASSIGNEE_CLEARED'
    when 'close' then 'CLOSED'                     when 'set_human_idle' then 'IDLE'
    when 'reopen_closed' then 'REOPENED'           when 'timeout_return' then 'TIMEOUT_RETURNED'
    when 'create_safety_conversation' then 'ESCALATED' end;

  if p_operation_name = 'claim' then
    -- CLAIMABLE_FROM is exactly AI_ACTIVE, HOLD_UNCLAIMED, HUMAN_IDLE, SYSTEM_HOLD.
    -- The 11 August 2026 binding adjudication supersedes Revision 14 §7.1 D7's inclusion of
    -- HUMAN_ACTIVE with a NULL assignee. HUMAN_ACTIVE is NOT a D7 claimable source: it
    -- succeeds only as an idempotent D6 when already assigned to the claiming member.
    v_target_state := 'HUMAN_ACTIVE'; v_target_owner := 'human';
    v_noop := c.ownership_state = 'HUMAN_ACTIVE' and c.owner = 'human'
              and c.assigned_member_id is not distinct from a_id
              and a_id is not null;
    if not v_noop then
      if c.ownership_state = 'HUMAN_ACTIVE' then
        if c.assigned_member_id is not null then
          -- assigned to another member
          raise exception 'KIV15 claim lost - held by another member';
        end if;
        -- unassigned HUMAN_ACTIVE is not a claim source; its legacy population is a separate
        -- pre-R-3 maintenance obligation and is never repaired here.
        raise exception 'KIV14 illegal transition from % for claim', c.ownership_state;
      end if;
      if c.ownership_state not in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_IDLE','SYSTEM_HOLD') then
        raise exception 'KIV14 illegal transition from % for claim', c.ownership_state;
      end if;
    end if;

  elsif p_operation_name = 'escalate' then
    v_target_state := case when p_safety then 'SYSTEM_HOLD' else 'HOLD_UNCLAIMED' end;
    v_target_owner := 'human';
    v_noop := c.ownership_state = v_target_state and c.owner = 'human'
              and c.assigned_member_id is null
              and c.escalation_reason is not distinct from p_escalation_reason
              and c.is_safety_hold = p_safety;
    if not v_noop then
      if not p_safety and c.is_safety_hold then
        raise exception 'KIV16 non-safety escalation against a safety-held row';
      end if;
      if c.ownership_state not in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_ACTIVE','HUMAN_IDLE') then
        raise exception 'KIV14 illegal transition from % for escalate', c.ownership_state;
      end if;
      if not p_safety and c.ownership_state = 'HOLD_UNCLAIMED' then
        raise exception 'KIV14 illegal transition from % for non-safety escalate', c.ownership_state;
      end if;
    end if;

  elsif p_operation_name = 'reassign' then
    v_target_state := 'HUMAN_ACTIVE'; v_target_owner := 'human';
    v_noop := c.ownership_state = 'HUMAN_ACTIVE' and c.owner = 'human'
              and c.assigned_member_id is not distinct from p_to_member_id;
    if not v_noop and c.ownership_state not in ('HUMAN_ACTIVE','HUMAN_IDLE') then
      raise exception 'KIV14 illegal transition from % for reassign', c.ownership_state;
    end if;

  elsif p_operation_name in ('return_to_kivo','timeout_return') then
    v_target_state := 'AI_ACTIVE'; v_target_owner := 'ai';
    v_noop := c.ownership_state = 'AI_ACTIVE' and c.owner = 'ai'
              and c.assigned_member_id is null and c.escalation_reason is null
              and c.handover_note is null and c.is_safety_hold = false;
    if not v_noop then
      if c.is_safety_hold then
        raise exception 'KIV16 safety hold prevents return to Kivo';
      end if;
      if c.ownership_state not in ('HUMAN_ACTIVE','HUMAN_IDLE') then
        raise exception 'KIV14 illegal transition from % for %', c.ownership_state, p_operation_name;
      end if;
    end if;

  elsif p_operation_name = 'release_hold' then
    v_target_state := 'AI_ACTIVE'; v_target_owner := 'ai';
    v_noop := c.ownership_state = 'AI_ACTIVE' and c.owner = 'ai'
              and c.assigned_member_id is null and c.is_safety_hold = false
              and c.escalation_reason is null
              and c.handover_note is not distinct from p_handover_note;
    if not v_noop and not (c.ownership_state = 'SYSTEM_HOLD'
         or (c.ownership_state in ('HUMAN_ACTIVE','HUMAN_IDLE') and c.is_safety_hold)) then
      raise exception 'KIV14 illegal transition from % for release_hold', c.ownership_state;
    end if;

  elsif p_operation_name = 'clear_stale_assignee' then
    v_target_state := c.ownership_state; v_target_owner := 'ai';
    v_noop := c.ownership_state = 'AI_ACTIVE' and c.assigned_member_id is null and c.owner = 'ai';
    if not v_noop then
      if c.is_safety_hold then
        raise exception 'KIV16 safety hold prevents clearing a stale assignee';
      end if;
      if not (c.ownership_state = 'AI_ACTIVE' and c.assigned_member_id is not null) then
        raise exception 'KIV14 illegal transition from % for clear_stale_assignee', c.ownership_state;
      end if;
      v_target_state := 'AI_ACTIVE';
    end if;

  elsif p_operation_name = 'close' then
    v_target_state := 'CLOSED'; v_target_owner := c.owner;
    v_noop := c.ownership_state = 'CLOSED';
    if not v_noop then
      if c.is_safety_hold then
        raise exception 'KIV16 safety hold prevents close';
      end if;
      if c.ownership_state not in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_ACTIVE','HUMAN_IDLE',
                                   'AI_RESUME_PENDING') then
        raise exception 'KIV14 illegal transition from % for close', c.ownership_state;
      end if;
    end if;

  elsif p_operation_name = 'set_human_idle' then
    v_target_state := 'HUMAN_IDLE'; v_target_owner := 'human';
    v_noop := c.ownership_state = 'HUMAN_IDLE' and c.owner = 'human';
    if not v_noop then
      if c.ownership_state <> 'HUMAN_ACTIVE' then
        raise exception 'KIV14 illegal transition from % for set_human_idle', c.ownership_state;
      end if;
    end if;

  elsif p_operation_name = 'reopen_closed' then
    v_target_state := 'AI_ACTIVE'; v_target_owner := 'ai';
    v_noop := c.ownership_state = 'AI_ACTIVE' and c.owner = 'ai'
              and c.assigned_member_id is null and c.escalation_reason is null
              and c.handover_note is null and c.is_safety_hold = false;
    if not v_noop then
      if c.is_safety_hold then
        raise exception 'KIV16 safety hold prevents reopen';
      end if;
      if c.ownership_state <> 'CLOSED' then
        raise exception 'KIV14 illegal transition from % for reopen_closed', c.ownership_state;
      end if;
    end if;

  elsif p_operation_name = 'create_safety_conversation' then
    v_target_state := 'SYSTEM_HOLD'; v_target_owner := 'human';
    v_noop := c.ownership_state = 'SYSTEM_HOLD' and c.owner = 'human'
              and c.assigned_member_id is null and c.is_safety_hold = true
              and c.escalation_reason is not distinct from p_escalation_reason
              and c.allergy_note is not distinct from p_allergy_note;
  else
    raise exception 'KIV14 unknown operation %', p_operation_name;
  end if;

  -- ---- D6 complete target-state no-op --------------------------------------------------
  if v_noop then
    v_epoch_after := v_epoch_before;
    insert into public.control_operations (
      restaurant_id, operation_id, conversation_id, operation_name, request_fingerprint,
      transition_id, operation_status, changed, from_mode, to_mode, epoch_before, epoch_after,
      audit_kind, audit_id, alert_intent_id, actor_kind, actor_member_id, actor_member_version,
      actor_user_id, actor_label, actor_role)
    values (
      p_expected_restaurant_id, p_operation_id, p_conversation_id, p_operation_name, v_fp,
      v_transition, 'noop', false, c.ownership_state, c.ownership_state,
      v_epoch_before, v_epoch_after, 'none', null, null, p_actor_kind, a_id, a_ver,
      a_uid, null, a_role);
    r := (p_conversation_id, p_expected_restaurant_id, p_operation_id, v_transition,
          p_operation_name, c.ownership_state, c.ownership_state, v_epoch_before, v_epoch_after,
          false, false, 'noop', 'none', null, null, p_actor_kind, a_id, a_ver, a_role
         )::public.kv_control_result;
    return r;
  end if;

  -- ---- D7 allowed-source transition ----------------------------------------------------
  -- Transaction-local marker read by the M-2 audit-bridge skip guard (§9.5 BR3).
  perform set_config('kv.control_transition_id', v_transition::text, true);

  update public.conversations set
    ownership_state = v_target_state,
    owner           = v_target_owner,
    assigned_member_id = case p_operation_name
                           when 'claim' then a_id
                           when 'reassign' then p_to_member_id
                           when 'set_human_idle' then assigned_member_id
                           when 'close' then assigned_member_id
                           else null end,
    is_safety_hold  = case p_operation_name
                        when 'escalate' then p_safety
                        when 'release_hold' then false
                        when 'create_safety_conversation' then true
                        else is_safety_hold end,
    escalation_reason = case p_operation_name
                          when 'escalate' then p_escalation_reason
                          when 'create_safety_conversation' then p_escalation_reason
                          when 'return_to_kivo' then null
                          when 'timeout_return' then null
                          when 'release_hold' then null
                          when 'reopen_closed' then null
                          else escalation_reason end,
    handover_note   = case p_operation_name
                        when 'release_hold' then p_handover_note
                        when 'return_to_kivo' then null
                        when 'timeout_return' then null
                        when 'reopen_closed' then null
                        else handover_note end,
    allergy_note    = case p_operation_name
                        when 'create_safety_conversation' then p_allergy_note
                        else allergy_note end,
    -- SB4: every APPLIED transition writes the governed presentation status in this same
    -- UPDATE. Status is presentation data only (SB1-SB3): it is not part of legality, D6
    -- equality or audit equivalence, and a stale value can neither block a transition nor
    -- manufacture a no-op (SB7). NO-OP and ALERTED write nothing at all (SB5).
    status          = case
                        when p_operation_name = 'create_safety_conversation' then 'مراجعة حساسية'
                        when v_target_state = 'AI_ACTIVE'         then 'AI نشط'
                        when v_target_state = 'HOLD_UNCLAIMED'    then 'يحتاج تدخل موظف'
                        when v_target_state = 'HUMAN_ACTIVE'      then 'موظف يتابع'
                        when v_target_state = 'HUMAN_IDLE'        then 'تم التحويل لموظف'
                        when v_target_state = 'SYSTEM_HOLD'       then 'يحتاج تدخل موظف'
                        when v_target_state = 'CLOSED'            then 'مغلقة'
                        else status end,
    updated_at      = now()
  where id = p_conversation_id;

  select control_epoch into v_epoch_after from public.conversations where id = p_conversation_id;

  -- A1 canonical evidence row, then the A0 parent (§11).
  insert into public.conversation_assignment_events (
    conversation_id, restaurant_id, event_type, actor_member_id, from_mode, to_mode,
    epoch_before, epoch_after, reason, transition_id, operation_id, actor_kind, is_canonical,
    actor_member_version, actor_user_id, actor_label, actor_role)
  values (
    p_conversation_id, p_expected_restaurant_id, v_event, a_id, c.ownership_state, v_target_state,
    v_epoch_before, v_epoch_after, p_reason, v_transition, p_operation_id, p_actor_kind, true,
    a_ver, a_uid, null, a_role)
  returning id into v_audit_id;

  insert into public.control_operations (
    restaurant_id, operation_id, conversation_id, operation_name, request_fingerprint,
    transition_id, operation_status, changed, from_mode, to_mode, epoch_before, epoch_after,
    audit_kind, audit_id, alert_intent_id, actor_kind, actor_member_id, actor_member_version,
    actor_user_id, actor_label, actor_role)
  values (
    p_expected_restaurant_id, p_operation_id, p_conversation_id, p_operation_name, v_fp,
    v_transition, 'applied', true, c.ownership_state, v_target_state,
    v_epoch_before, v_epoch_after, 'event', v_audit_id, null, p_actor_kind, a_id, a_ver,
    a_uid, null, a_role);

  r := (p_conversation_id, p_expected_restaurant_id, p_operation_id, v_transition,
        p_operation_name, c.ownership_state, v_target_state, v_epoch_before, v_epoch_after,
        true, false, 'applied', 'event', v_audit_id, null, p_actor_kind, a_id, a_ver, a_role
       )::public.kv_control_result;
  return r;
end $$;

-- ===========================================================================
-- 13. F1 / F2 — ORDINARY CREATION (Revision 14 §7.12, path L1, ungoverned)
--     No operation_id, no fingerprint, no A0, no A1, no epoch bump.
--     F1 and F2 differ ONLY in the actor rule (Step 2) and in the EXECUTE grant.
-- ===========================================================================
create or replace function public.kv_control_create_conversation(
  p_conversation_id uuid, p_restaurant_id uuid, p_customer_id uuid, p_channel text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.conversations%rowtype;
begin
  if p_channel not in ('whatsapp','website') then                              -- Step 1
    raise exception 'KIV14 channel % is outside the V1 allowlist', p_channel;
  end if;
  perform public.kv_control_assert_actor(p_restaurant_id, 'member', false);    -- Step 2 (F1)
  perform pg_advisory_xact_lock(hashtextextended('conv:' || p_conversation_id::text, 0)); -- Step 3
  select * into c from public.conversations where id = p_conversation_id;
  if not found then                                                            -- Step 4
    insert into public.conversations
      (id, restaurant_id, customer_id, channel, status, ownership_state, owner, is_safety_hold)
    values (p_conversation_id, p_restaurant_id, p_customer_id, p_channel,
            'AI نشط', 'AI_ACTIVE', 'ai', false);
    return p_conversation_id;
  end if;
  if c.restaurant_id <> p_restaurant_id then                                   -- Step 5 (a)
    raise exception 'KIV11 existing conversation belongs to another tenant';
  end if;
  if c.customer_id is distinct from p_customer_id then                         -- Step 5 (b)
    raise exception 'KIV26 creation identity conflict on customer_id';
  end if;
  if c.channel <> p_channel then                                               -- Step 5 (c)
    raise exception 'KIV26 creation identity conflict on channel';
  end if;
  return p_conversation_id;                                                    -- Step 6
end $$;

create or replace function public.kv_sys_control_create_conversation(
  p_conversation_id uuid, p_restaurant_id uuid, p_customer_id uuid, p_channel text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.conversations%rowtype;
begin
  if p_channel not in ('whatsapp','website') then
    raise exception 'KIV14 channel % is outside the V1 allowlist', p_channel;
  end if;
  perform public.kv_control_assert_actor(p_restaurant_id, 'system', false);    -- Step 2 (F2)
  perform pg_advisory_xact_lock(hashtextextended('conv:' || p_conversation_id::text, 0));
  select * into c from public.conversations where id = p_conversation_id;
  if not found then
    insert into public.conversations
      (id, restaurant_id, customer_id, channel, status, ownership_state, owner, is_safety_hold)
    values (p_conversation_id, p_restaurant_id, p_customer_id, p_channel,
            'AI نشط', 'AI_ACTIVE', 'ai', false);
    return p_conversation_id;
  end if;
  if c.restaurant_id <> p_restaurant_id then
    raise exception 'KIV11 existing conversation belongs to another tenant';
  end if;
  if c.customer_id is distinct from p_customer_id then
    raise exception 'KIV26 creation identity conflict on customer_id';
  end if;
  if c.channel <> p_channel then
    raise exception 'KIV26 creation identity conflict on channel';
  end if;
  return p_conversation_id;
end $$;

-- ===========================================================================
-- 14. F3..F14 — GOVERNED ENTRY POINTS (Revision 14 §17)
-- ===========================================================================
create or replace function public.kv_control_claim(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'claim','HUMAN_ACTIVE',
       null,null,null,null,null,null,null,$4,'member'); $$;

create or replace function public.kv_control_reassign(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_to_member_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'reassign','HUMAN_ACTIVE',
       null,$4,null,null,null,null,null,$5,'member'); $$;

create or replace function public.kv_control_return_to_kivo(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'return_to_kivo','AI_ACTIVE',
       null,null,null,null,null,null,null,$4,'member'); $$;

create or replace function public.kv_control_release_hold(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_handover_note text, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'release_hold','AI_ACTIVE',
       null,null,$4,null,null,null,null,$5,'member'); $$;

create or replace function public.kv_control_clear_stale_assignee(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'clear_stale_assignee','AI_ACTIVE',
       null,null,null,null,null,null,null,$4,'member'); $$;

create or replace function public.kv_control_close(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_close_reason text, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'close','CLOSED',
       null,null,null,$4,null,null,null,$5,'member'); $$;

create or replace function public.kv_control_set_human_idle(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'set_human_idle','HUMAN_IDLE',
       null,null,null,null,null,null,null,$4,'member'); $$;

create or replace function public.kv_sys_control_escalate(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_safety boolean, p_escalation_reason text, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'escalate',
       case when $4 then 'SYSTEM_HOLD' else 'HOLD_UNCLAIMED' end,
       $4,null,null,null,null,$5,null,$6,'system'); $$;

create or replace function public.kv_control_escalate(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_safety boolean, p_escalation_reason text, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'escalate',
       case when $4 then 'SYSTEM_HOLD' else 'HOLD_UNCLAIMED' end,
       $4,null,null,null,null,$5,null,$6,'member'); $$;

create or replace function public.kv_sys_control_reopen_closed(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_trigger_message_id uuid, p_reason text)
returns public.kv_control_result
language sql security definer set search_path = ''
as $$ select public.kv_control_transition($1,$2,$3,'reopen_closed','AI_ACTIVE',
       null,null,null,null,$4,null,null,$5,'system'); $$;

-- F13 — timeout_return. Decision order §10.2 T1..T14, with §3 L3 honoured exactly: the
-- operation lock and the ACTUAL A0 fingerprint/replay decision precede any conversation or
-- configuration read. A valid same-operation replay never re-reads current configuration.
-- Tenant configuration is read from public.restaurants.feature_flags (E15).
create or replace function public.kv_sys_control_timeout_return(
  p_conversation_id uuid, p_expected_restaurant_id uuid, p_operation_id uuid,
  p_expected_epoch bigint, p_expected_handoff_enabled boolean, p_expected_idle_minutes integer,
  p_expected_idle_action text, p_expected_updated_at timestamptz, p_reason text)
returns public.kv_control_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.conversations%rowtype;
  ff       jsonb;
  s_enable boolean;
  s_min    integer;
  s_action text;
  v_fields text[];
  v_f      text;
  v_buf    bytea := ''::bytea;
  v_fp     text;
  v_prior  public.control_operations%rowtype;
begin
  -- D3 parameter validity, before any lock and without reading the database.
  if p_expected_idle_minutes < 1 or p_expected_idle_minutes > 1440 then                    -- T3
    raise exception 'KIV14 expected idle minutes out of range';
  end if;
  if p_expected_idle_action not in ('auto_return','realert_only') then                     -- T3
    raise exception 'KIV14 expected idle action is not an allowed value';
  end if;
  perform public.kv_control_assert_actor(p_expected_restaurant_id, 'system', false);       -- T2

  perform pg_advisory_xact_lock(hashtextextended(                                          -- T4
    'op:' || p_expected_restaurant_id::text || ':' || p_operation_id::text, 0));

  -- T5 (D5) THE REPLAY DECISION, before any conversation or configuration read. The five
  -- expected inputs are fingerprint fields in the exact §16.2 order.
  v_fields := array[
      'timeout_return', p_expected_restaurant_id::text, p_conversation_id::text,
      p_operation_id::text, 'system', null, null,
      p_expected_epoch::text,
      case when p_expected_handoff_enabled then 't' else 'f' end,
      p_expected_idle_minutes::text,
      p_expected_idle_action,
      to_char(p_expected_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      p_reason];
  foreach v_f in array v_fields loop
    if v_f is null then
      v_buf := v_buf || pg_catalog.convert_to('ffffffff', 'UTF8');
    else
      v_f := normalize(v_f, NFC);
      v_buf := v_buf
        || pg_catalog.convert_to(
             lpad(to_hex(octet_length(pg_catalog.convert_to(v_f,'UTF8'))), 8, '0'), 'UTF8')
        || pg_catalog.convert_to(v_f, 'UTF8');
    end if;
  end loop;
  v_fp := encode(extensions.digest(v_buf, 'sha256'), 'hex');

  select * into v_prior from public.control_operations
   where restaurant_id = p_expected_restaurant_id and operation_id = p_operation_id;
  if found then
    if v_prior.request_fingerprint <> v_fp then
      raise exception 'KIV19 operation_id reused with a different request fingerprint';
    end if;
    -- Same fingerprint: return the recorded result verbatim. No conversation read, no
    -- configuration read, nothing written - even if configuration has since changed.
    return (v_prior.conversation_id, v_prior.restaurant_id, v_prior.operation_id,
            v_prior.transition_id, v_prior.operation_name, v_prior.from_mode, v_prior.to_mode,
            v_prior.epoch_before, v_prior.epoch_after, v_prior.changed, true,
            v_prior.operation_status, v_prior.audit_kind, v_prior.audit_id,
            v_prior.alert_intent_id, v_prior.actor_kind, v_prior.actor_member_id,
            v_prior.actor_member_version, v_prior.actor_role)::public.kv_control_result;
  end if;

  -- T1/T6 only now: identity, tenant and configuration are read after replay resolution.
  -- T6 acquires the governed conversation ROW LOCK, and it is taken BEFORE the T7 expected
  -- state/configuration validation. Everything from here to the transition decision is
  -- evaluated against the locked row, so a concurrent governed operation cannot move the
  -- conversation between validation and application: a stale timeout can never overwrite a
  -- fresh human claim or reassignment. The lock is held for the remainder of the transaction,
  -- so the universal core's own re-read observes exactly this row.
  select * into c from public.conversations
   where id = p_conversation_id and restaurant_id = p_expected_restaurant_id
   for update;
  if not found then
    raise exception 'KIV11 tenant or conversation identity did not resolve';
  end if;

  select r.feature_flags into ff from public.restaurants r where r.id = p_expected_restaurant_id;
  s_enable := coalesce((ff ->> 'handoff_timeout')::boolean, false);
  s_min    := coalesce(nullif(ff ->> 'handoff_idle_minutes','')::integer, 15);
  if s_min < 1 or s_min > 1440 then s_min := 15; end if;
  s_action := case when (ff ->> 'handoff_idle_action') = 'realert_only'
                   then 'realert_only' else 'auto_return' end;

  if p_expected_epoch is distinct from c.control_epoch                                     -- T7
     or p_expected_handoff_enabled is distinct from s_enable
     or p_expected_idle_minutes    is distinct from s_min
     or p_expected_idle_action     is distinct from s_action
     or p_expected_updated_at      is distinct from c.updated_at then
    raise exception 'KIV21 expected epoch or timeout configuration mismatch';
  end if;

  if not (c.ownership_state = 'AI_ACTIVE' and c.owner = 'ai' and c.assigned_member_id is null
          and c.escalation_reason is null and c.handover_note is null
          and c.is_safety_hold = false) then
    if c.is_safety_hold then                                                               -- T9
      raise exception 'KIV16 safety hold prevents timeout return';
    end if;
    if not s_enable then                                                                   -- T10
      raise exception 'KIV23 timeout is disabled for this tenant';
    end if;
    if s_action = 'realert_only' then                                                      -- T11
      raise exception 'KIV24 timeout action is realert_only and SCOPE-2 is not approved';
    end if;
    if c.ownership_state not in ('HUMAN_ACTIVE','HUMAN_IDLE') then                         -- T12
      raise exception 'KIV14 illegal transition from % for timeout_return', c.ownership_state;
    end if;
    if now() - c.updated_at < make_interval(mins => s_min) then                            -- T13
      raise exception 'KIV22 stale timeout precondition not met';
    end if;
  end if;

  -- Hand the ORIGINAL canonical request identity to the A0-writing path.
  perform set_config('kv.request_fingerprint', v_fp, true);
  return public.kv_control_transition(                                                     -- T8 / T14
    p_conversation_id, p_expected_restaurant_id, p_operation_id, 'timeout_return', 'AI_ACTIVE',
    null, null, null, null, null, null, null, p_reason, 'system');
end $$;

-- F14 — create_safety_conversation. Path L2 (§7.11) in exact order: identity lock, operation
-- lock, ACTUAL A0 fingerprint/replay decision, row re-read, create-or-adopt, then the
-- universal core for D6/D7. The replay decision precedes every conversation read, so a
-- replayed call creates nothing, adopts nothing and mutates nothing.
create or replace function public.kv_control_create_safety_conversation(
  p_conversation_id uuid, p_restaurant_id uuid, p_customer_id uuid, p_channel text,
  p_operation_id uuid, p_escalation_reason text, p_allergy_note text, p_reason text)
returns public.kv_control_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        public.conversations%rowtype;
  v_fields text[];
  v_f      text;
  v_buf    bytea := ''::bytea;
  v_fp     text;
  v_prior  public.control_operations%rowtype;
begin
  if p_channel not in ('whatsapp','website') then                                    -- Phase 0
    raise exception 'KIV14 channel % is outside the V1 allowlist', p_channel;
  end if;
  if p_escalation_reason is null or length(btrim(p_escalation_reason)) = 0 then
    raise exception 'KIV14 escalation reason must be a non-empty trimmed string';
  end if;
  perform public.kv_control_assert_actor(p_restaurant_id, 'system', false);

  -- Phase 1 (D4), L2 lock order: identity lock FIRST, then the operation lock.
  perform pg_advisory_xact_lock(hashtextextended('conv:' || p_conversation_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'op:' || p_restaurant_id::text || ':' || p_operation_id::text, 0));

  -- Phase 2 (D5) THE REPLAY DECISION, before the row re-read and before create-or-adopt.
  -- Fingerprint fields in the exact §16.2 order for this operation: the common prefix, then
  -- p_customer_id, p_channel, p_escalation_reason, p_allergy_note, p_reason.
  v_fields := array[
      'create_safety_conversation', p_restaurant_id::text, p_conversation_id::text,
      p_operation_id::text, 'system', null, null,
      p_customer_id::text, p_channel, p_escalation_reason, p_allergy_note, p_reason];
  foreach v_f in array v_fields loop
    if v_f is null then
      v_buf := v_buf || pg_catalog.convert_to('ffffffff', 'UTF8');
    else
      v_f := normalize(v_f, NFC);
      v_buf := v_buf
        || pg_catalog.convert_to(
             lpad(to_hex(octet_length(pg_catalog.convert_to(v_f,'UTF8'))), 8, '0'), 'UTF8')
        || pg_catalog.convert_to(v_f, 'UTF8');
    end if;
  end loop;
  v_fp := encode(extensions.digest(v_buf, 'sha256'), 'hex');

  select * into v_prior from public.control_operations
   where restaurant_id = p_restaurant_id and operation_id = p_operation_id;
  if found then
    if v_prior.request_fingerprint <> v_fp then
      raise exception 'KIV19 operation_id reused with a different request fingerprint';
    end if;
    return (v_prior.conversation_id, v_prior.restaurant_id, v_prior.operation_id,
            v_prior.transition_id, v_prior.operation_name, v_prior.from_mode, v_prior.to_mode,
            v_prior.epoch_before, v_prior.epoch_after, v_prior.changed, true,
            v_prior.operation_status, v_prior.audit_kind, v_prior.audit_id,
            v_prior.alert_intent_id, v_prior.actor_kind, v_prior.actor_member_id,
            v_prior.actor_member_version, v_prior.actor_role)::public.kv_control_result;
  end if;

  select * into c from public.conversations where id = p_conversation_id;            -- Phase 3
  if not found then
    insert into public.conversations
      (id, restaurant_id, customer_id, channel, status, ownership_state, owner, is_safety_hold)
    values (p_conversation_id, p_restaurant_id, p_customer_id, p_channel,
            'AI نشط', 'AI_ACTIVE', 'ai', false);
  else
    if c.restaurant_id <> p_restaurant_id then
      raise exception 'KIV11 existing conversation belongs to another tenant';        -- (a)
    end if;
    if c.customer_id is distinct from p_customer_id then
      raise exception 'KIV26 creation identity conflict on customer_id';              -- (b)
    end if;
    if c.channel <> p_channel then
      raise exception 'KIV26 creation identity conflict on channel';                  -- (c)
    end if;
  end if;

  -- Hand the ORIGINAL canonical request identity to the A0-writing path, unchanged by the
  -- create-or-adopt step that just ran.
  perform set_config('kv.request_fingerprint', v_fp, true);
  return public.kv_control_transition(                                               -- Phase 4
    p_conversation_id, p_restaurant_id, p_operation_id, 'create_safety_conversation',
    'SYSTEM_HOLD', true, null, null, null, null, p_escalation_reason, p_allergy_note,
    p_reason, 'system');
end $$;

-- ===========================================================================
-- 15. OWNERSHIP, THEN SA1 EXECUTE-GRANT SEPARATION (Revision 14 §8.3 SA1, §17, R9, R15)
--     Each creation is followed by REVOKE ALL naming that function's own fully-qualified
--     identity and argument type list, FROM public, anon, authenticated and service_role —
--     and only then by the single stated GRANT EXECUTE. F15 and F16 receive the REVOKE and
--     no GRANT. SA2 is withdrawn and is not implemented.
-- ===========================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%'
            or p.proname like 'kv_tg_%')
  loop
    execute format('alter function %s owner to kivo_control_owner', f.sig);           -- R9
    execute format('revoke all on function %s from public, anon, authenticated, service_role',
                   f.sig);
  end loop;
end $$;

-- MEMBER functions -> authenticated only (F1, F3..F9, F11)
grant execute on function public.kv_control_create_conversation(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_claim(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_reassign(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_return_to_kivo(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_release_hold(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.kv_control_clear_stale_assignee(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_close(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.kv_control_set_human_idle(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.kv_control_escalate(uuid,uuid,uuid,boolean,text,text) to authenticated;

-- SYSTEM functions -> service_role only (F2, F10, F12, F13, F14)
grant execute on function public.kv_sys_control_create_conversation(uuid,uuid,uuid,text) to service_role;
grant execute on function public.kv_sys_control_escalate(uuid,uuid,uuid,boolean,text,text) to service_role;
grant execute on function public.kv_sys_control_reopen_closed(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.kv_sys_control_timeout_return(
  uuid,uuid,uuid,bigint,boolean,integer,text,timestamptz,text) to service_role;
grant execute on function public.kv_control_create_safety_conversation(
  uuid,uuid,uuid,text,uuid,text,text,text) to service_role;

-- INTERNAL: F15 public.kv_control_transition and F16 public.kv_control_assert_actor keep the
-- REVOKE and receive NO grant. Nothing is granted to anon or PUBLIC anywhere in this file.

-- ===========================================================================
-- 16. BOOTSTRAP CLEANUP — REMOVES EVERY TEMPORARY CAPABILITY FROM SECTION 1B
--     Runs before this migration can succeed. The verification block below fails closed,
--     so an incomplete cleanup aborts and rolls the entire migration back rather than
--     leaving a privileged remnant behind.
-- ===========================================================================
revoke create on schema public from kivo_control_owner;
do $$
begin
  execute format('revoke kivo_control_owner from %I', current_user);
end $$;

do $$
declare
  v_total    integer;
  v_capable  integer;
  v_create   boolean;
  v_bad      text;
begin
  select count(*) into v_total
    from pg_auth_members m join pg_roles r on r.oid = m.roleid
   where r.rolname = 'kivo_control_owner';

  -- No surviving membership may confer the ability to act as kivo_control_owner.
  select count(*) into v_capable
    from pg_auth_members m join pg_roles r on r.oid = m.roleid
   where r.rolname = 'kivo_control_owner'
     and (m.set_option or m.inherit_option);

  v_create := pg_catalog.has_schema_privilege('kivo_control_owner', 'public', 'CREATE');

  if v_capable <> 0 then
    raise exception
      'KIV77 bootstrap cleanup incomplete: % membership(s) still carry SET or INHERIT on kivo_control_owner',
      v_capable;
  end if;

  -- At most one record may remain: the automatic CREATE ROLE grant made by the bootstrap
  -- superuser, ADMIN TRUE / SET FALSE / INHERIT FALSE. A superuser executor produces none.
  if v_total > 1 then
    raise exception
      'KIV77 bootstrap cleanup incomplete: % memberships remain on kivo_control_owner, at most 1 permitted',
      v_total;
  end if;

  if v_total = 1 then
    select g.rolname || '/admin=' || m.admin_option || '/set=' || m.set_option
           || '/inherit=' || m.inherit_option
      into v_bad
      from pg_auth_members m
      join pg_roles r on r.oid = m.roleid
      join pg_roles g on g.oid = m.grantor
     where r.rolname = 'kivo_control_owner'
       and not (m.admin_option and not m.set_option and not m.inherit_option);
    if v_bad is not null then
      raise exception 'KIV77 surviving membership has an unexpected shape: %', v_bad;
    end if;
  end if;

  if v_create then
    raise exception 'KIV77 bootstrap cleanup incomplete: kivo_control_owner retains CREATE on schema public';
  end if;
end $$;

-- Rollback (governed, manual — never run as part of a replay): drop the sixteen functions and
-- the five trigger functions, the three new tables, the type, the eight A1 columns, the eleven
-- policies and the role, in reverse dependency order.
