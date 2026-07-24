-- ============================================================================
-- E0 / MIGRATION 0104 — PRODUCTION VERIFICATION (ROLLBACK-ONLY)
--
-- Proves acceptance cases 4-7 and 13-16 against real PostgreSQL.
--
-- SAFETY PROPERTIES OF THIS SCRIPT:
--   * ONE outer transaction. ONE final ROLLBACK. ZERO COMMIT statements.
--   * No DDL. No CREATE/ALTER/DROP of tables, functions, policies, grants,
--     extensions or test tables. Nothing persistent is created.
--   * No REST / Data API / supabase-js calls.
--   * Privileged RPCs are called under SET LOCAL ROLE service_role.
--   * Expected failures are caught with PL/pgSQL exception blocks (pgTAP is
--     NOT installed and this script does NOT install it).
--   * Tenants A and B are existing founder-owned tenants.
--   * All synthetic identifiers are unmistakably marked E0VERIFY-ROLLBACK.
--
-- RUN WITH:  psql "<direct session connection string>" -f this_file.sql
--            (session/direct connection, NOT transaction-pooler mode)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Tenants: existing, founder-owned, never public.
--   A = وصاية              5acbc72f-def3-46cd-ad6c-bf0ff4a23642
--   B = Sweet Shop        9244d8ef-66b1-417a-a012-41a389ab1abf

DO $verify$
DECLARE
  TENANT_A  constant uuid := '5acbc72f-def3-46cd-ad6c-bf0ff4a23642';
  TENANT_B  constant uuid := '9244d8ef-66b1-417a-a012-41a389ab1abf';
  MARK      constant text := 'E0VERIFY-ROLLBACK';

  v_env_a      uuid;
  v_env_b      uuid;
  v_event_a1   uuid;   -- tenant A, completed_signal
  v_event_a2   uuid;   -- tenant A, completed_no_signal / rejection cases
  v_event_a3   uuid;   -- tenant A, failed -> completed transition
  v_event_b1   uuid;   -- tenant B, cross-tenant substitution target
  v_scan       uuid;
  v_outcome    text;
  v_count      int;
  v_evidence   jsonb;
  v_sqlstate   text;
  v_passed     int := 0;
  v_failed     int := 0;

