-- ============================================================================
-- MaitreAI - 0104: E0 safety ingress evidence (PREPARE-ONLY).
--
-- Activates persistence-only BRAIN ingress for the live WhatsApp webhook:
-- ingress and evidence tables only; zero execution surfaces.
--
-- PREPARE ONLY. Do not apply from builder sessions.
-- ============================================================================

-- Fail during migration preflight rather than when the first safety event lands.
-- The expected 0102 schema already permits NULL triage_class for failed scans.
-- An unexpected NOT NULL definition is schema drift and must stop for review.
do $$
declare
  v_triage_is_nullable text;
begin
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null then
    raise exception '0104 requires pgcrypto function extensions.digest(text,text)'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('gen_random_uuid()') is null then
    raise exception '0104 requires function gen_random_uuid()'
      using errcode = '55000';
  end if;

  select c.is_nullable
    into v_triage_is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'ingress_safety_scans'
    and c.column_name = 'triage_class';

  if v_triage_is_nullable is null then
    raise exception '0104 requires public.ingress_safety_scans.triage_class'
      using errcode = '55000';
  end if;

  if v_triage_is_nullable = 'NO' then
    raise exception '0104 requires nullable public.ingress_safety_scans.triage_class; unexpected NOT NULL schema drift'
      using errcode = '55000';
  end if;
end $$;

-- Exact webhook retries reuse one durable envelope.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhook_envelopes_payload_idempotency_key'
      and conrelid = 'public.webhook_envelopes'::regclass
  ) then
    alter table public.webhook_envelopes
      add constraint webhook_envelopes_payload_idempotency_key
      unique (tenant_id, provider, payload_hash);
  end if;
end $$;

-- A machine speech transcript is a separate derived event linked to the raw
-- customer inbound. It is not stored as customer-authored text.
alter table public.channel_events
  add column if not exists source_channel_event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_events_source_event_fk'
      and conrelid = 'public.channel_events'::regclass
  ) then
    alter table public.channel_events
      add constraint channel_events_source_event_fk
      foreign key (tenant_id, source_channel_event_id)
      references public.channel_events(tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_events_source_not_self_check'
      and conrelid = 'public.channel_events'::regclass
  ) then
    alter table public.channel_events
      add constraint channel_events_source_not_self_check
      check (source_channel_event_id is null or source_channel_event_id <> id);
  end if;
end $$;

create index if not exists channel_events_source_event_idx
  on public.channel_events(tenant_id, source_channel_event_id)
  where source_channel_event_id is not null;

