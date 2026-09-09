-- ============================================================================
-- 0123 — فيصل / Faysal: the Al Wattan Medical Group data layer.
--
-- APPLIED to project zlighrbsjexrozrmuwpw on 2026-09-09 via Supabase
-- apply_migration, ledger entry `0123_faysal_health_foundation`. The ledger copy
-- carries the identical statement set with this file's commentary condensed;
-- this file is the annotated source of truth. Do not apply it again.
--
-- SPEC-3-REUSE.md §1.3 Option C (OWN) rendered as SQL. Faysal gets its own
-- `health_*` schema instead of renting a discriminator column on Kivo's tenant
-- table.
--
-- THE COLUMN NAME IS THE ENFORCEMENT SURFACE. Every table below carries
-- `clinic_id`, and no Kivo table or Kivo tenant column is named, referenced or
-- joined anywhere in this file. Supabase table names are STRINGS, not imports,
-- so an import-graph scan cannot police the seam (SPEC-3 §2.3) — but a grep for
-- Kivo's tenant table and tenant-column literals under `lib/health/*` and
-- `app/faysal/*` can, and that grep is only meaningful because the schema gives
-- Faysal no reason to type either one. Extraction is then what the brief asked
-- for: `pg_dump -t 'health_*'` and no Kivo table appears in the dump.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * it does not touch, alter, drop or reference ANY existing table;
--   * it does not reuse `public.is_member_of` / `public.is_manager_of` — those
--     read Kivo's membership table, which is keyed by Kivo's tenant column.
--     Two new SECURITY DEFINER functions mirror them against `health_members`.
--     That duplication is real and is the acknowledged cost of Option C
--     (SPEC-3 §1.3); it is ~40 lines with a fixed, enumerable surface, held in
--     place by an adversarial RLS proof rather than by a convention.
--
-- HONESTY IS SPELLED WITH CONSTRAINTS, NOT WITH COMMENTS. The specification's
-- load-bearing rules are encoded where they cannot be forgotten:
--   * `health_doctors.fictional` is `not null default true check (fictional)` —
--     the SQL rendering of SPEC-1 §6.3's literal type `fictional: true`. A row
--     asserting a real clinician does not insert (Prohibition A).
--   * `health_services` may only carry `price_basis = 'client_confirmed'` with a
--     populated `client_confirmation`, and every other basis is forced to keep
--     `requires_demo_label` true (SPEC-1 §9.2, the two-marker price model).
--   * `health_payers.acceptance_confirmed` is pinned false (SPEC-1 §10.4 Rule
--     INS-1 — Faysal never promises coverage; the column exists so nothing can
--     quietly invent the field later).
--   * confidence is a seven-value CHECK that includes `unknown` and
--     `demo_seeded`, so "we don't know" and "we made this up for the demo" are
--     both first-class states and neither can be spelled as a bare boolean
--     (SPEC-1 §2, §4.1, §4.10 Rule HRS-DEMO).
--
-- Hours live in `health_sites.hours` as jsonb rather than in a day/window table
-- on purpose: SPEC-1 §4.1's record is a five-layer × seven-day matrix in which
-- each day carries its own confidence, its own sources, its own conflicts and
-- its own capturedAt. Six sites have six different Friday problems and one has
-- no published hours at all. A relational shredding of that would need four
-- tables to hold what is read as a single document by `bookableWindows()`, and
-- would tempt exactly the defaulting the model exists to forbid — a missing
-- Friday row reading as "closed" instead of `unknown` (Invariant H3). The
-- shape is validated in TypeScript (`lib/health/db/types.ts`) and by the seed.
--
-- RLS: enabled AND forced on all fifteen tables, membership-scoped, `to
-- authenticated`, mirroring 0002's read/write split (config = manager writes,
-- operational = any member) with 0100's force + explicit-role hardening and
-- 0118's `(select auth.uid())` hoist. `service_role` and `postgres` carry
-- BYPASSRLS, so seeding and the webhook are unaffected by FORCE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Membership primitives — mirrors public.is_member_of / is_manager_of.
--    SECURITY DEFINER so they can read health_members without tripping that
--    table's own RLS policy (the anti-recursion reason 0002 gives).
-- ---------------------------------------------------------------------------

