#!/usr/bin/env python3
"""KIV-13 / CTRL-04 — M-1 ADDITIVE SCOPE-1: disposable-PostgreSQL proof.

Provisions a throwaway local PostgreSQL cluster, rebuilds the governed pre-M0 shape of the
relevant schema, applies 0107 (M-0) then 0108 (M-1) verbatim, proves the M-1 contract of
Revision 14 §15.4 as reconciled by the 13 August 2026 binding adjudication, then destroys
the cluster.

LOCAL DISPOSABLE POSTGRESQL ONLY. Never contacts production, reads no production credential,
and opens no network listener — the cluster is reachable only over a unix socket.

Usage:  sudo python3 scripts/proof-kiv13-m1-disposable-pg.py
Exit 0 = every assertion passed.
"""
import subprocess, hashlib, pathlib, sys, re, os, shutil

SELF = pathlib.Path(__file__).resolve()
ROOT = SELF.parent.parent
M0 = ROOT / "supabase/migrations/0107_kiv12_m0_constraint_prestage.sql"
M1 = ROOT / "supabase/migrations/0108_kiv13_m1_additive_scope1.sql"
M0_SHA = "3c40c6280b99d6f8a78c5081054b25d3438d47f205f2646c66796e4adefc74a6"

PGBIN = "/usr/lib/postgresql/16/bin"
PGDATA = "/var/lib/postgresql/kiv13_m1_proof"
PORT, DB, USER, SOCK = "55433", "kivo_m1", "kivoproof", "/tmp"
SCRATCH = pathlib.Path("/tmp/kiv13_m1_q.sql")

results = []


def sh(cmd):
    return subprocess.run(["su", "postgres", "-c", cmd], capture_output=True, text=True)


