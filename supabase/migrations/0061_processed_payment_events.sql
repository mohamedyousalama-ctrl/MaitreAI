-- ============================================================================
-- Kivo (KSA) — WO-3c: processed payment webhook events (event-dedup layer).
-- PREPARE-ONLY: NOT applied.
--
-- The Moyasar webhook is at-least-once AND can deliver out of order. WO-3b gave
-- us the settlement-layer idempotency (markPaymentSessionPaid is atomic; a repeat
-- is a no-op) + a terminal-state no-op in app code. This table adds the EVENT
-- layer: a UNIQUE (provider, restaurant_id, event_id) guard so a re-delivered
-- provider event is recognized and processed exactly once. Both layers together
-- cover retries AND reordering. The event is recorded ONLY AFTER its durable
-- effect (so a failed transition never consumes the event); a concurrent double
-- delivery is caught by this constraint and the idempotent transitions.
--
-- Financial artifact: members may READ their tenant's processed-events (audit);
-- writes happen ONLY via the service role (the webhook), which bypasses RLS — no
-- client write policy (mirrors the financial-lockdown posture). Additive +
-- idempotent.
-- ============================================================================

create table if not exists public.processed_payment_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null default 'moyasar',
  -- The provider's own event id (Moyasar webhook top-level `id`; falls back to a
  -- composed key when absent). Dedup key is (provider, restaurant_id, event_id) so
  -- a future PSP reusing an event_id can never be mistaken for a Moyasar duplicate.
  event_id text not null,
  -- The session this event settled (for traceability); SET NULL if the session is
  -- later removed.
  session_id uuid references public.payment_sessions(id) on delete set null,
  -- The mapped status this event carried (paid|failed|expired|…), for audit.
  event_status text,
  created_at timestamptz not null default now(),
  unique (provider, restaurant_id, event_id)
);

create index if not exists processed_payment_events_restaurant_idx
  on public.processed_payment_events(restaurant_id, created_at desc);
create index if not exists processed_payment_events_session_idx
  on public.processed_payment_events(session_id);

-- RLS: members read their tenant's events; the service role (webhook) bypasses
-- RLS for writes. No client write policy (financial artifact).
alter table public.processed_payment_events enable row level security;
drop policy if exists processed_payment_events_read on public.processed_payment_events;
create policy processed_payment_events_read on public.processed_payment_events
  for select using (public.is_member_of(restaurant_id));

-- ── psp_currency: the ISO currency the session was actually created with at the
--    PSP (e.g. 'SAR') — distinct from payment_sessions.currency which holds the
--    DISPLAY glyph ('ر.س'). The webhook verifies the paid event's currency against
--    THIS (with a tiny glyph→ISO fallback for legacy null rows), so a display
--    glyph can never be mis-compared against the provider's ISO code. Additive,
--    nullable; back-filled going forward by create-session. (payments-scoped)
alter table public.payment_sessions
  add column if not exists psp_currency text;

notify pgrst, 'reload schema';