create table if not exists public.health_clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text not null,
  brand text not null,
  district text,
  phone text,
  unified_phone text,
  timezone text not null default 'Asia/Riyadh',
  country text not null default 'SA',
  dialect text not null default 'saudi' check (dialect in ('saudi', 'egyptian')),
  -- Group-level defaults only. The operationally meaningful hours are per-SITE
  -- (SPEC-1 §4.4: six sites, six different Fridays) and live on health_sites.
  hours jsonb not null default '{}'::jsonb,
  cchi_code text,
  agent_mode text not null default 'setup' check (agent_mode in ('setup', 'test', 'live')),
  feature_flags jsonb not null default '{}'::jsonb,
  wa_phone_number_id text,
  wa_verify_token text,
  wa_access_token_enc text,
  -- SPEC-1 §4.10 / §9.2: DEMO_MODE is read at ONE place in code. This column is
  -- the tenant's declaration that it is a demo tenant, not a second reader.
  demo_mode boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.health_clinics is
  'Faysal tenant root (Al Wattan Medical Group). SPEC-3 §1.3 Option C. The clinic-scoped analogue of the Kivo tenant table — deliberately NOT that table.';

create table if not exists public.health_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('manager', 'operation')),
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create index if not exists health_members_user_idx on public.health_members(user_id);

create or replace function public.is_member_of_clinic(p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.health_members m
    where m.clinic_id = p_clinic_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_manager_of_clinic(p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.health_members m
    where m.clinic_id = p_clinic_id
      and m.user_id = auth.uid()
      and m.role = 'manager'
  );
$$;

-- 0090's lesson: a SECURITY DEFINER function is created with an implicit
-- PUBLIC execute grant, which anon inherits. Neither of these has an internal
-- guard (they ARE the guard), so an unauthenticated role must not reach them.
revoke execute on function public.is_member_of_clinic(uuid) from public;
revoke execute on function public.is_manager_of_clinic(uuid) from public;
revoke execute on function public.is_member_of_clinic(uuid) from anon;
revoke execute on function public.is_manager_of_clinic(uuid) from anon;
grant execute on function public.is_member_of_clinic(uuid) to authenticated, service_role;
grant execute on function public.is_manager_of_clinic(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Sites — SPEC-1 §2 schema, §3 the six branches, §4 hours.
-- ---------------------------------------------------------------------------

create table if not exists public.health_sites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  -- SPEC-1 §2 SiteId. Enumerated so a typo cannot mint a seventh branch.
  site_key text not null check (site_key in
    ('wattan-1', 'wattan-2', 'wattan-3', 'wattan-4', 'shoaa-wurud', 'shoaa-rawdah')),
  brand text not null check (brand in ('wattan', 'shoaa')),
  name_ar text not null,
  name_en text not null,
  aka_ar text[] not null default '{}',
  aka_en text[] not null default '{}',
  maps_category text not null default 'unknown'
    check (maps_category in ('Hospital', 'Medical Center', 'Polyclinic', 'unknown')),

  district_ar text not null,
  district_en text not null,
  address_en text not null,
  -- NULL where the dossier gives no Arabic form (wattan-2). Never back-filled
  -- from a sibling site: SPEC-1 §3 preamble.
  address_ar text,
  postal_code text,
  landmarks text[] not null default '{}',
  plus_code text,

  -- SPEC-1 §2 Phone[]: {e164OrNational, kind, confidence, source, suppressed,
  -- suppressionReason}. Rule PHONE-1 (never read out a fax) and the Complex 4
  -- phone warning (§3.4) are carried by `kind` and `suppressed` per entry —
  -- which is why this is a typed array of records and not four text columns.
  phones jsonb not null default '[]'::jsonb,

  established_year integer,
  established_kind text check (established_kind in ('established', 'acquired', 'joined_group')),

  -- SPEC-1 §3.4.1. `operational_contested` is a first-class state, not a
  -- boolean that lost an argument. Invariant H5 keys off it.
  operating_state text not null default 'unknown'
    check (operating_state in ('operational', 'operational_contested', 'closed', 'unknown')),
  operating_evidence jsonb not null default '{}'::jsonb,
  requires_live_confirmation boolean not null default false,

  -- SPEC-1 §10.3. Complex 4's code is NULL and is never borrowed from a
  -- sibling, for the same reason Friday is never borrowed from Thursday.
  insurance_facility_code text,
  insurance_code_kind text
    check (insurance_code_kind in ('cchi_style_network_code', 'legacy_map_id')),
  insurance_code_confidence text not null default 'unknown'
    check (insurance_code_confidence in
      ('client_confirmed', 'high', 'medium', 'low', 'conflicted', 'demo_seeded', 'unknown')),
  insurance_code_source jsonb,

  accreditation_cbahi text not null default 'unknown'
    check (accreditation_cbahi in ('accredited', 'not_accredited_claimed_in_progress', 'unknown')),
  accreditation_date date,
  accreditation_source jsonb,

  -- SPEC-1 Rule RATE-1: routing tie-breaker only, NEVER rendered to a patient.
  -- Stored with min/max review counts rather than an averaged false precision.
  rating jsonb not null default '{}'::jsonb,

  -- SPEC-1 §2: tri-state, never a bare boolean. A boolean forces `unknown` to
  -- become `false`, and `false` for wheelchair access at a site where we have
  -- no data is a lie that a wheelchair user acts on.
  amenities jsonb not null default '{}'::jsonb,

  -- SPEC-1 §4.1 SiteHours: { siteId, timezone, layers: LayerHours[],
  -- staleAfterDays }. Five layers × seven days, each day carrying status,
  -- windows, confidence, sources, conflicts and capturedAt.
  hours jsonb not null default '{}'::jsonb,
  timezone text not null default 'Asia/Riyadh',
  -- Rule HRS-FRESH. Two clocks: scraped listings decay in 30 days; a timetable
  -- a named operations manager gave us on a dated call decays over 180 and
  -- DOWNGRADES rather than voiding (§4.10).
  stale_after_days integer not null default 30 check (stale_after_days > 0),
  client_confirmed_stale_after_days integer not null default 180
    check (client_confirmed_stale_after_days > 0),

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, site_key)
);