-- One deterministic scan result per raw event. An explicit terminal outcome distinguishes
-- "scanned and empty" from "never scanned".
alter table public.ingress_safety_scans
  add column if not exists scan_outcome text not null default 'pending',
  add column if not exists error_category text,
  add column if not exists result_fingerprint text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingress_safety_scans_outcome_check'
      and conrelid = 'public.ingress_safety_scans'::regclass
  ) then
    alter table public.ingress_safety_scans
      add constraint ingress_safety_scans_outcome_check
      check (scan_outcome in ('pending', 'completed_signal', 'completed_no_signal', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingress_safety_scans_error_category_check'
      and conrelid = 'public.ingress_safety_scans'::regclass
  ) then
    alter table public.ingress_safety_scans
      add constraint ingress_safety_scans_error_category_check
      check (
        (
          scan_outcome = 'failed'
          and error_category in (
            'scanner_failed',
            'evidence_validation_failed',
            'evidence_persist_failed',
            'database_unavailable'
          )
        )
        or
        (scan_outcome <> 'failed' and error_category is null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingress_safety_scans_result_fingerprint_check'
      and conrelid = 'public.ingress_safety_scans'::regclass
  ) then
    alter table public.ingress_safety_scans
      add constraint ingress_safety_scans_result_fingerprint_check
      check (
        (
          scan_outcome in ('completed_signal', 'completed_no_signal')
          and result_fingerprint ~ '^[0-9a-f]{64}$'
        )
        or
        (
          scan_outcome not in ('completed_signal', 'completed_no_signal')
          and result_fingerprint is null
        )
      );
  end if;
end $$;

-- Safety evidence must retain its raw channel event. Replacing CASCADE is safe
-- at E0 activation because the auditor verified this substrate has zero rows.
alter table public.ingress_safety_scans
  drop constraint if exists ingress_safety_scans_event_fk;

alter table public.ingress_safety_scans
  add constraint ingress_safety_scans_event_fk
  foreign key (tenant_id, channel_event_id)
  references public.channel_events(tenant_id, id)
  on delete restrict;

create table if not exists public.ingress_safety_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.restaurants(id) on delete restrict,
  scan_id uuid not null,
  evidence_class text not null
    check (evidence_class in ('customer_text', 'speech_transcript')),
  disclosure_class text not null
    check (disclosure_class in (
      'allergy',
      'allergen',
      'ingredient',
      'medical',
      'symptom',
      'cross_contact',
      'third_party'
    )),
  matched_excerpt text not null check (length(matched_excerpt) > 0),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  excerpt_hash text not null check (excerpt_hash ~ '^[0-9a-f]{64}$'),
  customer_authored boolean not null,
  audio_message_reference text,
  transcription_provider text,
  transcription_model text,
  created_at timestamptz not null default now(),
  constraint ingress_safety_evidence_tenant_id_id_key unique (tenant_id, id),
  constraint ingress_safety_evidence_scan_fk
    foreign key (tenant_id, scan_id)
    references public.ingress_safety_scans(tenant_id, id)
    on delete restrict,
  constraint ingress_safety_evidence_offsets_check
    check (end_offset - start_offset <= length(matched_excerpt) * 8),
  constraint ingress_safety_evidence_hash_check
    check (excerpt_hash = encode(extensions.digest(matched_excerpt, 'sha256'), 'hex')),
  constraint ingress_safety_evidence_provenance_check
    check (
      (
        evidence_class = 'customer_text'
        and customer_authored
        and audio_message_reference is null
        and transcription_provider is null
        and transcription_model is null
      )
      or
      (
        evidence_class = 'speech_transcript'
        and not customer_authored
        and audio_message_reference is not null
        and transcription_provider is not null
        and transcription_model is not null
      )
    ),
  constraint ingress_safety_evidence_match_key
    unique (tenant_id, scan_id, evidence_class, disclosure_class, start_offset, end_offset, excerpt_hash)
);

create index if not exists ingress_safety_evidence_scan_idx
  on public.ingress_safety_evidence(tenant_id, scan_id, created_at);

create or replace function public.enforce_ingress_safety_scan_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.scan_outcome in ('completed_signal', 'completed_no_signal') and new is distinct from old then
    raise exception 'completed ingress safety scans are terminal'
      using errcode = '23514';
  end if;

  if old.scan_outcome = 'pending'
     and new.scan_outcome not in ('pending', 'completed_signal', 'completed_no_signal', 'failed') then
    raise exception 'invalid ingress safety scan transition from pending to %', new.scan_outcome
      using errcode = '23514';
  end if;

  if old.scan_outcome = 'failed'
     and new.scan_outcome not in ('failed', 'completed_signal', 'completed_no_signal') then
    raise exception 'invalid ingress safety scan transition from failed to %', new.scan_outcome
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists ingress_safety_scans_monotonic on public.ingress_safety_scans;
create trigger ingress_safety_scans_monotonic
before update on public.ingress_safety_scans
for each row execute function public.enforce_ingress_safety_scan_transition();

create or replace function public.reject_ingress_safety_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'ingress safety evidence is immutable'
    using errcode = '55000';
end;
$$;

drop trigger if exists ingress_safety_evidence_immutable on public.ingress_safety_evidence;
create trigger ingress_safety_evidence_immutable
before update or delete on public.ingress_safety_evidence
for each row execute function public.reject_ingress_safety_evidence_mutation();

create or replace function public.guard_ingress_safety_evidence_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_outcome text;
  v_retry_scan_id text;
begin
  select s.scan_outcome
    into v_outcome
  from public.ingress_safety_scans s
  where s.tenant_id = new.tenant_id
    and s.id = new.scan_id
  for update;

  if not found then
    raise exception 'ingress safety scan parent not found'
      using errcode = '23503';
  end if;

  v_retry_scan_id := current_setting('kivo.ingress_safety_retry_scan_id', true);
  if v_outcome = 'pending'
     or (v_outcome = 'failed' and v_retry_scan_id = new.scan_id::text) then
    return new;
  end if;

  raise exception 'terminal ingress safety scan accepts no evidence'
    using errcode = '23514';
end;
$$;

drop trigger if exists ingress_safety_evidence_parent_guard on public.ingress_safety_evidence;
create trigger ingress_safety_evidence_parent_guard
before insert on public.ingress_safety_evidence
for each row execute function public.guard_ingress_safety_evidence_insert();

-- Raw envelope persistence. The unique payload key makes provider retries
-- idempotent and still returns the existing envelope id so processing resumes.
--
-- Approved service-role exception: these four SECURITY DEFINER RPCs are called
-- only by the server-side live webhook. Each uses an empty search_path,
-- schema-qualified relations, validates its tenant-scoped parent, and has
-- EXECUTE reset for PUBLIC/anon/authenticated before service_role alone is granted.
create or replace function public.brain_record_webhook_envelope(
  p_tenant_id uuid,
  p_provider text,
  p_channel text,
  p_app_id text,
  p_received_at timestamptz,
  p_payload_hash text,
  p_signature_verified boolean,
  p_processing_status text,
  p_raw_payload jsonb,
  p_error text
)
returns table (id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_inserted boolean := false;
begin
  if not exists (
    select 1
    from public.restaurants r
    where r.id = p_tenant_id
  ) then
    raise exception 'ingress tenant not found'
      using errcode = '23503';
  end if;

  insert into public.webhook_envelopes (
    tenant_id,
    provider,
    channel,
    app_id,
    received_at,
    payload_hash,
    signature_verified,
    processing_status,
    raw_payload,
    error
  )
  values (
    p_tenant_id,
    p_provider,
    p_channel,
    p_app_id,
    p_received_at,
    p_payload_hash,
    p_signature_verified,
    p_processing_status,
    coalesce(p_raw_payload, '{}'::jsonb),
    p_error
  )
  on conflict (tenant_id, provider, payload_hash) do nothing
  returning webhook_envelopes.id into v_id;

  if v_id is not null then
    v_inserted := true;
  else
    select e.id
      into v_id
    from public.webhook_envelopes e
    where e.tenant_id = p_tenant_id
      and e.provider = p_provider
      and e.payload_hash = p_payload_hash;
  end if;

  if v_id is null then
    raise exception 'failed to resolve webhook envelope after idempotent insert';
  end if;
  return query select v_id, v_inserted;
end;
$$;

-- Atomic raw channel-event persistence. Duplicate events return the existing id;
-- callers must continue to the scan rather than treating the duplicate as done.
create or replace function public.brain_record_channel_event(
  p_tenant_id uuid,
  p_envelope_id uuid,
  p_provider text,
  p_channel text,
  p_event_kind text,
  p_event_dedupe_key text,
  p_event_index integer,
  p_source_channel_event_id uuid,
  p_provider_message_id text,
  p_provider_timestamp timestamptz,
  p_customer_channel_id text,
  p_thread_key text,
  p_status text,
  p_status_rank integer,
  p_message_type text,
  p_raw_event jsonb,
  p_normalized_event jsonb,
  p_received_at timestamptz
)
returns table (id uuid, inserted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_inserted boolean := false;
  v_requested_identity jsonb;
  v_existing_identity jsonb;
  v_existing_raw_event jsonb;
  v_existing_provider_timestamp timestamptz;
begin
  if not exists (
    select 1
    from public.webhook_envelopes e
    where e.tenant_id = p_tenant_id
      and e.id = p_envelope_id
  ) then
    raise exception 'webhook envelope does not belong to ingress tenant'
      using errcode = '23503';
  end if;

  if p_source_channel_event_id is not null and not exists (
    select 1
    from public.channel_events e
    where e.tenant_id = p_tenant_id
      and e.id = p_source_channel_event_id
  ) then
    raise exception 'source channel event does not belong to ingress tenant'
      using errcode = '23503';
  end if;

  v_requested_identity := jsonb_build_object(
    'provider', p_provider,
    'channel', p_channel,
    'event_kind', p_event_kind,
    'source_channel_event_id', p_source_channel_event_id,
    'provider_message_id', p_provider_message_id,
    'customer_channel_id', p_customer_channel_id,
    'thread_key', p_thread_key,
    'status', p_status,
    'message_type', p_message_type
  );

  insert into public.channel_events (
    tenant_id,
    envelope_id,
    provider,
    channel,
    event_kind,
    event_dedupe_key,
    event_index,
    source_channel_event_id,
    provider_message_id,
    provider_timestamp,
    customer_channel_id,
    thread_key,
    status,
    status_rank,
    message_type,
    raw_event,
    normalized_event,
    received_at
  )
  values (
    p_tenant_id,
    p_envelope_id,
    p_provider,
    p_channel,
    p_event_kind,
    p_event_dedupe_key,
    p_event_index,
    p_source_channel_event_id,
    p_provider_message_id,
    p_provider_timestamp,
    p_customer_channel_id,
    p_thread_key,
    p_status,
    p_status_rank,
    p_message_type,
    coalesce(p_raw_event, '{}'::jsonb),
    coalesce(p_normalized_event, '{}'::jsonb),
    p_received_at
  )
  on conflict (tenant_id, provider, event_dedupe_key) do nothing
  returning channel_events.id into v_id;

  if v_id is not null then
    v_inserted := true;
  else
    select
      e.id,
      jsonb_build_object(
        'provider', e.provider,
        'channel', e.channel,
        'event_kind', e.event_kind,
        'source_channel_event_id', e.source_channel_event_id,
        'provider_message_id', e.provider_message_id,
        'customer_channel_id', e.customer_channel_id,
        'thread_key', e.thread_key,
        'status', e.status,
        'message_type', e.message_type
      ),
      e.raw_event,
      e.provider_timestamp
      into
        v_id,
        v_existing_identity,
        v_existing_raw_event,
        v_existing_provider_timestamp
    from public.channel_events e
    where e.tenant_id = p_tenant_id
      and e.provider = p_provider
      and e.event_dedupe_key = p_event_dedupe_key;

    -- A provider retry may use a new envelope, and normalized output may change
    -- across deployments. Raw provider payload and provider timestamp may not.
    if not (
      v_existing_identity is not distinct from v_requested_identity
      and v_existing_raw_event is not distinct from coalesce(p_raw_event, '{}'::jsonb)
      and v_existing_provider_timestamp is not distinct from p_provider_timestamp
    ) then
      raise exception 'KIVO_CHANNEL_EVENT_DEDUPE_CONFLICT'
        using
          errcode = 'KIV02',
          detail = 'Existing channel event immutable identity differs from the dedupe-key retry.';
    end if;
  end if;

  if v_id is null then
    raise exception 'failed to resolve channel event after idempotent insert';
  end if;
  return query select v_id, v_inserted;
end;
$$;

-- Parent completion and all immutable child evidence commit in one transaction.
create or replace function public.brain_complete_ingress_safety_scan(
  p_tenant_id uuid,
  p_channel_event_id uuid,
  p_provider text,
  p_source_message_id text,
  p_raw_text_hash text,
  p_triage_class text,
  p_safety_candidate boolean,
  p_explicit_stop boolean,
  p_human_takeover_requested boolean,
  p_fast_path_markers text[],
  p_matched_spans jsonb,
  p_scanner_version text,
  p_scanned_at timestamptz,
  p_scan_outcome text,
  p_evidence jsonb
)
returns table (
  id uuid,
  scan_outcome text,
  evidence_count integer,
  already_completed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan_id uuid;
  v_current_outcome text;
  v_current_fingerprint text;
  v_evidence_count integer;
  v_event_provider text;
  v_event_source_message_id text;
  v_canonical_evidence jsonb;
  v_canonical_fast_path_markers jsonb;
  v_canonical_matched_spans jsonb;
  v_requested_fingerprint text;
begin
  select e.provider, e.provider_message_id
    into v_event_provider, v_event_source_message_id
  from public.channel_events e
  where e.tenant_id = p_tenant_id
    and e.id = p_channel_event_id;

  if not found then
    raise exception 'channel event does not belong to ingress tenant'
      using errcode = '23503';
  end if;

  if v_event_provider is distinct from p_provider
     or v_event_source_message_id is distinct from p_source_message_id then
    raise exception 'KIVO_SAFETY_SCAN_EVENT_IDENTITY_MISMATCH'
      using
        errcode = 'KIV03',
        detail = 'Safety completion provider/source message does not match the immutable channel event.';
  end if;

  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then
    raise exception 'safety evidence payload must be an array'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_matched_spans, '[]'::jsonb)) <> 'array' then
    raise exception 'safety matched spans payload must be an array'
      using errcode = '22023';
  end if;

  v_evidence_count := jsonb_array_length(coalesce(p_evidence, '[]'::jsonb));
  if p_scan_outcome not in ('completed_signal', 'completed_no_signal') then
    raise exception 'invalid terminal safety scan outcome'
      using errcode = '23514';
  end if;

  if p_scan_outcome = 'completed_signal'
     and (p_safety_candidate is distinct from true or v_evidence_count = 0) then
    raise exception 'completed_signal requires safety_candidate = true and evidence_count > 0'
      using errcode = '23514';
  end if;

  if p_scan_outcome = 'completed_no_signal'
     and (p_safety_candidate is distinct from false or v_evidence_count <> 0) then
    raise exception 'completed_no_signal requires safety_candidate = false and evidence_count = 0'
      using errcode = '23514';
  end if;

  select coalesce(
    jsonb_agg(c.canonical_item order by c.canonical_item::text),
    '[]'::jsonb
  )
    into v_canonical_evidence
  from (
    select jsonb_build_object(
      'evidence_class', item->>'evidence_class',
      'disclosure_class', item->>'disclosure_class',
      'matched_excerpt', item->>'matched_excerpt',
      'start_offset', (item->>'start_offset')::integer,
      'end_offset', (item->>'end_offset')::integer,
      'excerpt_hash', item->>'excerpt_hash',
      'customer_authored', (item->>'customer_authored')::boolean,
      'audio_message_reference', nullif(item->>'audio_message_reference', ''),
      'transcription_provider', nullif(item->>'transcription_provider', ''),
      'transcription_model', nullif(item->>'transcription_model', '')
    ) as canonical_item
    from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) item
  ) c;

  select coalesce(
    jsonb_agg(to_jsonb(marker) order by marker),
    '[]'::jsonb
  )
    into v_canonical_fast_path_markers
  from unnest(coalesce(p_fast_path_markers, '{}'::text[])) marker;

  select coalesce(
    jsonb_agg(item order by item::text),
    '[]'::jsonb
  )
    into v_canonical_matched_spans
  from jsonb_array_elements(coalesce(p_matched_spans, '[]'::jsonb)) item;

  v_requested_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'channel_event_id', p_channel_event_id,
        'provider', p_provider,
        'source_message_id', p_source_message_id,
        'raw_text_hash', p_raw_text_hash,
        'triage_class', p_triage_class,
        'safety_candidate', p_safety_candidate,
        'explicit_stop', p_explicit_stop,
        'human_takeover_requested', p_human_takeover_requested,
        'fast_path_markers', v_canonical_fast_path_markers,
        'matched_spans', v_canonical_matched_spans,
        'scanner_version', p_scanner_version,
        'scan_outcome', p_scan_outcome,
        'evidence', v_canonical_evidence
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.ingress_safety_scans (
    tenant_id,
    channel_event_id,
    provider,
    source_message_id,
    raw_text_hash,
    triage_class,
    safety_candidate,
    explicit_stop,
    human_takeover_requested,
    fast_path_markers,
    matched_spans,
    scanner_version,
    scanned_at,
    scan_outcome,
    error_category,
    result_fingerprint
  )
  values (
    p_tenant_id,
    p_channel_event_id,
    p_provider,
    p_source_message_id,
    p_raw_text_hash,
    p_triage_class,
    p_safety_candidate,
    p_explicit_stop,
    p_human_takeover_requested,
    coalesce(p_fast_path_markers, '{}'::text[]),
    coalesce(p_matched_spans, '[]'::jsonb),
    p_scanner_version,
    p_scanned_at,
    'pending',
    null,
    null
  )
  on conflict (tenant_id, channel_event_id) do nothing;

  select s.id, s.scan_outcome, s.result_fingerprint
    into v_scan_id, v_current_outcome, v_current_fingerprint
  from public.ingress_safety_scans s
  where s.tenant_id = p_tenant_id
    and s.channel_event_id = p_channel_event_id
  for update;

  if v_scan_id is null then
    raise exception 'failed to resolve ingress safety scan parent';
  end if;

  if v_current_outcome in ('completed_signal', 'completed_no_signal') then
    if v_current_fingerprint is distinct from v_requested_fingerprint then
      raise exception 'KIVO_SAFETY_SCAN_RESULT_CONFLICT: completed scan fingerprint mismatch; critical alert required'
        using
          errcode = 'KIV01',
          detail = 'An idempotent retry may reuse a completed scan only when its canonical result fingerprint matches.';
    end if;

    select count(*)::integer
      into v_evidence_count
    from public.ingress_safety_evidence e
    where e.tenant_id = p_tenant_id
      and e.scan_id = v_scan_id;
    return query select v_scan_id, v_current_outcome, v_evidence_count, true;
    return;
  end if;

  if v_current_outcome = 'failed' then
    perform set_config('kivo.ingress_safety_retry_scan_id', v_scan_id::text, true);
  elsif v_current_outcome <> 'pending' then
    raise exception 'invalid resumable ingress safety scan outcome: %', v_current_outcome
      using errcode = '23514';
  end if;

  insert into public.ingress_safety_evidence (
    tenant_id,
    scan_id,
    evidence_class,
    disclosure_class,
    matched_excerpt,
    start_offset,
    end_offset,
    excerpt_hash,
    customer_authored,
    audio_message_reference,
    transcription_provider,
    transcription_model
  )
  select
    p_tenant_id,
    v_scan_id,
    item->>'evidence_class',
    item->>'disclosure_class',
    item->>'matched_excerpt',
    (item->>'start_offset')::integer,
    (item->>'end_offset')::integer,
    item->>'excerpt_hash',
    (item->>'customer_authored')::boolean,
    nullif(item->>'audio_message_reference', ''),
    nullif(item->>'transcription_provider', ''),
    nullif(item->>'transcription_model', '')
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) item;

  update public.ingress_safety_scans s
  set
    provider = p_provider,
    source_message_id = p_source_message_id,
    raw_text_hash = p_raw_text_hash,
    triage_class = p_triage_class,
    safety_candidate = p_safety_candidate,
    explicit_stop = p_explicit_stop,
    human_takeover_requested = p_human_takeover_requested,
    fast_path_markers = coalesce(p_fast_path_markers, '{}'::text[]),
    matched_spans = coalesce(p_matched_spans, '[]'::jsonb),
    scanner_version = p_scanner_version,
    scanned_at = p_scanned_at,
    scan_outcome = p_scan_outcome,
    error_category = null,
    result_fingerprint = v_requested_fingerprint
  where s.tenant_id = p_tenant_id
    and s.id = v_scan_id;

  return query select v_scan_id, p_scan_outcome, v_evidence_count, false;
