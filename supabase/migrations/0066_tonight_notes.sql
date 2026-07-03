-- ============================================================================
-- MaitreAI — Item 9: tonight_notes (ephemeral operator notes with expiry)
--
-- Short-lived, tonight-only guidance injected alongside standing_instructions
-- (same `standing_instructions` flag, default OFF) as a SUBORDINATE, escaped
-- prompt section. Unlike standing instructions these EXPIRE:
--   • expires_at  — NOT NULL; the authoring API computes it from the restaurant's
--                   hours (end of the current service window). The prompt fetch
--                   filters `expires_at > now()`, so a stale note self-drops from
--                   the prompt with no cron needed.
--   • BOUNDED     — body length capped (<= 500): a tonight note is a one-liner, not
--                   a policy document.
--
-- RLS: per-tenant read for members; writes via the service role (authoring API),
-- mirroring standing_instructions.
--
-- Migration number 0066 assumes merge order #281=0062, R6=0063, R4=0064,
-- standing_instructions=0065 (state at branch time). PREPARE-ONLY.
-- ============================================================================

create table if not exists public.tonight_notes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  body          text not null check (char_length(body) <= 500 and char_length(btrim(body)) > 0),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index if not exists tonight_notes_live_idx
  on public.tonight_notes(restaurant_id, expires_at);

alter table public.tonight_notes enable row level security;
drop policy if exists tonight_notes_read on public.tonight_notes;
create policy tonight_notes_read on public.tonight_notes
  for select using (public.is_member_of(restaurant_id));

-- Rollback (manual):
--   drop table if exists public.tonight_notes;
