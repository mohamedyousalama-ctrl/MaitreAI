-- ============================================================================
-- MaitreAI — RLS lockdown for conversation_locks + drop webhook_debug
--
-- F1 (HIGH): conversation_locks had RLS disabled with full anon+authenticated
-- grants. It is the live per-conversation mutex (Pillar 3) and is ONLY ever
-- touched by the service role (lib/db/conversation-lock.ts, admin client).
-- A public anon key holder could DELETE or TRUNCATE it, instantly breaking
-- message serialization across ALL tenants. Fix: enable RLS (deny-by-default)
-- and revoke all public grants. service_role bypasses RLS unconditionally in
-- Postgres, so the lock mechanism continues working with zero app changes.
--
-- F2 (MEDIUM): webhook_debug was a one-off signature-verification debug table
-- (Jun 13–19 sprint, 443 rows, no code reads it, no FK references). It had
-- RLS disabled and full anon/authenticated grants. No operational value remains.
-- Recommendation: DROP (not RLS+lock). A dead table should not be maintained.
-- ============================================================================

-- F1 ── conversation_locks: enable RLS (deny-by-default) + revoke public grants

-- Revoke before enabling RLS — order does not matter for security but is explicit
-- and matches Supabase's own convention. service_role is not revoked; it bypasses
-- RLS at the Postgres level and needs no explicit grant to continue working.
revoke all on public.conversation_locks from anon, authenticated;

alter table public.conversation_locks enable row level security;

-- No RLS policies are added: service_role (the only legitimate caller) bypasses
-- RLS. Anon and authenticated have no grants and no policies → denied by default.
-- This is the tightest possible posture for an internal-only mutex table.

-- F2 ── webhook_debug: drop (debug leftover, no production code uses it)

-- Confirm: no FK references this table (it has no FK columns), so a plain
-- DROP is safe. CASCADE is added as belt-and-suspenders but will find nothing.
drop table if exists public.webhook_debug cascade;
