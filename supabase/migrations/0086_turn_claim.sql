-- ============================================================================
-- MaitreAI — WO-LIVE6-TURN-LOCK in-progress turn marker (0086) — ADDITIVE, PREPARE-ONLY
-- (unapplied until an off-peak batch). ONE nullable timestamp per conversation: the
-- moment a Brain turn was CLAIMED. Concurrent inbound webhooks for the same conversation
-- otherwise both read the post-success `last_answered_inbound_at` watermark before either
-- stamps it, so both run the LLM and BOTH reply (live dup: conv 68966859, 15:19 UTC — two
-- turns 56ms apart on identical input). The claim is a single ATOMIC compare-and-set:
--   UPDATE conversations SET turn_claimed_at = now()
--   WHERE id = $1 AND (turn_claimed_at IS NULL OR turn_claimed_at < now() - <ttl>)
-- The winner (1 row) runs the turn; the loser (0 rows) exits SILENTLY. A stale claim
-- (older than the turn-max TTL — a crashed turn) is reclaimable, so a conversation is
-- never wedged. The claim is CLEARED after the turn so a legitimate follow-up isn't
-- delayed. `last_answered_inbound_at` stays a strictly post-SUCCESS truth (0085) — it is
-- never advanced by this marker, so a crashed turn never loses the message.
--
-- Nullable, no default → deploy-safe: the reader treats a missing column (42703) as
-- claim-inert (the turn PROCEEDS, exactly today's behavior) and the feature is flag-OFF
-- (inbound_coalescing) until enabled per tenant regardless.
-- ============================================================================

alter table public.conversations
  add column if not exists turn_claimed_at timestamptz;

notify pgrst, 'reload schema';