def git(args):
    p = subprocess.run(["git", "-C", str(ROOT)] + args, capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else "<unavailable>"


def q(sql, db=DB, role=None):
    """Run SQL as USER, optionally SET ROLE first. -> (ok, output|error)."""
    body = (f"set role {role};\n" if role else "") + sql
    SCRATCH.write_text(body, encoding="utf-8")
    SCRATCH.chmod(0o644)
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {USER} -d {db} -tAX -v ON_ERROR_STOP=1 -f {SCRATCH}')
    return (p.returncode == 0, (p.stdout if p.returncode == 0 else p.stderr).strip())


def qf(path, db=DB):
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {USER} -d {db} -X -v ON_ERROR_STOP=1 -f {path}')
    return (p.returncode == 0, (p.stdout + p.stderr).strip())


def check(label, expected, actual, ok=None):
    passed = (actual == expected) if ok is None else ok
    results.append((label, expected, actual, passed))
    print(f"  [{'PASS' if passed else 'FAIL'}] {label}\n         expected: {expected}\n         actual:   {actual}")
    return passed


def raises(label, sql, want_code, role=None):
    ok, out = q(sql, role=role)
    if ok:
        return check(label, f"raises {want_code}", "ACCEPTED (no error)", ok=False)
    first = out.splitlines()[0] if out.splitlines() else out
    got = want_code if want_code in out else first[:100]
    return check(label, f"raises {want_code}", f"raised {got}", ok=(want_code in out))


def accepts(label, sql, role=None):
    ok, out = q(sql, role=role)
    return check(label, "accepted", "accepted" if ok else f"REJECTED: {out.splitlines()[0][:100]}", ok=ok)


def destroy():
    sh(f'{PGBIN}/pg_ctl -D {PGDATA} stop -m fast')
    shutil.rmtree(PGDATA, ignore_errors=True)
    SCRATCH.unlink(missing_ok=True)


print("=" * 78)
print("KIV-13 / CTRL-04 — M-1 ADDITIVE SCOPE-1 — DISPOSABLE POSTGRESQL PROOF")
print("=" * 78)
m0b, m1b = M0.read_bytes(), M1.read_bytes()
print("--- PROVENANCE ---")
print(f"  repository            : {ROOT}")
print(f"  git branch            : {git(['rev-parse','--abbrev-ref','HEAD'])}")
print(f"  git HEAD              : {git(['rev-parse','HEAD'])}")
print(f"  git tree state        : {'clean' if git(['status','--porcelain'])=='' else 'DIRTY (uncommitted changes present)'}")
print(f"  proof script          : {SELF.relative_to(ROOT)}")
print(f"  proof script sha256   : {hashlib.sha256(SELF.read_bytes()).hexdigest()}")
print(f"  M-0 migration         : {M0.relative_to(ROOT)}")
print(f"  M-0 bytes / sha256    : {len(m0b)} / {hashlib.sha256(m0b).hexdigest()}")
print(f"  M-0 expected sha256   : {M0_SHA}  match={'YES' if hashlib.sha256(m0b).hexdigest()==M0_SHA else 'NO'}")
print(f"  M-1 migration         : {M1.relative_to(ROOT)}")
print(f"  M-1 bytes             : {len(m1b)}")
print(f"  M-1 sha256            : {hashlib.sha256(m1b).hexdigest()}")
print(f"  M-1 git blob          : {git(['hash-object', str(M1)])}")
print(f"  M-0 git blob          : {git(['hash-object', str(M0)])}")
print(f"  M-0 blob@HEAD         : {git(['rev-parse','HEAD:supabase/migrations/0107_kiv12_m0_constraint_prestage.sql'])}")
print("--- ENVIRONMENT ---")
print(f"  class                 : DISPOSABLE LOCAL — created by this script, destroyed at the end")
print(f"  PGDATA                : {PGDATA}")
print(f"  port / socket         : {PORT} / {SOCK}   (listen_addresses='' — no TCP listener)")
print(f"  database              : {DB}")
print(f"  production contact    : NONE — no production host, credential or network egress")
print(f"  scaffolding           : auth.uid()/auth.users and the Supabase roles anon,")
print(f"                          authenticated, service_role are DISPOSABLE TEST SCAFFOLDING")
print(f"                          standing in for Supabase-provided primitives. They are NOT")
print(f"                          production proof of PostgREST behaviour.")

print("\n--- PROVISION DISPOSABLE CLUSTER ---")
destroy()
os.makedirs(PGDATA, exist_ok=True)
shutil.chown(PGDATA, user="postgres")
os.chmod(PGDATA, 0o700)
p = sh(f'{PGBIN}/initdb -D {PGDATA} -U {USER} --auth=trust -E UTF8')
print(f"  initdb                : {'OK' if p.returncode==0 else 'FAILED'}")
if p.returncode:
    print(p.stderr[-600:]); sys.exit(1)
p = sh(f"{PGBIN}/pg_ctl -D {PGDATA} -o '-p {PORT} -k {SOCK} -c listen_addresses=' -l {PGDATA}/server.log start -w")
print(f"  pg_ctl start          : {'OK' if p.returncode==0 else 'FAILED'}")
if p.returncode:
    destroy(); sys.exit(1)
ok, ver = q("select version();", db="postgres")
print(f"  server version        : {ver}")

try:
    q(f"drop database if exists {DB};", db="postgres")
    q(f"create database {DB};", db="postgres")

    print("\n--- BASELINE: governed pre-M0 schema (0001/0002/0024/0028/0032/0099 shape) ---")
    BASE = r"""
create extension if not exists pgcrypto with schema public;
create schema if not exists extensions;
create schema if not exists auth;
create or replace function extensions.digest(bytea, text) returns bytea
  language sql immutable strict as $fn$ select public.digest($1,$2) $fn$;
-- DISPOSABLE TEST SCAFFOLDING for Supabase primitives -------------------------------
do $r$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $r$;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
-- ------------------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  feature_flags jsonb not null default '{}'::jsonb);
create table public.customers (id uuid primary key default gen_random_uuid());
create table public.members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('manager','operation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id));
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'AI نشط',
  owner text not null default 'ai',
  assigned_member_id uuid references public.members(id) on delete set null,
  escalation_reason text, handover_note text, allergy_note text, staff_notes text,
  last_intent text, confidence numeric(5,2), stage text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_safety_hold boolean not null default false,
  ownership_state text not null default 'AI_ACTIVE',
  control_epoch bigint not null default 0);
alter table public.conversations add constraint conversations_ownership_state_check
  check (ownership_state in ('AI_ACTIVE','HOLD_UNCLAIMED','HUMAN_ACTIVE','HUMAN_IDLE',
                             'AI_RESUME_PENDING','SYSTEM_HOLD','CLOSED'));
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  text text);
create table public.conversation_assignment_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_type text not null check (event_type in ('CLAIMED','RELEASED','REASSIGNED',
    'MANAGER_TAKEOVER','HANDED_TO_AI','ESCALATED','SYSTEM_HOLD','CLOSED')),
  actor_member_id uuid references public.members(id) on delete set null,
  from_mode text, to_mode text, epoch_before bigint, epoch_after bigint,
  reason text, created_at timestamptz not null default now());
create or replace function public.is_member_of(p_restaurant_id uuid) returns boolean
  language sql security definer stable set search_path = public as $fn$
  select exists (select 1 from public.members m
                  where m.restaurant_id = p_restaurant_id and m.user_id = auth.uid()) $fn$;
create or replace function public.bump_control_epoch() returns trigger language plpgsql as $fn$
begin
  if new.ownership_state is distinct from old.ownership_state
     or new.owner is distinct from old.owner
     or new.assigned_member_id is distinct from old.assigned_member_id then
    new.control_epoch := old.control_epoch + 1;
  end if; return new; end $fn$;
create trigger trg_bump_control_epoch before update on public.conversations
  for each row execute function public.bump_control_epoch();
create or replace function public.touch_conversations() returns trigger language plpgsql as $fn$
begin return new; end $fn$;
create trigger trg_touch_conversations before update on public.conversations
  for each row execute function public.touch_conversations();
create or replace function public.log_assignment_event() returns trigger language plpgsql as $fn$
begin return null; end $fn$;
create trigger trg_log_assignment_event after update on public.conversations
  for each row execute function public.log_assignment_event();
-- existing RLS posture (E3/E7): enabled, NOT forced
alter table public.conversations enable row level security;
create policy conversations_rw on public.conversations for all to public using (true) with check (true);
alter table public.conversation_assignment_events enable row level security;
create policy conversation_assignment_events_read on public.conversation_assignment_events
  for select to public using (public.is_member_of(restaurant_id));
alter table public.messages enable row level security;
create policy messages_rw on public.messages for all to public using (public.is_member_of(restaurant_id));
alter table public.members enable row level security;
create policy members_read on public.members for select to public using (true);
grant select, insert, update, delete, truncate, references, trigger
  on public.conversation_assignment_events to anon, authenticated, service_role;
grant select, insert, update on public.conversations to anon, authenticated, service_role;
grant select on public.members, public.restaurants, public.customers, public.messages
  to anon, authenticated, service_role;
"""
    ok, out = q(BASE)
    print("  baseline built" if ok else f"  BASELINE FAILED: {out[:600]}")
    if not ok:
        destroy(); sys.exit(1)

    R = "'11111111-1111-1111-1111-111111111111'"
    U1 = "'22222222-2222-2222-2222-222222222221'"   # manager
    U2 = "'22222222-2222-2222-2222-222222222222'"   # operation - acts as the assignee
    U3 = "'22222222-2222-2222-2222-222222222223'"   # operation - unrelated ordinary member
    U4 = "'22222222-2222-2222-2222-222222222224'"   # operation - MIV close-test subject
    M1ID = "'33333333-0000-0000-0000-000000000001'"  # manager member row
    M2ID = "'33333333-0000-0000-0000-000000000002'"  # assignee member row
    SEED = f"""
insert into public.restaurants (id, feature_flags) values ({R}, '{{"handoff_timeout": true}}'::jsonb);
insert into auth.users (id) values ({U1}), ({U2}), ({U3}), ({U4});
insert into public.members (id, restaurant_id, user_id, role) values
 ('33333333-0000-0000-0000-000000000001',{R},{U1},'manager'),
 ('33333333-0000-0000-0000-000000000002',{R},{U2},'operation'),
 ('33333333-0000-0000-0000-000000000003',{R},{U3},'operation'),
 ('33333333-0000-0000-0000-000000000004',{R},{U4},'operation');
insert into public.customers (id) values ('44444444-0000-0000-0000-000000000001');
insert into public.conversations (id, restaurant_id, customer_id, channel, ownership_state, owner)
 values ('55555555-0000-0000-0000-000000000001',{R},'44444444-0000-0000-0000-000000000001',
         'whatsapp','AI_ACTIVE','ai');
insert into public.conversation_assignment_events
 (id, conversation_id, restaurant_id, event_type, actor_member_id, from_mode, to_mode,
  epoch_before, epoch_after, reason)
 values ('66666666-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000001',{R},
         'CLAIMED', null, 'AI_ACTIVE','HUMAN_ACTIVE',0,1,'legacy row');
"""
    q(SEED)
    _, n_members = q("select count(*) from public.members;")
    A1_FP = ("select md5(string_agg(id::text||'|'||event_type||'|'||coalesce(actor_member_id::text,'~')"
             "||'|'||coalesce(from_mode,'~')||'|'||coalesce(to_mode,'~')||'|'||coalesce(epoch_before::text,'~')"
             "||'|'||coalesce(epoch_after::text,'~')||'|'||coalesce(reason,'~'), ',' order by id)) "
             "from public.conversation_assignment_events;")
    _, a1_before = q(A1_FP)
    PRIV_SNAP = ("select coalesce(string_agg(grantee||':'||table_name||':'||privilege_type, ',' "
                 "order by grantee, table_name, privilege_type), 'none') "
                 "from information_schema.role_table_grants "
                 "where table_schema='public' and grantee in ('anon','authenticated','service_role');")
    _, priv_before = q(PRIV_SNAP)
    OWNER_SNAP = ("select coalesce(string_agg(c.relname||':'||pg_get_userbyid(c.relowner), ',' order by c.relname),'none') "
                  "from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                  "where n.nspname='public' and c.relkind='r';")
    _, owner_before = q(OWNER_SNAP)
    RLS_SNAP = ("select coalesce(string_agg(c.relname||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text, ',' order by c.relname),'none') "
                "from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                "where n.nspname='public' and c.relkind='r';")
    _, rls_before = q(RLS_SNAP)
    TRG_SNAP = ("select coalesce(string_agg(c.relname||'.'||t.tgname, ',' order by c.relname, t.tgname),'none') "
                "from pg_trigger t join pg_class c on c.oid=t.tgrelid "
                "join pg_namespace n on n.oid=c.relnamespace "
                "where n.nspname='public' and not t.tgisinternal;")
    _, trg_before = q(TRG_SNAP)
    _, members_before = q("select md5(string_agg(id::text||user_id::text||role, ',' order by id)) from public.members;")
    _, boot_owner = q("select pg_get_userbyid(relowner) from pg_class where oid='public.conversation_assignment_events'::regclass;")
    _, bridge_owner_before = q("""select pg_get_userbyid(proowner) from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='log_assignment_event';""")
    print(f"  seeded: members N={n_members}, one conversation, one legacy A1 row")

    print("\n--- APPLY 0107 (M-0), then 0108 (M-1), verbatim ---")
    ok0, out0 = qf(str(M0))
    print(f"  0107 first application : {'APPLIED CLEANLY' if ok0 else 'FAILED'}")
    if not ok0:
        print(out0[-900:]); destroy(); sys.exit(1)
    ok1, out1 = qf(str(M1))
    print(f"  0108 first application : {'APPLIED CLEANLY' if ok1 else 'FAILED'}")
    if not ok1:
        print(out1[-3000:]); destroy(); sys.exit(1)

    # ---------------------------------------------------------------- A. ADDITIVE LAW
    print("\n--- A. ADDITIVE LAW (Revision 14 §15.4 M-1) ---")
    _, priv_after = q(PRIV_SNAP)
    check("no privilege removed from any pre-existing principal", priv_before,
          priv_before if priv_before in priv_after or priv_after == priv_before else priv_after,
          ok=all(x in priv_after.split(",") for x in priv_before.split(",")))
    _, owner_after = q(OWNER_SNAP)
    pre_tables = dict(x.split(":") for x in owner_before.split(","))
    post_tables = dict(x.split(":") for x in owner_after.split(","))
    changed_owner = [t for t in pre_tables if post_tables.get(t) != pre_tables[t]]
    check("no EXISTING object owner changed", [], changed_owner)
    _, rls_after = q(RLS_SNAP)
    pre_rls = dict((x.split(":")[0], x) for x in rls_before.split(","))
    post_rls = dict((x.split(":")[0], x) for x in rls_after.split(","))
    changed_rls = [t for t in pre_rls if post_rls.get(t) != pre_rls[t]]
    check("no EXISTING table RLS enable/force changed", [], changed_rls)
    _, trg_after = q(TRG_SNAP)
    pre_t, post_t = set(trg_before.split(",")), set(trg_after.split(","))
    existing_tables = set(pre_tables)
    new_trg_on_existing = sorted(t for t in (post_t - pre_t) if t.split(".")[0] in existing_tables)
    check("no trigger added to an EXISTING table", [], new_trg_on_existing)
    check("no EXISTING trigger dropped", [], sorted(pre_t - post_t))
    _, a1_after = q(A1_FP)
    check("A1 pre-existing rows preserve every old-column value", a1_before, a1_after)
    _, members_after = q("select md5(string_agg(id::text||user_id::text||role, ',' order by id)) from public.members;")
    check("public.members not mutated", members_before, members_after)
    _, a1_null = q("""select coalesce(string_agg(column_name, ',' order by column_name),'none')
from information_schema.columns where table_schema='public'
and table_name='conversation_assignment_events' and is_nullable='NO'
and column_name in ('transition_id','operation_id','actor_kind','is_canonical',
'actor_member_version','actor_user_id','actor_label','actor_role');""")
    check("all eight A1 additions are NULLABLE", "none", a1_null)
    _, a1_cols = q("""select count(*) from information_schema.columns where table_schema='public'
and table_name='conversation_assignment_events';""")
    check("A1 column count 11 + 8 = 19", "19", a1_cols)
    _, a1_new_con = q("""select coalesce(string_agg(conname,',' order by conname),'none') from pg_constraint
where conrelid='public.conversation_assignment_events'::regclass and conname like 'a1_%';""")
    check("no A1 hardening constraint added (A1-1..A1-10 are M-5)", "none", a1_new_con)
    accepts("legacy A1 nine-column insert still succeeds unchanged",
            f"""insert into public.conversation_assignment_events
(conversation_id, restaurant_id, event_type, actor_member_id, from_mode, to_mode,
 epoch_before, epoch_after, reason)
values ('55555555-0000-0000-0000-000000000001',{R},'ESCALATED',null,'AI_ACTIVE','HUMAN_ACTIVE',5,6,'legacy writer');""")

    # ---------------------------------------------------------------- B. ROLE / MEMBERSHIP
    print("\n--- B. ROLE AND MEMBERSHIP (R1, R2, R19) ---")
    _, attrs = q("""select rolcanlogin::text||','||rolsuper::text||','||rolbypassrls::text||','
||rolcreatedb::text||','||rolcreaterole::text from pg_roles where rolname='kivo_control_owner';""")
    check("R1 kivo_control_owner attributes (login,super,bypassrls,createdb,createrole)",
          "false,false,false,false,false", attrs)
    _, mem = q("""select count(*) from pg_auth_members m
join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.member
where r.rolname='kivo_control_owner' or g.rolname='kivo_control_owner';""")
    check("R2/R19 no role membership to or from kivo_control_owner", "0", mem)
    _, disj = q("""select count(*) from pg_auth_members m
join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.member
where (r.rolname='authenticated' and g.rolname='service_role')
   or (r.rolname='service_role' and g.rolname='authenticated');""")
    check("authenticated/service_role remain disjoint (E32)", "0", disj)

    # ---------------------------------------------------------------- C. OWNERSHIP / RLS / POLICY
    print("\n--- C. OWNERSHIP, RLS AND POLICY (R3, R4, R10) ---")
    for t in ("control_operations", "conversation_audit_failures", "member_identity_versions"):
        _, o = q(f"select pg_get_userbyid(relowner) from pg_class where oid='public.{t}'::regclass;")
        check(f"R3 {t} owner = kivo_control_owner", "kivo_control_owner", o)
        _, s = q(f"select relrowsecurity::text||','||relforcerowsecurity::text from pg_class where oid='public.{t}'::regclass;")
        check(f"R4 {t} RLS enabled AND forced", "true,true", s)
    _, a1o = q("select pg_get_userbyid(relowner) from pg_class where oid='public.conversation_assignment_events'::regclass;")
    check("R3 A1 owner unchanged before M-5 (still the baseline owner)", boot_owner, a1o)
    _, a1f = q("select relforcerowsecurity::text from pg_class where oid='public.conversation_assignment_events'::regclass;")
    check("A1 RLS still NOT forced before M-5", "false", a1f)
    _, badpol = q("""select coalesce(string_agg(policyname,',' order by policyname),'none') from pg_policies
where schemaname='public' and tablename in ('control_operations','conversation_audit_failures',
'conversation_assignment_events') and cmd in ('UPDATE','DELETE');""")
    check("R10 no UPDATE/DELETE policy on A0, A1 or A2", "none", badpol)
    _, mivupd = q("""select count(*) from pg_policies where schemaname='public'
and tablename='member_identity_versions' and cmd='UPDATE';""")
    check("R10 MIV has exactly one owner UPDATE policy", "1", mivupd)
    _, mivdel = q("""select count(*) from pg_policies where schemaname='public'
and tablename='member_identity_versions' and cmd='DELETE';""")
    check("R10 MIV has no DELETE policy", "0", mivdel)
    _, seven = q("""select coalesce(string_agg(policyname,',' order by policyname),'none') from pg_policies
where schemaname='public' and policyname in ('conversations_control_owner_rw','members_control_owner_sel',
'restaurants_control_owner_sel','customers_control_owner_sel','messages_control_owner_sel',
'a1_control_owner_ins','a1_control_owner_sel');""")
    check("the seven preserved owner policies exist",
          "a1_control_owner_ins,a1_control_owner_sel,conversations_control_owner_rw,"
          "customers_control_owner_sel,members_control_owner_sel,messages_control_owner_sel,"
          "restaurants_control_owner_sel", seven)

    # ---------------------------------------------------------------- D. NEW-OWNER PRIVILEGE
    print("\n--- D. NEW-OWNER PRIVILEGE (R7, R8, adjudication §2D) ---")
    for s in ("public", "auth", "extensions"):
        _, hs = q(f"select has_schema_privilege('kivo_control_owner','{s}','usage')::text;")
        check(f"R7 USAGE on schema {s}", "true", hs)
    _, hd = q("select has_function_privilege('kivo_control_owner','extensions.digest(bytea,text)','execute')::text;")
    check("R8 EXECUTE on extensions.digest", "true", hd)
    _, msgcols = q("""select coalesce(string_agg(column_name,',' order by column_name),'none')
from information_schema.column_privileges where grantee='kivo_control_owner'
and table_schema='public' and table_name='messages' and privilege_type='SELECT';""")
    check("messages SELECT on exactly three identity columns",
          "conversation_id,id,restaurant_id", msgcols)
    _, insc = q("""select coalesce(string_agg(column_name,',' order by column_name),'none')
from information_schema.column_privileges where grantee='kivo_control_owner'
and table_schema='public' and table_name='conversations' and privilege_type='INSERT';""")
    check("conversations INSERT on exactly the eight granted columns",
          "channel,customer_id,id,is_safety_hold,owner,ownership_state,restaurant_id,status", insc)
    _, updc = q("""select coalesce(string_agg(column_name,',' order by column_name),'none')
from information_schema.column_privileges where grantee='kivo_control_owner'
and table_schema='public' and table_name='conversations' and privilege_type='UPDATE';""")
    check("conversations UPDATE on exactly the nine granted columns",
          "allergy_note,assigned_member_id,escalation_reason,handover_note,is_safety_hold,"
          "owner,ownership_state,status,updated_at", updc)
    _, noepoch = q("""select count(*) from information_schema.column_privileges
where grantee='kivo_control_owner' and table_name='conversations' and column_name='control_epoch'
and privilege_type='UPDATE';""")
    check("control_epoch NOT granted (trigger sets it)", "0", noepoch)

    # ---------------------------------------------------------------- E. FUNCTIONS
    print("\n--- E. CONTROL FUNCTIONS (R9, R15, PR80 SCOPE-1 branch) ---")
    _, fcount = q("""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%');""")
    check("exactly sixteen SCOPE-1 control functions", "16", fcount)
    # EXACT inventory: name AND argument type list, as a sorted set. A wrong sixteen-function
    # set — a missing, extra, renamed or wrongly-typed function — fails this assertion.
    EXPECTED_F = sorted([
      "kv_control_create_conversation(uuid,uuid,uuid,text)",                       # F1
      "kv_sys_control_create_conversation(uuid,uuid,uuid,text)",                   # F2
      "kv_control_claim(uuid,uuid,uuid,text)",                                     # F3
      "kv_control_reassign(uuid,uuid,uuid,uuid,text)",                             # F4
      "kv_control_return_to_kivo(uuid,uuid,uuid,text)",                            # F5
      "kv_control_release_hold(uuid,uuid,uuid,text,text)",                         # F6
      "kv_control_clear_stale_assignee(uuid,uuid,uuid,text)",                      # F7
      "kv_control_close(uuid,uuid,uuid,text,text)",                                # F8
      "kv_control_set_human_idle(uuid,uuid,uuid,text)",                            # F9
      "kv_sys_control_escalate(uuid,uuid,uuid,boolean,text,text)",                 # F10
      "kv_control_escalate(uuid,uuid,uuid,boolean,text,text)",                     # F11
      "kv_sys_control_reopen_closed(uuid,uuid,uuid,uuid,text)",                    # F12
      "kv_sys_control_timeout_return(uuid,uuid,uuid,bigint,boolean,integer,text,"
      "timestamp with time zone,text)",                                            # F13
      "kv_control_create_safety_conversation(uuid,uuid,uuid,text,uuid,text,text,text)",  # F14
      "kv_control_transition(uuid,uuid,uuid,text,text,boolean,uuid,text,text,uuid,text,"
      "text,text,text)",                                                           # F15
      "kv_control_assert_actor(uuid,text,boolean)",                                # F16
    ])
    _, fsigs = q("""select string_agg(p.proname||'('||oidvectortypes(p.proargtypes)||')',
E'\n' order by p.proname||'('||oidvectortypes(p.proargtypes)||')') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%');""")
    actual_f = sorted(x.strip().replace(", ", ",") for x in fsigs.split("\n") if x.strip())
    check("EXACT F1..F16 inventory and signatures", EXPECTED_F, actual_f)
    check("no function missing from the exact set", [], sorted(set(EXPECTED_F) - set(actual_f)))
    check("no function beyond the exact set", [], sorted(set(actual_f) - set(EXPECTED_F)))
    _, bad = q("""select coalesce(string_agg(p.proname,',' order by p.proname),'none') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%' or p.proname like 'kv_tg_%')
and (p.prosecdef = false or pg_get_userbyid(p.proowner) <> 'kivo_control_owner'
     or p.proconfig is distinct from array['search_path=""']);""")
    check("R9 every control/trigger function: SECURITY DEFINER, owner, search_path=''", "none", bad)
    _, defaults = q("""select coalesce(string_agg(p.proname,',' order by p.proname),'none') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%') and p.pronargdefaults > 0;""")
    check("no control function has a DEFAULT parameter", "none", defaults)
    _, scope2 = q("""select coalesce(string_agg(p.proname,',' order by p.proname),'none') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like '%alert_intent%' or p.proname like '%kv_legacy_assignment_bridge%'
     or p.proname like '%escalation_sweep%' or p.proname like '%acknowledge_alert%');""")
    check("no F17/F18/F19 and no kv_legacy_assignment_bridge function", "none", scope2)
    member_fns = ["kv_control_create_conversation", "kv_control_claim", "kv_control_reassign",
                  "kv_control_return_to_kivo", "kv_control_release_hold",
                  "kv_control_clear_stale_assignee", "kv_control_close",
                  "kv_control_set_human_idle", "kv_control_escalate"]
    system_fns = ["kv_sys_control_create_conversation", "kv_sys_control_escalate",
                  "kv_sys_control_reopen_closed", "kv_sys_control_timeout_return",
                  "kv_control_create_safety_conversation"]
    for fn in member_fns:
        _, g = q(f"""select coalesce(string_agg(distinct grantee,',' order by grantee),'none')
from information_schema.role_routine_grants where routine_schema='public' and routine_name='{fn}'
and grantee <> 'kivo_control_owner';""")
        check(f"SA1 {fn} -> authenticated only", "authenticated", g)
    for fn in system_fns:
        _, g = q(f"""select coalesce(string_agg(distinct grantee,',' order by grantee),'none')
from information_schema.role_routine_grants where routine_schema='public' and routine_name='{fn}'
and grantee <> 'kivo_control_owner';""")
        check(f"SA1 {fn} -> service_role only", "service_role", g)
    for fn in ("kv_control_transition", "kv_control_assert_actor"):
        _, g = q(f"""select coalesce(string_agg(distinct grantee,',' order by grantee),'none')
from information_schema.role_routine_grants where routine_schema='public' and routine_name='{fn}'
and grantee <> 'kivo_control_owner';""")
        check(f"F15/F16 {fn} has zero EXECUTE grantees beyond the owner", "none", g)
    _, anon_g = q("""select coalesce(string_agg(distinct routine_name,',' order by routine_name),'none')
from information_schema.role_routine_grants where routine_schema='public'
and grantee in ('anon','PUBLIC') and (routine_name like 'kv_control_%' or routine_name like 'kv_sys_%');""")
    check("nothing granted to anon or PUBLIC", "none", anon_g)

    # ---------------------------------------------------------------- F. COLUMN RESOLUTION
    print("\n--- F. COLUMN RESOLUTION (PF11 / R11) ---")
    _, unres = q("""select coalesce(string_agg(distinct table_name||'.'||column_name, ',' order by table_name||'.'||column_name),'none')
from information_schema.column_privileges cp where cp.grantee='kivo_control_owner'
and not exists (select 1 from information_schema.columns c
  where c.table_schema=cp.table_schema and c.table_name=cp.table_name and c.column_name=cp.column_name);""")
    check("every granted column resolves", "none", unres)
    _, voice = q("""select coalesce(string_agg(column_name,',' order by column_name),'none')
from information_schema.column_privileges where grantee='kivo_control_owner'
and column_name in ('voice_minutes_used','voice_budget_minutes','voice_enabled');""")
    check("no voice-budget drift column entered the grant set", "none", voice)

    # ---------------------------------------------------------------- G. MESSAGE READ PATH
    print("\n--- G. MESSAGE READ PATH (R12 applicable M-1 branch) ---")
    q(f"""insert into public.messages (id, restaurant_id, conversation_id, text)
values ('77777777-0000-0000-0000-000000000001',{R},'55555555-0000-0000-0000-000000000001','secret');""")
    ok_t, out_t = q("""select id, restaurant_id, conversation_id from public.messages
where id='77777777-0000-0000-0000-000000000001';""", role="kivo_control_owner")
    check("owner can resolve the known identity triple", True, ok_t and "77777777" in out_t,
          ok=(ok_t and "77777777" in out_t))
    raises("owner selecting messages.text is refused", "select text from public.messages;",
           "permission denied", role="kivo_control_owner")

    # ---------------------------------------------------------------- H. A0 / A2 KEYS
    print("\n--- H. A0 / A2 EVIDENCE KEYS (R16 applicable M-1 branch) ---")
    _, opuniq = q("""select coalesce(string_agg(conrelid::regclass::text,',' order by conrelid::regclass::text),'none')
from pg_constraint where contype='u' and array_length(conkey,1)=2 and pg_get_constraintdef(oid) like '%restaurant_id, operation_id%';""")
    check("exactly one UNIQUE (restaurant_id, operation_id), on A0",
          "control_operations", opuniq)
    _, uxdef = q("select indexdef from pg_indexes where schemaname='public' and indexname='ux_a0_evidence_core';")
    check("ux_a0_evidence_core has the exact nine-column order", True,
          "(transition_id, restaurant_id, conversation_id, operation_id, from_mode, to_mode, epoch_before, epoch_after, actor_kind)" in uxdef,
          ok="(transition_id, restaurant_id, conversation_id, operation_id, from_mode, to_mode, epoch_before, epoch_after, actor_kind)" in uxdef)
    _, a2fk = q("""select contype::text||','||convalidated::text||','||condeferrable::text||','||condeferred::text
from pg_constraint where conname='fk_a2_parent_core';""")
    check("fk_a2_parent_core: FK, VALID, deferrable, initially deferred", "f,true,true,true", a2fk)
    _, a1fk = q("""select count(*) from pg_constraint where conname='fk_a1_parent_core';""")
    check("fk_a1_parent_core NOT created in M-1 (deferred to M-5)", "0", a1fk)
    for t, c in (("control_operations", "fk_a0_2_actor_identity"),
                 ("conversation_audit_failures", "fk_a2_2_actor_identity")):
        _, k = q(f"""select count(*) from pg_constraint where conname='{c}'
and conrelid='public.{t}'::regclass and array_length(conkey,1)=5;""")
        check(f"{t} carries the five-column MIV identity key", "1", k)

    # ---------------------------------------------------------------- I. MIV
    print("\n--- I. MIV (R17, population-relative — NOT the historical 18) ---")
    _, miv_n = q("select count(*) from public.member_identity_versions;")
    check(f"exactly N={n_members} MIV rows after initialization", n_members, miv_n)
    _, open_n = q("select count(*) from public.member_identity_versions where valid_to is null;")
    check("exactly N open versions", n_members, open_n)
    _, multi = q("""select count(*) from (select member_id from public.member_identity_versions
where valid_to is null group by member_id having count(*)<>1) x;""")
    check("no member has zero or multiple open versions", "0", multi)
    _, tuple_eq = q("""select count(*) from public.members m
join public.member_identity_versions v on v.member_id=m.id and v.valid_to is null
where v.restaurant_id=m.restaurant_id and v.user_id=m.user_id and v.role=m.role;""")
    check("every open tuple equals the member's current identity tuple", n_members, tuple_eq)
    _, v1 = q("select count(*) from public.member_identity_versions where version=1;")
    check("initialization writes version = 1 for every member", n_members, v1)
    _, ix = q("""select indisunique::text||','||(indpred is not null)::text from pg_index
where indexrelid='public.ux_miv_open_version'::regclass;""")
    check("ux_miv_open_version is a PARTIAL UNIQUE index", "true,true", ix)
    _, ixcon = q("select count(*) from pg_constraint where conname='ux_miv_open_version';")
    check("ux_miv_open_version is an index, not a constraint", "0", ixcon)
    _, mtrg = q("""select coalesce(string_agg(tgname,',' order by tgname),'none') from pg_trigger
where tgrelid='public.member_identity_versions'::regclass and not tgisinternal;""")
    check("the three MIV immutability triggers exist",
          "tg_miv_close_only,tg_miv_no_delete,tg_miv_no_truncate", mtrg)
    raises("illegal MIV update rejected KIV18",
           "update public.member_identity_versions set role='operation' where version=1;", "KIV18")
    raises("MIV DELETE rejected", "delete from public.member_identity_versions;", "KIV18")
    ok_t, out_t = q("truncate public.member_identity_versions;")
    check("MIV TRUNCATE rejected (FK from A0/A2 fires before tg_miv_no_truncate)",
          True, ("cannot truncate" in out_t or "KIV18" in out_t) and not ok_t,
          ok=((not ok_t) and ("cannot truncate" in out_t or "KIV18" in out_t)))
    raises("duplicate open version rejected by ux_miv_open_version",
           """insert into public.member_identity_versions (member_id, version, restaurant_id, user_id, role)
select member_id, 2, restaurant_id, user_id, role from public.member_identity_versions limit 1;""",
           "ux_miv_open_version")
    accepts("closing an open version is the one permitted MIV update",
            """update public.member_identity_versions set valid_to = now() + interval '1 second'
where member_id='33333333-0000-0000-0000-000000000004';""")
    _, members_after2 = q("select md5(string_agg(id::text||user_id::text||role, ',' order by id)) from public.members;")
    check("public.members still unchanged after MIV work", members_before, members_after2)
    _, mtrg_members = q("""select count(*) from pg_trigger where tgrelid='public.members'::regclass
and not tgisinternal and tgname='tg_members_identity_version';""")
    check("tg_members_identity_version NOT created in M-1 (M-2 only)", "0", mtrg_members)

    # ---------------------------------------------------------------- J. CALLER SAFETY
    print("\n--- J. EXISTING CALLER SAFETY (PR65 / RB1 applicable M-1 branch) ---")
    for role in ("anon", "authenticated", "service_role"):
        _, p7 = q(f"""select count(*) from information_schema.role_table_grants
where table_schema='public' and table_name='conversation_assignment_events' and grantee='{role}';""")
        check(f"{role} retains all seven A1 privileges", "7", p7)
    _, bridge = q("""select prosecdef::text||','||pg_get_userbyid(proowner) from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='log_assignment_event';""")
    check("audit writer remains in its pre-M-2 form (not SECURITY DEFINER, owner unchanged)",
          "false," + bridge_owner_before, bridge)
    _, btrg = q("""select count(*) from pg_trigger where tgrelid='public.conversations'::regclass
and tgname='trg_log_assignment_event' and not tgisinternal;""")
    check("trg_log_assignment_event untouched", "1", btrg)

    # ---------------------------------------------------------------- K. SCOPE SEPARATION
    print("\n--- K. SCOPE SEPARATION (PR81 SCOPE-1 branch) ---")
    _, a3 = q("""select coalesce(string_agg(c.relname,',' order by c.relname),'none') from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('control_alert_intents');""")
    check("no A3 control_alert_intents table", "none", a3)
    _, a3idx = q("""select coalesce(string_agg(indexname,',' order by indexname),'none') from pg_indexes
where schemaname='public' and indexname in ('ux_a3_pending_per_epoch');""")
    check("no ux_a3_pending_per_epoch", "none", a3idx)
    _, a3fk = q("""select coalesce(string_agg(conname,',' order by conname),'none') from pg_constraint
where conname in ('fk_a3_transition','fk_a0_alert_intent');""")
    check("no SCOPE-2 circular keys", "none", a3fk)
    _, a018 = q("""select count(*) from pg_constraint where conname='a0_18_scope1_no_alert_intent'
and conrelid='public.control_operations'::regclass and convalidated;""")
    check("A0-18 SCOPE-1 NULL-only alert-intent guard present and VALID", "1", a018)


    # ------------------------------------------------- M. END-TO-END CONTROL PLANE
    print("\n--- M. END-TO-END GOVERNED OPERATION (exercises F3 -> F15 -> F16, A0 + A1) ---")
    CONV = "'55555555-0000-0000-0000-000000000001'"
    OP1  = "'88888888-0000-0000-0000-000000000001'"
    claim_sql = (f"select set_config('request.jwt.claim.sub', {U1}, false); set role authenticated;\n"
                 f"select (public.kv_control_claim({CONV}, {R}, {OP1}, 'proof claim')).operation_status;")
    ok_c, out_c = q(claim_sql)
    check("F3 kv_control_claim as authenticated member applies", "applied",
          out_c.strip().splitlines()[-1] if ok_c and out_c.strip() else f"FAILED: {out_c[:200]}")
    _, a0n = q("select count(*) from public.control_operations;")
    check("exactly one A0 row written by the operation", "1", a0n)
    _, a0shape = q("""select operation_status||','||changed::text||','||audit_kind||','||
(audit_id is not null)::text||','||actor_kind from public.control_operations;""")
    check("A0 row shape: applied/changed/event/audit_id/member", "applied,true,event,true,member", a0shape)
    _, epochs = q("select epoch_before::text||','||epoch_after::text from public.control_operations;")
    check("A0 epoch_after = epoch_before + 1", "0,1", epochs)
    _, a1can = q("""select count(*) from public.conversation_assignment_events
where is_canonical = true and event_type='CLAIMED';""")
    check("exactly one canonical A1 CLAIMED row", "1", a1can)
    _, linked = q("""select count(*) from public.control_operations o
join public.conversation_assignment_events e on e.id = o.audit_id
and e.transition_id = o.transition_id;""")
    check("A0.audit_id resolves to the A1 row sharing its transition_id", "1", linked)
    _, convstate = q(f"""select ownership_state||','||owner||','||control_epoch::text
from public.conversations where id={CONV};""")
    check("conversation advanced to HUMAN_ACTIVE with epoch bumped", "HUMAN_ACTIVE,human,1", convstate)
    # D5 replay: same operation_id and same fingerprint returns the recorded result, writes nothing.
    ok_r, out_r = q(f"select set_config('request.jwt.claim.sub', {U1}, false); set role authenticated;\n"
                    f"select (public.kv_control_claim({CONV}, {R}, {OP1}, 'proof claim')).replayed;")
    check("D5 replay returns replayed=true", "t", out_r.strip().splitlines()[-1] if ok_r else f"FAILED: {out_r[:150]}")
    _, a0n2 = q("select count(*) from public.control_operations;")
    check("D5 replay wrote no second A0 row", "1", a0n2)
    raises("D5 different fingerprint on the same operation_id raises KIV19",
           f"select set_config('request.jwt.claim.sub', {U1}, false); set role authenticated;\n"
           f"select public.kv_control_claim({CONV}, {R}, {OP1}, 'DIFFERENT reason');", "KIV19")
    # D6 complete target-state no-op on a fresh operation_id.
    ok_n, out_n = q(f"select set_config('request.jwt.claim.sub', {U1}, false); set role authenticated;\n"
                    f"select (public.kv_control_claim({CONV}, {R}, "
                    f"'88888888-0000-0000-0000-000000000002', 'noop')).operation_status;")
    check("D6 complete target-state no-op yields operation_status=noop", "noop",
          out_n.strip().splitlines()[-1] if ok_n else f"FAILED: {out_n[:200]}")
    _, noopshape = q("""select changed::text||','||audit_kind||','||(audit_id is null)::text||','||
(epoch_before = epoch_after)::text||','||(from_mode = to_mode)::text
from public.control_operations where operation_status='noop';""")
    check("A0 noop row: unchanged/none/null audit/equal epochs/equal modes",
          "false,none,true,true,true", noopshape)
    _, a1n2 = q("select count(*) from public.conversation_assignment_events where is_canonical = true;")
    check("no A1 row written for the no-op", "1", a1n2)
    raises("F15 is not directly invocable by authenticated (internal, zero grantees)",
           f"set role authenticated; select public.kv_control_transition({CONV},{R},"
           f"'88888888-0000-0000-0000-000000000009','claim','HUMAN_ACTIVE',null,null,null,null,"
           f"null,null,null,null,'member');", "permission denied")

    # A legitimate A2 failure record, written with its A0 parent in one transaction so the
    # deferred exclusivity and parent guards both evaluate at COMMIT.
    print("\n--- N. A2 EVIDENCE PATH (fk_a2_parent_core + tg_a2_parent_guard) ---")
    A2SQL = f"""
begin;
insert into public.conversation_audit_failures
 (id, transition_id, operation_id, restaurant_id, conversation_id, attempted_event_type,
  from_mode, to_mode, epoch_before, epoch_after, actor_kind, failure_category,
  failure_sqlstate, failure_fingerprint)
values ('99999999-0000-0000-0000-000000000001','99999999-1111-0000-0000-000000000001',
        '99999999-2222-0000-0000-000000000001',{R},{CONV},'CLAIMED','AI_ACTIVE','HUMAN_ACTIVE',
        7,8,'system','audit_insert_constraint','23514',repeat('a',64));
insert into public.control_operations
 (restaurant_id, operation_id, conversation_id, operation_name, request_fingerprint,
  transition_id, operation_status, changed, from_mode, to_mode, epoch_before, epoch_after,
  audit_kind, audit_id, actor_kind)
values ({R},'99999999-2222-0000-0000-000000000001',{CONV},'claim',repeat('b',64),
        '99999999-1111-0000-0000-000000000001','applied',true,'AI_ACTIVE','HUMAN_ACTIVE',
        7,8,'failure','99999999-0000-0000-0000-000000000001','system');
commit;"""
    accepts("a well-formed A0(failure) + A2 pair commits", A2SQL, role="kivo_control_owner")
    _, a2n = q("select count(*) from public.conversation_audit_failures;")
    check("exactly one A2 row", "1", a2n)
    raises("A2 with a mismatched attempted_event_type is refused by tg_a2_parent_guard",
           A2SQL.replace("'CLAIMED'", "'CLOSED'")
                .replace("99999999-0000-0000-0000-000000000001'", "99999999-0000-0000-0000-000000000002'")
                .replace("99999999-1111-0000-0000-000000000001'", "99999999-1111-0000-0000-000000000002'")
                .replace("99999999-2222-0000-0000-000000000001'", "99999999-2222-0000-0000-000000000002'"),
           "KIV20", role="kivo_control_owner")

    # ---------------------------------------------------------------- L. TRIGGER INVENTORY
    print("\n--- L. TRIGGER INVENTORY AT THE M-1 BOUNDARY ---")
    _, convtrg = q("""select coalesce(string_agg(tgname,',' order by tgname),'none') from pg_trigger
where tgrelid='public.conversations'::regclass and not tgisinternal;""")
    check("conversations trigger set unchanged (exactly three)",
          "trg_bump_control_epoch,trg_log_assignment_event,trg_touch_conversations", convtrg)
    _, a0trg = q("""select coalesce(string_agg(tgname,',' order by tgname),'none') from pg_trigger
where tgrelid='public.control_operations'::regclass and not tgisinternal;""")
    check("A0 carries its four evidence triggers (adjudication §2A)",
          "tg_a0_audit_exclusivity,tg_a0_no_delete,tg_a0_no_truncate,tg_a0_no_update", a0trg)
    _, a2trg = q("""select coalesce(string_agg(tgname,',' order by tgname),'none') from pg_trigger
where tgrelid='public.conversation_audit_failures'::regclass and not tgisinternal;""")
    check("A2 carries its four evidence triggers (adjudication §2A)",
          "tg_a2_no_delete,tg_a2_no_truncate,tg_a2_parent_guard,tg_a2_no_update".replace(
              "tg_a2_parent_guard,tg_a2_no_update", "tg_a2_no_update,tg_a2_parent_guard"), a2trg)
    _, a1trg = q("""select coalesce(string_agg(tgname,',' order by tgname),'none') from pg_trigger
where tgrelid='public.conversation_assignment_events'::regclass and not tgisinternal;""")
    check("A1 evidence triggers NOT created in M-1 (M-5 only)", "none", a1trg)
    _, a0rows = q("select count(*) from public.control_operations;")
    check("A0 is populated, so the immutability tests below are not vacuous", True,
          int(a0rows) > 0, ok=int(a0rows) > 0)
    raises("A0 UPDATE rejected KIV18",
           "update public.control_operations set changed = false;", "KIV18")
    raises("A0 DELETE rejected KIV18", "delete from public.control_operations;", "KIV18")
    raises("A2 UPDATE rejected KIV18",
           "update public.conversation_audit_failures set failure_sqlstate = '23505';", "KIV18")
    raises("A2 DELETE rejected KIV18", "delete from public.conversation_audit_failures;", "KIV18")


    # ================= O. CLAIMABILITY — 11 Aug binding adjudication =================
    print("\n--- O. CLAIMABILITY: CLAIMABLE_FROM is exactly AI_ACTIVE, HOLD_UNCLAIMED, "
          "HUMAN_IDLE, SYSTEM_HOLD ---")

    def mk_conv(cid, state, owner, assignee="null", hold="false"):
        q(f"""insert into public.conversations
(id, restaurant_id, customer_id, channel, ownership_state, owner, assigned_member_id, is_safety_hold)
values ('{cid}',{R},'44444444-0000-0000-0000-000000000001','whatsapp','{state}','{owner}',
        {assignee}, {hold});""")

    def as_member(uid, sql):
        return f"select set_config('request.jwt.claim.sub', {uid}, false); set role authenticated;\n{sql}"

    def conv_state(cid):
        _, v = q(f"""select ownership_state||'|'||owner||'|'||coalesce(assigned_member_id::text,'~')
||'|'||is_safety_hold::text||'|'||status||'|'||control_epoch::text
from public.conversations where id='{cid}';""")
        return v

    # the four governed D7 sources each succeed
    for i, (state, owner, hold) in enumerate([("AI_ACTIVE", "ai", "false"),
                                              ("HOLD_UNCLAIMED", "human", "false"),
                                              ("HUMAN_IDLE", "human", "false"),
                                              ("SYSTEM_HOLD", "human", "true")]):
        cid = f"5a000000-0000-0000-0000-00000000000{i+1}"
        mk_conv(cid, state, owner, hold=hold)
        okc, outc = q(as_member(U2, f"select (public.kv_control_claim('{cid}',{R},"
                                    f"gen_random_uuid(),'src')).operation_status;"))
        check(f"claim from {state} applies (D7 source)", "applied",
              outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")
    _, held = q("select is_safety_hold::text from public.conversations where id='5a000000-0000-0000-0000-000000000004';")
    check("claim from SYSTEM_HOLD preserves is_safety_hold = true", "true", held)

    # HUMAN_ACTIVE already assigned to the claiming member -> idempotent D6 success
    CID_SAME = "5a000000-0000-0000-0000-000000000011"
    mk_conv(CID_SAME, "HUMAN_ACTIVE", "human", assignee=M2ID)
    okc, outc = q(as_member(U2, f"select (public.kv_control_claim('{CID_SAME}',{R},"
                                f"gen_random_uuid(),'same')).operation_status;"))
    check("HUMAN_ACTIVE assigned to the claiming member = idempotent D6 noop", "noop",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")

    # HUMAN_ACTIVE with a NULL assignee is NOT claimable, and mutates nothing
    CID_NULL = "5a000000-0000-0000-0000-000000000012"
    mk_conv(CID_NULL, "HUMAN_ACTIVE", "human")
    before = conv_state(CID_NULL)
    _, a0_before = q("select count(*) from public.control_operations;")
    raises("HUMAN_ACTIVE with a NULL assignee is NOT claimable (KIV14)",
           as_member(U2, f"select public.kv_control_claim('{CID_NULL}',{R},gen_random_uuid(),'null');"),
           "KIV14")
    check("unassigned HUMAN_ACTIVE claim attempt mutated nothing", before, conv_state(CID_NULL))
    _, a0_after = q("select count(*) from public.control_operations;")
    check("unassigned HUMAN_ACTIVE claim attempt wrote no A0 row", a0_before, a0_after)

    # HUMAN_ACTIVE assigned to another member is NOT claimable, and mutates nothing
    CID_OTHER = "5a000000-0000-0000-0000-000000000013"
    mk_conv(CID_OTHER, "HUMAN_ACTIVE", "human", assignee=M1ID)
    before = conv_state(CID_OTHER)
    _, a0_before = q("select count(*) from public.control_operations;")
    raises("HUMAN_ACTIVE assigned to another member is NOT claimable (KIV15)",
           as_member(U2, f"select public.kv_control_claim('{CID_OTHER}',{R},gen_random_uuid(),'other');"),
           "KIV15")
    check("other-assignee claim attempt mutated nothing", before, conv_state(CID_OTHER))
    _, a0_after = q("select count(*) from public.control_operations;")
    check("other-assignee claim attempt wrote no A0 row", a0_before, a0_after)

    # ================= P. F5 / F8 / F9 ACTOR AUTHORIZATION =================
    print("\n--- P. F5 / F8 / F9 ACTOR AUTHORIZATION (Revision 14 §7.4, §7.7, §7.8) ---")

    # F5 return_to_kivo: assignee OK, manager OK, unrelated ordinary member REFUSED
    CID = "5b000000-0000-0000-0000-000000000001"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    raises("F5 unrelated ordinary member is refused (KIV12)",
           as_member(U3, f"select public.kv_control_return_to_kivo('{CID}',{R},gen_random_uuid(),'x');"),
           "KIV12")
    okc, outc = q(as_member(U2, f"select (public.kv_control_return_to_kivo('{CID}',{R},"
                                f"gen_random_uuid(),'assignee')).operation_status;"))
    check("F5 current assignee succeeds", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")
    CID = "5b000000-0000-0000-0000-000000000002"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    okc, outc = q(as_member(U1, f"select (public.kv_control_return_to_kivo('{CID}',{R},"
                                f"gen_random_uuid(),'manager')).operation_status;"))
    check("F5 manager succeeds", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")

    # F8 close
    CID = "5b000000-0000-0000-0000-000000000011"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    raises("F8 unrelated ordinary member refused on a human-owned shape (KIV12)",
           as_member(U3, f"select public.kv_control_close('{CID}',{R},gen_random_uuid(),'r','x');"),
           "KIV12")
    okc, outc = q(as_member(U2, f"select (public.kv_control_close('{CID}',{R},"
                                f"gen_random_uuid(),'r','assignee')).operation_status;"))
    check("F8 current assignee succeeds on a human-owned shape", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")
    CID = "5b000000-0000-0000-0000-000000000012"
    mk_conv(CID, "AI_ACTIVE", "ai")
    raises("F8 ordinary member refused on an AI-owned / unassigned shape (KIV12)",
           as_member(U3, f"select public.kv_control_close('{CID}',{R},gen_random_uuid(),'r','x');"),
           "KIV12")
    okc, outc = q(as_member(U1, f"select (public.kv_control_close('{CID}',{R},"
                                f"gen_random_uuid(),'r','manager')).operation_status;"))
    check("F8 manager succeeds where manager authority is required", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")

    # F9 set_human_idle
    CID = "5b000000-0000-0000-0000-000000000021"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    raises("F9 unrelated ordinary member is refused (KIV12)",
           as_member(U3, f"select public.kv_control_set_human_idle('{CID}',{R},gen_random_uuid(),'x');"),
           "KIV12")
    # F9's applied path emits event IDLE, one of the five values the LIVE 0099 eight-value
    # A1 CHECK rejects (the pre-R3 blocker of section 9). In this faithful fixture the
    # authorized actor therefore passes authorization and fails only on that blocker, which is
    # itself the evidence. The full applied path is proven in section T against a fixture
    # carrying Revision 14 A1-2. The migration does NOT widen the CHECK.
    okc, outc = q(as_member(U2, f"select public.kv_control_set_human_idle('{CID}',{R},"
                                f"gen_random_uuid(),'assignee');"))
    check("F9 current assignee passes authorization (fails only on the A1 event_type blocker)",
          True, (not okc) and "conversation_assignment_events_event_type_check" in outc,
          ok=((not okc) and "conversation_assignment_events_event_type_check" in outc))
    CID = "5b000000-0000-0000-0000-000000000022"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    okc, outc = q(as_member(U1, f"select public.kv_control_set_human_idle('{CID}',{R},"
                                f"gen_random_uuid(),'manager');"))
    check("F9 manager passes authorization (fails only on the A1 event_type blocker)",
          True, (not okc) and "conversation_assignment_events_event_type_check" in outc,
          ok=((not okc) and "conversation_assignment_events_event_type_check" in outc))

    # ================= Q. SB4 STATUS WRITE-THROUGH =================
    print("\n--- Q. SB4 PRESENTATION STATUS WRITE-THROUGH (Revision 14 §8.2) ---")
    STALE = "'a stale presentation value'"
    SB4 = [("claim", "HUMAN_ACTIVE", "موظف يتابع", "AI_ACTIVE", "ai", "null", "false",
            "kv_control_claim('{c}',{r},gen_random_uuid(),'sb4')", U2),
           ("return_to_kivo", "AI_ACTIVE", "AI نشط", "HUMAN_ACTIVE", "human", M2ID, "false",
            "kv_control_return_to_kivo('{c}',{r},gen_random_uuid(),'sb4')", U2),
           ("close", "CLOSED", "مغلقة", "HUMAN_ACTIVE", "human", M2ID, "false",
            "kv_control_close('{c}',{r},gen_random_uuid(),'r','sb4')", U2),
           ("escalate safety", "SYSTEM_HOLD", "يحتاج تدخل موظف", "AI_ACTIVE", "ai", "null", "false",
            "kv_control_escalate('{c}',{r},gen_random_uuid(),true,'why','sb4')", U2),
           ("escalate non-safety", "HOLD_UNCLAIMED", "يحتاج تدخل موظف", "AI_ACTIVE", "ai", "null", "false",
            "kv_control_escalate('{c}',{r},gen_random_uuid(),false,'why','sb4')", U2)]
    for i, (name, target, status, src, owner, assignee, hold, call, uid) in enumerate(SB4):
        cid = f"5c000000-0000-0000-0000-00000000000{i+1}"
        mk_conv(cid, src, owner, assignee=assignee, hold=hold)
        q(f"update public.conversations set status = {STALE} where id='{cid}';")
        okc, outc = q(as_member(uid, "select (public." + call.format(c=cid, r=R)
                                     + ").operation_status;"))
        if not okc:
            print(f"         (call error: {outc.splitlines()[-1][:130]})")
        _, st = q(f"select ownership_state||'|'||status from public.conversations where id='{cid}';")
        check(f"SB4 {name} -> {target} writes the governed status despite a stale prior value",
              f"{target}|{status}", st)
    # NO-OP writes nothing to conversations
    CID = "5c000000-0000-0000-0000-000000000021"
    mk_conv(CID, "HUMAN_ACTIVE", "human", assignee=M2ID)
    q(f"update public.conversations set status = {STALE} where id='{CID}';")
    before = conv_state(CID)
    okc, outc = q(as_member(U2, f"select (public.kv_control_claim('{CID}',{R},"
                                f"gen_random_uuid(),'noop')).operation_status;"))
    check("SB5 no-op outcome recognised", "noop",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:120]}")
    check("SB5 no-op writes NOTHING to conversations (stale status untouched)", before, conv_state(CID))
    # ALERTED cannot occur in SCOPE-1: A0-18 and KIV24 both forbid it
    _, alerted = q("select count(*) from public.control_operations where operation_status='alerted';")
    check("SB5 alerted outcome does not occur in SCOPE-1", "0", alerted)

    # ================= R. F14 EXACT L2 ORDER =================
    print("\n--- R. F14 L2 ORDER: A0 replay BEFORE row re-read / create-or-adopt (§3 L2) ---")
    NEWC = "5d000000-0000-0000-0000-000000000001"
    OP14 = "'5d000000-1111-0000-0000-000000000001'"
    okc, outc = q(f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                  f"'{NEWC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{OP14},"
                  f"'allergy','note','create')).operation_status;")
    check("F14 first call creates and applies", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:150]}")
    _, st14 = q(f"select ownership_state||'|'||is_safety_hold::text||'|'||status "
                f"from public.conversations where id='{NEWC}';")
    check("F14 applied row is SYSTEM_HOLD + hold + مراجعة حساسية", "SYSTEM_HOLD|true|مراجعة حساسية", st14)
    before = conv_state(NEWC)
    _, a0b = q("select count(*) from public.control_operations;")
    _, convb = q("select count(*) from public.conversations;")
    okc, outc = q(f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                  f"'{NEWC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{OP14},"
                  f"'allergy','note','create')).replayed;")
    check("F14 same-fingerprint replay returns the recorded result", "t",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:150]}")
    check("F14 replay mutated no conversation", before, conv_state(NEWC))
    _, a0a = q("select count(*) from public.control_operations;")
    check("F14 replay wrote no second A0 row", a0b, a0a)
    _, conva = q("select count(*) from public.conversations;")
    check("F14 replay created no conversation", convb, conva)
    # replay is honoured BEFORE create-or-adopt: a replay whose identity parameters would
    # otherwise raise an adoption conflict still returns the recorded result.
    okc, outc = q(f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                  f"'{NEWC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{OP14},"
                  f"'allergy','note','create')).operation_status;")
    check("F14 replay is honoured before any re-read/create/adopt", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc[:150]}")
    raises("F14 different fingerprint on the same operation_id remains KIV19",
           f"set role service_role;\nselect public.kv_control_create_safety_conversation("
           f"'{NEWC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{OP14},"
           f"'allergy','DIFFERENT note','create');", "KIV19")

    # ================= S. GENERIC KIV11 — NO EXISTENCE ORACLE =================
    print("\n--- S. TENANT RESOLUTION: one generic KIV11 for every non-creation entry point ---")
    R2 = "'1a111111-1111-1111-1111-111111111111'"
    q(f"""insert into public.restaurants (id) values ({R2});
insert into public.conversations (id, restaurant_id, channel, ownership_state, owner)
values ('5e000000-0000-0000-0000-000000000001',{R2},'whatsapp','AI_ACTIVE','ai');""")
    MISSING = "'5e000000-9999-9999-9999-999999999999'"
    OTHER   = "'5e000000-0000-0000-0000-000000000001'"
    ENTRY = [
      ("F3  claim",                "member", "kv_control_claim({c},{r},gen_random_uuid(),'t')"),
      ("F4  reassign",             "member", "kv_control_reassign({c},{r},gen_random_uuid()," + M2ID + ",'t')"),
      ("F5  return_to_kivo",       "member", "kv_control_return_to_kivo({c},{r},gen_random_uuid(),'t')"),
      ("F6  release_hold",         "member", "kv_control_release_hold({c},{r},gen_random_uuid(),'n','t')"),
      ("F7  clear_stale_assignee", "member", "kv_control_clear_stale_assignee({c},{r},gen_random_uuid(),'t')"),
      ("F8  close",                "member", "kv_control_close({c},{r},gen_random_uuid(),'r','t')"),
      ("F9  set_human_idle",       "member", "kv_control_set_human_idle({c},{r},gen_random_uuid(),'t')"),
      ("F11 escalate (member)",    "member", "kv_control_escalate({c},{r},gen_random_uuid(),true,'w','t')"),
      ("F10 escalate (system)",    "system", "kv_sys_control_escalate({c},{r},gen_random_uuid(),true,'w','t')"),
      ("F12 reopen_closed",        "system", "kv_sys_control_reopen_closed({c},{r},gen_random_uuid()," + MISSING + ",'t')"),
      ("F13 timeout_return",       "system", "kv_sys_control_timeout_return({c},{r},gen_random_uuid(),"
                                             "0,true,15,'auto_return',now(),'t')"),
    ]
    for label, kind, call in ENTRY:
        msgs = []
        for cid in (MISSING, OTHER):
            body = "select public." + call.format(c=cid, r=R) + ";"
            sql = as_member(U1, body) if kind == "member" else "set role service_role;\n" + body
            ok_e, out_e = q(sql)
            line = [l for l in out_e.splitlines() if "ERROR" in l]
            msgs.append(line[0].split("ERROR:")[-1].strip() if line else ("NO ERROR" if ok_e else out_e[:80]))
        check(f"{label}: nonexistent and wrong-tenant give the SAME generic KIV11",
              ["KIV11 tenant or conversation identity did not resolve"] * 2, msgs)


    # ================= T. THE FIVE A1-BLOCKED OPERATIONS, UNDER REVISION 14 A1-2 =========
    print("\n--- T. OPERATIONS BLOCKED BY THE LIVE 8-VALUE A1 CHECK, PROVEN UNDER A1-2 ---")
    print("    SUPPLEMENTARY FIXTURE. The A1 event_type CHECK here carries Revision 14 A1-2's")
    print("    THIRTEEN governed values, which M-5 installs. Migration 0108 does NOT widen the")
    print("    live CHECK and this fixture is not evidence that it does. Its only purpose is to")
    print("    prove that the five operations blocked by the 8-value CHECK are otherwise correct.")
    DB2 = "kivo_m1_a12"
    q(f"drop database if exists {DB2};", db="postgres")
    q(f"create database {DB2};", db="postgres")
    A12 = ("'CLAIMED','RELEASED','REASSIGNED','MANAGER_TAKEOVER','HANDED_TO_AI','ESCALATED',"
           "'SYSTEM_HOLD','CLOSED','HOLD_RELEASED','REOPENED','IDLE','TIMEOUT_RETURNED',"
           "'STALE_ASSIGNEE_CLEARED'")
    BASE2 = BASE.replace(
        "event_type text not null check (event_type in ('CLAIMED','RELEASED','REASSIGNED',\n"
        "    'MANAGER_TAKEOVER','HANDED_TO_AI','ESCALATED','SYSTEM_HOLD','CLOSED')),",
        f"event_type text not null check (event_type in ({A12})),")
    check("A1-2 fixture actually differs from the faithful 0099 fixture", True, BASE2 != BASE,
          ok=(BASE2 != BASE))
    ok2, out2 = q(BASE2, db=DB2)
    if not ok2:
        print(f"    A1-2 fixture baseline failed: {out2[:300]}")
    q(SEED, db=DB2)
    ok2a, _ = qf(str(M0), db=DB2)
    ok2b, out2b = qf(str(M1), db=DB2)
    check("0107 + 0108 apply cleanly on the A1-2 fixture", True, ok2a and ok2b, ok=(ok2a and ok2b))

    def q2(sql):
        return q(sql, db=DB2)

    def mk2(cid, state, owner, assignee="null", hold="false", stale=True):
        q2(f"""insert into public.conversations
(id, restaurant_id, customer_id, channel, ownership_state, owner, assigned_member_id, is_safety_hold)
values ('{cid}',{R},'44444444-0000-0000-0000-000000000001','whatsapp','{state}','{owner}',
        {assignee}, {hold});""")
        if stale:
            q2(f"update public.conversations set status = 'a stale presentation value' where id='{cid}';")

    BLOCKED = [
      ("F9  set_human_idle",       "IDLE",                   "HUMAN_IDLE", "تم التحويل لموظف",
       "HUMAN_ACTIVE", "human", M2ID, "false",
       "kv_control_set_human_idle('{c}',{r},gen_random_uuid(),'t')", "member", U2),
      ("F6  release_hold",         "HOLD_RELEASED",          "AI_ACTIVE",  "AI نشط",
       "SYSTEM_HOLD", "human", "null", "true",
       "kv_control_release_hold('{c}',{r},gen_random_uuid(),'note','t')", "member", U1),
      ("F7  clear_stale_assignee", "STALE_ASSIGNEE_CLEARED", "AI_ACTIVE",  "AI نشط",
       "AI_ACTIVE", "ai", M2ID, "false",
       "kv_control_clear_stale_assignee('{c}',{r},gen_random_uuid(),'t')", "member", U1),
      ("F12 reopen_closed",        "REOPENED",               "AI_ACTIVE",  "AI نشط",
       "CLOSED", "ai", "null", "false",
       "kv_sys_control_reopen_closed('{c}',{r},gen_random_uuid(),'7c000000-0000-0000-0000-000000000001','t')",
       "system", None),
    ]
    for i, (label, event, target, status, src, owner, assignee, hold, call, kind, uid) in enumerate(BLOCKED):
        cid = f"5f000000-0000-0000-0000-00000000000{i+1}"
        mk2(cid, src, owner, assignee=assignee, hold=hold)
        if "reopen_closed" in call:
            q2(f"""insert into public.messages (id, restaurant_id, conversation_id)
values ('7c000000-0000-0000-0000-000000000001',{R},'{cid}');""")
        body = "select (public." + call.format(c=cid, r=R) + ").operation_status;"
        sql = (f"select set_config('request.jwt.claim.sub', {uid}, false); set role authenticated;\n{body}"
               if kind == "member" else f"set role service_role;\n{body}")
        okc, outc = q2(sql)
        check(f"{label} applies under A1-2", "applied",
              outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
        _, st = q2(f"select ownership_state||'|'||status from public.conversations where id='{cid}';")
        check(f"{label} SB4 status -> {target}", f"{target}|{status}", st)
        _, ev = q2(f"""select event_type from public.conversation_assignment_events
where is_canonical = true and conversation_id='{cid}';""")
        check(f"{label} emits A1 event {event}", event, ev)

    # F13 timeout_return: exercised through its own T1..T14 order under A1-2.
    cid = "5f000000-0000-0000-0000-000000000009"
    mk2(cid, "HUMAN_IDLE", "human", assignee=M2ID)
    q2(f"update public.conversations set updated_at = now() - interval '60 minutes' where id='{cid}';")
    _, cfg = q2(f"""select control_epoch::text||'|'||to_char(updated_at,'YYYY-MM-DD\"T\"HH24:MI:SS.USOF')
from public.conversations where id='{cid}';""")
    ep, upd = cfg.split("|")
    okc, outc = q2(f"set role service_role;\nselect (public.kv_sys_control_timeout_return('{cid}',{R},"
                   f"gen_random_uuid(),{ep},true,15,'auto_return','{upd}'::timestamptz,'t')).operation_status;")
    check("F13 timeout_return applies under A1-2", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    _, st = q2(f"select ownership_state||'|'||status from public.conversations where id='{cid}';")
    check("F13 SB4 status -> AI_ACTIVE", "AI_ACTIVE|AI نشط", st)
    _, ev = q2(f"""select event_type from public.conversation_assignment_events
where is_canonical = true and conversation_id='{cid}';""")
    check("F13 emits A1 event TIMEOUT_RETURNED", "TIMEOUT_RETURNED", ev)
    ok_s, out_s = q2(f"set role service_role;\nselect public.kv_sys_control_timeout_return('{cid}',{R},"
                     f"gen_random_uuid(),999,true,15,'auto_return',now(),'t');")
    check("F13 stale configuration is refused KIV21", True,
          (not ok_s) and "KIV21" in out_s, ok=((not ok_s) and "KIV21" in out_s))

    # The blocker itself, stated as a proven fact rather than an assertion about the migration.
    _, live_vals = q("""select pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.conversation_assignment_events'::regclass and contype='c'
and pg_get_constraintdef(oid) like '%event_type%';""")
    missing = [v for v in ("HOLD_RELEASED","REOPENED","IDLE","TIMEOUT_RETURNED","STALE_ASSIGNEE_CLEARED")
               if v not in live_vals]
    check("PRE-R3 BLOCKER: the live A1 CHECK omits exactly these five governed events",
          ["HOLD_RELEASED","REOPENED","IDLE","TIMEOUT_RETURNED","STALE_ASSIGNEE_CLEARED"], missing)
    _, widened = q("""select count(*) from pg_constraint
where conrelid='public.conversation_assignment_events'::regclass and contype='c'
and pg_get_constraintdef(oid) like '%HOLD_RELEASED%';""")
    check("0108 did NOT widen the live A1 CHECK (M-5 owns A1-2)", "0", widened)
    q(f"drop database if exists {DB2};", db="postgres")

    # ---------------------------------------------------------------- IDEMPOTENCE
    print("\n--- IDEMPOTENCE: SECOND APPLICATION of 0108 ---")
    ok2, out2 = qf(str(M1))
    print(f"  0108 second application: {'APPLIED CLEANLY' if ok2 else 'FAILED'}")
    if not ok2:
        print(out2[-1500:])
    check("second application succeeds without error", True, ok2, ok=ok2)
    _, fcount2 = q("""select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'kv_control_%' or p.proname like 'kv_sys_control_%');""")
    check("still exactly sixteen control functions after re-run", "16", fcount2)
    _, miv_n2 = q("select count(*) from public.member_identity_versions;")
    check("MIV not re-initialized on re-run", miv_n, miv_n2)

    print("\n" + "=" * 78)
    passed = sum(1 for r in results if r[3])
    failed = len(results) - passed
    print(f"TOTAL {len(results)} assertions — PASS {passed} — FAIL {failed}")
    if failed:
        print("\nFAILURES:")
        for lab, e, a, ok_ in results:
            if not ok_:
                print(f"  - {lab}: expected {e!r}, actual {a!r}")
    print("=" * 78)
finally:
    print("\n--- TEARDOWN: destroy the disposable cluster ---")
    destroy()
    print(f"  cluster removed       : {'YES' if not pathlib.Path(PGDATA).exists() else 'NO'}")
    print(f"  production touched    : NO")

sys.exit(1 if any(not r[3] for r in results) else 0)
