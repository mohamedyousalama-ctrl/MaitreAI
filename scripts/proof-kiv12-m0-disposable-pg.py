#!/usr/bin/env python3
"""KIV-12 / CTRL-03 — M-0 constraint pre-stage: disposable-PostgreSQL proof.

Independently re-runnable primary evidence for the M-0 contract. Provisions a
throwaway local PostgreSQL cluster, rebuilds the governed pre-M0 shape of
public.conversations, applies supabase/migrations/0107_kiv12_m0_constraint_prestage.sql
verbatim, asserts the M-0 contract, then destroys the cluster.

LOCAL DISPOSABLE POSTGRESQL ONLY. This script never contacts production, reads no
production credential, and opens no network listener — the cluster it creates is
reachable only over a unix socket (listen_addresses='').

Usage:  sudo python3 scripts/proof-kiv12-m0-disposable-pg.py
Exit 0 = every assertion passed. Exit 1 = at least one failed, or setup failed.

Recovered from the original Builder proof script (session scratchpad `m0_proof.py`).
Proof logic and every assertion are preserved; this version adds the provenance
header, self-provisioning of the cluster and its destruction, so the transcript is
independently inspectable rather than merely trusted.
"""
import subprocess, hashlib, pathlib, sys, re, os, shutil

# ── paths and constants ──────────────────────────────────────────────────────
SELF = pathlib.Path(__file__).resolve()
ROOT = SELF.parent.parent
MIG = ROOT / "supabase/migrations/0107_kiv12_m0_constraint_prestage.sql"
EXPECTED_MIG_SHA = "3c40c6280b99d6f8a78c5081054b25d3438d47f205f2646c66796e4adefc74a6"

PGBIN = "/usr/lib/postgresql/16/bin"
PGDATA = "/var/lib/postgresql/kiv12_m0_proof"     # disposable; destroyed at the end
PORT, DB, USER = "55432", "kivo_m0", "kivoproof"
SOCK = "/tmp"
SCRATCH = pathlib.Path("/tmp/kiv12_m0_q.sql")

results = []


def sh(cmd, as_postgres=True):
    """Run a shell command, as the postgres system user when required."""
    argv = ["su", "postgres", "-c", cmd] if as_postgres else ["bash", "-lc", cmd]
    return subprocess.run(argv, capture_output=True, text=True)


def git(args):
    p = subprocess.run(["git", "-C", str(ROOT)] + args, capture_output=True, text=True)
    return p.stdout.strip() if p.returncode == 0 else f"<unavailable: {p.stderr.strip()[:60]}>"


def q(sql, db=DB):
    """Run SQL through a file (su -c mangles embedded newlines). -> (ok, output|error)."""
    SCRATCH.write_text(sql, encoding="utf-8")
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


def rejects(label, sql, want_constraint):
    """Assert an INSERT is rejected, and rejected by the NAMED constraint."""
    ok, out = q(sql)
    if ok:
        return check(label, f"rejected by {want_constraint}", "ACCEPTED (constraint did not fire)", ok=False)
    m = re.search(r'violates check constraint "([^"]+)"|violates unique constraint "([^"]+)"', out)
    got = (m.group(1) or m.group(2)) if m else out.splitlines()[0][:90]
    return check(label, f"rejected by {want_constraint}", f"rejected by {got}", ok=(got == want_constraint))


def accepts(label, sql):
    ok, out = q(sql)
    return check(label, "accepted", "accepted" if ok else f"REJECTED: {out.splitlines()[0][:90]}", ok=ok)


def destroy():
    """Stop and delete the disposable cluster. Safe to call more than once."""
    sh(f'{PGBIN}/pg_ctl -D {PGDATA} stop -m fast')
    shutil.rmtree(PGDATA, ignore_errors=True)
    SCRATCH.unlink(missing_ok=True)


