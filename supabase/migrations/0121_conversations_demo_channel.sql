-- ============================================================================
-- 0121 — allow channel = 'demo' on conversations.
--
-- WO-KHALID-ORDER mints an ephemeral conversation per demo visitor so the order draft
-- survives across turns, and pins BOTH `restaurant_id = <demo tenant>` AND
-- `channel = 'demo'` when resolving a client-supplied id — the channel pin is a security
-- control, not a label: it stops a visitor passing a real WhatsApp conversation id.
--
-- But `conversations.channel` carried CHECK (channel IN ('whatsapp','website')), so every
-- insert failed. The session helper fails SOFT by design, so the failure was invisible:
-- the demo simply kept running statelessly, `conversationId` came back null on every
-- turn, and the basket still evaporated. Unit tests passed against a Supabase double,
-- which does not enforce CHECK constraints. Only a live run against production found it.
--
-- Widening only — no existing row changes and nothing that was valid becomes invalid.
-- 'demo' is kept as a DISTINCT value rather than reusing 'website' precisely so the
-- security pin above stays meaningful and demo rows stay identifiable for the sweep.
-- ============================================================================

-- THERE ARE TWO CHECK CONSTRAINTS ON THIS ONE COLUMN. Widening only the first left the
-- second still rejecting 'demo', and the insert kept failing silently. Both are widened
-- here, and the pg_constraint query that revealed the second is worth repeating before
-- assuming a column has one guard:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.conversations'::regclass and contype = 'c';
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations
  add constraint conversations_channel_check
  check (channel = any (array['whatsapp'::text, 'website'::text, 'demo'::text]));

alter table public.conversations drop constraint if exists conversations_channel_v1_check;
alter table public.conversations
  add constraint conversations_channel_v1_check
  check (channel = any (array['whatsapp'::text, 'website'::text, 'demo'::text]));
