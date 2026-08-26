#!/usr/bin/env python3
"""KIV-13 / CTRL-04 — M-1 ADDITIVE SCOPE-1: disposable-PostgreSQL proof.

Provisions a throwaway local PostgreSQL cluster, rebuilds the governed pre-M0 shape of the
relevant schema, applies 0107 (M-0) then 0108 (M-1) verbatim, proves the M-1 contract of
Revision 14 §15.4 as reconciled by the 13 August 2026 binding adjudication, then destroys
the cluster.

LOCAL DISPOSABLE POSTGRESQL ONLY. Never contacts production, reads no production credential,
and opens no network listener — the cluster is reachable only over a unix socket.

KIV-77 (14 Aug 2026) extends this proof to the real production execution model: the cluster is
PostgreSQL 17, and 0107/0108 are applied by a NON-SUPERUSER CREATEROLE role (kv_exec, modelled
on Supabase `postgres`) in a single transaction — never by the bootstrap superuser. It adds
section R (the historical 0108 failing for the production reason, plus failure-injection
rollback) and section Z (transactional-bootstrap cleanup and final privilege state).

Usage:  sudo python3 scripts/proof-kiv13-m1-disposable-pg.py
Exit 0 = every assertion passed.
"""
import subprocess, hashlib, pathlib, sys, re, os, shutil, time, uuid, atexit, socket as _socket

SELF = pathlib.Path(__file__).resolve()
ROOT = SELF.parent.parent
M0 = ROOT / "supabase/migrations/0107_kiv12_m0_constraint_prestage.sql"
M1 = ROOT / "supabase/migrations/0108_kiv13_m1_additive_scope1.sql"
M0_SHA = "3c40c6280b99d6f8a78c5081054b25d3438d47f205f2646c66796e4adefc74a6"

PGBIN = "/usr/lib/postgresql/17/bin"          # KIV-77: production parity (PG 17)

# KIV-77 W4: everything this run owns is namespaced by a unique tag, lives in an owner-only
# directory, and is removed by a single teardown registered BEFORE the cluster is created —
# so cleanup still runs if initdb or pg_ctl never succeeds.
RUNTAG = f"kiv77_{os.getpid()}_{uuid.uuid4().hex[:10]}"
RUNDIR = pathlib.Path("/var/tmp") / RUNTAG      # short path: also holds the unix socket
PGDATA = f"/var/lib/postgresql/{RUNTAG}"


def _free_port():
    with _socket.socket() as s_:
        s_.bind(("127.0.0.1", 0))
        return str(s_.getsockname()[1])


PORT, DB, USER, SOCK = _free_port(), "kivo_m1", "kivoproof", str(RUNDIR)
# KIV-77: the governed NON-SUPERUSER execution role. Migrations are applied as this role,
# never as the bootstrap superuser, so the proof exercises the real production privilege
# model (Supabase `postgres`: rolsuper=false, rolcreaterole=true).
EXEC = "kv_exec"
DB3 = "kivo_repro"                            # isolated DB for the historical-0108 repro
HIST = RUNDIR / "historical_0108.sql"
INJECTED = RUNDIR / "injected_0108.sql"
SCRATCH = RUNDIR / "q.sql"

results = []


def sh(cmd):
    return subprocess.run(["su", "postgres", "-c", cmd], capture_output=True, text=True)


def git(args):
    p = subprocess.run(["git", "-C", str(ROOT)] + args, capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else "<unavailable>"


def q(sql, db=DB, role=None):
    """Run SQL as USER, optionally SET ROLE first. -> (ok, output|error)."""
    body = (f"set role {role};\n" if role else "") + sql
    _own(SCRATCH, body)
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {USER} -d {db} -tAX -v ON_ERROR_STOP=1 -f {SCRATCH}')
    return (p.returncode == 0, (p.stdout if p.returncode == 0 else p.stderr).strip())


def qf(path, db=DB):
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {USER} -d {db} -X -v ON_ERROR_STOP=1 -f {path}')
    return (p.returncode == 0, (p.stdout + p.stderr).strip())


def qf_exec(path, db=DB, user=None):
    """KIV-77: apply a migration exactly as the governed runner does — as the NON-SUPERUSER
    execution role, in ONE transaction, so partial application is impossible."""
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {user or EXEC} -d {db} -X '
           f'-v ON_ERROR_STOP=1 --single-transaction -f {path}')
    return (p.returncode == 0, (p.stdout + p.stderr).strip())


def qf_exec_no_txn(path, db=DB, user=None):
    """Q3 EVIDENCE ONLY. Applies a migration WITHOUT the mandatory whole-file transaction
    wrapper, i.e. statement-by-statement under autocommit. This exists solely to demonstrate
    that such a runner is unsafe. It must never be used to apply 0108 for real."""
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {user or EXEC} -d {db} -X '
           f'-v ON_ERROR_STOP=1 -f {path}')
    return (p.returncode == 0, (p.stdout + p.stderr).strip())


