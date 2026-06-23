-- ============================================================================
-- Conversation advisory lock table (Pillar 3 — concurrency serialization)
--
-- Provides a per-conversation distributed mutex for the inbound Brain turn so
-- rapid successive messages from the same customer are processed one-at-a-time
-- rather than interleaved. INSERT ON CONFLICT is atomic on any Postgres
-- transaction isolation level and works correctly through pgBouncer in
-- transaction mode (where session-level pg_advisory_lock cannot be used).
--
-- Stale locks (held > 60 s — well beyond any Brain turn) are expired at
-- acquire time so a crashed process never permanently blocks a conversation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_locks (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  lock_token      text        NOT NULL,
  locked_at       timestamptz NOT NULL DEFAULT now()
);

-- Fast expiry sweep: when acquiring, we DELETE WHERE locked_at < now() - 60s.
CREATE INDEX IF NOT EXISTS idx_conversation_locks_locked_at ON conversation_locks(locked_at);
