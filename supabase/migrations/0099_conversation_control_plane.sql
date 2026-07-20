-- ============================================================================
-- MaitreAI — 0099: conversation control plane (WO-CONTROL) — PREPARE ONLY.
--
-- The FOUNDATION of the human-takeover suite. It EXTENDS the existing ownership
-- axis (conversations.ownership_state + owner + assigned_member_id), it does NOT
-- create a second source of truth. Three additions, all behavior-neutral until the
-- app-side send gate (Part B) reads the epoch and the claim/hold helpers (Part C/D)
-- use them:
--
--   1. control_epoch (bigint, NOT NULL default 0) — the COLLISION KILLER. Bumped on
--      every mode/owner/authority transition. A sender captures the epoch at enqueue
--      and re-reads it immediately before the WhatsApp API call; a mismatch means the
--      conversation changed hands mid-flight → the stale send is dropped.
--
--   2. ownership_state (== the control-plane `mode`) CHECK is WIDENED with the two
--      genuinely-new states — HOLD_UNCLAIMED (escalated, awaiting a human claim) and
--      AI_RESUME_PENDING (handback validation in flight). The five existing values are
--      preserved verbatim; HUMAN_IDLE is retained as the canonical name for the WO's
--      "HUMAN_WAITING" (a documented alias — no rename, no data backfill, so every
--      existing reader/writer keeps working).
--
--   3. conversation_assignment_events — an append-only control-plane audit trail
--      (from_mode/to_mode/epoch_before/epoch_after/actor/reason), one row per
--      transition, indexed by conversation.
--
-- Epoch bump + audit append are done by TRIGGERS on conversations, so they are
-- UN-BYPASSABLE: the Brain (customer-turn.ts → setOwnershipState), the console
-- (assignee route), and the new Part C helpers all bump + audit identically with
-- ZERO edits to those call sites. actor/event_type/reason for a HUMAN action come
-- from transaction-local GUCs the app sets before the write (set_config(
-- 'app.actor_member_id' / 'app.assignment_event_type' / 'app.assignment_reason'));
-- a Brain-initiated transition (no GUC) audits with actor NULL and a derived type.
--
-- LAW (founder ruling, Stage-1 approval): the BEFORE-UPDATE epoch bump is HARD and
-- must never be swallowed. The AFTER-UPDATE audit append is made NON-FATAL (wrapped
-- in a BEGIN…EXCEPTION block) so an audit-write failure can NEVER abort a live
-- ownership transition.
--
-- ⚠️ PREPARE ONLY — reviewed via the propose→approve→apply ceremony. NOT applied
-- from the builder session; the PM applies it via the approved channel and confirms
-- before any proof relies on the live schema. Idempotent (add-if-not-exists / guarded
-- constraint / create-or-replace), safe to run once the ceremony lane picks it up.
-- ============================================================================

-- 1. control_epoch — the collision killer. Existing rows backfill to 0 (safe).
alter table public.conversations
  add column if not exists control_epoch bigint not null default 0;

-- 2. Widen the ownership_state (== control-plane `mode`) enum with the two new states.
--    HUMAN_IDLE kept as the canonical name for HUMAN_WAITING (alias — no backfill).
alter table public.conversations
  drop constraint if exists conversations_ownership_state_check;
alter table public.conversations
  add constraint conversations_ownership_state_check
  check (ownership_state in (
    'AI_ACTIVE',          -- Karim owns + replies (authority AI)
    'HOLD_UNCLAIMED',     -- NEW: escalated, no human has claimed yet (authority NONE)
    'HUMAN_ACTIVE',       -- a member has taken over (authority HUMAN)
    'HUMAN_IDLE',         -- == HUMAN_WAITING: member owns but idle, customer waiting (authority HUMAN)
    'AI_RESUME_PENDING',  -- NEW: handback validation in flight (authority NONE)
    'SYSTEM_HOLD',        -- safety hold (allergy); deliberate human release only (authority NONE)
    'CLOSED'              -- finished (authority NONE)
  ));

