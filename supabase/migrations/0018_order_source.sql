-- ============================================================================
-- MaitreAI — Order source channel
-- Tags orders by channel while preserving existing WhatsApp order behavior.
-- ============================================================================

alter table public.orders
  add column if not exists source text not null default 'whatsapp';