comment on column public.health_sites.rating is
  'Rule RATE-1: internal routing tie-breaker only. Never rendered to a patient, never a reason to route.';
comment on column public.health_sites.hours is
  'SPEC-1 §4.1 SiteHours. `bookable` is DERIVED by bookableWindows() and must never be authored here.';

create index if not exists health_sites_clinic_idx on public.health_sites(clinic_id, site_key);

-- ---------------------------------------------------------------------------
-- 3. Specialties and the per-site evidence matrix — SPEC-1 §6.1, §6.2.
-- ---------------------------------------------------------------------------

create table if not exists public.health_specialties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  specialty_key text not null,
  name_ar text not null,
  name_en text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (clinic_id, specialty_key)
);

create table if not exists public.health_site_specialties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  site_id uuid not null references public.health_sites(id) on delete cascade,
  specialty_id uuid not null references public.health_specialties(id) on delete cascade,
  -- SPEC-1 Rule SPEC-1: ONLY `named_at_site` is bookable. `group_only` and
  -- `inferred` are conversational — the group offering ophthalmology somewhere
  -- is not evidence that Ar Rawdah has an ophthalmologist on Tuesday.
  evidence text not null check (evidence in ('named_at_site', 'group_only', 'inferred', 'absent')),
  dossier_ref text,
  note text,
  created_at timestamptz not null default now(),
  unique (clinic_id, site_id, specialty_id),
  -- A claim that this branch runs this clinic, or an inference standing in for
  -- one, must be able to point at where it came from.
  constraint health_site_specialties_cited
    check (evidence in ('group_only', 'absent') or dossier_ref is not null)
);

create index if not exists health_site_specialties_site_idx
  on public.health_site_specialties(clinic_id, site_id, evidence);

-- ---------------------------------------------------------------------------
-- 4. Clinicians — SPEC-1 §6.3. EVERY ROW IS FICTIONAL, BY CONSTRAINT.
-- ---------------------------------------------------------------------------

create table if not exists public.health_doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  doctor_key text not null,
  name_ar text not null,
  name_en text not null,
  -- SPEC-1 Rule DOC-1: a filter, never a recommendation. Patients frequently
  -- ask for a female clinician, so it is first-class data rather than a note.
  gender text not null check (gender in ('female', 'male')),
  specialty_id uuid references public.health_specialties(id) on delete set null,
  sub_specialties text[] not null default '{}',
  languages text[] not null default '{ar}'
    check (languages <@ array['ar', 'en', 'ur', 'fr']::text[]),
  seniority text not null default 'specialist'
    check (seniority in ('consultant', 'specialist', 'general_practitioner')),
  -- The service whose duration + buffer shapes this clinician's slot grid.
  default_service_key text,

  -- SPEC-1 §6.3, PROHIBITION A. The literal type `fictional: true` in SQL: a
  -- false value does not insert. The dossier names real, identifiable, licensed
  -- clinicians harvested from public reviews; wiring one of them into a fake
  -- booking system would attach invented availability and invented fees to a
  -- real professional's name. scripts/proof-faysal-denylist.test.ts is the
  -- other half of this guard and matches on normalised full names.
  fictional boolean not null default true check (fictional),

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, doctor_key)
);

