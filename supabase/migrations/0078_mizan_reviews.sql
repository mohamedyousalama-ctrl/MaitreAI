-- ============================================================================
-- MaitreAI — WO-KHALID-STEP5B hosted MIZAN reviewer panel (0078) — ADDITIVE,
-- PREPARE-ONLY (unapplied until the off-peak batch; PM/Mohamed apply via
-- db-apply.mjs at an approved event). Backs the hosted reviewer flow
-- (/mizan/<token>): 3 real Saudi reviewers each open a per-token URL and score
-- Khalid's replies (the 5 MIZAN human-hook suites); each score row saves here.
--
-- One row per (packet, reviewer, scenario, dimension). Re-submitting the same
-- cell UPSERTS (resume/edit is a first-class flow) — hence the UNIQUE tuple and
-- the updated_at bump. The reviewer is identified ONLY by the SHA-256 hash of
-- their URL token (reviewer_token_hash): the raw token is NEVER stored (it lives
-- only in the reviewer's URL and in the MIZAN_REVIEWER_TOKEN_HASHES env var), and
-- the hash both authenticates the writer and scopes their rows so no reviewer can
-- read another's scores.
--
-- RLS: enabled with NO policy → every non-service-role reader/writer is denied.
-- All access goes through the token-scoped API route (app/api/mizan/[token])
-- using the service-role client, which validates the token hash ∈ env BEFORE any
-- read/write. There is no public/anon/member access, and no cross-reviewer read.
-- Feature-gated by NEXT_PUBLIC_ENABLE_MIZAN_PANEL (OFF by default).
--
-- Honesty core is untouched: this table only STORES what humans tapped. The
-- ≥3-reviewers / ≥3-per-dimension / HIGH-VARIANCE / PENDING-HUMAN rules stay in
-- mizan-panel-score.mjs — authenticity is NEVER machine-scored.
-- ============================================================================

create table if not exists public.mizan_reviews (
  id uuid primary key default gen_random_uuid(),
  packet_id text not null,                     -- e.g. 'mizan-panel-2026-07-08' (ties rows to one capture run)
  reviewer_token_hash text not null,           -- sha256(url token) hex; NEVER the raw token
  scenario_id text not null,                   -- MIZAN scenario id (e.g. 'S1-01')
  suite_id integer not null,                   -- human-hook suite id (1/9/10/11/12)
  dimension text not null,                      -- rubric dimension key (e.g. 'authenticity')
  score integer not null,                       -- 1..10 (the reviewer's tap)
  notes text,                                   -- optional per-item note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mizan_reviews_score_chk check (score >= 1 and score <= 10),
  constraint mizan_reviews_uniq unique (packet_id, reviewer_token_hash, scenario_id, dimension)
);

-- Aggregation reads all rows for one packet; a reviewer's resume reads their own.
create index if not exists mizan_reviews_packet_idx
  on public.mizan_reviews (packet_id);
create index if not exists mizan_reviews_reviewer_idx
  on public.mizan_reviews (packet_id, reviewer_token_hash);

alter table public.mizan_reviews enable row level security;

-- NO policy is intentional: RLS-enabled + no policy denies ALL anon/authenticated
-- access. Reads and writes happen only through the service-role API route, which
-- bypasses RLS and enforces token-hash auth + per-reviewer scoping in code. This
-- guarantees no public read, no client write, and no cross-reviewer read.

notify pgrst, 'reload schema';
