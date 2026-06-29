-- ============================================================================
-- 0053 — conversations ad/campaign referral capture (WB3, Meta click-to-message)
--
-- When a customer arrives via a Meta click-to-message ad, WhatsApp's inbound
-- webhook includes a `referral` object on the first message (source_type,
-- source_id = the ad/post id, headline, body, source_url, ctwa_clid). Kivo
-- dropped it. These columns PRESERVE that ad context on the conversation so we
-- know which ad/campaign drove each lead (a light «من إعلان» marker, like Be-On).
--
-- All columns are NULLABLE and only populated when Meta actually sends referral
-- context — organic / web / non-ad conversations leave them NULL (never
-- false-tagged). The values are captured from Meta's webhook as data only
-- (sanitized + length-bounded in code), never trusted as commands. This does NOT
-- change the existing source tagging (orders.source / channel) — it extends it:
-- the conversation's channel stays 'whatsapp'; these fields + the indicator
-- distinguish an ad-origin lead.
--
-- Additive, no backfill, no data touched. No RLS change (conversations' existing
-- tenant policies govern these columns). Campaign analytics/conversion reporting
-- is deferred (P2) — this only CAPTURES + preserves the data. PREPARE-ONLY.
-- ============================================================================

alter table public.conversations add column if not exists ad_source_type text;   -- "ad" | "post"
alter table public.conversations add column if not exists ad_source_id   text;   -- the ad / post id
alter table public.conversations add column if not exists ad_headline     text;   -- ad headline (display)
alter table public.conversations add column if not exists ad_body         text;   -- ad body text (display)
alter table public.conversations add column if not exists ad_referrer_url text;   -- referral source_url (fb.me/…)
alter table public.conversations add column if not exists ad_ctwa_clid    text;   -- click-to-WhatsApp click id

-- Rollback (manual; not auto-run):
--   alter table public.conversations drop column if exists ad_ctwa_clid;
--   alter table public.conversations drop column if exists ad_referrer_url;
--   alter table public.conversations drop column if exists ad_body;
--   alter table public.conversations drop column if exists ad_headline;
--   alter table public.conversations drop column if exists ad_source_id;
--   alter table public.conversations drop column if exists ad_source_type;