comment on table public.health_doctors is
  'SPEC-1 §6.3 — ALL NAMES ARE FICTIONAL. No row corresponds to any real clinician. `fictional` is CHECKed true so the marker cannot be forgotten.';

create table if not exists public.health_doctor_sites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  doctor_id uuid not null references public.health_doctors(id) on delete cascade,
  site_id uuid not null references public.health_sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (clinic_id, doctor_id, site_id)
);

create index if not exists health_doctor_sites_site_idx
  on public.health_doctor_sites(clinic_id, site_id);

-- ---------------------------------------------------------------------------
-- 5. Service catalogue and demo prices — SPEC-1 §9.
-- ---------------------------------------------------------------------------

create table if not exists public.health_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  service_key text not null,
  name_ar text not null,
  name_en text not null,
  category text not null,
  specialty_id uuid references public.health_specialties(id) on delete set null,

  amount_sar numeric(10, 2) not null check (amount_sar >= 0),
  -- SPEC-1 §9.2 marker 1 (data layer). Governs code paths.
  price_basis text not null
    check (price_basis in ('demo_invented_anchored', 'demo_invented_unanchored', 'client_confirmed')),
  anchor_note text,
  -- SPEC-1 §9.2 marker 2 (message layer). Governs what the patient sees. Two
  -- markers because they are read by different things and neither can be
  -- satisfied by the other — the same law lib/demo/config.ts applies when it
  -- stamps a demo order with BOTH `source` and `is_test`.
  requires_demo_label boolean not null default true,
  -- SPEC-1 §9.5: Saudi VAT treatment of healthcare is not uniform and the
  -- dossier carries no ruling, so there is no tax line and Faysal never states
  -- whether a price includes VAT.
  vat_note text not null default 'excluded_unknown' check (vat_note = 'excluded_unknown'),

  duration_minutes integer not null check (duration_minutes > 0),
  -- Rule BUF-1: the buffer blocks the resource, is never offered as a slot and
  -- is never billed. It is part of `end` for occupancy and part of nothing for
  -- money — which is why it lives here and not in any price calculation.
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),

  -- Rule PKG-1: every package is exactly 5 x session (six sessions, one free),
  -- and that relationship is SPOKEN to the patient, so it is stored as a
  -- relationship a test can assert rather than as two numbers that can drift.
  package_sessions integer check (package_sessions is null or package_sessions > 1),
  base_service_id uuid references public.health_services(id) on delete set null,

  -- SPEC-1 §4.10 ClientConfirmation: the named person, role, channel, datetime,
  -- verbatim and scope. Rule HRS-CONFIRM applied to money.
  client_confirmation jsonb,

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, service_key),

  -- The two-marker law, enforced. An invented price MUST carry the label; a
  -- client-confirmed price MUST carry its attribution. "The client said so" is
  -- the highest-authority claim in this system, so it takes the strongest
  -- provenance requirement, not the weakest.
  constraint health_services_demo_marked check (
    (price_basis = 'client_confirmed' and client_confirmation is not null)
    or (price_basis <> 'client_confirmed' and requires_demo_label)
  ),
  constraint health_services_package_shape check (
    (package_sessions is null and base_service_id is null)
    or (package_sessions is not null and base_service_id is not null)
  )
);

comment on column public.health_services.price_basis is
  'SPEC-1 §9.1: every figure in the Wave 1 catalogue is INVENTED. The dossier contains a marketplace range and TPA discount percentages, and disclaims both.';

create index if not exists health_services_clinic_idx
  on public.health_services(clinic_id, category, active);

-- ---------------------------------------------------------------------------
-- 6. Payers — SPEC-1 §10. Insurance NEVER gates a booking and coverage is
--    never promised; this table exists so the agent can name networks a
--    building appears on, and nothing more.
-- ---------------------------------------------------------------------------

