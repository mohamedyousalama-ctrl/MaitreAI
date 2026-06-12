-- ============================================================================
-- MaitreAI — Amendment 04 §E7 / §O#4: handover summary injection.
-- When an operator releases a conversation back to the assistant, their one-line
-- handover summary (e.g. a discount they promised) is stored here and injected
-- into the Brain's context as a high-priority, must-honor instruction so the
-- assistant continues honoring the human's commitment. Idempotent.
-- ============================================================================

alter table public.conversations add column if not exists handover_note text;