# ── provenance header ────────────────────────────────────────────────────────
print("=" * 78)
print("KIV-12 / CTRL-03 — M-0 CONSTRAINT PRE-STAGE — DISPOSABLE POSTGRESQL PROOF")
print("=" * 78)
mig_bytes = MIG.read_bytes()
mig_sha = hashlib.sha256(mig_bytes).hexdigest()
print("--- PROVENANCE ---")
print(f"  repository          : {ROOT}")
print(f"  git branch          : {git(['rev-parse', '--abbrev-ref', 'HEAD'])}")
print(f"  git HEAD            : {git(['rev-parse', 'HEAD'])}")
print(f"  git tree state      : {'clean' if git(['status', '--porcelain']) == '' else 'DIRTY (uncommitted changes present)'}")
print(f"  proof script        : {SELF.relative_to(ROOT)}")
print(f"  proof script sha256 : {hashlib.sha256(SELF.read_bytes()).hexdigest()}")
print(f"  migration path      : {MIG.relative_to(ROOT)}")
print(f"  migration bytes     : {len(mig_bytes)}")
print(f"  migration sha256    : {mig_sha}")
print(f"  migration git blob  : {git(['hash-object', str(MIG)])}")
print(f"  migration blob@HEAD : {git(['rev-parse', 'HEAD:supabase/migrations/0107_kiv12_m0_constraint_prestage.sql'])}")
print(f"  expected sha256     : {EXPECTED_MIG_SHA}")
print(f"  sha256 match        : {'YES' if mig_sha == EXPECTED_MIG_SHA else 'NO — ABORT'}")
if mig_sha != EXPECTED_MIG_SHA:
    print("MIGRATION BYTES DIFFER FROM THE GOVERNED ARTIFACT — refusing to run.")
    sys.exit(1)

print("--- ENVIRONMENT ---")
print(f"  class               : DISPOSABLE LOCAL — created by this script, destroyed at the end")
print(f"  PGDATA              : {PGDATA}")
print(f"  port                : {PORT}   (unix socket dir {SOCK}; listen_addresses='' — no TCP listener)")
print(f"  database            : {DB}")
print(f"  production contact  : NONE — no production host, credential or network egress is used")

# ── provision ────────────────────────────────────────────────────────────────
print("\n--- PROVISION DISPOSABLE CLUSTER ---")
destroy()
os.makedirs(PGDATA, exist_ok=True)
shutil.chown(PGDATA, user="postgres")
os.chmod(PGDATA, 0o700)
p = sh(f'{PGBIN}/initdb -D {PGDATA} -U {USER} --auth=trust -E UTF8')
print(f"  initdb              : {'OK' if p.returncode == 0 else 'FAILED'}")
if p.returncode != 0:
    print(p.stderr[-800:]); sys.exit(1)
p = sh(f"{PGBIN}/pg_ctl -D {PGDATA} -o '-p {PORT} -k {SOCK} -c listen_addresses=' -l {PGDATA}/server.log start -w")
print(f"  pg_ctl start        : {'OK' if p.returncode == 0 else 'FAILED'}")
if p.returncode != 0:
    print(p.stdout[-400:], p.stderr[-800:]); destroy(); sys.exit(1)
ok, ver = q("select version();", db="postgres")
print(f"  server version      : {ver}")

