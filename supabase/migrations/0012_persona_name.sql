-- ============================================================================
-- MaitreAI — Customer Agent persona name (persona upgrade envelope, 2026-06-13).
-- Per-tenant, customer-facing host name so the agent feels like the restaurant's
-- own staff member (MaitreAI brand stays invisible to the diner). Nullable —
-- falls back to a dialect-fitting default in the prompt builder when unset.
-- The operator app keeps «المساعد / الموظف الذكي» (Layer A) — this is WhatsApp-only.
-- Idempotent.
-- ============================================================================

alter table public.restaurants add column if not exists agent_persona_name text;
