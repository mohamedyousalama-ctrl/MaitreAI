-- ============================================================================
-- MaitreAI — WO-COMPANION W1: allergy audit trail + kitchen-ticket note.
-- PREPARE-ONLY. Apply is a SEPARATE approved event (like 0077/0079). Nothing
-- reads/writes these until allergy_companion_mode is flipped ON for a tenant, and
-- the runtime writes are deploy-safe (a missing column/table → inert, never throws)
-- so this migration can land ahead of the code and the code ahead of the apply.
--
-- Two pieces, one migration (per PM ruling):
--
--   1. conversation_allergy_events — the §4 AUDIT TRAIL. Append-only, structured,
--      queryable (a liability record, not an AI-inference blob). One row per allergy
--      interaction: the allergen(s), the verbatim customer message, the agent reply +
--      truth-states used, data source + verified_at, human offered/accepted, checkpoint
--      acknowledgement text + timestamp, banner + staff-notification status.
--
--   2. orders.allergy_note + conversations.allergy_note — the KITCHEN-TICKET note.
--      INVARIANT (§1a.2, PM): an allergy mention → a note the kitchen cooks from, in
--      EVERY configuration. The companion flow stamps the session note on the
--      conversation and copies it onto the order at create/update; the EXISTING ticket
--      banner predicate (lib/render/load.ts) is extended to (is_safety_hold OR
--      allergy_note present) — one banner, not a fork. W2 later ENRICHES this note with
--      per-dish/prep detail; it does not create the mechanism.
--
-- Posture (matches 0079 system_alerts): service-role only, deny-by-default RLS.
-- ============================================================================

-- 1. Structured allergy audit trail -----------------------------------------
create table if not exists public.conversation_allergy_events (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  conversation_id       uuid not null references public.conversations(id) on delete cascade,
  order_id              uuid references public.orders(id) on delete set null,
  -- what was detected
  allergens             text[] not null default '{}',   -- named allergen(s) for this event
  customer_message      text not null,                  -- verbatim customer message that triggered it
  event_kind            text not null,                  -- 'mention' | 'emergency' | 'checkpoint' | 'recovery' | 'post_commit_mention'
  -- what Kivo did
  agent_reply           text,                           -- the reply sent (companion / checkpoint / recovery / emergency)
  truth_states          jsonb not null default '{}',    -- per-dish two-axis truth-states used in the reply
  data_source           text,                           -- 'none' (W1) | 'ingredient' | 'ingredient+prep' (W2)
  data_verified_at      timestamptz,                    -- verified-at of the data used, when any
  -- human handoff bookkeeping
  human_offered         boolean not null default false,
  human_accepted        boolean,                        -- null = not answered
  -- checkpoint (§6)
  checkpoint_ack_text   text,                           -- verbatim customer acknowledgement
  checkpoint_ack_at     timestamptz,
  -- side-effects fired
  banner_written        boolean not null default false, -- kitchen-ticket note stamped
  staff_notified        boolean not null default false, -- staff alert / manager ping fired
  net_reason            text,                            -- observability: which detector/path
  created_at            timestamptz not null default now()
);
create index if not exists conversation_allergy_events_conv_idx
  on public.conversation_allergy_events (conversation_id, created_at desc);
create index if not exists conversation_allergy_events_rest_idx
  on public.conversation_allergy_events (restaurant_id, created_at desc);

alter table public.conversation_allergy_events enable row level security;
-- Deny-by-default: no policies. The service-role admin client (engine writes,
-- console reads) bypasses RLS; anon/authenticated have no access.

-- 2. Kitchen-ticket allergy note (the note the kitchen cooks from) ----------
-- conversations.allergy_note: the session-level note (allergen(s) mentioned this
-- conversation), set by the companion flow and preserved across turns.
alter table public.conversations add column if not exists allergy_note text;
-- orders.allergy_note: copied onto the order at create/update so the kitchen ticket
-- (lib/render/load.ts → receipt.ts banner) carries it independent of is_safety_hold.
alter table public.orders add column if not exists allergy_note text;