try:
    q(f"drop database if exists {DB};", db="postgres")
    q(f"create database {DB};", db="postgres")

    # ── baseline: governed pre-M0 shape ──────────────────────────────────────
    print("\n--- BASELINE: governed pre-M0 shape of public.conversations ---")
    print("  sources: 0001_init (id/restaurant_id/channel), 0028 (is_safety_hold), 0032 (ownership_state + CHECK)")
    BASE = """
create table public.restaurants (id uuid primary key default gen_random_uuid());
create table public.members (id uuid primary key default gen_random_uuid());
create table public.customers (id uuid primary key default gen_random_uuid());
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'AI نشط',
  owner text not null default 'ai',
  assigned_member_id uuid references public.members(id) on delete set null,
  escalation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_safety_hold boolean not null default false,
  ownership_state text not null default 'AI_ACTIVE'
);
alter table public.conversations
  add constraint conversations_ownership_state_check
  check (ownership_state in ('AI_ACTIVE','HUMAN_ACTIVE','HUMAN_IDLE','SYSTEM_HOLD','CLOSED'));
insert into public.restaurants (id) values ('11111111-1111-1111-1111-111111111111');
"""
    ok, out = q(BASE)
    print("  baseline built" if ok else f"  BASELINE FAILED: {out}")
    if not ok:
        destroy(); sys.exit(1)

    # Existing-shaped rows that must survive M-0 (mirrors the accepted KIV-11 entry
    # evidence: only permitted channels; every safety hold in a governed held state).
    SEED = """
insert into public.conversations (id, restaurant_id, channel, ownership_state, is_safety_hold) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','whatsapp','AI_ACTIVE',   false),
 ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','whatsapp','HUMAN_ACTIVE',false),
 ('aaaaaaaa-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','whatsapp','SYSTEM_HOLD', true),
 ('aaaaaaaa-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','website', 'HUMAN_IDLE',  true),
 ('aaaaaaaa-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','whatsapp','HUMAN_ACTIVE',true),
 ('aaaaaaaa-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','whatsapp','CLOSED',      false);
"""
    q(SEED)
    _, seed_n = q("select count(*) from public.conversations;")
    FINGERPRINT = ("select md5(string_agg(id::text||'|'||channel||'|'||ownership_state||'|'||"
                   "is_safety_hold::text, ',' order by id)) from public.conversations;")
    _, fp_before = q(FINGERPRINT)
    print(f"  seeded rows: {seed_n}   data fingerprint: {fp_before}")

    CAT = {
        "tables":    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';",
        "functions": "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';",
        "triggers":  "select count(*) from pg_trigger where not tgisinternal;",
        "policies":  "select count(*) from pg_policies where schemaname='public';",
        "roles":     "select count(*) from pg_roles;",
        "indexes":   "select count(*) from pg_indexes where schemaname='public';",
    }
    before = {k: q(v)[1] for k, v in CAT.items()}
    print(f"  pre-M0 catalog: {before}")

    # ── first application ────────────────────────────────────────────────────
    print("\n--- FIRST APPLICATION of 0107 (verbatim repository file) ---")
    ok, out = qf(str(MIG))
    print(f"  result: {'APPLIED CLEANLY (exit 0)' if ok else 'APPLY FAILED'}")
    if out:
        print(f"  psql output: {out[:400]}")
    if not ok:
        destroy(); sys.exit(1)
    after = {k: q(v)[1] for k, v in CAT.items()}
    print(f"  post-M0 catalog: {after}")

    print("\n--- CONSTRAINT CATALOG READ-BACK (pg_constraint) ---")
    _, cat = q("""select conname||' | contype='||contype::text||' | convalidated='||convalidated::text
||' | '||pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.conversations'::regclass order by conname;""")
    for line in cat.split("\n"):
        print(f"    {line}")

    print("\n--- INDEX READ-BACK (pg_indexes) ---")
    _, ix = q("select indexname||' | '||indexdef from pg_indexes where schemaname='public' and tablename='conversations' order by indexname;")
    for line in ix.split("\n"):
        print(f"    {line}")

    # ── assertions ───────────────────────────────────────────────────────────
    print("\n--- PROOF 1: the three constraints exist with their exact names ---")
    for name, kind in (("conversations_restaurant_id_id_key", "u"),
                       ("conversations_channel_v1_check", "c"),
                       ("conversations_safety_state_check", "c")):
        _, got = q(f"select contype from pg_constraint where conname='{name}' "
                   f"and conrelid='public.conversations'::regclass;")
        check(f"{name} exists (contype {kind})", kind, got)

    print("\n--- PROOF 2: UNIQUE covers exactly (restaurant_id, id) ---")
    _, cols = q("""select string_agg(a.attname, ',' order by k.ord)
from pg_constraint c
cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
where c.conname='conversations_restaurant_id_id_key'
  and c.conrelid='public.conversations'::regclass;""")
    check("UNIQUE column list, in order", "restaurant_id,id", cols)
    _, ncols = q("select cardinality(conkey) from pg_constraint where conname='conversations_restaurant_id_id_key';")
    check("UNIQUE covers exactly 2 columns", "2", ncols)

    print("\n--- PROOF 3: all three constraints are VALID ---")
    _, inval = q("""select coalesce(string_agg(conname, ','), 'none') from pg_constraint
where conrelid='public.conversations'::regclass and convalidated = false;""")
    check("constraints NOT validated", "none", inval)
    _, val3 = q("""select count(*) from pg_constraint where conrelid='public.conversations'::regclass
and convalidated = true and conname in ('conversations_restaurant_id_id_key',
'conversations_channel_v1_check','conversations_safety_state_check');""")
    check("M-0 constraints marked VALID", "3", val3)

    R = "'11111111-1111-1111-1111-111111111111'"

    print("\n--- PROOF 4: channel CHECK permits whatsapp and website ---")
    accepts("channel 'whatsapp' accepted",
            f"insert into public.conversations (restaurant_id, channel) values ({R},'whatsapp');")
    accepts("channel 'website' accepted",
            f"insert into public.conversations (restaurant_id, channel) values ({R},'website');")
    accepts("channel default ('whatsapp') accepted",
            f"insert into public.conversations (restaurant_id) values ({R});")

    print("\n--- PROOF 5: channel CHECK rejects every disallowed value ---")
    for bad in ("instagram", "facebook", "google", "voice", "console_command", "", "WHATSAPP"):
        rejects(f"channel '{bad}' rejected",
                f"insert into public.conversations (restaurant_id, channel) values ({R},'{bad}');",
                "conversations_channel_v1_check")

    print("\n--- PROOF 6: safety-state CHECK permits the governed valid held states ---")
    for st in ("SYSTEM_HOLD", "HUMAN_ACTIVE", "HUMAN_IDLE"):
        accepts(f"is_safety_hold=true with {st} accepted",
                f"insert into public.conversations (restaurant_id, ownership_state, is_safety_hold) "
                f"values ({R},'{st}',true);")

    print("\n--- PROOF 7: safety-state CHECK rejects invalid held states ---")
    for st in ("AI_ACTIVE", "CLOSED"):
        rejects(f"is_safety_hold=true with {st} rejected",
                f"insert into public.conversations (restaurant_id, ownership_state, is_safety_hold) "
                f"values ({R},'{st}',true);",
                "conversations_safety_state_check")

    print("\n--- PROOF 8: unheld rows remain unconstrained by state ---")
    for st in ("AI_ACTIVE", "HUMAN_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD", "CLOSED"):
        accepts(f"is_safety_hold=false with {st} accepted",
                f"insert into public.conversations (restaurant_id, ownership_state, is_safety_hold) "
                f"values ({R},'{st}',false);")

    print("\n--- PROOF 9: pre-existing valid rows survived unchanged ---")
    _, fp_seed_after = q("""select md5(string_agg(id::text||'|'||channel||'|'||ownership_state||'|'||
is_safety_hold::text, ',' order by id)) from public.conversations
where id::text like 'aaaaaaaa-%';""")
    check("seeded-row fingerprint unchanged by M-0", fp_before, fp_seed_after)
    _, seed_after_n = q("select count(*) from public.conversations where id::text like 'aaaaaaaa-%';")
    check("seeded row count unchanged", seed_n, seed_after_n)

    print("\n--- PROOF 10: M-0 introduced no M1/M2 material ---")
    for k in CAT:
        if k == "indexes":
            # A UNIQUE constraint necessarily creates its own backing index, so the correct
            # assertion is +1 and that the one new index IS the constraint's own (next check).
            check("public indexes: exactly +1 (the UNIQUE constraint's backing index)",
                  str(int(before[k]) + 1), after[k])
        else:
            check(f"public {k} count unchanged by 0107", before[k], after[k])
    _, newidx = q("""select coalesce(string_agg(indexname, ','), 'none') from pg_indexes
where schemaname='public' and indexname like '%restaurant_id_id%';""")
    check("only index added is the UNIQUE constraint's own",
          "conversations_restaurant_id_id_key", newidx)

    print("\n--- PROOF 11: 0107 performs no data remediation ---")
    body = MIG.read_text(encoding="utf-8")
    stripped = "\n".join(l for l in body.split("\n") if not l.strip().startswith("--"))
    for verb in ("update ", "delete ", "insert ", "truncate", "drop "):
        check(f"migration body contains no `{verb.strip()}` statement", 0,
              len(re.findall(r"(?<![a-z_])" + verb, stripped, re.I)))

    print("\n--- PROOF 12: idempotent re-application (SECOND APPLICATION of 0107) ---")
    ok2, out2 = qf(str(MIG))
    print(f"  second application result: {'APPLIED CLEANLY (exit 0)' if ok2 else 'FAILED'}")
    if out2:
        print(f"  psql output: {out2[:400]}")
    check("second application succeeds without error", True, ok2, ok=ok2)
    _, n3 = q("""select count(*) from pg_constraint where conrelid='public.conversations'::regclass
and conname in ('conversations_restaurant_id_id_key','conversations_channel_v1_check',
'conversations_safety_state_check');""")
    check("still exactly 3 M-0 constraints after re-run", "3", n3)

    print("\n--- PROOF 13: pre-existing invariants not weakened ---")
    _, oldchk = q("""select count(*) from pg_constraint where conrelid='public.conversations'::regclass
and conname='conversations_ownership_state_check' and convalidated;""")
    check("0032 ownership_state CHECK still present and VALID", "1", oldchk)
    rejects("unknown ownership_state still rejected by 0032",
            f"insert into public.conversations (restaurant_id, ownership_state) values ({R},'NOT_A_STATE');",
            "conversations_ownership_state_check")
    _, pk = q("""select count(*) from pg_constraint where conrelid='public.conversations'::regclass
and contype='p';""")
    check("primary key on id still present", "1", pk)

    # ── tally ────────────────────────────────────────────────────────────────
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
    gone = not pathlib.Path(PGDATA).exists()
    print(f"  pg_ctl stop + rm -rf {PGDATA}")
    print(f"  cluster removed     : {'YES' if gone else 'NO — MANUAL CLEANUP REQUIRED'}")
    print(f"  production touched  : NO")

sys.exit(1 if any(not r[3] for r in results) else 0)
