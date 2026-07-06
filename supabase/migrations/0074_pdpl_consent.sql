-- ============================================================================
-- Kivo (KSA) — WO-PDPL-CONSENT (0074). PDPL lawful-basis consent on customers.
-- Additive + idempotent. PREPARE-ONLY: NOT applied (joins an off-peak batch).
--
-- SEMANTICS (the law, encoded as columns — enforcement lives in lib/privacy):
--   • In-conversation ALLERGEN SAFETY processing needs NO consent — it is a
--     VITAL-INTEREST basis (protecting health), so the deterministic hold always
--     works regardless of these flags. These columns NEVER gate the safety gate.
--   • PERSISTING allergy/health info to customer_memory requires
--     consent_health_notes = true. Without it, memory's health content
--     (inferred.allergy_notes) is not written.
--   • Campaign / marketing sends require consent_marketing = true (enforced in the
--     send path when the campaigns backend lands).
--
-- Capture provenance is stamped: source ∈ ('conversation','operator','import') +
-- the moment consent was recorded. Distinct from the LEGACY 0005 marketing flags
-- (marketing_opt_in / opt_in_*): those predate PDPL; consent_marketing is the
-- explicit lawful-basis flag going forward. We do NOT touch the legacy columns.
--
-- No new grant needed — customers uses table-level grants (RLS scopes reads).
-- ============================================================================

alter table public.customers
  add column if not exists consent_marketing boolean not null default false,
  add column if not exists consent_marketing_at timestamptz,
  add column if not exists consent_marketing_source text,
  add column if not exists consent_health_notes boolean not null default false,
  add column if not exists consent_health_notes_at timestamptz,
  add column if not exists consent_health_notes_source text;

-- Provenance guard: a recorded consent must name a valid capture source (null =
-- never recorded / default-false).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_consent_marketing_source_chk') then
    alter table public.customers add constraint customers_consent_marketing_source_chk
      check (consent_marketing_source is null or consent_marketing_source in ('conversation','operator','import'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customers_consent_health_notes_source_chk') then
    alter table public.customers add constraint customers_consent_health_notes_source_chk
      check (consent_health_notes_source is null or consent_health_notes_source in ('conversation','operator','import'));
  end if;
end $$;

notify pgrst, 'reload schema';