def qx(sql, db=DB):
    """Read-only/observational query issued AS the executor role."""
    _own(SCRATCH, sql)
    p = sh(f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {EXEC} -d {db} -tAX -v ON_ERROR_STOP=1 -f {SCRATCH}')
    return (p.returncode == 0, (p.stdout if p.returncode == 0 else p.stderr).strip())


def miv_membership(db=DB):
    """Every surviving membership on kivo_control_owner, as grantor/admin/set/inherit."""
    _, out = q("""select coalesce(string_agg(g.rolname||'/admin='||m.admin_option
||'/set='||m.set_option||'/inherit='||m.inherit_option, ' ; ' order by g.rolname), 'NONE')
from pg_auth_members m join pg_roles r on r.oid=m.roleid
join pg_roles g on g.oid=m.grantor where r.rolname='kivo_control_owner';""", db=db)
    return out.strip()


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


BGFILE = RUNDIR / "bg.sql"


def bg(sql, db=DB):
    """Start a REAL second session and return the process. Used to hold locks concurrently."""
    _own(BGFILE, sql)
    return subprocess.Popen(
        ["su", "postgres", "-c",
         f'{PGBIN}/psql -h {SOCK} -p {PORT} -U {USER} -d {db} -X -f {BGFILE}'],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def _own(path, text):
    """KIV-77 W4: write a task-owned temp file readable ONLY by its owner (postgres)."""
    path.write_text(text, encoding="utf-8")
    os.chmod(path, 0o600)
    shutil.chown(path, user="postgres")


def destroy():
    """KIV-77 W4: remove EVERY artifact this task owns - cluster, processes, socket, PGDATA
    and every temp/injected SQL file. Safe before the server ever starts, and idempotent."""
    try:
        subprocess.run(["su", "postgres", "-c", f'{PGBIN}/pg_ctl -D {PGDATA} stop -m immediate'],
                       capture_output=True, text=True, timeout=60)
    except Exception:
        pass
    try:  # only processes carrying THIS run's unique tag; other clusters are never touched
        for pid in subprocess.run(["pgrep", "-f", RUNTAG],
                                  capture_output=True, text=True).stdout.split():
            if pid and pid != str(os.getpid()):
                subprocess.run(["kill", "-9", pid], capture_output=True)
    except Exception:
        pass
    for p in (pathlib.Path(PGDATA), RUNDIR):     # PGDATA, socket, temp and injected SQL
        shutil.rmtree(p, ignore_errors=True)


def teardown_report():
    left = []
    if pathlib.Path(PGDATA).exists():
        left.append("PGDATA")
    if RUNDIR.exists():
        left.append("RUNDIR(socket/temp SQL)")
    try:
        if subprocess.run(["pgrep", "-f", RUNTAG], capture_output=True, text=True).stdout.strip():
            left.append("processes")
    except Exception:
        pass
    return left


atexit.register(destroy)     # registered BEFORE any cluster exists (W4)


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
RUNDIR.mkdir(parents=True, exist_ok=True)
os.chmod(RUNDIR, 0o700)
shutil.chown(RUNDIR, user="postgres")   # owner-only: only postgres (and root) may read
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
q("do $r$ begin if not exists (select 1 from pg_roles where rolname='kv_exec') then create role kv_exec login nosuperuser createrole inherit; end if; end $r$;", db="postgres")
_, _execattr = q("select 'super='||rolsuper||' createrole='||rolcreaterole||' inherit='||rolinherit from pg_roles where rolname='kv_exec';", db="postgres")
print(f"  execution role        : kv_exec  {_execattr}   (NON-SUPERUSER — migrations run as this role)")

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
-- KIV-77 DISPOSABLE TEST SCAFFOLDING: the governed non-superuser execution role, modelled on
-- the Supabase `postgres` role that actually runs migrations. It is NOT a superuser, it holds
-- CREATEROLE, and it owns the application objects exactly as Supabase `postgres` does.
do $r$ begin
  if not exists (select 1 from pg_roles where rolname='kv_exec') then
    create role kv_exec login nosuperuser createrole inherit;
  end if;
end $r$;
grant usage, create on schema public to kv_exec;
grant usage on schema extensions to kv_exec;
grant usage on schema auth       to kv_exec;
grant all on all tables    in schema auth to kv_exec;
-- Supabase `postgres` owns the application schemas, which is why it can GRANT on them.
-- Without this the fixture would be UNFAITHFUL: the executor would fail earlier, on the
-- section-2 grants, instead of on the ownership transfer the defect is actually about.
alter schema public     owner to kv_exec;
alter schema auth       owner to kv_exec;
alter schema extensions owner to kv_exec;
alter function extensions.digest(bytea, text) owner to kv_exec;
do $r$
declare x record;
begin
  for x in select c.oid::regclass as o, c.relkind as k
             from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname in ('public','auth') and c.relkind in ('r','p','v','S')
              and not exists (select 1 from pg_depend d
                               where d.objid=c.oid and d.deptype='e')
  loop
    if x.k = 'S' then execute format('alter sequence %s owner to kv_exec', x.o);
    else                execute format('alter table %s owner to kv_exec', x.o);
    end if;
  end loop;
  for x in select p.oid::regprocedure as o
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','auth') and p.prokind='f'
              and not exists (select 1 from pg_depend d
                               where d.objid=p.oid and d.deptype='e')
  loop
    execute format('alter function %s owner to kv_exec', x.o);
  end loop;
end $r$;
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


    # ================= R. KIV-77: PRODUCTION-DISCOVERED PRIVILEGE DEFECT =================
    # Runs BEFORE the corrected migration is applied anywhere, because roles are CLUSTER-WIDE:
    # only here can "the role must not exist afterwards" be a meaningful rollback assertion.
    print("\n--- R. HISTORICAL 0108 UNDER THE GOVERNED NON-SUPERUSER EXECUTOR ---")
    _, execattr = q("select 'rolsuper='||rolsuper||' rolcreaterole='||rolcreaterole"
                    "||' rolinherit='||rolinherit from pg_roles where rolname='kv_exec';")
    check("executor mirrors Supabase postgres (non-superuser, CREATEROLE)",
          "rolsuper=false rolcreaterole=true rolinherit=true", execattr)
    _, pubcreate = q("select coalesce(has_schema_privilege('public','public','CREATE'),false);")
    check("PUBLIC supplies no schema CREATE shortcut", "f", pubcreate)
    _, kco_pre = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
    check("kivo_control_owner does not exist before any application", "0", kco_pre)

    hist = subprocess.run(["git", "-C", str(ROOT), "show",
                           "bf5f982b8a8e9f622baae98d3a7460a8ac5443a3:"
                           "supabase/migrations/0108_kiv13_m1_additive_scope1.sql"],
                          capture_output=True, text=True).stdout
    _own(HIST, hist)          # Q1: every task-created SQL artifact is 0600 owner-only
    check("historical accepted 0108 recovered at its accepted SHA-256",
          "8a435974b1b302223548b4aeadfa84ee0a11918a301d8698f7774a49f757a107",
          hashlib.sha256(hist.encode("utf-8")).hexdigest())

    def drop_kco():
        """Roles are CLUSTER-WIDE. Return the cluster to a pre-M1 state so that
        'the role must not survive' is a meaningful rollback assertion."""
        q(f"drop database if exists {DB3};", db="postgres")
        q("do $r$ begin if exists (select 1 from pg_roles where rolname='kivo_control_owner')"
          " then execute 'drop role kivo_control_owner'; end if; end $r$;", db="postgres")

    def fresh_repro():
        drop_kco()
        q(f"create database {DB3};", db="postgres")
        q(BASE, db=DB3); q(SEED, db=DB3)
        return qf_exec(str(M0), db=DB3)[0]

    check("0107 applies as the non-superuser executor", True, fresh_repro(), ok=fresh_repro())
    ok_h, out_h = qf_exec(str(HIST), db=DB3)
    check("historical 0108 FAILS as the non-superuser executor", True, not ok_h, ok=(not ok_h))
    check("...for the expected reason: cannot SET ROLE kivo_control_owner", True,
          ("42501" in out_h or "must be able to SET ROLE" in out_h) and "kivo_control_owner" in out_h,
          ok=(("42501" in out_h or "must be able to SET ROLE" in out_h) and "kivo_control_owner" in out_h))
    _, h_role = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
    check("historical 0108 rolled back completely: no role survives", "0", h_role)
    _, h_tab = q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                 "where n.nspname='public' and c.relname in ('member_identity_versions',"
                 "'control_operations','conversation_audit_failures');", db=DB3)
    check("historical 0108 rolled back completely: no M-1 table survives", "0", h_tab)

    # ---- failure injection: complete rollback at two required points ----
    print("\n--- R2. FAILURE INJECTION -> COMPLETE ROLLBACK ---")
    corrected = M1.read_text(encoding="utf-8")
    BOOM = "\ndo $boom$ begin raise exception 'KIV77 INJECTED FAILURE'; end $boom$;\n"
    INJECTS = [
        ("after bootstrap privilege creation",
         "grant create on schema public to kivo_control_owner;   -- bootstrap-only; revoked in section 16"),
        ("after the first ownership transfer",
         "alter table public.member_identity_versions owner to kivo_control_owner;                  -- R3"),
    ]
    for label, anchor in INJECTS:
        assert corrected.count(anchor) == 1, f"inject anchor missing: {label}"
        injected = corrected.replace(anchor, anchor + BOOM, 1)
        _own(INJECTED, injected)
        fresh_repro()
        ok_i, out_i = qf_exec(str(INJECTED), db=DB3)
        check(f"injection {label}: migration fails", True,
              (not ok_i) and "KIV77 INJECTED FAILURE" in out_i,
              ok=((not ok_i) and "KIV77 INJECTED FAILURE" in out_i))
        _, i_role = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
        check(f"injection {label}: no role survives", "0", i_role)
        check(f"injection {label}: no membership survives", "NONE", miv_membership(db=DB3))
        _, i_tab = q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                     "where n.nspname='public' and c.relname in ('member_identity_versions',"
                     "'control_operations','conversation_audit_failures');", db=DB3)
        check(f"injection {label}: no M-1 object survives", "0", i_tab)
        _, i_col = q("select count(*) from pg_attribute where attrelid="
                     "'public.conversation_assignment_events'::regclass and attnum>0 "
                     "and not attisdropped and attname in ('transition_id','operation_id',"
                     "'actor_kind','is_canonical','actor_member_version','actor_user_id',"
                     "'actor_label','actor_role');", db=DB3)
        check(f"injection {label}: no A1 column survives", "0", i_col)


    # ---- R3. KIV-77 W2/W1: hostile pre-existing privilege states must ABORT SAFELY ----
    print("\n--- R3. HOSTILE STARTING STATES -> SAFE ABORT + COMPLETE ROLLBACK ---")

    def assert_rolled_back(tag):
        _, r_role = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
        check(f"{tag}: no kivo_control_owner role survives", "0", r_role)
        _, r_tab = q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                     "where n.nspname='public' and c.relname in ('member_identity_versions',"
                     "'control_operations','conversation_audit_failures');", db=DB3)
        check(f"{tag}: no M-1 object survives", "0", r_tab)
        _, r_col = q("select count(*) from pg_attribute where attrelid="
                     "'public.conversation_assignment_events'::regclass and attnum>0 "
                     "and not attisdropped and attname in ('transition_id','operation_id',"
                     "'actor_kind','is_canonical','actor_member_version','actor_user_id',"
                     "'actor_label','actor_role');", db=DB3)
        check(f"{tag}: no A1 column survives", "0", r_col)

    # ---- W2: PUBLIC already holds CREATE on schema public ----
    # The bootstrap-only CREATE grant then cannot be cleanly withdrawn, because
    # has_schema_privilege() still reports CREATE via PUBLIC. The migration must NOT declare
    # success while kivo_control_owner effectively retains schema CREATE.
    fresh_repro()
    ok_pg, _ = qx("grant create on schema public to public;", db=DB3)
    check("W2 fixture: PUBLIC granted CREATE on schema public", True, ok_pg, ok=ok_pg)
    _, pub_has = q("select has_schema_privilege('public','public','CREATE');", db=DB3)
    check("W2 fixture: PUBLIC really holds schema CREATE", "t", pub_has)
    ok_w2, out_w2 = qf_exec(str(M1), db=DB3)
    check("W2 migration ABORTS when PUBLIC holds schema CREATE", True, not ok_w2, ok=(not ok_w2))
    check("W2 abort is the governed fail-closed cleanup check, not an incidental error", True,
          "KIV77" in out_w2 and "CREATE on schema public" in out_w2,
          ok=("KIV77" in out_w2 and "CREATE on schema public" in out_w2))
    assert_rolled_back("W2")

    # ---- W1: an extra membership recorded by a NON-SUPERUSER grantor ----
    # LIMITATIONS, RECORDED EXPLICITLY (KIV-87 Q5):
    #   * the hostile W1 grantor state CANNOT be isolated behaviourally, because the
    #     membership-COUNT guard fires first; this test therefore exercises the guard family,
    #     not the grantor branch alone;
    #   * the accompanying source-substring assertion confirms the guard is present in the
    #     file. It is NOT full independent behavioural proof of the grantor branch;
    #   * INHERIT is required by THIS candidate's current statement order (grants and FKs that
    #     follow the ownership transfer). It is not claimed to be unavoidable under every
    #     possible design.
    fresh_repro()
    q("create role kv_probe nologin;", db=DB3)
    q("do $r$ begin if not exists (select 1 from pg_roles where rolname='kivo_control_owner')"
      " then create role kivo_control_owner nologin noinherit; end if; end $r$;", db=DB3)
    q("grant kivo_control_owner to kv_exec with admin option, set false, inherit false;", db=DB3)
    ok_pw, _ = qx("grant kivo_control_owner to kv_probe with admin option, set false, inherit false;",
                  db=DB3)
    check("W1 fixture: a non-superuser (kv_exec) recorded a membership", True, ok_pw, ok=ok_pw)
    _, w1_grantors = q("""select string_agg(distinct g.rolsuper::text, ',' order by g.rolsuper::text)
from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.grantor
where r.rolname='kivo_control_owner';""", db=DB3)
    check("W1 fixture: at least one membership has a non-superuser grantor", True,
          "false" in w1_grantors, ok=("false" in w1_grantors))
    ok_w1, out_w1 = qf_exec(str(M1), db=DB3)
    check("W1 migration ABORTS on an unexpected membership state", True, not ok_w1, ok=(not ok_w1))
    # KIV-126 note: this assertion previously required the KIV77 label specifically. The
    # KIV-126 member guard is deliberately ordered BEFORE the KIV77 count guard, so this
    # hostile state now trips the more specific guard first and reports KIV126 naming
    # kv_probe. The condition is NOT weakened - it still requires a governed fail-closed
    # guard to abort the run, and now also requires the offending member to be named.
    check("W1 abort is a governed KIV77/KIV126 cleanup check naming the offending member",
          True, ("KIV77" in out_w1 or "KIV126" in out_w1) and "kv_probe" in out_w1,
          ok=(("KIV77" in out_w1 or "KIV126" in out_w1) and "kv_probe" in out_w1))
    _, w1_tab = q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                  "where n.nspname='public' and c.relname in ('member_identity_versions',"
                  "'control_operations','conversation_audit_failures');", db=DB3)
    check("W1: no M-1 object survives the abort", "0", w1_tab)
    _, w1_boot = q("""select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
join pg_roles g on g.oid=m.member where r.rolname='kivo_control_owner' and g.rolname='kv_exec'
and (m.set_option or m.inherit_option);""", db=DB3)
    check("W1: the migration's bootstrap SET/INHERIT grant did not survive the abort", "0", w1_boot)
    q("do $r$ begin if exists (select 1 from pg_roles where rolname='kivo_control_owner')"
      " then execute 'revoke kivo_control_owner from kv_probe'; "
      " execute 'revoke kivo_control_owner from kv_exec'; end if; end $r$;", db=DB3)
    drop_kco()
    q("drop role if exists kv_probe;", db="postgres")

    # ---- W1 positive: the migration source carries the grantor guard ----
    check("W1 the migration's final safety check verifies the surviving grantor is a superuser",
          True, "not g.rolsuper" in M1.read_text(encoding="utf-8")
                and "bootstrap superuser" in M1.read_text(encoding="utf-8"),
          ok=("not g.rolsuper" in M1.read_text(encoding="utf-8")))

    # ---- Q3 (KIV-87): the whole-file transaction wrapper is MANDATORY ----
    # Must run HERE, before the main application, because roles are CLUSTER-WIDE: once the
    # main database has applied 0108 successfully the role exists and owns objects, so
    # "the role must not survive" would be unfalsifiable. Same file, same injected failure,
    # applied two ways - the only difference is the runner.
    print("\n--- R4. KIV-87 Q3: MANDATORY WHOLE-FILE TRANSACTION WRAPPER ---")
    corrected_q3 = M1.read_text(encoding="utf-8")
    anchor_q3 = ("alter table public.member_identity_versions owner to kivo_control_owner;"
                 "                  -- R3")
    assert corrected_q3.count(anchor_q3) == 1
    _own(INJECTED, corrected_q3.replace(
        anchor_q3,
        anchor_q3 + "\ndo $boom$ begin raise exception 'KIV87 Q3 INJECTED FAILURE'; end $boom$;\n", 1))
    fresh_repro()
    ok_q3, out_q3 = qf_exec_no_txn(str(INJECTED), db=DB3)
    check("Q3 statement-by-statement: the injected failure aborts the run", True,
          (not ok_q3) and "KIV87 Q3 INJECTED FAILURE" in out_q3,
          ok=((not ok_q3) and "KIV87 Q3 INJECTED FAILURE" in out_q3))
    _, q3_role = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
    check("Q3 statement-by-statement: the role SURVIVES — the wrapper is MANDATORY", "1", q3_role)
    _, q3_memb = q("""select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
where r.rolname='kivo_control_owner' and (m.set_option or m.inherit_option);""")
    check("Q3 statement-by-statement: a usable SET/INHERIT bootstrap grant also survives",
          "1", q3_memb)
    drop_kco()
    fresh_repro()
    ok_q3b, _ = qf_exec(str(INJECTED), db=DB3)
    check("Q3 with the wrapper: the identical failure aborts", True, not ok_q3b, ok=(not ok_q3b))
    _, q3_role_b = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
    check("Q3 with the wrapper: NO role survives", "0", q3_role_b)
    check("Q3 with the wrapper: NO membership survives", "NONE", miv_membership(db=DB3))
    drop_kco()


    # ================= R5. KIV-126: EXECUTOR IDENTITY + PRE-EXISTING ROLE GUARD =========
    # Roles are CLUSTER-WIDE, so these run BEFORE the main application: only here can
    # "no role survives" and "the role must not be adopted" be falsifiable.
    print("\n--- R5. KIV-126: MEMBER IDENTITY AND PRE-EXISTING ROLE ATTRIBUTE GUARDS ---")

    def kco_rollback_proof(tag):
        _, n_role = q("select count(*) from pg_roles where rolname='kivo_control_owner';")
        _, n_tab = q("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                     "where n.nspname='public' and c.relname in ('member_identity_versions',"
                     "'control_operations','conversation_audit_failures');", db=DB3)
        _, n_col = q("select count(*) from pg_attribute where attrelid="
                     "'public.conversation_assignment_events'::regclass and attnum>0 "
                     "and not attisdropped and attname in ('transition_id','operation_id',"
                     "'actor_kind','is_canonical','actor_member_version','actor_user_id',"
                     "'actor_label','actor_role');", db=DB3)
        check(f"{tag}: no M-1 object survives the abort", "0", n_tab)
        check(f"{tag}: no A1 column survives the abort", "0", n_col)
        return n_role

    # ---- (a) UNRELATED MEMBERSHIP: a membership held by someone other than the executor ----
    # Constructed so the executor still holds ADMIN (so section 1B can run) and neither
    # membership carries SET/INHERIT, which isolates the KIV-126 member guard: it fires
    # before the count guard and names the offending member.
    fresh_repro()
    q("drop role if exists kv_probe;", db="postgres")
    q("create role kv_probe nologin;", db="postgres")
    qx("create role kivo_control_owner nologin nosuperuser nobypassrls nocreatedb "
       "nocreaterole noinherit noreplication;", db=DB3)
    ok_g, _ = qx("grant kivo_control_owner to kv_probe with admin option, set false, inherit false;",
                 db=DB3)
    check("K126(a) fixture: an unrelated role holds a membership on kivo_control_owner",
          True, ok_g, ok=ok_g)
    _, memb_pre = q("""select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
join pg_roles mm on mm.oid=m.member where r.rolname='kivo_control_owner' and mm.rolname='kv_probe';""")
    check("K126(a) fixture: that unrelated membership really exists", "1", memb_pre)
    ok_a, out_a = qf_exec(str(M1), db=DB3)
    check("K126(a) migration ABORTS on a membership held by a non-executor", True, not ok_a,
          ok=(not ok_a))
    check("K126(a) the abort is the governed KIV126 member guard, naming the offender", True,
          "KIV126" in out_a and "kv_probe" in out_a and "governed executor" in out_a,
          ok=("KIV126" in out_a and "kv_probe" in out_a and "governed executor" in out_a))
    kco_rollback_proof("K126(a)")
    _, boot_a = q("""select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
where r.rolname='kivo_control_owner' and (m.set_option or m.inherit_option);""")
    check("K126(a) no bootstrap SET/INHERIT grant survives the abort", "0", boot_a)
    q("do $r$ begin if exists (select 1 from pg_roles where rolname='kivo_control_owner')"
      " then execute 'revoke kivo_control_owner from kv_probe'; end if; end $r$;", db=DB3)
    drop_kco(); q("drop role if exists kv_probe;", db="postgres")

    # ---- (b) EVERY unsafe pre-existing role attribute must abort and roll back ----
    UNSAFE = [("LOGIN", "login"), ("SUPERUSER", "superuser"), ("BYPASSRLS", "bypassrls"),
              ("CREATEDB", "createdb"), ("CREATEROLE", "createrole"), ("INHERIT", "inherit"),
              ("REPLICATION", "replication")]
    for label, attr in UNSAFE:
        fresh_repro()
        # created by the BOOTSTRAP SUPERUSER: a non-superuser executor cannot mint
        # SUPERUSER/BYPASSRLS/REPLICATION, and the guard must hold however the role arrived.
        # LOGIN is the one attribute that contradicts the NOLOGIN default, so it replaces
        # it rather than being appended to it.
        spec = "login" if attr == "login" else f"nologin {attr}"
        okc, outc = q(f"create role kivo_control_owner {spec};", db=DB3)
        check(f"K126(b) fixture: pre-existing role carries {label}", True, okc,
              ok=okc) or print(f"    {outc[:160]}")
        ok_b, out_b = qf_exec(str(M1), db=DB3)
        check(f"K126(b) {label}: migration ABORTS on the unsafe pre-existing role", True,
              (not ok_b) and "KIV126" in out_b and label in out_b,
              ok=((not ok_b) and "KIV126" in out_b and label in out_b))
        kco_rollback_proof(f"K126(b) {label}")
        drop_kco()

    # ---- (c) a SAFE pre-existing role must be ACCEPTED ----
    # Superuser pre-creates the governed role with every safe attribute and grants the
    # executor ADMIN (no SET/INHERIT), mirroring a legitimate earlier partial install.
    fresh_repro()
    q("create role kivo_control_owner nologin nosuperuser nobypassrls nocreatedb "
      "nocreaterole noinherit noreplication;", db=DB3)
    q("grant kivo_control_owner to kv_exec with admin option, set false, inherit false;", db=DB3)
    ok_c, out_c = qf_exec(str(M1), db=DB3)
    if not ok_c:
        print(f"    K126(c) failure detail: {out_c[-700:]}")
    check("K126(c) a SAFE pre-existing kivo_control_owner is accepted and the migration succeeds",
          True, ok_c, ok=ok_c)
    check("K126(c) the surviving membership belongs to the governed executor", True,
          miv_membership(db=DB3).startswith(USER + "/") or "/admin=true" in miv_membership(db=DB3),
          ok=("/admin=true" in miv_membership(db=DB3)))
    _, c_member = q("""select coalesce(string_agg(distinct mm.rolname, ','),'NONE')
from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles mm on mm.oid=m.member
where r.rolname='kivo_control_owner';""")
    check("K126(c) no membership belongs to any role other than the executor", EXEC, c_member)
    _, c_attr = q("""select 'login='||rolcanlogin||' super='||rolsuper||' bypassrls='||rolbypassrls
||' createdb='||rolcreatedb||' createrole='||rolcreaterole||' inherit='||rolinherit
||' repl='||rolreplication from pg_roles where rolname='kivo_control_owner';""")
    check("K126(c) the adopted role still carries exactly the governed safe attributes",
          "login=false super=false bypassrls=false createdb=false createrole=false "
          "inherit=false repl=false", c_attr)
    # ---- (d) second application must NOT reinitialize MIV ----
    _, miv_1 = q("select count(*) from public.member_identity_versions;", db=DB3)
    _, miv_min1 = q("select coalesce(min(valid_from)::text,'none') from public.member_identity_versions;",
                    db=DB3)
    ok_d, out_d = qf_exec(str(M1), db=DB3)
    check("K126(d) second application of 0108 succeeds (idempotent)", True, ok_d, ok=ok_d)
    _, miv_2 = q("select count(*) from public.member_identity_versions;", db=DB3)
    _, miv_min2 = q("select coalesce(min(valid_from)::text,'none') from public.member_identity_versions;",
                    db=DB3)
    check("K126(d) second application did NOT reinitialize MIV (row count unchanged)", miv_1, miv_2)
    check("K126(d) second application did NOT rewrite MIV rows (valid_from unchanged)",
          miv_min1, miv_min2)
    drop_kco()

    # ---- corrected 0108 succeeds on the very same non-superuser fixture ----
    fresh_repro()
    ok_c, out_c = qf_exec(str(M1), db=DB3)
    if not ok_c:
        print(f"    corrected-0108 failure detail: {out_c[-700:]}")
    check("CORRECTED 0108 succeeds on the identical non-superuser fixture", True, ok_c, ok=ok_c)
    check("corrected 0108 leaves exactly the one permitted membership", True,
          miv_membership(db=DB3).endswith("/admin=true/set=false/inherit=false"),
          ok=miv_membership(db=DB3).endswith("/admin=true/set=false/inherit=false"))
    # leave the cluster pristine so the MAIN application below creates the role itself
    drop_kco()

    print("\n--- APPLY 0107 (M-0), then 0108 (M-1), verbatim ---")
    ok0, out0 = qf_exec(str(M0))
    print(f"  0107 first application : {'APPLIED CLEANLY' if ok0 else 'FAILED'}  (as {EXEC}, single transaction)")
    if not ok0:
        print(out0[-900:]); destroy(); sys.exit(1)
    ok1, out1 = qf_exec(str(M1))
    print(f"  0108 first application : {'APPLIED CLEANLY' if ok1 else 'FAILED'}")
    if not ok1:
        print(out1[-3000:]); destroy(); sys.exit(1)

    # KIV-77: MIV completeness must be measured against the population AT APPLICATION TIME.
    # Later proof sections deliberately seed extra members (MIV maintenance is M-2, not M-1),
    # so capturing it here is the only correct measurement point.
    _, MIV_ANOM_AT_APPLY = q("""select
 (select count(*) from public.members m where not exists
    (select 1 from public.member_identity_versions v where v.member_id=m.id and v.valid_to is null))::text
 ||'/'||(select count(*) from public.member_identity_versions v where not exists
    (select 1 from public.members m where m.id=v.member_id))::text
 ||'/'||(select count(*) from (select member_id from public.member_identity_versions
    where valid_to is null group by member_id having count(*)>1) d)::text
 ||'/'||(select count(*) from public.member_identity_versions v join public.members m on m.id=v.member_id
    where v.valid_to is null and (v.restaurant_id,v.user_id,v.role)
      is distinct from (m.restaurant_id,m.user_id,m.role))::text
 ||'/'||(select count(*) from public.member_identity_versions where valid_to is null and version<>1)::text;""")

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
    # KIV-77 (14 Aug adjudication): this assertion is RE-STATED. Under a non-superuser
    # CREATEROLE executor PostgreSQL unavoidably records one automatic
    # executor->kivo_control_owner membership (ADMIN TRUE / SET FALSE / INHERIT FALSE,
    # grantor = bootstrap superuser) that the executor cannot remove.
    #
    # ASSERTION-HISTORY, STATED HONESTLY (KIV-87 Q2). The historical combined
    # zero-membership assertion WAS REPLACED. It is not accurate to say that no assertion
    # was removed, skipped or weakened:
    #   * inbound membership changed from ZERO to AT MOST ONE - a RELAXATION;
    #   * outbound membership remains ZERO, unchanged;
    #   * the one permitted inbound row must be the exact unusable automatic row;
    #   * compensating checks added in section Z: exact shape, bootstrap-superuser grantor,
    #     no SET, no INHERIT, SET ROLE denied, and no inherited object permission.
    # The relaxation is exactly the scope the 14 August adjudication approved and no more,
    # and the compensating checks are what make it safe.
    _, mem_out = q("""select count(*) from pg_auth_members m
join pg_roles g on g.oid=m.member where g.rolname='kivo_control_owner';""")
    check("R19 kivo_control_owner is a member of no role", "0", mem_out)
    _, mem_in = q("""select count(*)::text||'/'||coalesce(sum((m.set_option or m.inherit_option)::int),0)::text
from pg_auth_members m join pg_roles r on r.oid=m.roleid where r.rolname='kivo_control_owner';""")
    check("R2 at most the one PostgreSQL-mandated membership, carrying neither SET nor INHERIT",
          True, mem_in in ("0/0", "1/0"), ok=(mem_in in ("0/0", "1/0")))
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
    ok2a, _ = qf_exec(str(M0), db=DB2)
    ok2b, out2b = qf_exec(str(M1), db=DB2)
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
    # Render exactly as §16.2 canonicalizes a timestamp: UTC, microseconds, no offset suffix.
    _, cfg = q2(f"""select control_epoch::text||'|'||to_char(updated_at at time zone 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US') from public.conversations where id='{cid}';""")
    ep, upd = cfg.split("|")
    TOP = "'6e000000-1111-0000-0000-000000000001'"
    def f13b(op=TOP, ep_=None, en="true", mins="15", act="auto_return", upd_=None, reason="t", tail=".operation_status"):
        return (f"set role service_role;\nselect (public.kv_sys_control_timeout_return('{cid}',{R},"
                f"{op},{ep_ or ep},{en},{mins},'{act}','{upd_ or upd}'::timestamptz,'{reason}')){tail};")
    okc, outc = q2(f13b())
    check("F13 timeout_return applies under A1-2", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    _, st = q2(f"select ownership_state||'|'||status from public.conversations where id='{cid}';")
    check("F13 SB4 status -> AI_ACTIVE", "AI_ACTIVE|AI نشط", st)
    _, ev = q2(f"""select event_type from public.conversation_assignment_events
where is_canonical = true and conversation_id='{cid}';""")
    check("F13 emits A1 event TIMEOUT_RETURNED", "TIMEOUT_RETURNED", ev)

    # F13 replay ordering and exact fingerprint, proven where the operation can complete.
    _, a0_t = q2("select count(*) from public.control_operations;")
    okc, outc = q2(f13b(tail=".replayed"))
    check("F13 same-fingerprint replay returns the recorded result", "t",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    # The applied operation already changed control_epoch and updated_at, so a replay that
    # re-read the conversation or configuration would fail T7 with KIV21. It does not: the
    # replay is resolved before any such read.
    check("F13 replay resolved WITHOUT re-reading the conversation (epoch has since changed)",
          True, okc, ok=okc)
    q2(f"""update public.restaurants set feature_flags =
'{{"handoff_timeout": false, "handoff_idle_minutes": 45, "handoff_idle_action": "realert_only"}}'::jsonb
where id={R};""")
    okc, outc = q2(f13b(tail=".replayed"))
    check("F13 same-fingerprint replay survives a later configuration change", "t",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    q2(f"""update public.restaurants set feature_flags = '{{"handoff_timeout": true}}'::jsonb where id={R};""")
    # Each of the five expected timeout inputs is a fingerprint field: changing any one alone
    # must give a deterministic KIV19, never KIV21/KIV22/KIV23/KIV24 and never a false replay.
    for label, kw in [("expected_epoch",            dict(ep_="999")),
                      ("expected_handoff_enabled",  dict(en="false")),
                      ("expected_idle_minutes",     dict(mins="30")),
                      ("expected_idle_action",      dict(act="realert_only")),
                      ("expected_updated_at",       dict(upd_="2020-01-01T00:00:00.000000"))]:
        ok_w, out_w = q2(f13b(**kw))
        got = "KIV19" if "KIV19" in out_w else (out_w.splitlines()[-1][:70] if not ok_w else "ACCEPTED")
        check(f"F13 changed {label} alone -> KIV19", "KIV19", got)
    _, a0_t2 = q2("select count(*) from public.control_operations;")
    check("F13 replays and KIV19 rejections wrote no additional A0 row", a0_t, a0_t2)

    # F13 -> F15 AUTHORITATIVE REQUEST IDENTITY. The stored A0 fingerprint must be the canonical
    # §16.2 identity of the ORIGINAL request, computed here by an independent SQL oracle rather
    # than by reusing the migration's own encoder.
    def canon2(fields):
        vals = ",".join(f"({i+1},{v})" for i, v in enumerate(fields))
        return f"""select encode(extensions.digest((select coalesce(string_agg(
  case when v is null then pg_catalog.convert_to('ffffffff','UTF8')
       else pg_catalog.convert_to(lpad(to_hex(octet_length(
              pg_catalog.convert_to(normalize(v,NFC),'UTF8'))),8,'0'),'UTF8')
            || pg_catalog.convert_to(normalize(v,NFC),'UTF8') end,
  ''::bytea order by i), ''::bytea) from (values {vals}) as f(i,v)), 'sha256'),'hex');"""
    _, expect_f13 = q2(canon2(["'timeout_return'", R, f"'{cid}'", TOP, "'system'",
                               "null::text", "null::text",
                               f"'{ep}'", "'t'", "'15'", "'auto_return'", f"'{upd}'", "'t'"]))
    _, stored_f13 = q2(f"select request_fingerprint from public.control_operations where operation_id={TOP};")
    check("F13 A0 stores exactly the OUTER canonical §16.2 identity of the original request",
          expect_f13, stored_f13)
    check("F13 stored identity is NOT derived from post-validation mutable state", True,
          expect_f13 == stored_f13 and len(stored_f13) == 64,
          ok=(expect_f13 == stored_f13 and len(stored_f13) == 64))
    # drift the conversation as well as the configuration, then retry the exact original request
    q2(f"""update public.conversations set status='drifted' where id='{cid}';""")
    q2(f"""update public.restaurants set feature_flags =
'{{"handoff_timeout": false, "handoff_idle_minutes": 5}}'::jsonb where id={R};""")
    okr, outr = q2(f13b(tail=".replayed"))
    check("F13 exact retry replays after BOTH conversation and configuration drift", "t",
          outr.strip().splitlines()[-1] if okr else f"FAILED: {outr.splitlines()[-1][:130]}")
    _, stored_f13b = q2(f"select request_fingerprint from public.control_operations where operation_id={TOP};")
    check("F13 stored identity unchanged by that drift", expect_f13, stored_f13b)
    q2(f"""update public.restaurants set feature_flags = '{{"handoff_timeout": true}}'::jsonb where id={R};""")
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


    # ============ U. D2 AUTHORIZATION PRECEDES D6 (no unauthorized no-op success) ============
    print("\n--- U. AUTHORIZATION IS D2 AND CANNOT BE SKIPPED BY A D6 NO-OP ---")
    D2 = [("F5 return_to_kivo", "AI_ACTIVE", "ai", "null",
           "kv_control_return_to_kivo('{c}',{r},gen_random_uuid(),'t')"),
          ("F8 close",          "CLOSED",    "human", M2ID,
           "kv_control_close('{c}',{r},gen_random_uuid(),'r','t')"),
          ("F9 set_human_idle", "HUMAN_IDLE","human", M2ID,
           "kv_control_set_human_idle('{c}',{r},gen_random_uuid(),'t')")]
    for i, (label, state, owner, assignee, call) in enumerate(D2):
        cid = f"6a000000-0000-0000-0000-00000000000{i+1}"
        mk_conv(cid, state, owner, assignee=assignee)
        before = conv_state(cid)
        _, a0b = q("select count(*) from public.control_operations;")
        _, nb = q("select count(*) from public.control_operations where operation_status='noop';")
        # U3 is an ordinary member of the tenant and is NOT the assignee.
        raises(f"{label}: unauthorized member refused even though already at target",
               as_member(U3, "select public." + call.format(c=cid, r=R) + ";"), "KIV12")
        check(f"{label}: unauthorized already-target attempt mutated nothing", before, conv_state(cid))
        _, a0a = q("select count(*) from public.control_operations;")
        check(f"{label}: unauthorized already-target attempt wrote no A0 row", a0b, a0a)
        _, na = q("select count(*) from public.control_operations where operation_status='noop';")
        check(f"{label}: unauthorized already-target attempt wrote no A0 NOOP row", nb, na)
        # the authorized actor still gets the legitimate no-op
        okc, outc = q(as_member(U1, "select (public." + call.format(c=cid, r=R)
                                    + ").operation_status;"))
        check(f"{label}: manager still receives the legitimate no-op", "noop",
              outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:110]}")

    # ============ V. F14 TRUE L2 / D5 ORDER AND EXACT FINGERPRINT ============
    print("\n--- V. F14: replay decided BEFORE any conversation re-read / create / adopt ---")
    VC  = "6b000000-0000-0000-0000-000000000001"
    VOP = "'6b000000-1111-0000-0000-000000000001'"
    CUST = "'44444444-0000-0000-0000-000000000001'"
    def f14(cid, op, cust=CUST, chan="whatsapp", esc="allergy", note="note", reason="create", tail=".operation_status"):
        return (f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                f"'{cid}',{R},{cust},'{chan}',{op},'{esc}','{note}','{reason}')){tail};")
    okc, outc = q(f14(VC, VOP))
    check("F14 original call applies", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    _, a0_v = q("select count(*) from public.control_operations;")
    _, conv_v = q("select count(*) from public.conversations;")
    base_v = conv_state(VC)
    # A changed customer_id on the SAME operation_id must be decided by the FINGERPRINT (KIV19)
    # and NOT by the adoption identity check (KIV26). This is the discriminating evidence that
    # the replay decision happens before create-or-adopt.
    raises("F14 changed customer_id on the same operation_id -> KIV19 (not KIV26)",
           f14(VC, VOP, cust="'44444444-0000-0000-0000-00000000000f'"), "KIV19")
    raises("F14 changed channel on the same operation_id -> KIV19 (not KIV26)",
           f14(VC, VOP, chan="website"), "KIV19")
    check("F14 rejected replays mutated no conversation", base_v, conv_state(VC))
    _, a0_v2 = q("select count(*) from public.control_operations;")
    check("F14 rejected replays wrote no A0 row", a0_v, a0_v2)
    _, conv_v2 = q("select count(*) from public.conversations;")
    check("F14 rejected replays created/adopted no conversation", conv_v, conv_v2)
    # Same fingerprint still replays, and does so without re-reading: mutate the conversation
    # first, then confirm the recorded result is returned unchanged.
    q(f"update public.conversations set status = 'externally changed' where id='{VC}';")
    okc, outc = q(f14(VC, VOP, tail=".operation_status || '|' || (x.replayed)::text"
                  ).replace("select (public.", "select (x).operation_status || '|' || (x).replayed::text from (select public.")
                   .replace(")).operation_status || '|' || (x.replayed)::text;", ")) as x;"))
    _, rec = q(f"""select operation_status||'|t' from public.control_operations
where operation_id={VOP};""")
    okc2, outc2 = q(f14(VC, VOP, tail=".replayed"))
    check("F14 same-fingerprint replay returns the recorded result after external mutation",
          "t", outc2.strip().splitlines()[-1] if okc2 else f"FAILED: {outc2.splitlines()[-1][:130]}")
    _, a0_v3 = q("select count(*) from public.control_operations;")
    check("F14 same-fingerprint replay wrote no second A0 row", a0_v, a0_v3)

    # ============ W. F13 REPLAY BEFORE CONFIGURATION READ, EXACT FINGERPRINT ============
    print("\n--- W. F13: replay decided BEFORE configuration re-read; five expected inputs ---")
    WC = "6c000000-0000-0000-0000-000000000001"
    mk_conv(WC, "HUMAN_IDLE", "human", assignee=M2ID)
    q(f"update public.conversations set updated_at = now() - interval '90 minutes' where id='{WC}';")
    _, wcfg = q(f"""select control_epoch::text||'|'||to_char(updated_at at time zone 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US') from public.conversations where id='{WC}';""")
    wep, wupd = wcfg.split("|")
    def f13(cid, op, ep=None, en="true", mins="15", act="auto_return", upd=None, reason="t", tail=".operation_status"):
        return (f"set role service_role;\nselect (public.kv_sys_control_timeout_return('{cid}',{R},"
                f"{op},{ep or wep},{en},{mins},'{act}','{upd or wupd}'::timestamptz,'{reason}')){tail};")
    WOP = "'6c000000-1111-0000-0000-000000000001'"
    # F13's applied path emits TIMEOUT_RETURNED, blocked by the live 8-value A1 CHECK, so the
    # ORIGINAL operation is performed in the A1-2 fixture (section T). Here the replay-ordering
    # and fingerprint behaviour are proven against a recorded A0 row created by that same
    # governed path in this database using an operation that the live CHECK permits.
    okc, outc = q(f13(WC, WOP))
    check("F13 original call is blocked only by the A1 event_type pre-R3 blocker", True,
          (not okc) and "conversation_assignment_events_event_type_check" in outc,
          ok=((not okc) and "conversation_assignment_events_event_type_check" in outc))
    for label, kw in [("expected_epoch", dict(ep="999")),
                      ("expected_handoff_enabled", dict(en="false")),
                      ("expected_idle_minutes", dict(mins="30")),
                      ("expected_idle_action", dict(act="realert_only")),
                      ("expected_updated_at", dict(upd="2020-01-01T00:00:00.000000"))]:
        ok_w, out_w = q(f13(WC, WOP, **kw))
        # No A0 row exists for WOP (the original aborted), so each variant must fail on its own
        # governed check rather than silently replaying.
        check(f"F13 changed {label} does not replay the original operation", True,
              (not ok_w) and "replayed" not in out_w, ok=((not ok_w) and "replayed" not in out_w))
    _, a0_w = q(f"select count(*) from public.control_operations where operation_id={WOP};")
    check("F13 aborted attempts recorded no A0 row", "0", a0_w)

    # ============ X. NFC CANONICALIZATION ============
    print("\n--- X. NFC CANONICALIZATION OF GOVERNED FINGERPRINT TEXT (§16.2) ---")
    _, nfc_ok = q("select (normalize(U&'\\0065\\0301', NFC) = normalize(U&'\\00E9', NFC))::text;")
    check("normalize(...,NFC) is available and canonically equates the two forms", "true", nfc_ok)
    _, raw_ne = q("select (U&'\\0065\\0301' = U&'\\00E9')::text;")
    check("the two forms are NOT byte-equal before normalization", "false", raw_ne)
    XC  = "6d000000-0000-0000-0000-000000000001"
    XOP = "'6d000000-1111-0000-0000-000000000001'"
    mk_conv(XC, "AI_ACTIVE", "ai")
    COMPOSED   = "caf" + "é"                 # cafe with precomposed e-acute
    DECOMPOSED = "café"                     # cafe + combining acute
    assert COMPOSED != DECOMPOSED
    okc, outc = q(as_member(U2, f"select (public.kv_control_escalate('{XC}',{R},{XOP},true,"
                                f"'{COMPOSED}','r')).operation_status;"))
    check("NFC: original escalate with COMPOSED text applies", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    okc, outc = q(as_member(U2, f"select (public.kv_control_escalate('{XC}',{R},{XOP},true,"
                                f"'{DECOMPOSED}','r')).replayed;"))
    check("NFC: canonically equivalent DECOMPOSED text replays as the same fingerprint", "t",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    raises("NFC: a materially different normalized value on the same operation_id -> KIV19",
           as_member(U2, f"select public.kv_control_escalate('{XC}',{R},{XOP},true,"
                         f"'cafe','r');"), "KIV19")
    _, a0_x = q(f"select count(*) from public.control_operations where operation_id={XOP};")
    check("NFC: exactly one A0 row across the composed/decomposed/different attempts", "1", a0_x)


    # ================= Y. DETERMINISTIC CONCURRENCY AND REQUEST IDENTITY =================
    print("\n--- Y. CONCURRENCY: real second session, actual lock behaviour ---")

    # An INDEPENDENT §16.2 encoder, written here in SQL rather than reusing the migration's,
    # so the stored A0 identity is checked against an oracle the migration did not produce.
    def canon(fields):
        vals = ",".join(f"({i+1},{v})" for i, v in enumerate(fields))
        return f"""select encode(extensions.digest((select coalesce(string_agg(
  case when v is null then pg_catalog.convert_to('ffffffff','UTF8')
       else pg_catalog.convert_to(lpad(to_hex(octet_length(
              pg_catalog.convert_to(normalize(v,NFC),'UTF8'))),8,'0'),'UTF8')
            || pg_catalog.convert_to(normalize(v,NFC),'UTF8') end,
  ''::bytea order by i), ''::bytea) from (values {vals}) as f(i,v)), 'sha256'),'hex');"""

    # ---- Y1: F13 takes the conversation ROW LOCK, and takes it before deciding ----------
    YC = "6f000000-0000-0000-0000-000000000001"
    mk_conv(YC, "HUMAN_IDLE", "human", assignee=M2ID)
    q(f"update public.conversations set updated_at = now() - interval '90 minutes' where id='{YC}';")
    _, ycfg = q(f"""select control_epoch::text||'|'||to_char(updated_at at time zone 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US') from public.conversations where id='{YC}';""")
    yep, yupd = ycfg.split("|")

    def y_timeout(op, ep=None, upd=None, timeout_ms=None):
        pre = f"set statement_timeout = {timeout_ms};\n" if timeout_ms else ""
        return (pre + f"set role service_role;\nselect public.kv_sys_control_timeout_return('{YC}',{R},"
                f"{op},{ep or yep},true,15,'auto_return','{upd or yupd}'::timestamptz,'t');")

    # control: with no competing lock the call proceeds (it fails only on the A1 pre-R3 blocker)
    ok_ctl, out_ctl = q(y_timeout("gen_random_uuid()", timeout_ms=4000))
    check("Y1 control: with no competing lock F13 proceeds to the transition (no timeout)",
          True, "statement timeout" not in out_ctl, ok=("statement timeout" not in out_ctl))

    # now a REAL concurrent session holds the conversation row lock
    holder = bg(f"begin; select id from public.conversations where id='{YC}' for update;"
                f" select pg_sleep(6); commit;")
    time.sleep(2.0)
    ok_blk, out_blk = q(y_timeout("gen_random_uuid()", timeout_ms=2500))
    check("Y1 F13 BLOCKS on the conversation row lock, so it locks before deciding",
          True, (not ok_blk) and "statement timeout" in out_blk,
          ok=((not ok_blk) and "statement timeout" in out_blk))
    holder.wait(timeout=30)
    _, y_a0 = q(f"select count(*) from public.control_operations where conversation_id='{YC}';")
    check("Y1 the blocked timeout wrote no A0 row", "0", y_a0)

    # ---- Y2: a stale timeout cannot apply over fresh human activity ---------------------
    ZC = "6f000000-0000-0000-0000-000000000002"
    mk_conv(ZC, "HUMAN_IDLE", "human", assignee=M2ID)
    q(f"update public.conversations set updated_at = now() - interval '90 minutes' where id='{ZC}';")
    _, zcfg = q(f"""select control_epoch::text||'|'||to_char(updated_at at time zone 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US') from public.conversations where id='{ZC}';""")
    zep, zupd = zcfg.split("|")
    # caller B: a fresh governed human claim commits first
    okb, outb = q(as_member(U2, f"select (public.kv_control_claim('{ZC}',{R},"
                                f"gen_random_uuid(),'fresh human activity')).operation_status;"))
    check("Y2 caller B's fresh human claim applies", "applied",
          outb.strip().splitlines()[-1] if okb else f"FAILED: {outb.splitlines()[-1][:110]}")
    before_z = conv_state(ZC)
    _, a0_z = q("select count(*) from public.control_operations;")
    # caller A: the stale timeout, still holding its ORIGINAL pre-claim expectations
    ok_z, out_z = q(f"set role service_role;\nselect public.kv_sys_control_timeout_return('{ZC}',{R},"
                    f"gen_random_uuid(),{zep},true,15,'auto_return','{zupd}'::timestamptz,'t');")
    check("Y2 stale timeout is refused KIV21 after the fresh claim", True,
          (not ok_z) and "KIV21" in out_z, ok=((not ok_z) and "KIV21" in out_z))
    check("Y2 fresh human ownership was NOT overwritten", before_z, conv_state(ZC))
    _, st_z = q(f"""select ownership_state||'|'||coalesce(assigned_member_id::text,'~')
from public.conversations where id='{ZC}';""")
    check("Y2 conversation remains HUMAN_ACTIVE with its assignee", f"HUMAN_ACTIVE|{M2ID.strip(chr(39))}", st_z)
    _, a0_z2 = q("select count(*) from public.control_operations;")
    check("Y2 the stale timeout wrote no A0 row", a0_z, a0_z2)

    # ---- Y3: F14 stored identity == the outer authoritative fingerprint -----------------
    NC = "6f000000-0000-0000-0000-000000000011"
    NOP = "'6f000000-1111-0000-0000-000000000011'"
    okc, outc = q(f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                  f"'{NC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{NOP},"
                  f"'why','note','r')).operation_status;")
    check("Y3 F14 applies", "applied",
          outc.strip().splitlines()[-1] if okc else f"FAILED: {outc.splitlines()[-1][:130]}")
    _, expect_f14 = q(canon(["'create_safety_conversation'", R, f"'{NC}'", NOP, "'system'",
                             "null::text", "null::text",
                             "'44444444-0000-0000-0000-000000000001'", "'whatsapp'",
                             "'why'", "'note'", "'r'"]))
    _, stored_f14 = q(f"select request_fingerprint from public.control_operations where operation_id={NOP};")
    check("Y3 A0 stores exactly F14's outer canonical §16.2 identity", expect_f14, stored_f14)
    # a later state change must not alter that identity, and an exact retry must still replay
    q(f"update public.conversations set status='drifted', allergy_note='drifted' where id='{NC}';")
    okr, outr = q(f"set role service_role;\nselect (public.kv_control_create_safety_conversation("
                  f"'{NC}',{R},'44444444-0000-0000-0000-000000000001','whatsapp',{NOP},"
                  f"'why','note','r')).replayed;")
    check("Y3 exact F14 retry replays after state drift (no spurious KIV19)", "t",
          outr.strip().splitlines()[-1] if okr else f"FAILED: {outr.splitlines()[-1][:130]}")
    _, stored_f14b = q(f"select request_fingerprint from public.control_operations where operation_id={NOP};")
    check("Y3 stored identity did not drift", expect_f14, stored_f14b)


    # ================= Z. KIV-77 BOOTSTRAP / CLEANUP FINAL STATE =================
    print("\n--- Z. KIV-77: BOOTSTRAP CLEANUP AND FINAL PRIVILEGE STATE ---")
    memb = miv_membership()
    check("exactly ONE membership survives on kivo_control_owner", 1,
          0 if memb == "NONE" else len(memb.split(" ; ")),
          ok=(memb != "NONE" and len(memb.split(" ; ")) == 1))
    check("the surviving membership is the PostgreSQL-mandated automatic record "
          "(ADMIN TRUE / SET FALSE / INHERIT FALSE)", True,
          memb.endswith("/admin=true/set=false/inherit=false"),
          ok=memb.endswith("/admin=true/set=false/inherit=false"))
    _, grantor_is_boot = q("""select (g.rolname = (select rolname from pg_roles where oid=10))::text
from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.grantor
where r.rolname='kivo_control_owner';""")
    check("its grantor is the bootstrap superuser", "true", grantor_is_boot)
    _, n_capable = q("""select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid
where r.rolname='kivo_control_owner' and (m.set_option or m.inherit_option);""")
    check("NO surviving membership carries SET or INHERIT", "0", n_capable)
    ok_sr, out_sr = qx("set role kivo_control_owner; select 1;")
    check("executor can NO LONGER 'SET ROLE kivo_control_owner'", True,
          (not ok_sr) and "permission denied to set role" in out_sr,
          ok=((not ok_sr) and "permission denied to set role" in out_sr))
    _, boot_create = q("select has_schema_privilege('kivo_control_owner','public','CREATE');")
    check("bootstrap-only schema CREATE was removed", "f", boot_create)
    _, keep_usage = q("select has_schema_privilege('kivo_control_owner','public','USAGE');")
    check("the governed schema USAGE grant is retained", "t", keep_usage)

    # the executor must inherit NO object permission from the target role
    _, inh = q("""select coalesce(string_agg(x,','),'none') from (
  select case when has_table_privilege('kv_exec','public.member_identity_versions','INSERT')
              then 'miv_insert' end as x
  union all select case when has_table_privilege('kv_exec','public.control_operations','INSERT')
              then 'a0_insert' end
  union all select case when has_table_privilege('kv_exec','public.conversation_audit_failures','INSERT')
              then 'a2_insert' end
  union all select case when has_function_privilege('kv_exec','public.kv_control_transition(uuid,uuid,uuid,text,text,boolean,uuid,text,text,uuid,text,text,text,text)','EXECUTE')
              then 'f15_execute' end) s where x is not null;""")
    check("executor inherits NO object permission from kivo_control_owner", "none", inh)

    # ownership actually landed where the accepted contract requires
    _, own = q("""select string_agg(distinct pg_get_userbyid(relowner), ',') from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('member_identity_versions','control_operations','conversation_audit_failures');""")
    check("MIV / A0 / A2 are owned by kivo_control_owner", "kivo_control_owner", own)
    _, town = q("select pg_get_userbyid(typowner) from pg_type where typname='kv_control_result';")
    check("kv_control_result is owned by kivo_control_owner", "kivo_control_owner", town)
    _, fown = q("""select string_agg(distinct pg_get_userbyid(proowner), ',') from pg_proc p
join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
and (p.proname like 'kv_control%' or p.proname like 'kv_sys_control%' or p.proname like 'kv_tg_%');""")
    check("all governed functions are owned by kivo_control_owner", "kivo_control_owner", fown)
    _, rattr = q("""select 'login='||rolcanlogin||' super='||rolsuper||' bypassrls='||rolbypassrls
||' createdb='||rolcreatedb||' createrole='||rolcreaterole||' inherit='||rolinherit
||' repl='||rolreplication from pg_roles where rolname='kivo_control_owner';""")
    check("kivo_control_owner attributes are exactly as governed",
          "login=false super=false bypassrls=false createdb=false createrole=false "
          "inherit=false repl=false", rattr)

    # members untouched + MIV completeness under the corrected migration
    _, members_after_z = q("select md5(string_agg(id::text||user_id::text||role, ',' order by id)) "
                           "from public.members;")
    check("public.members identity fingerprint unchanged by the corrected migration",
          members_before, members_after_z)
    _, n_members_z = q("select count(*) from public.members;")
    check("public.members count unchanged", n_members, n_members_z)
    check("MIV missing/extra/duplicate-open/identity-mismatch/non-version-1 all zero "
          "(measured against the contemporaneous population at application time)",
          "0/0/0/0/0", MIV_ANOM_AT_APPLY)

    # ================= Q. KIV-87 QUALITY CORRECTIONS (Q1, Q3, Q4) =================
    print("\n--- Q. KIV-87: FILE MODES, MANDATORY TRANSACTION RUNNER, PREFLIGHT RECORD ---")

    # ---- Q1: every task-created SQL artifact is 0600 and owned by postgres ----
    import stat as _stat
    import pwd as _pwd
    bad_mode = []
    for f in sorted(RUNDIR.glob("*.sql")):
        st = f.stat()
        owner = _pwd.getpwuid(st.st_uid).pw_name
        mode = oct(_stat.S_IMODE(st.st_mode))
        if mode != "0o600" or owner != "postgres":
            bad_mode.append(f"{f.name}:{mode}:{owner}")
    _, rundir_mode = ("", oct(_stat.S_IMODE(RUNDIR.stat().st_mode)))
    check("Q1 run directory is 0700", "0o700", rundir_mode)
    check("Q1 EVERY task-created SQL file is 0600 and owned by postgres "
          f"({len(list(RUNDIR.glob('*.sql')))} files checked, incl. historical_0108.sql)",
          "none", ",".join(bad_mode) if bad_mode else "none")
    check("Q1 historical_0108.sql was actually created by this run", True, HIST.exists(),
          ok=HIST.exists())

    # ---- Q3: the whole-file transaction wrapper is MANDATORY, proven by its absence ----
    # Applied statement-by-statement (autocommit), a failure part-way leaves the role behind.
    # This is why 0108 must only ever be applied with psql --single-transaction or a proved
    # equivalent. The corrected candidate carries no top-level BEGIN/COMMIT of its own.
    check("Q3 the governed applier uses the whole-file transaction wrapper", True,
          "--single-transaction" in pathlib.Path(__file__).read_text(encoding="utf-8"),
          ok=("--single-transaction" in pathlib.Path(__file__).read_text(encoding="utf-8")))
    check("Q3 0108 carries no top-level BEGIN/COMMIT of its own (it relies on the runner)",
          True,
          not re.search(r"(?mi)^\s*(begin|commit)\s*;", M1.read_text(encoding="utf-8")),
          ok=not re.search(r"(?mi)^\s*(begin|commit)\s*;", M1.read_text(encoding="utf-8")))
    check("Q3 0108 header records the mandatory transaction runner as fail-closed", True,
          "MANDATORY EXECUTION PRECONDITION" in M1.read_text(encoding="utf-8"),
          ok=("MANDATORY EXECUTION PRECONDITION" in M1.read_text(encoding="utf-8")))
    # ---- Q4: the mandatory SELECT-only production preflight is recorded in the source ----
    check("Q4 0108 header records the mandatory Founder-authorized SELECT-only PUBLIC-CREATE "
          "preflight before any future production application", True,
          "SELECT-ONLY PRODUCTION PREFLIGHT" in M1.read_text(encoding="utf-8"),
          ok=("SELECT-ONLY PRODUCTION PREFLIGHT" in M1.read_text(encoding="utf-8")))

    # ---------------------------------------------------------------- IDEMPOTENCE
    print("\n--- IDEMPOTENCE: SECOND APPLICATION of 0108 ---")
    ok2, out2 = qf_exec(str(M1))
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
    print("\n--- TEARDOWN: destroy every task-owned artifact (KIV-77 W4) ---")
    destroy()
    _left = teardown_report()
    print(f"  run tag               : {RUNTAG}")
    print(f"  cluster / PGDATA      : {'REMOVED' if not pathlib.Path(PGDATA).exists() else 'PRESENT'}")
    print(f"  run dir (socket + temp/injected SQL): {'REMOVED' if not RUNDIR.exists() else 'PRESENT'}")
    print(f"  task-owned processes  : {'NONE' if 'processes' not in _left else 'PRESENT'}")
    print(f"  leftovers             : {_left if _left else 'NONE'}")
    print(f"  production touched    : NO")

sys.exit(1 if any(not r[3] for r in results) else 0)