create table if not exists public.health_payers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  payer_key text not null,
  name_en text not null,
  name_ar text not null,
  -- The insurer / tpa_discount_card distinction is load-bearing: a discount
  -- card is not health insurance, and a patient told "we accept Takaful" who
  -- arrives expecting cover has been misled by a category error.
  kind text not null check (kind in ('insurer', 'tpa_discount_card', 'directory_source')),
  site_evidence jsonb not null default '[]'::jsonb,
  -- Rule INS-3 / §10.3: we were told to verify the class on the patient's card;
  -- we have not verified it; therefore it is unknown and Faysal never states one.
  network_class text not null default 'unknown'
    check (network_class in ('A', 'B', 'C', 'MPN', 'OCN', 'OHN', 'unknown')),
  -- Rule INS-1, as a constraint rather than a hope. DERIVED and always false in
  -- Wave 1: a list of networks a building appears on is not eligibility.
  acceptance_confirmed boolean not null default false check (acceptance_confirmed = false),
  created_at timestamptz not null default now(),
  unique (clinic_id, payer_key)
);

-- ---------------------------------------------------------------------------
-- 7. Constrained resources — SPEC-1 §7.4.
-- ---------------------------------------------------------------------------

create table if not exists public.health_resources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  site_id uuid not null references public.health_sites(id) on delete cascade,
  resource_key text not null,
  kind text not null check (kind in ('room', 'device', 'chair')),
  capacity integer not null default 1 check (capacity > 0),
  -- Service keys that consume this resource. Rule RES-1: the resource is never
  -- named to the patient — the evidence is a patient review, not a spec sheet.
  service_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (clinic_id, site_id, resource_key)
);

-- ---------------------------------------------------------------------------
-- 8. Holds — SPEC-1 §7.5. A hold is NOT a booking.
-- ---------------------------------------------------------------------------

create table if not exists public.health_holds (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  hold_token text not null,
  -- The patient identity (WhatsApp number, normalised). Not a name.
  patient_ref text not null,
  -- FAM-6: a family block is ONE hold with one token covering every leg.
  family_group_id uuid,
  state text not null default 'active'
    check (state in ('active', 'confirmed', 'released', 'expired')),
  expires_at timestamptz not null,
  released_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (clinic_id, hold_token)
);

-- HOLD-2, enforced by the database rather than by the caller remembering: one
-- ACTIVE hold per patient identity per clinic. A new hold must release the
-- previous one; an indecisive conversation cannot accumulate locks.
create unique index if not exists health_holds_one_active_per_patient
  on public.health_holds(clinic_id, patient_ref)
  where state = 'active';

create index if not exists health_holds_expiry_idx
  on public.health_holds(clinic_id, state, expires_at);

-- ---------------------------------------------------------------------------
-- 9. Slots — SPEC-1 §7.1, §7.2. Deterministically generated, then stored so
--    the salesperson's screen and the client's phone show the same day.
-- ---------------------------------------------------------------------------

create table if not exists public.health_slots (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  site_id uuid not null references public.health_sites(id) on delete cascade,
  doctor_id uuid not null references public.health_doctors(id) on delete cascade,
  service_id uuid not null references public.health_services(id) on delete restrict,

  starts_at timestamptz not null,
  -- start + duration. What the patient is told.
  ends_at timestamptz not null,
  -- start + duration + buffer. Rule BUF-1: what the resource is blocked for.
  blocked_until timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),

  -- Local (Asia/Riyadh) day and minute-of-day, carried explicitly because the
  -- generator is keyed on them and because "which local day is this" must never
  -- be re-derived from a server clock (SPEC-1 §4.1: the timezone is pinned).
  local_date date not null,
  local_start_minute integer not null check (local_start_minute between 0 and 1439),
  day_key text not null check (day_key in ('sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri')),

  state text not null default 'offered'
    check (state in ('offered', 'held', 'confirmed', 'expired', 'cancelled', 'checked_in', 'no_show')),
  hold_id uuid references public.health_holds(id) on delete set null,
  held_until timestamptz,

  -- The confidence of the clinic-layer window that minted this slot. Wave 1
  -- inventory is `demo_seeded` (Rule HRS-DEMO): invented, labelled, accepted by
  -- bookableWindows() ONLY under DEMO_MODE, and disclosed in conversation. It
  -- is stored per slot so a production build can find and refuse it, and so
  -- HOLD-5 can re-validate at confirm time instead of trusting the offer.
  window_confidence text not null
    check (window_confidence in
      ('client_confirmed', 'high', 'medium', 'low', 'conflicted', 'demo_seeded', 'unknown')),
  -- SPEC-1 §7.2: pinned salt, never accepted from a request. Recorded so a
  -- regenerated day can be compared against the day that was offered.
  generator text not null default 'faysal-slotgen-v1',
  seed_salt text not null,

  -- POL-04 two-marker law, same as lib/demo/config.ts stamps on a demo order.
  source text not null default 'faysal_demo',
  is_test boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One clinician cannot be in two places at one instant.
  unique (clinic_id, doctor_id, starts_at),
  -- H1's shape at the storage layer: a slot's end never precedes its start and
  -- the buffer never shrinks the block (BUF-2 checks the window at generation).
  constraint health_slots_interval check (ends_at > starts_at and blocked_until >= ends_at)
);