end;
$$;

-- A failed scan records only an enum-like error category. It never writes
-- invented customer text and a later retry may move it to a completed outcome.
create or replace function public.brain_fail_ingress_safety_scan(
  p_tenant_id uuid,
  p_channel_event_id uuid,
  p_provider text,
  p_source_message_id text,
  p_raw_text_hash text,
  p_scanner_version text,
  p_error_category text,
  p_scanned_at timestamptz
)
returns table (id uuid, scan_outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan_id uuid;
  v_current_outcome text;
  v_event_provider text;
  v_event_source_message_id text;
begin
  select e.provider, e.provider_message_id
    into v_event_provider, v_event_source_message_id
  from public.channel_events e
  where e.tenant_id = p_tenant_id
    and e.id = p_channel_event_id;

  if not found then
    raise exception 'channel event does not belong to ingress tenant'
      using errcode = '23503';
  end if;

  if v_event_provider is distinct from p_provider
     or v_event_source_message_id is distinct from p_source_message_id then
    raise exception 'KIVO_SAFETY_SCAN_EVENT_IDENTITY_MISMATCH'
      using
        errcode = 'KIV03',
        detail = 'Safety failure provider/source message does not match the immutable channel event.';
  end if;

  if p_error_category not in (
    'scanner_failed',
    'evidence_validation_failed',
    'evidence_persist_failed',
    'database_unavailable'
  ) then
    raise exception 'invalid ingress safety error category'
      using errcode = '23514';
  end if;

  insert into public.ingress_safety_scans (
    tenant_id,
    channel_event_id,
    provider,
    source_message_id,
    raw_text_hash,
    triage_class,
    safety_candidate,
    explicit_stop,
    human_takeover_requested,
    fast_path_markers,
    matched_spans,
    scanner_version,
    scanned_at,
    scan_outcome,
    error_category
  )
  values (
    p_tenant_id,
    p_channel_event_id,
    p_provider,
    p_source_message_id,
    p_raw_text_hash,
    null,
    false,
    false,
    false,
    '{}'::text[],
    '[]'::jsonb,
    p_scanner_version,
    p_scanned_at,
    'failed',
    p_error_category
  )
  on conflict (tenant_id, channel_event_id) do nothing;

  select s.id, s.scan_outcome
    into v_scan_id, v_current_outcome
  from public.ingress_safety_scans s
  where s.tenant_id = p_tenant_id
    and s.channel_event_id = p_channel_event_id
  for update;

  if v_scan_id is null then
    raise exception 'failed to resolve ingress safety scan failure parent';
  end if;

  if v_current_outcome = 'pending' then
    update public.ingress_safety_scans s
    set scan_outcome = 'failed',
        error_category = p_error_category,
        result_fingerprint = null,
        scanned_at = p_scanned_at
    where s.tenant_id = p_tenant_id
      and s.id = v_scan_id;
    v_current_outcome := 'failed';
  end if;

  return query select v_scan_id, v_current_outcome;
end;
$$;

-- RLS remains forced with no authenticated read policy. Direct writes are
-- removed from every API role; all E0 writes must pass through the RPCs.
alter table public.ingress_safety_evidence enable row level security;
alter table public.ingress_safety_evidence force row level security;

revoke all on table public.ingress_safety_evidence
  from public, anon, authenticated, service_role;
grant select on table public.ingress_safety_evidence to service_role;

drop policy if exists ingress_safety_evidence_member_read on public.ingress_safety_evidence;

revoke insert, update, delete, truncate, references, trigger
  on table public.webhook_envelopes,
           public.channel_events,
           public.ingress_safety_scans,
           public.ingress_safety_evidence
  from public, anon, authenticated, service_role;

revoke all on function public.enforce_ingress_safety_scan_transition() from public, anon, authenticated, service_role;
revoke all on function public.reject_ingress_safety_evidence_mutation() from public, anon, authenticated, service_role;
revoke all on function public.guard_ingress_safety_evidence_insert() from public, anon, authenticated, service_role;

revoke all on function public.brain_record_webhook_envelope(
  uuid, text, text, text, timestamptz, text, boolean, text, jsonb, text
) from public, anon, authenticated, service_role;
revoke all on function public.brain_record_channel_event(
  uuid, uuid, text, text, text, text, integer, uuid, text, timestamptz,
  text, text, text, integer, text, jsonb, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.brain_complete_ingress_safety_scan(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text[],
  jsonb, text, timestamptz, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.brain_fail_ingress_safety_scan(
  uuid, uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.brain_record_webhook_envelope(
  uuid, text, text, text, timestamptz, text, boolean, text, jsonb, text
) to service_role;
grant execute on function public.brain_record_channel_event(
  uuid, uuid, text, text, text, text, integer, uuid, text, timestamptz,
  text, text, text, integer, text, jsonb, jsonb, timestamptz
) to service_role;
grant execute on function public.brain_complete_ingress_safety_scan(
  uuid, uuid, text, text, text, text, boolean, boolean, boolean, text[],
  jsonb, text, timestamptz, text, jsonb
) to service_role;
grant execute on function public.brain_fail_ingress_safety_scan(
  uuid, uuid, text, text, text, text, text, timestamptz
) to service_role;

notify pgrst, 'reload schema';