-- 3. BEFORE UPDATE: auto-bump control_epoch on any control transition. HARD — never
--    swallowed. A change to ANY of the three ownership axes counts as a transition.
create or replace function public.bump_control_epoch()
returns trigger
language plpgsql
as $$
begin
  if new.ownership_state is distinct from old.ownership_state
     or new.owner is distinct from old.owner
     or new.assigned_member_id is distinct from old.assigned_member_id then
    new.control_epoch := old.control_epoch + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_control_epoch on public.conversations;
create trigger trg_bump_control_epoch
  before update on public.conversations
  for each row
  execute function public.bump_control_epoch();

-- 4. conversation_assignment_events — append-only control-plane audit.
create table if not exists public.conversation_assignment_events (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  restaurant_id    uuid not null references public.restaurants(id)   on delete cascade,
  event_type       text not null check (event_type in (
    'CLAIMED','RELEASED','REASSIGNED','MANAGER_TAKEOVER',
    'HANDED_TO_AI','ESCALATED','SYSTEM_HOLD','CLOSED')),
  actor_member_id  uuid references public.members(id) on delete set null,
  from_mode        text,
  to_mode          text,
  epoch_before     bigint,
  epoch_after      bigint,
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists conversation_assignment_events_conv_idx
  on public.conversation_assignment_events(conversation_id, created_at desc);
create index if not exists conversation_assignment_events_rid_idx
  on public.conversation_assignment_events(restaurant_id, created_at desc);

alter table public.conversation_assignment_events enable row level security;

-- Members of the tenant may READ their control trail. No INSERT/UPDATE/DELETE policy
-- → members cannot write or mutate rows; the trigger (SECURITY DEFINER owner) + the
-- service-role client are the only writers. Append-only by construction.
drop policy if exists conversation_assignment_events_read on public.conversation_assignment_events;
create policy conversation_assignment_events_read on public.conversation_assignment_events
  for select using (public.is_member_of(restaurant_id));

-- 5. AFTER UPDATE: append one audit row per control transition. NON-FATAL — the whole
--    INSERT is wrapped so an audit-write failure (RLS, transient, constraint) can never
--    abort the live ownership transition (the epoch bump in step 3 already committed to
--    NEW). actor/type/reason come from transaction-local GUCs the app sets before the
--    write; a Brain transition (no GUC) → actor NULL + a to_mode-derived type. Under
--    Option 1 an unclaimed escalation (HUMAN_ACTIVE + assigned_member_id NULL) audits as
--    ESCALATED; a real claim (HUMAN_ACTIVE + assignee set) audits as CLAIMED.
create or replace function public.log_assignment_event()
returns trigger
language plpgsql
as $$
declare
  v_actor  uuid;
  v_type   text;
  v_reason text;
begin
  if new.ownership_state is distinct from old.ownership_state
     or new.owner is distinct from old.owner
     or new.assigned_member_id is distinct from old.assigned_member_id then
    begin
      -- Optional per-transaction context (set by the app for human actions).
      begin
        v_actor := nullif(current_setting('app.actor_member_id', true), '')::uuid;
      exception when others then
        v_actor := null;
      end;
      v_type   := nullif(current_setting('app.assignment_event_type', true), '');
      v_reason := nullif(current_setting('app.assignment_reason', true), '');

      -- Derive a type when the app didn't set one (Brain-initiated transitions).
      if v_type is null then
        v_type := case
          when new.ownership_state = 'HUMAN_ACTIVE' and new.assigned_member_id is not null then 'CLAIMED'
          when new.ownership_state = 'HUMAN_ACTIVE'    then 'ESCALATED'      -- unclaimed handoff (Option 1)
          when new.ownership_state = 'HOLD_UNCLAIMED'  then 'ESCALATED'
          when new.ownership_state = 'AI_ACTIVE'       then 'HANDED_TO_AI'
          when new.ownership_state = 'AI_RESUME_PENDING' then 'HANDED_TO_AI'
          when new.ownership_state = 'SYSTEM_HOLD'      then 'SYSTEM_HOLD'
          when new.ownership_state = 'CLOSED'           then 'CLOSED'
          else 'REASSIGNED'
        end;
      end if;

      insert into public.conversation_assignment_events
        (conversation_id, restaurant_id, event_type, actor_member_id,
         from_mode, to_mode, epoch_before, epoch_after, reason)
      values
        (new.id, new.restaurant_id, v_type, v_actor,
         old.ownership_state, new.ownership_state, old.control_epoch, new.control_epoch, v_reason);
    exception when others then
      -- NON-FATAL: an audit failure must never abort the ownership transition.
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_assignment_event on public.conversations;
create trigger trg_log_assignment_event
  after update on public.conversations
  for each row
  execute function public.log_assignment_event();

-- 6. Control-plane RPCs. Each sets the per-transaction audit GUCs and performs its
--    UPDATE in ONE function body = ONE transaction, so the epoch-bump + audit triggers
--    fire with the real actor/type/reason. Mirrors the CoD atomic-RPC pattern
--    (capture_cod_on_delivered_atomic / settle_cod_driver_atomic). SECURITY DEFINER so
--    the trigger's audit INSERT runs regardless of the caller's RLS; every RPC is
--    tenant-scoped by an explicit restaurant_id predicate where it matters.

-- Per-transaction audit context. is_local=true → scoped to THIS transaction only, so a
-- pooled connection never leaks context into the next request.
create or replace function public._control_set_ctx(p_actor uuid, p_type text, p_reason text)
returns void language plpgsql as $$
begin
  perform set_config('app.actor_member_id', coalesce(p_actor::text, ''), true);
  perform set_config('app.assignment_event_type', coalesce(p_type, ''), true);
  perform set_config('app.assignment_reason', coalesce(p_reason, ''), true);
end;
$$;

-- Generic mode transition (owner/status dual-write kept via coalesce; these ops never
-- need to null them). Used by applyTransition + the HUMAN_IDLE / AI_RESUME_PENDING steps.
create or replace function public.control_apply_transition(
  p_conversation_id uuid, p_to_mode text, p_owner text, p_status text,
  p_actor uuid, p_event_type text, p_reason text
) returns table(id uuid, ownership_state text, control_epoch bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public._control_set_ctx(p_actor, p_event_type, p_reason);
  return query
  update public.conversations c
     set ownership_state = p_to_mode,
         owner  = coalesce(p_owner, c.owner),
         status = coalesce(p_status, c.status),
         updated_at = now()
   where c.id = p_conversation_id
  returning c.id, c.ownership_state, c.control_epoch;
end;
$$;

-- Escalate to a hold. safety=true routes to SYSTEM_HOLD (the established safety state —
-- keeps isSafetyHeld()/#87/red-chip intact, NO second safety representation); non-safety
-- routes to HOLD_UNCLAIMED. is_safety_hold is only ever SET true, never cleared here.
-- IDEMPOTENT per (conversation, epoch): the WHERE excludes already-held/terminal modes,
-- so a repeat call updates 0 rows → no epoch bump, no duplicate event.
create or replace function public.control_escalate_to_hold(
  p_conversation_id uuid, p_to_mode text, p_reason text, p_safety boolean, p_actor uuid
) returns table(id uuid, ownership_state text, control_epoch bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public._control_set_ctx(p_actor, 'ESCALATED', p_reason);
  return query
  update public.conversations c
     set ownership_state  = p_to_mode,
         owner            = 'human',
         status           = 'يحتاج تدخل موظف',
         is_safety_hold   = c.is_safety_hold or p_safety,
         escalation_reason = coalesce(c.escalation_reason, p_reason),
         handover_note    = coalesce(c.handover_note, p_reason),
         updated_at       = now()
   where c.id = p_conversation_id
     and c.ownership_state not in ('HOLD_UNCLAIMED','SYSTEM_HOLD','CLOSED')
  returning c.id, c.ownership_state, c.control_epoch;
end;
$$;

-- Atomic claim (MO2 lineage). Conditional UPDATE — the precondition lives in the WHERE,
-- so concurrent claims serialize at the DB: exactly one row updated, the loser gets 0.
create or replace function public.control_claim(
  p_conversation_id uuid, p_restaurant_id uuid, p_member_id uuid
) returns table(id uuid, ownership_state text, control_epoch bigint, assigned_member_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform public._control_set_ctx(p_member_id, 'CLAIMED', null);
  return query
  update public.conversations c
     set assigned_member_id = p_member_id,
         ownership_state    = 'HUMAN_ACTIVE',
         owner              = 'human',
         status             = 'تم التحويل لموظف',
         updated_at         = now()
   where c.id = p_conversation_id
     and c.restaurant_id = p_restaurant_id
     and c.ownership_state in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_IDLE','SYSTEM_HOLD')
     and (c.assigned_member_id is null or c.assigned_member_id = p_member_id)
  returning c.id, c.ownership_state, c.control_epoch, c.assigned_member_id;
end;
$$;

-- Manager reassignment. Conditional on the CURRENT owner (optimistic) so a stale reassign
-- can't clobber a takeover that already moved. event_type MANAGER_TAKEOVER when the manager
-- takes it themselves, else REASSIGNED. Manager-role authorization is enforced in the caller
-- (reuse the require-tenant gate + the last-manager guard pattern, migrations 0089/0094).
create or replace function public.control_reassign(
  p_conversation_id uuid, p_restaurant_id uuid, p_from_member uuid, p_to_member uuid,
  p_actor uuid, p_event_type text, p_reason text
) returns table(id uuid, ownership_state text, control_epoch bigint, assigned_member_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform public._control_set_ctx(p_actor, p_event_type, p_reason);
  return query
  update public.conversations c
     set assigned_member_id = p_to_member,
         ownership_state    = 'HUMAN_ACTIVE',
         owner              = 'human',
         updated_at         = now()
   where c.id = p_conversation_id
     and c.restaurant_id = p_restaurant_id
     and c.assigned_member_id is not distinct from p_from_member
  returning c.id, c.ownership_state, c.control_epoch, c.assigned_member_id;
end;
$$;

-- Release to AI (final step of handback, after canHandBack validation in the caller).
-- Clears the named owner + escalation context. AI_RESUME_PENDING → AI_ACTIVE is the
-- deliberate resume the map permits.
create or replace function public.control_release_to_ai(
  p_conversation_id uuid, p_restaurant_id uuid, p_actor uuid, p_reason text
) returns table(id uuid, ownership_state text, control_epoch bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public._control_set_ctx(p_actor, 'HANDED_TO_AI', p_reason);
  return query
  update public.conversations c
     set ownership_state   = 'AI_ACTIVE',
         owner             = 'ai',
         status            = 'AI نشط',
         assigned_member_id = null,
         escalation_reason = null,
         handover_note     = null,
         updated_at        = now()
   where c.id = p_conversation_id
     and c.restaurant_id = p_restaurant_id
  returning c.id, c.ownership_state, c.control_epoch;
end;
$$;

notify pgrst, 'reload schema';

-- ── Rollback (manual; not auto-run) ─────────────────────────────────────────
-- drop function if exists public.control_release_to_ai(uuid,uuid,uuid,text);
-- drop function if exists public.control_reassign(uuid,uuid,uuid,uuid,uuid,text,text);
-- drop function if exists public.control_claim(uuid,uuid,uuid);
-- drop function if exists public.control_escalate_to_hold(uuid,text,text,boolean,uuid);
-- drop function if exists public.control_apply_transition(uuid,text,text,text,uuid,text,text);
-- drop function if exists public._control_set_ctx(uuid,text,text);
-- drop trigger if exists trg_log_assignment_event on public.conversations;
-- drop trigger if exists trg_bump_control_epoch  on public.conversations;
-- drop function if exists public.log_assignment_event();
-- drop function if exists public.bump_control_epoch();
-- drop table if exists public.conversation_assignment_events;
-- alter table public.conversations drop constraint if exists conversations_ownership_state_check;
-- alter table public.conversations
--   add constraint conversations_ownership_state_check
--   check (ownership_state in ('AI_ACTIVE','HUMAN_ACTIVE','HUMAN_IDLE','SYSTEM_HOLD','CLOSED'));
-- alter table public.conversations drop column if exists control_epoch;
