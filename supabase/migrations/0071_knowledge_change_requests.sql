-- ============================================================================
-- MaitreAI — Item 10 (Approvals): knowledge_change_requests — the SIGNING FOLDER.
--
-- The GATED tier of Knowledge (price / description / delivery-zone / policy edits)
-- never writes a truth table directly ("a wrong price in Karim's mouth is a live
-- incident"). Instead it files a PROPOSAL here; a manager reviews it in Approvals and,
-- on APPLY, the change is written ONLY through the existing audited write helpers —
-- never a new raw path to a truth table.
--
-- Pipeline (the exact state-shape the future Decision-Layer recommendations pipeline
-- will reuse, proven here first):
--   proposed → approved → applied      (the happy path; APPLY is idempotent)
--   proposed → rejected                (declined, with a reason)
-- A failed apply leaves the row in `approved` with an honest `apply_error`, never
-- half-applied — the manager can retry.
--
-- Governance: requester + reviewer identity are both recorded (soft member refs), and
-- every transition carries its own timestamp. Every transition ALSO emits an
-- audit_events row from the API (belt & suspenders — this table is the pipeline, the
-- audit log is the ledger).
--
-- RLS mirrors standing_instructions / tonight_notes / conversation_outcomes: per-tenant
-- SELECT for members; ALL WRITES go through the service role (the authoring/review
-- API), so there is no client write path and no manager can forge another tenant's row.
--
-- PREPARE-ONLY. Migration number 0071 (0069 = open #311, 0070 = merged #317). Additive;
-- touches no existing table. Applied to prod in the off-peak batch with 0069+0070.
-- ============================================================================

create table if not exists public.knowledge_change_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  -- Lifecycle. Default proposed; only the review/apply API advances it.
  status        text not null default 'proposed'
                  check (status in ('proposed', 'approved', 'rejected', 'applied')),

  -- WHAT truth this targets, and the exact diff.
  target_type   text not null check (target_type in ('menu_item', 'delivery_zone', 'policy')),
  target_id     text,                       -- menu_item.id / delivery_zone.id / policy key (null-safe)
  target_label  text,                       -- human snapshot (e.g. item name) so the folder renders standalone
  field         text not null,              -- e.g. price, description, delivery_fee, eta_minutes, hours, tone
  old_value     jsonb,                      -- snapshot of the current value AT PROPOSAL time (what the requester saw)
  new_value     jsonb not null,             -- the proposed value

  -- WHO + WHEN, per transition (soft member refs — no hard FK, matches the codebase).
  requested_by  uuid,
  created_at    timestamptz not null default now(),   -- proposed_at
  reviewed_by   uuid,                                 -- the approver OR rejecter
  reviewed_at   timestamptz,
  applied_by    uuid,
  applied_at    timestamptz,

  -- Notes.
  reason        text check (reason is null or char_length(reason) <= 500),  -- rejection reason / review note
  apply_error   text                                                        -- set iff an apply failed (stays 'approved')
);

-- The folder query: pending items for a tenant, newest first.
create index if not exists knowledge_change_requests_status_idx
  on public.knowledge_change_requests(restaurant_id, status, created_at desc);

-- Fast "waiting for you" count.
create index if not exists knowledge_change_requests_pending_idx
  on public.knowledge_change_requests(restaurant_id)
  where status = 'proposed';

alter table public.knowledge_change_requests enable row level security;
drop policy if exists knowledge_change_requests_read on public.knowledge_change_requests;
create policy knowledge_change_requests_read on public.knowledge_change_requests
  for select using (public.is_member_of(restaurant_id));
-- No INSERT/UPDATE/DELETE policy: all writes are service-role only (the authoring +
-- review API), mirroring standing_instructions. The service role bypasses RLS.

-- Rollback (manual):
--   drop table if exists public.knowledge_change_requests;