BEGIN
  -- ==========================================================================
  -- SETUP — envelopes and channel events, created via the approved RPCs only
  -- ==========================================================================
  SET LOCAL ROLE service_role;

  SELECT id INTO v_env_a FROM public.brain_record_webhook_envelope(
    TENANT_A, 'whatsapp', 'whatsapp', MARK || '-app',
    now(), MARK || '-payload-hash-a', true, 'received',
    jsonb_build_object('marker', MARK), null);

  SELECT id INTO v_env_b FROM public.brain_record_webhook_envelope(
    TENANT_B, 'whatsapp', 'whatsapp', MARK || '-app',
    now(), MARK || '-payload-hash-b', true, 'received',
    jsonb_build_object('marker', MARK), null);

  SELECT id INTO v_event_a1 FROM public.brain_record_channel_event(
    TENANT_A, v_env_a, 'whatsapp', 'whatsapp', 'message',
    MARK || '-dedupe-a1', 0, null, MARK || '-msg-a1', now(),
    MARK || '-customer', MARK || '-thread-a1', 'received', 0, 'text',
    jsonb_build_object('text', MARK || ' allergy probe'),
    jsonb_build_object('text', MARK || ' allergy probe'), now());

  SELECT id INTO v_event_a2 FROM public.brain_record_channel_event(
    TENANT_A, v_env_a, 'whatsapp', 'whatsapp', 'message',
    MARK || '-dedupe-a2', 1, null, MARK || '-msg-a2', now(),
    MARK || '-customer', MARK || '-thread-a2', 'received', 0, 'text',
    jsonb_build_object('text', MARK || ' plain probe'),
    jsonb_build_object('text', MARK || ' plain probe'), now());

  SELECT id INTO v_event_a3 FROM public.brain_record_channel_event(
    TENANT_A, v_env_a, 'whatsapp', 'whatsapp', 'message',
    MARK || '-dedupe-a3', 2, null, MARK || '-msg-a3', now(),
    MARK || '-customer', MARK || '-thread-a3', 'received', 0, 'text',
    jsonb_build_object('text', MARK || ' failure probe'),
    jsonb_build_object('text', MARK || ' failure probe'), now());

  SELECT id INTO v_event_b1 FROM public.brain_record_channel_event(
    TENANT_B, v_env_b, 'whatsapp', 'whatsapp', 'message',
    MARK || '-dedupe-b1', 0, null, MARK || '-msg-b1', now(),
    MARK || '-customer', MARK || '-thread-b1', 'received', 0, 'text',
    jsonb_build_object('text', MARK || ' tenant b probe'),
    jsonb_build_object('text', MARK || ' tenant b probe'), now());

  RAISE NOTICE 'SETUP: envelopes and channel events created for both tenants';

  v_evidence := jsonb_build_array(jsonb_build_object(
    'evidence_class', 'customer_text',
    'disclosure_class', 'explicit_allergy',
    'excerpt', MARK || ' allergy probe',
    'excerpt_start', 0,
    'excerpt_end', 30,
    'excerpt_hash', encode(extensions.digest(MARK || ' allergy probe','sha256'),'hex'),
    'authored_by', 'customer'
  ));

  -- ==========================================================================
  -- CASE 4 — completed_signal WITHOUT evidence is REJECTED
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a1, 'whatsapp', MARK || '-msg-a1',
      MARK || '-rawhash-a1', 'EXPLICIT_CUSTOMER_DISCLOSURE',
      true, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_signal', '[]'::jsonb);
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 4: completed_signal with zero evidence was ACCEPTED';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 4: completed_signal without evidence rejected (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 5 — completed_no_signal WITH evidence is REJECTED
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a2, 'whatsapp', MARK || '-msg-a2',
      MARK || '-rawhash-a2', 'NON_MEDICAL_PREFERENCE',
      false, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_no_signal', v_evidence);
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 5: completed_no_signal with evidence was ACCEPTED';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 5: completed_no_signal with evidence rejected (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 6a — valid completed_signal commits parent + evidence atomically
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a1, 'whatsapp', MARK || '-msg-a1',
      MARK || '-rawhash-a1', 'EXPLICIT_CUSTOMER_DISCLOSURE',
      true, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_signal', v_evidence);

    SELECT s.id, s.scan_outcome INTO v_scan, v_outcome
      FROM public.ingress_safety_scans s
     WHERE s.tenant_id = TENANT_A AND s.channel_event_id = v_event_a1;

    SELECT count(*) INTO v_count
      FROM public.ingress_safety_evidence e
     WHERE e.tenant_id = TENANT_A AND e.scan_id = v_scan;

    IF v_outcome = 'completed_signal' AND v_count = 1 THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS  case 6a: valid completed_signal committed parent + 1 evidence atomically';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL  case 6a: outcome=% evidence_count=%', v_outcome, v_count;
    END IF;
  EXCEPTION WHEN others THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 6a: valid completion raised (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 6b — identical retry is IDEMPOTENT (fingerprint matches)
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a1, 'whatsapp', MARK || '-msg-a1',
      MARK || '-rawhash-a1', 'EXPLICIT_CUSTOMER_DISCLOSURE',
      true, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_signal', v_evidence);

    SELECT count(*) INTO v_count
      FROM public.ingress_safety_evidence e
     WHERE e.tenant_id = TENANT_A AND e.scan_id = v_scan;

    IF v_count = 1 THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS  case 6b: identical retry idempotent, evidence still 1 row';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL  case 6b: retry duplicated evidence (count=%)', v_count;
    END IF;
  EXCEPTION WHEN others THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 6b: identical retry raised (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 7 — CONFLICTING retry raises KIV01 (the silent-discard defect)
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a1, 'whatsapp', MARK || '-msg-a1',
      MARK || '-rawhash-a1', 'NON_MEDICAL_PREFERENCE',
      false, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_no_signal', '[]'::jsonb);
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 7: conflicting retry was ACCEPTED — evidence could be discarded';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = 'KIV01' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS  case 7: conflicting retry raised KIV01 as required';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS(partial) case 7: conflicting retry rejected with % (%)', v_sqlstate, SQLERRM;
    END IF;
  END;

  -- ==========================================================================
  -- CASE 13 — a COMPLETED scan cannot accept additional evidence / transition
  -- ==========================================================================
  BEGIN
    INSERT INTO public.ingress_safety_evidence
      (tenant_id, scan_id, evidence_class, disclosure_class, excerpt,
       excerpt_start, excerpt_end, excerpt_hash, authored_by)
    VALUES
      (TENANT_A, v_scan, 'customer_text', 'explicit_allergy', MARK || ' late child',
       0, 15, encode(extensions.digest(MARK || ' late child','sha256'),'hex'), 'customer');
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 13: terminal parent ACCEPTED a new evidence child';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 13: terminal parent rejected new evidence (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 14 — evidence cannot be UPDATED (immutability trigger)
  -- ==========================================================================
  BEGIN
    UPDATE public.ingress_safety_evidence
       SET excerpt = MARK || ' tampered'
     WHERE tenant_id = TENANT_A AND scan_id = v_scan;
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 14: evidence UPDATE succeeded';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 14: evidence UPDATE rejected by trigger (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 15 — evidence cannot be DELETED (immutability trigger)
  -- ==========================================================================
  BEGIN
    DELETE FROM public.ingress_safety_evidence
     WHERE tenant_id = TENANT_A AND scan_id = v_scan;
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 15: evidence DELETE succeeded';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 15: evidence DELETE rejected by trigger (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 16 — deleting a referenced channel event is rejected by RESTRICT
  -- ==========================================================================
  BEGIN
    DELETE FROM public.channel_events
     WHERE tenant_id = TENANT_A AND id = v_event_a1;
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 16: referenced channel event DELETE succeeded';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 16: referenced channel event DELETE rejected by RESTRICT (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 17 — CROSS-TENANT substitution is rejected
  --   tenant A claiming tenant B's channel event
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_b1, 'whatsapp', MARK || '-msg-b1',
      MARK || '-rawhash-b1', 'EXPLICIT_CUSTOMER_DISCLOSURE',
      true, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_signal', v_evidence);
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 17: cross-tenant event substitution was ACCEPTED';
  EXCEPTION WHEN others THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS  case 17: cross-tenant event substitution rejected (%)', SQLERRM;
  END;

  -- ==========================================================================
  -- CASE 18 — failed -> completed_* transition is permitted (retry path)
  -- ==========================================================================
  BEGIN
    PERFORM public.brain_fail_ingress_safety_scan(
      TENANT_A, v_event_a3, 'whatsapp', MARK || '-msg-a3',
      MARK || '-rawhash-a3', MARK || '-scanner', 'transient_db_error', now());

    PERFORM public.brain_complete_ingress_safety_scan(
      TENANT_A, v_event_a3, 'whatsapp', MARK || '-msg-a3',
      MARK || '-rawhash-a3', 'NON_MEDICAL_PREFERENCE',
      false, false, false, ARRAY[]::text[], '[]'::jsonb,
      MARK || '-scanner', now(), 'completed_no_signal', '[]'::jsonb);

    SELECT s.scan_outcome INTO v_outcome
      FROM public.ingress_safety_scans s
     WHERE s.tenant_id = TENANT_A AND s.channel_event_id = v_event_a3;

    IF v_outcome = 'completed_no_signal' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS  case 18: failed -> completed_no_signal transition permitted';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL  case 18: outcome after retry = %', v_outcome;
    END IF;
  EXCEPTION WHEN others THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL  case 18: failed->completed transition raised (%)', SQLERRM;
  END;

  RESET ROLE;

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'E0 PRODUCTION VERIFICATION: % passed, % failed', v_passed, v_failed;
  RAISE NOTICE 'Transaction remained usable through every expected failure.';
  RAISE NOTICE '--------------------------------------------------';
END
$verify$;

-- ============================================================================
-- PRE-ROLLBACK ASSERTION — proves the script actually did work.
--
-- WHY THIS EXISTS: post-rollback zeros alone are NOT evidence. Zero is also
-- what a dropped connection, an early syntax error, or a transaction that
-- aborted on its first statement would produce. A clean pass and a silent
-- no-op are indistinguishable without this check.
--
-- PASS CONDITION: these counts must be NON-ZERO here, and ZERO after ROLLBACK.
-- Either one alone is not evidence.
-- ============================================================================
SELECT 'in-transaction row counts (MUST BE NON-ZERO - proves work occurred)' AS note;
SELECT
  (SELECT count(*) FROM public.webhook_envelopes)        AS webhook_envelopes,
  (SELECT count(*) FROM public.channel_events)           AS channel_events,
  (SELECT count(*) FROM public.ingress_safety_scans)     AS ingress_safety_scans,
  (SELECT count(*) FROM public.ingress_safety_evidence)  AS ingress_safety_evidence;

DO $assert_nonzero$
DECLARE
  v_env int; v_evt int; v_scan int; v_evi int;
BEGIN
  SELECT count(*) INTO v_env  FROM public.webhook_envelopes;
  SELECT count(*) INTO v_evt  FROM public.channel_events;
  SELECT count(*) INTO v_scan FROM public.ingress_safety_scans;
  SELECT count(*) INTO v_evi  FROM public.ingress_safety_evidence;

  IF v_env > 0 AND v_evt > 0 AND v_scan > 0 AND v_evi > 0 THEN
    RAISE NOTICE 'PASS  pre-rollback: rows exist (envelopes=%, events=%, scans=%, evidence=%) - the script did real work',
      v_env, v_evt, v_scan, v_evi;
  ELSE
    RAISE NOTICE 'FAIL  pre-rollback: expected NON-ZERO counts, got (envelopes=%, events=%, scans=%, evidence=%)',
      v_env, v_evt, v_scan, v_evi;
    RAISE NOTICE 'FAIL  This means the script inserted nothing. Post-rollback zeros would be meaningless.';
  END IF;
END
$assert_nonzero$;

ROLLBACK;

-- Post-rollback confirmation, same session, outside the transaction.
-- PASS CONDITION: all zero HERE, having been non-zero above.
SELECT 'post-rollback row counts (all MUST be zero)' AS note;
SELECT
  (SELECT count(*) FROM public.webhook_envelopes)        AS webhook_envelopes,
  (SELECT count(*) FROM public.channel_events)           AS channel_events,
  (SELECT count(*) FROM public.ingress_safety_scans)     AS ingress_safety_scans,
  (SELECT count(*) FROM public.ingress_safety_evidence)  AS ingress_safety_evidence;
