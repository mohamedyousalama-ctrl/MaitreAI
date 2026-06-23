-- MaitreAI — Never-stuck spine Step 2: persist stuck_reason on conversations
-- Records WHY a conversation was flagged as stuck so the escalations console
-- can surface it without re-running detection on every load. Nullable: null
-- means "not currently stuck". Three recognised values:
--   system_hold_timeout | payment_review_timeout | human_no_response
--
-- Idempotent: safe to apply on a DB that already has the column.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'stuck_reason'
  ) THEN
    ALTER TABLE conversations ADD COLUMN stuck_reason text DEFAULT NULL;
    COMMENT ON COLUMN conversations.stuck_reason IS
      'Stuck detection (spine Step 2): null = healthy; '
      'system_hold_timeout | payment_review_timeout | human_no_response';
  END IF;
END;
$$;
