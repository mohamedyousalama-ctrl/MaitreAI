-- ============================================================================
-- MaitreAI — 0109: KIV-174 — MEMBER-ACTOR RUNTIME REPAIR — ADDITIVE, FUNCTION-ONLY
--
-- Governed by KIV-174 under the KIV-173 terminal finding RUNTIME REPAIR REQUIRED.
--
-- WHY THIS FILE EXISTS
--   Exact committed 0108 (merge/source d5b4b1dd0925964ae44d55e125893081afddc651,
--   path supabase/migrations/0108_kiv13_m1_additive_scope1.sql,
--   blob 7b500626331dd4eaf4620d29c95953740f6e5541,
--   SHA-256 00cd7b7fe2ee581df7b9d038301123db45a80962fe8a6ad3c0435e2893dea9ee)
--   transferred every governed control function to kivo_control_owner, but its
--   line 175 could not grant that role USAGE on the request-subject schema: the
--   governed non-superuser executor holds no grant authority there, so the
--   statement emitted only "no privileges were granted" and granted nothing.
--
--   public.kv_control_assert_actor(uuid,text,boolean) is SECURITY DEFINER, so its
--   member branch executes as kivo_control_owner. That branch resolved the request
--   subject through a function in that unreachable schema. Every authenticated
--   member entry point therefore failed closed with SQLSTATE 42501
--   "permission denied for schema auth". Service-role system paths were unaffected.
--
-- WHAT THIS FILE DOES
--   It replaces exactly one function body — the member branch's request-subject
--   resolution — with the schema-independent expression that resolves the SAME
--   request subject from the SAME two request GUCs the previous resolver itself
--   read. No new identity source is introduced and no actor authority is widened.
--   Nothing else in 0108 is touched: 0108's bytes are not edited, no ownership is
--   changed, no RLS/policy/table/MIV/A1/order/safety state is changed, and no other
--   control function is redefined.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   It does NOT take the elevated route of granting kivo_control_owner USAGE on the
--   request-subject schema. KIV-174 excludes that route for this candidate.
--
-- ============================================================================
-- MANDATORY EXECUTION PRECONDITION — WHOLE-FILE TRANSACTION WRAPPER
-- ============================================================================
-- THIS FILE MUST BE APPLIED AS ONE TRANSACTION AND MUST NEVER BE APPLIED
-- STATEMENT BY STATEMENT.
--
-- Use `psql --single-transaction -v ON_ERROR_STOP=1 -f <this file>`, or a runner
-- independently proved to wrap the entire file in a single transaction.
--
-- Like 0108, this file carries NO top-level BEGIN/COMMIT of its own so that it
-- composes with a runner that supplies the transaction. Consequently:
--   * section 2 may grant the executor a strictly minimal, temporary INHERIT-only
--     membership in kivo_control_owner; section 4 removes it. Under autocommit a
--     failure between them would leave that membership behind.
--   * section 4's verification raises on incomplete restoration. That raise only
--     undoes this migration if the whole file is inside one transaction.
--
-- APPLICATION: this repository has no migration runner. Merging this file does not
-- execute it. Applying it to any database is a separate, separately approved event
-- under the governed migration ceremony. This file writes no migration-ledger row;
-- if a ledger row is required, the governed runner records it.
--
-- EXECUTOR AUTHORITY (proved on PostgreSQL 17.11, not assumed)
--   After 0108 the governed executor's ONLY surviving membership in
--   kivo_control_owner is the record PostgreSQL creates automatically during
--   CREATE ROLE: grantor = bootstrap superuser, ADMIN TRUE, SET FALSE, INHERIT
--   FALSE. That record is NOT sufficient to replace a function the role owns:
--     * CREATE OR REPLACE FUNCTION under it fails 42501 "must be owner of function"
--     * SET ROLE kivo_control_owner under it fails 42501 "permission denied to set role"
--   ADMIN OPTION is, however, sufficient to grant the executor a temporary INHERIT.
--   INHERIT-only is the minimum that works and is strictly less capability than
--   0108 section 1B took: SET ROLE remains denied for the whole window, and no
--   CREATE on any schema is granted to kivo_control_owner at any point. The
--   SET ROLE route is additionally unusable here because 0108 section 16 revoked
--   kivo_control_owner's CREATE on schema public, so acting AS that role fails
--   42501 "permission denied for schema public".
-- ============================================================================