create index if not exists health_slots_lookup_idx
  on public.health_slots(clinic_id, site_id, local_date, state, starts_at);
create index if not exists health_slots_doctor_day_idx
  on public.health_slots(clinic_id, doctor_id, local_date, starts_at);
create index if not exists health_slots_hold_idx
  on public.health_slots(clinic_id, hold_id) where hold_id is not null;

-- ---------------------------------------------------------------------------
-- 10. Appointments — SPEC-1 §7.5, §4.6 (callback_request), §8 (consent).
-- ---------------------------------------------------------------------------

create table if not exists public.health_appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  site_id uuid not null references public.health_sites(id) on delete cascade,
  doctor_id uuid references public.health_doctors(id) on delete set null,
  service_id uuid references public.health_services(id) on delete set null,
  slot_id uuid references public.health_slots(id) on delete set null,

  -- §4.6: a site with no hours and a contested status yields ZERO bookable
  -- minutes and a working conversation. A callback request is a distinct kind,
  -- consumes no inventory, and never renders a time the patient could turn up
  -- for.
  kind text not null default 'slot' check (kind in ('slot', 'callback_request')),
  state text not null default 'confirmed'
    check (state in ('requested', 'confirmed', 'cancelled', 'checked_in', 'no_show')),

  -- §8 / POL-03: the minimum. Display name, WhatsApp number, service, site,
  -- time. NO national ID, NO Iqama, NO insurance member number, NO clinical
  -- detail beyond the service name. ID and insurance card are a RECEPTION step
  -- and Faysal tells the patient to bring them rather than collecting them.
  patient_name text,
  patient_ref text not null,
  preferred_window text,
  note text,

  starts_at timestamptz,
  ends_at timestamptz,

  -- Rule C4-1: a contested site is bookable, but never silently. Faysal never
  -- renders a bare "confirmed" for `operational_contested`.
  pending_branch_confirmation boolean not null default false,

  hold_token text,
  family_group_id uuid,
  consent jsonb not null default '{}'::jsonb,

  -- POL-04 two markers + a TTL, like DEMO_SESSION_TTL_MS.
  source text not null default 'faysal_demo',
  is_test boolean not null default true,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint health_appointments_kind_shape check (
    (kind = 'slot' and slot_id is not null and starts_at is not null)
    or (kind = 'callback_request' and slot_id is null and starts_at is null)
  )
);

-- HOLD-4: confirm() is idempotent on the hold token. WhatsApp double-taps and
-- network retries are routine; a second confirm must return the SAME
-- appointment id, never write a second appointment.
create unique index if not exists health_appointments_hold_idem
  on public.health_appointments(clinic_id, hold_token, slot_id)
  where hold_token is not null and slot_id is not null;

create index if not exists health_appointments_lookup_idx
  on public.health_appointments(clinic_id, site_id, state, starts_at);
create index if not exists health_appointments_patient_idx
  on public.health_appointments(clinic_id, patient_ref, created_at desc);
create index if not exists health_appointments_family_idx
  on public.health_appointments(clinic_id, family_group_id)
  where family_group_id is not null;

-- ---------------------------------------------------------------------------
-- 11. Conversations and messages — Faysal's own, because the Kivo ones FK to
--     the Kivo tenant table and because a clinic's conversations are health
--     records end to end. Separate tables mean a separate retention policy, a separate
--     deletion path and a separate export — things you want to be able to point
--     at during a PDPL conversation, not derive with a `where` clause.
-- ---------------------------------------------------------------------------

