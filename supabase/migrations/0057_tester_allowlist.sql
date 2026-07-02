-- ============================================================================
-- MaitreAI — DRYRUN-1 — tester allowlist (additive, default-OFF)
-- Lets a tenant run Karim "live but only to allowlisted testers": when
-- tester_allowlist_mode is ON, the agent auto-responds ONLY to phone numbers in
-- tester_allowlist; every other inbound is held for human handling. The gate
-- (lib/messaging/respond-and-send.ts) is purely an UPSTREAM recipient filter —
-- it sits before runCustomerTurn and never touches the allergen safety gate.
--
-- Fail-safe by construction: the column default is FALSE, so until a tenant
-- explicitly turns it on there is ZERO behavior change. When ON, the gate
-- responds only if the number is explicitly listed (never block-only-if-denied).
--
-- Additive only: two nullable/defaulted columns on restaurants. No RLS change,
-- no backfill, no other column touched. Existing rows get mode=false (inert) and
-- a NULL allowlist.
-- ============================================================================

alter table public.restaurants
  add column if not exists tester_allowlist text[];

alter table public.restaurants
  add column if not exists tester_allowlist_mode boolean not null default false;

comment on column public.restaurants.tester_allowlist is
  'DRYRUN-1: E.164 (no +) phone numbers Karim may auto-respond to when tester_allowlist_mode is on. NULL/empty + mode on = hold everyone.';
comment on column public.restaurants.tester_allowlist_mode is
  'DRYRUN-1: when true, Karim auto-responds ONLY to numbers in tester_allowlist; all other inbound is held for human handling. Default false = feature inert.';