-- ===========================================================================
-- 1. EXACT PRECONDITIONS — REFUSE TO RUN AGAINST ANY STATE THAT IS NOT POST-0108
--    Every check below fails closed, so a divergent or already-repaired target
--    aborts the whole migration rather than being silently overwritten.
-- ===========================================================================
do $$
declare
  p        record;
  v_oid    oid;
  v_args   text;
  v_result text;
begin
  -- P1: the governed principal exists and still carries every governed safe attribute.
  perform 1 from pg_roles where rolname = 'kivo_control_owner';
  if not found then
    raise exception 'KIV174 precondition failed: role kivo_control_owner does not exist — 0108 has not been applied';
  end if;
  perform 1 from pg_roles
   where rolname = 'kivo_control_owner'
     and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreatedb
     and not rolcreaterole and not rolinherit and not rolreplication;
  if not found then
    raise exception 'KIV174 precondition failed: kivo_control_owner no longer carries the governed safe attribute set';
  end if;

  -- P2: the exact target function exists, at the exact 0108 signature. Resolved through
  --     regprocedure so the match is on the real argument-type list and cannot drift with
  --     server-version differences in how identity argument lists are rendered.
  begin
    v_oid := 'public.kv_control_assert_actor(uuid,text,boolean)'::pg_catalog.regprocedure;
  exception when undefined_function or invalid_text_representation or undefined_object then
    raise exception 'KIV174 precondition failed: public.kv_control_assert_actor(uuid,text,boolean) not found at the exact 0108 signature';
  end;
  select p2.oid, p2.proowner, p2.prosecdef, p2.proconfig, p2.prosrc, p2.proacl, p2.prorettype, p2.proretset
    into p
    from pg_proc p2
    join pg_namespace n on n.oid = p2.pronamespace
   where p2.oid = v_oid and n.nspname = 'public';
  if not found then
    raise exception 'KIV174 precondition failed: public.kv_control_assert_actor(uuid,text,boolean) is not in schema public';
  end if;

  -- P3: it is owned by the governed principal, as 0108 section 15 left it.
  if pg_catalog.pg_get_userbyid(p.proowner) <> 'kivo_control_owner' then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor is owned by %, expected kivo_control_owner',
      pg_catalog.pg_get_userbyid(p.proowner);
  end if;

  -- P4/P5: SECURITY DEFINER with the exact empty search_path 0108 set.
  if not p.prosecdef then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor is not SECURITY DEFINER';
  end if;
  if p.proconfig is distinct from array['search_path=""'] then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor proconfig is %, expected {"search_path=\"\""}',
      coalesce(p.proconfig::text, '<null>');
  end if;

  -- P6: the exact declared result shape 0108 defined (a SETOF record of four columns).
  if not p.proretset then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor no longer RETURNS TABLE';
  end if;
  select pg_catalog.pg_get_function_result(p.oid) into v_result;
  if v_result <> 'TABLE(member_id uuid, member_version integer, member_role text, actor_user_id uuid)' then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor result shape is "%", expected the exact 0108 shape', v_result;
  end if;
  select pg_catalog.pg_get_function_arguments(p.oid) into v_args;
  if v_args <> 'p_restaurant_id uuid, p_actor_kind text, p_require_manager boolean' then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor argument list is "%", expected the exact 0108 list', v_args;
  end if;

  -- P7: the body still carries the executable request-subject dependency this file repairs.
  --     This is what makes the target provably the un-repaired 0108 definition. It also
  --     makes a second application refuse rather than silently re-write a changed function.
  if pg_catalog.strpos(p.prosrc, 'auth.uid()') = 0 then
    raise exception 'KIV174 precondition failed: kv_control_assert_actor does not contain the 0108 request-subject dependency — target is not the un-repaired 0108 definition';
  end if;

  -- P8: capture the exact before-state this migration must preserve. Transaction-local
  --     settings only: they leave no residue at COMMIT or ROLLBACK, and no object is created.
  perform pg_catalog.set_config('kivo.kiv174_acl_before',   coalesce(p.proacl::text, '<null>'), true);
  perform pg_catalog.set_config('kivo.kiv174_owner_before', pg_catalog.pg_get_userbyid(p.proowner), true);
  perform pg_catalog.set_config('kivo.kiv174_cfg_before',   p.proconfig::text, true);
  perform pg_catalog.set_config('kivo.kiv174_res_before',   v_result, true);
  perform pg_catalog.set_config('kivo.kiv174_args_before',  v_args, true);