create table if not exists public.health_conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  site_id uuid references public.health_sites(id) on delete set null,
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'web', 'demo', 'voice')),
  patient_ref text not null,
  display_name text,
  locale text not null default 'ar',
  state text not null default 'open' check (state in ('open', 'closed')),
  owner text not null default 'AI' check (owner in ('AI', 'HUMAN')),
  -- SPEC-4's escalation surface writes here; the domain layer owns the values.
  safety jsonb not null default '{}'::jsonb,
  consent jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  source text not null default 'faysal_demo',
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, channel, patient_ref)
);

create table if not exists public.health_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.health_clinics(id) on delete cascade,
  conversation_id uuid not null references public.health_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text not null check (sender in ('patient', 'agent', 'staff', 'system')),
  body text not null default '',
  wa_message_id text,
  status text check (status in ('sending', 'sent', 'delivered', 'read', 'failed')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Inbound WhatsApp delivery is at-least-once. Dedupe on the provider id.
create unique index if not exists health_messages_wa_dedupe
  on public.health_messages(clinic_id, wa_message_id)
  where wa_message_id is not null;

create index if not exists health_messages_conversation_idx
  on public.health_messages(clinic_id, conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 12. RLS — enabled AND forced on every table, membership-scoped, to
--     `authenticated` only. Reads and writes split exactly as 0002 splits them:
--     config is manager-write, operational work is any-member.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'health_clinics', 'health_members', 'health_sites', 'health_specialties',
    'health_site_specialties', 'health_doctors', 'health_doctor_sites',
    'health_services', 'health_payers', 'health_resources', 'health_holds',
    'health_slots', 'health_appointments', 'health_conversations', 'health_messages'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- health_clinics: any member reads; only a manager edits.
drop policy if exists health_clinics_read on public.health_clinics;
drop policy if exists health_clinics_write on public.health_clinics;
create policy health_clinics_read on public.health_clinics
  for select to authenticated using (public.is_member_of_clinic(id));
create policy health_clinics_write on public.health_clinics
  for update to authenticated
  using (public.is_manager_of_clinic(id))
  with check (public.is_manager_of_clinic(id));

-- health_members: a user sees their own row; a manager sees and manages the team.
-- auth.uid() is hoisted into a scalar subquery so the planner evaluates it once
-- per statement rather than once per row (0118's finding, applied at birth).
drop policy if exists health_members_read on public.health_members;
drop policy if exists health_members_write on public.health_members;
create policy health_members_read on public.health_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager_of_clinic(clinic_id));
create policy health_members_write on public.health_members
  for all to authenticated
  using (public.is_manager_of_clinic(clinic_id))
  with check (public.is_manager_of_clinic(clinic_id));

-- Config tables: any member reads, manager writes.
do $$
declare t text;
begin
  foreach t in array array[
    'health_sites', 'health_specialties', 'health_site_specialties', 'health_doctors',
    'health_doctor_sites', 'health_services', 'health_payers', 'health_resources'
  ] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format(
      'create policy %1$s_read on public.%1$s
         for select to authenticated using (public.is_member_of_clinic(clinic_id));', t);
    execute format(
      'create policy %1$s_write on public.%1$s
         for all to authenticated
         using (public.is_manager_of_clinic(clinic_id))
         with check (public.is_manager_of_clinic(clinic_id));', t);
  end loop;
end $$;

-- Operational tables: any member (manager OR operation) reads and writes, since
-- day-to-day booking work is the operation role's job.
do $$
declare t text;
begin
  foreach t in array array[
    'health_holds', 'health_slots', 'health_appointments',
    'health_conversations', 'health_messages'
  ] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s;', t);
    execute format(
      'create policy %1$s_rw on public.%1$s
         for all to authenticated
         using (public.is_member_of_clinic(clinic_id))
         with check (public.is_member_of_clinic(clinic_id));', t);
  end loop;
end $$;

-- Nothing here is reachable by an unauthenticated caller. The Faysal demo page
-- talks to the database through server routes holding the service key, exactly
-- as the Kivo demo does; the anon key gets no health surface at all.
do $$
declare t text;
begin
  foreach t in array array[
    'health_clinics', 'health_members', 'health_sites', 'health_specialties',
    'health_site_specialties', 'health_doctors', 'health_doctor_sites',
    'health_services', 'health_payers', 'health_resources', 'health_holds',
    'health_slots', 'health_appointments', 'health_conversations', 'health_messages'
  ] loop
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;