end $$;

-- Capture the exact membership topology of kivo_control_owner before any capability
-- is taken, so section 4 can prove byte-equal restoration rather than assert it.
do $$
declare v_before text;
begin
  select coalesce(pg_catalog.string_agg(row_desc, '|' order by row_desc), '<none>')
    into v_before
    from (
      select mm.rolname || '/' || g.rolname || '/admin=' || m.admin_option
             || '/set=' || m.set_option || '/inherit=' || m.inherit_option as row_desc
        from pg_auth_members m
        join pg_roles r  on r.oid  = m.roleid
        join pg_roles mm on mm.oid = m.member
        join pg_roles g  on g.oid  = m.grantor
       where r.rolname = 'kivo_control_owner'
    ) s;
  perform pg_catalog.set_config('kivo.kiv174_members_before', v_before, true);
end $$;


-- ===========================================================================
-- 2. MINIMAL TEMPORARY EXECUTOR CAPABILITY — INHERIT ONLY, NEVER SET ROLE
--    Taken only if the executor cannot already act with the owner's privileges.
--    A superuser or an already-inheriting executor takes nothing and section 4
--    then removes nothing, so this file leaves no residue on any executor class.
-- ===========================================================================
do $$
begin
  if pg_catalog.pg_has_role(current_user, 'kivo_control_owner', 'USAGE') then
    perform pg_catalog.set_config('kivo.kiv174_granted', 'no', true);
  else
    -- SET FALSE is explicit and load-bearing: GRANT defaults SET to TRUE, which would
    -- hand the executor SET ROLE capability this migration does not need and must not take.
    execute pg_catalog.format(
      'grant kivo_control_owner to %I with inherit true, set false', current_user);
    perform pg_catalog.set_config('kivo.kiv174_granted', 'yes', true);

    -- Fail closed if the grant did not actually confer the inherited privileges, or if it
    -- conferred SET ROLE despite SET FALSE.
    if not pg_catalog.pg_has_role(current_user, 'kivo_control_owner', 'USAGE') then
      raise exception 'KIV174 temporary capability did not take effect for executor %', current_user;
    end if;
    perform 1
       from pg_auth_members m
       join pg_roles r  on r.oid  = m.roleid
       join pg_roles mm on mm.oid = m.member
       join pg_roles g  on g.oid  = m.grantor
      where r.rolname = 'kivo_control_owner'
        and mm.rolname = current_user
        and g.rolname  = current_user
        and m.set_option;
    if found then
      raise exception 'KIV174 temporary capability wrongly conferred SET ROLE on kivo_control_owner';
    end if;
  end if;
end $$;


-- ===========================================================================
-- 3. THE REPAIR — ONE FUNCTION, ONE RESOLUTION EXPRESSION
--    Byte-identical to the exact 0108 definition except for the member branch's
--    request-subject resolution and its comment. Signature, language, SECURITY
--    DEFINER, empty search_path, RETURNS TABLE shape, the actor_kind guard, the
--    system branch, the member/manager checks, the MIV lookup and every
--    fail-closed raise are preserved exactly.
--
--    The replacement resolves the request subject from exactly the two request
--    GUCs the previous resolver itself consulted, in the same precedence, with
--    the same NULL and same invalid-value behaviour. It is schema-independent,
--    so it no longer depends on privileges kivo_control_owner does not hold.
--    Reading these GUCs is not a new identity source: they are the transport the
--    previous resolver already read, populated by the request layer and not by
--    the caller's SQL. No actor authority is broadened.
--
--    CREATE OR REPLACE preserves the function's ownership and permissions, so the
--    owner stays kivo_control_owner and the EXECUTE matrix 0108 established is
--    untouched. Section 5 proves both rather than trusting them.
-- ===========================================================================
create or replace function public.kv_control_assert_actor(
  p_restaurant_id uuid,
  p_actor_kind text,
  p_require_manager boolean)
returns table (member_id uuid, member_version integer, member_role text, actor_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_id   uuid;
  v_role text;
  v_ver  integer;
begin
  if p_actor_kind not in ('member','system') then
    raise exception 'KIV14 actor_kind must be member or system';
  end if;

  -- 'system': one row, all four values NULL, satisfying A0-13, A1-6 and A2-8 uniformly.
  if p_actor_kind = 'system' then
    member_id := null; member_version := null; member_role := null; actor_user_id := null;
    return next;
    return;
  end if;

  -- 'member': SA4 — the request subject must resolve, else fail closed. KIV-174: resolved
  -- directly from the request claims, in the same precedence and with the same NULL and
  -- invalid-value behaviour as before, so the governed resolver no longer depends on a
  -- schema kivo_control_owner cannot reach.
  v_uid := coalesce(
             nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
             pg_catalog.jsonb_extract_path_text(
               nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb,
               'sub')
           )::uuid;
  if v_uid is null then
    raise exception 'KIV12 member actor requires an authenticated subject';
  end if;
  select m.id, m.role into v_id, v_role
    from public.members m
   where m.user_id = v_uid and m.restaurant_id = p_restaurant_id;
  if v_id is null then
    raise exception 'KIV12 actor is not a member of the resolved tenant';
  end if;
  if p_require_manager and v_role <> 'manager' then
    raise exception 'KIV12 operation requires the manager role';
  end if;

  -- member_version is the version of that member's OPEN MIV row (unique by ux_miv_open_version).
  select v.version into v_ver
    from public.member_identity_versions v
   where v.member_id = v_id and v.valid_to is null;
  if v_ver is null then
    raise exception 'KIV12 actor has no open member identity version';
  end if;

  member_id := v_id; member_version := v_ver; member_role := v_role; actor_user_id := v_uid;
  return next;
end $$;


-- ===========================================================================
-- 4. CAPABILITY RETURN — REMOVES EXACTLY WHAT SECTION 2 TOOK, AND PROVES IT
--    Runs before this migration can succeed. The verification fails closed, so an
--    incomplete restoration aborts and rolls the entire migration back rather than
--    leaving a privileged remnant behind.
-- ===========================================================================
do $$
declare
  v_after  text;
  v_before text := pg_catalog.current_setting('kivo.kiv174_members_before', true);
begin
  if pg_catalog.current_setting('kivo.kiv174_granted', true) = 'yes' then
    execute pg_catalog.format('revoke kivo_control_owner from %I', current_user);
  end if;

  -- The executor must no longer inherit the owner's privileges.
  if pg_catalog.pg_has_role(current_user, 'kivo_control_owner', 'USAGE')
     and pg_catalog.current_setting('kivo.kiv174_granted', true) = 'yes' then
    raise exception 'KIV174 capability return incomplete: executor % still inherits kivo_control_owner', current_user;
  end if;

  -- No surviving membership anywhere may confer SET or INHERIT on the governed principal.
  perform 1
     from pg_auth_members m
     join pg_roles r on r.oid = m.roleid
    where r.rolname = 'kivo_control_owner'
      and (m.set_option or m.inherit_option);
  if found then
    raise exception 'KIV174 capability return incomplete: a membership on kivo_control_owner still carries SET or INHERIT';
  end if;

  -- The membership topology must be byte-equal to the state captured before section 2.
  select coalesce(pg_catalog.string_agg(row_desc, '|' order by row_desc), '<none>')
    into v_after
    from (
      select mm.rolname || '/' || g.rolname || '/admin=' || m.admin_option
             || '/set=' || m.set_option || '/inherit=' || m.inherit_option as row_desc
        from pg_auth_members m
        join pg_roles r  on r.oid  = m.roleid
        join pg_roles mm on mm.oid = m.member
        join pg_roles g  on g.oid  = m.grantor
       where r.rolname = 'kivo_control_owner'
    ) s;
  if v_before is null then
    raise exception 'KIV174 capability return cannot be verified: the before-state capture is missing';
  end if;
  if v_after is distinct from v_before then
    raise exception 'KIV174 capability return incomplete: kivo_control_owner membership is now [%], expected [%]',
      v_after, v_before;
  end if;

  -- This file grants no schema privilege to kivo_control_owner at any point; prove none appeared.
  if pg_catalog.has_schema_privilege('kivo_control_owner', 'public', 'CREATE') then
    raise exception 'KIV174 kivo_control_owner unexpectedly holds CREATE on schema public';
  end if;
end $$;


-- ===========================================================================
-- 5. POST-ASSERTIONS — THE REPAIR CHANGED THE BODY AND NOTHING ELSE
-- ===========================================================================
do $$
declare
  p     record;
  v_oid oid;
begin
  begin
    v_oid := 'public.kv_control_assert_actor(uuid,text,boolean)'::pg_catalog.regprocedure;
  exception when undefined_function or invalid_text_representation or undefined_object then
    raise exception 'KIV174 post-assertion failed: kv_control_assert_actor is missing at the exact signature';
  end;
  select p2.oid, p2.proowner, p2.prosecdef, p2.proconfig, p2.prosrc, p2.proacl
    into p
    from pg_proc p2
    join pg_namespace n on n.oid = p2.pronamespace
   where p2.oid = v_oid and n.nspname = 'public';
  if not found then
    raise exception 'KIV174 post-assertion failed: kv_control_assert_actor is missing at the exact signature';
  end if;

  -- The executable request-subject dependency this file exists to remove is gone.
  if pg_catalog.strpos(p.prosrc, 'auth.') <> 0 then
    raise exception 'KIV174 post-assertion failed: the repaired resolver still references the unreachable schema';
  end if;

  -- Owner, SECURITY DEFINER, empty search_path, signature and result shape are unchanged.
  if pg_catalog.pg_get_userbyid(p.proowner) <> pg_catalog.current_setting('kivo.kiv174_owner_before', true) then
    raise exception 'KIV174 post-assertion failed: function owner changed to %', pg_catalog.pg_get_userbyid(p.proowner);
  end if;
  if not p.prosecdef then
    raise exception 'KIV174 post-assertion failed: function is no longer SECURITY DEFINER';
  end if;
  if p.proconfig::text is distinct from pg_catalog.current_setting('kivo.kiv174_cfg_before', true) then
    raise exception 'KIV174 post-assertion failed: search_path configuration changed';
  end if;
  if pg_catalog.pg_get_function_result(p.oid) <> pg_catalog.current_setting('kivo.kiv174_res_before', true) then
    raise exception 'KIV174 post-assertion failed: result shape changed';
  end if;
  if pg_catalog.pg_get_function_arguments(p.oid) <> pg_catalog.current_setting('kivo.kiv174_args_before', true) then
    raise exception 'KIV174 post-assertion failed: argument list changed';
  end if;

  -- The EXECUTE matrix 0108 established is byte-identical: CREATE OR REPLACE must not have
  -- disturbed the SA1 grant separation, and this file adds and removes no EXECUTE privilege.
  if coalesce(p.proacl::text, '<null>') is distinct from pg_catalog.current_setting('kivo.kiv174_acl_before', true) then
    raise exception 'KIV174 post-assertion failed: EXECUTE matrix changed from [%] to [%]',
      pg_catalog.current_setting('kivo.kiv174_acl_before', true), coalesce(p.proacl::text, '<null>');
  end if;

  -- The repair is function-only: no other governed function may have been redefined here.
  perform 1
     from pg_proc p2
     join pg_namespace n on n.oid = p2.pronamespace
    where n.nspname = 'public'
      and (p2.proname like 'kv_control_%' or p2.proname like 'kv_sys_control_%' or p2.proname like 'kv_tg_%')
      and pg_catalog.pg_get_userbyid(p2.proowner) <> 'kivo_control_owner';
  if found then
    raise exception 'KIV174 post-assertion failed: a governed function is no longer owned by kivo_control_owner';
  end if;
end $$;

-- Rollback (governed, manual — never run as part of a replay): re-apply the exact 0108
-- definition of public.kv_control_assert_actor(uuid,text,boolean) under the same
-- INHERIT-only temporary capability. That restores the pre-0109 state exactly, and with it
-- the 42501 member-path failure this file repairs. This file creates, drops and renames
-- nothing, so no other reversal step exists.
