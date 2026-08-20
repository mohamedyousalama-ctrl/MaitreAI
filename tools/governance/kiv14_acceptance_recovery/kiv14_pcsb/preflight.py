from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .constants import (
    BLOB_0108,
    INTEGRATION_MERGE,
    INTEGRATION_PARENT_1,
    INTEGRATION_PARENT_2,
    SOURCE_0109_BLOB,
    VERDICT_HOLD,
    VERDICT_READY,
)
from .driver import PersistentCaptureSession, driver_identity
from .errors import Hold
from .evidence import canonical_dumps, class_inventory, jsonable, write_run_evidence
from .local_pg import (
    LocalCluster,
    init_and_start,
    require_server_17_6,
    statements_logged_for_pid,
    stop_cluster,
)
from .platform import apply_method1, init_official_platform, is_official_cli_prefix
from .safety import assert_not_production_target
from .sequence import prove_failed_p0_blocks_later
from .statements import QueryClass, STATEMENTS, package_root, statement_by_id


AUTH_USERS_MARKERS = ("auth.users", 'schema "auth" does not exist')
EXTENSION_MARKERS = (
    "could not open extension control file",
    "extension",
)


def source_text_auth_users_refs(sql_text: str) -> bool:
    return "auth.users" in sql_text


def classify_bootstrap_failure(sql_text: str, stderr: str, relpath: str) -> dict[str, Any]:
    findings: list[str] = []
    if source_text_auth_users_refs(sql_text):
        findings.append(
            "AR-HS-25 / §5.9: exact method-1 file "
            f"{relpath} references auth.users(id). Bare PostgreSQL 17.6 does not "
            "provide Supabase auth.users. Inventing auth schema/tables/request-GUCs "
            "is forbidden."
        )
    lowered = stderr.lower()
    if any(marker.lower() in lowered for marker in EXTENSION_MARKERS) and "pgcrypto" in lowered:
        findings.append(
            "method-1 apply stopped at CREATE EXTENSION pgcrypto: this disposable "
            "PostgreSQL 17.6 prefix has no pgcrypto contrib (openssl headers were "
            "not present to build it from the same 17.6 tarball). Homebrew/other "
            "PG builds will not be mixed in. Extension invention is forbidden."
        )
    elif stderr.strip():
        findings.append(
            f"method-1 apply of {relpath} failed closed without invention: "
            + stderr.strip().splitlines()[-1]
        )
    if not findings:
        findings.append(f"method-1 apply of {relpath} failed closed without invention")
    return {
        "hold": True,
        "hold_reason": " ".join(findings),
        "hold_findings": findings,
        "class_b_queries_executed": False,
        "class_b_queries_validated": False,
        "invented_auth_objects": False,
        "invented_extensions": False,
        "class_b_statement_ids_not_validated": [
            s.id for s in STATEMENTS if s.query_class == QueryClass.B
        ],
    }


def repo_root() -> Path:
    return Path(
        subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
        ).strip()
    )


def _class_a_statement_ids() -> list[str]:
    return [s.id for s in STATEMENTS if s.query_class == QueryClass.A]


def run_class_a_preflight(cluster: LocalCluster) -> dict[str, Any]:
    """Tooling validation only. Not a PCSB capture. Not §7 fixture evidence."""
    assert_not_production_target(cluster.conninfo)
    pkg = package_root()
    capture_contract: dict[str, Any]
    session = PersistentCaptureSession(cluster.conninfo)
    session.connect()
    try:
        require_server_17_6(session.server_version)
        capture_contract = prove_failed_p0_blocks_later(session, root=pkg)
        capture_contract["sql_log"] = list(session.sql_log)
        log_text = cluster.log_path.read_text() if cluster.log_path.is_file() else ""
        capture_contract["logged_statements_for_backend"] = statements_logged_for_pid(
            log_text, int(session.pre_p0_backend_pid or 0)
        )
        first_logged = capture_contract["logged_statements_for_backend"]
        capture_contract["p0_was_first_logged_sql"] = bool(first_logged) and (
            "current_user" in first_logged[0]
            and "members_present" in first_logged[0]
        )
    finally:
        session.close()

    class_a_rows: dict[str, Any] = {}
    with psycopg.connect(
        cluster.conninfo,
        autocommit=True,
        prepare_threshold=None,
        row_factory=dict_row,
    ) as conn:
        # Tooling-only connection: records server_version without claiming capture.
        class_a_rows["tooling_session_kind"] = (
            "class_a_tooling_validation_not_capture"
        )
        class_a_rows["server_version"] = conn.info.parameter_status("server_version")
        class_a_rows["server_version_num"] = conn.info.parameter_status(
            "server_version_num"
        )
        require_server_17_6(class_a_rows["server_version"])
        queries: dict[str, Any] = {}
        for stmt_id in _class_a_statement_ids():
            stmt = statement_by_id(stmt_id)
            cur = conn.execute(stmt.sql_text(pkg))
            rows = [jsonable(dict(r)) for r in cur.fetchall()]
            columns = list(rows[0].keys()) if rows else []
            missing = [c for c in stmt.columns if c not in columns]
            queries[stmt_id] = {
                "n_rows": len(rows),
                "columns": columns,
                "missing_declared_columns": missing,
                "status": "ok" if not missing and len(rows) == 1 else "contract_miss",
                "sample_keys": columns,
            }
        class_a_rows["queries"] = queries

    return {
        "class": "A",
        "not_section7_fixture_evidence": True,
        "driver": driver_identity(),
        "capture_contract_on_clean_cluster": capture_contract,
        "class_a_query_validation": class_a_rows,
        "kivo_or_supabase_objects_created": False,
    }


def integration_migration_relpaths(repo: Path) -> list[str]:
    output = subprocess.check_output(
        [
            "git",
            "ls-tree",
            "-r",
            "--name-only",
            INTEGRATION_MERGE,
            "--",
            "supabase/migrations",
        ],
        cwd=repo,
        text=True,
    )
    return sorted(line for line in output.splitlines() if line.endswith(".sql"))


def blob_for(repo: Path, commit: str, relpath: str) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", f"{commit}:{relpath}"],
        cwd=repo,
        text=True,
    ).strip()


def is_auth_users_hold(stderr: str) -> bool:
    lowered = stderr.lower()
    return any(marker.lower() in lowered for marker in AUTH_USERS_MARKERS)


def run_class_b_queries(cluster: LocalCluster) -> dict[str, Any]:
    """Tooling validation of packaged Class B SQL. Not a PCSB capture. Not §7 evidence."""
    assert_not_production_target(cluster.conninfo)
    pkg = package_root()
    out: dict[str, Any] = {
        "query_role": cluster.user,
        "not_section7_fixture_evidence": True,
        "not_capture": True,
        "queries": {},
    }
    with psycopg.connect(
        cluster.conninfo,
        autocommit=True,
        prepare_threshold=None,
        row_factory=dict_row,
    ) as conn:
        out["server_version"] = conn.info.parameter_status("server_version")
        require_server_17_6(out["server_version"])
        out["backend_pid"] = conn.info.backend_pid
        for stmt in STATEMENTS:
            if stmt.query_class is not QueryClass.B:
                continue
            rec: dict[str, Any] = {
                "id": stmt.id,
                "expected_sqlstate": stmt.expected_sqlstate,
            }
            sql = stmt.sql_text(pkg)
            try:
                cur = conn.execute(sql)
                if cur.description:
                    rows = [jsonable(dict(r)) for r in cur.fetchall()]
                    columns = list(rows[0].keys()) if rows else [c.name for c in cur.description]
                else:
                    rows, columns = [], []
                missing = [c for c in stmt.columns if c not in columns]
                rec.update(
                    {
                        "n_rows": len(rows),
                        "columns": columns,
                        "missing_declared_columns": missing,
                        "sqlstate": None,
                    }
                )
                if stmt.expected_sqlstate:
                    rec["status"] = "unexpected_success"
                elif missing:
                    rec["status"] = "contract_miss"
                elif stmt.cardinality == "exactly_one" and len(rows) != 1:
                    rec["status"] = "cardinality_miss"
                else:
                    rec["status"] = "ok"
                if stmt.id == "PS-GRANT-FUNCTION":
                    rec["function_signature_in_select"] = "function_signature" in columns
                    rec["order_by_uses_alias"] = "function_signature" in stmt.order_by
                if stmt.id in {"PS-BODY", "PF-4-USAGE", "PS-COUNT"} and rows:
                    rec["sample"] = rows[0]
            except Exception as exc:
                sqlstate = getattr(exc, "sqlstate", None)
                rec.update(
                    {
                        "status": "error",
                        "sqlstate": sqlstate,
                        "error": str(exc)[-500:],
                    }
                )
                if stmt.expected_sqlstate and sqlstate == stmt.expected_sqlstate:
                    rec["status"] = "expected_denial"
            out["queries"][stmt.id] = rec
    expected_ok = {
        stmt.id: (
            "expected_denial" if stmt.expected_sqlstate else "ok"
        )
        for stmt in STATEMENTS
        if stmt.query_class is QueryClass.B
    }
    out["validated"] = all(
        out["queries"][stmt_id].get("status") == status
        for stmt_id, status in expected_ok.items()
    )
    return out


def run_class_b_preflight(cluster: LocalCluster, repo: Path | None = None) -> dict[str, Any]:
    """Method-1 source-derived bootstrap, then Class B query validation on platform topology.

    Bare PostgreSQL still HOLDs. Official CLI platform + method 1 validates Class B.
    Does not invent Supabase auth objects.
    """
    repo = repo or repo_root()
    assert_not_production_target(cluster.conninfo)
    files = integration_migration_relpaths(repo)
    if not files:
        raise Hold("method 1 produced no migration files from the integration merge tree")
    pin_0108 = blob_for(repo, INTEGRATION_MERGE, "supabase/migrations/0108_kiv13_m1_additive_scope1.sql")
    pin_0109 = blob_for(
        repo, INTEGRATION_MERGE, "supabase/migrations/0109_kiv174_member_actor_runtime_repair.sql"
    )
    record: dict[str, Any] = {
        "class": "B",
        "method": 1,
        "not_section7_fixture_evidence": True,
        "integration_merge": INTEGRATION_MERGE,
        "integration_parent_1": INTEGRATION_PARENT_1,
        "integration_parent_2": INTEGRATION_PARENT_2,
        "migration_count": len(files),
        "first_file": files[0],
        "blob_0108_at_merge": pin_0108,
        "blob_0109_at_merge": pin_0109,
        "expected_blob_0108": BLOB_0108,
        "expected_blob_0109": SOURCE_0109_BLOB,
        "blob_0108_match": pin_0108 == BLOB_0108,
        "blob_0109_match": pin_0109 == SOURCE_0109_BLOB,
        "applied": [],
        "failed_at": None,
        "stderr": None,
        "hold": False,
        "invented_auth_objects": False,
        "class_b_queries_executed": False,
        "class_b_queries_validated": False,
        "hold_reason": None,
        "platform_baseline": bool(cluster.platform_baseline),
        "query_role": cluster.user,
        "bootstrap_user": cluster.bootstrap_user,
    }
    if pin_0108 != BLOB_0108 or pin_0109 != SOURCE_0109_BLOB:
        record["hold"] = True
        record["hold_reason"] = "integration-merge 0108/0109 blobs did not MATCH pins"
        return record

    first = files[0]
    sql_bytes = subprocess.check_output(
        ["git", "show", f"{INTEGRATION_MERGE}:{first}"],
        cwd=repo,
    )
    sql_text = sql_bytes.decode("utf-8", errors="replace")
    record["source_references_auth_users"] = source_text_auth_users_refs(sql_text)
    pgcrypto_control = cluster.prefix / "share" / "postgresql" / "extension" / "pgcrypto.control"
    if not pgcrypto_control.is_file():
        alt = cluster.prefix / "share" / "extension" / "pgcrypto.control"
        pgcrypto_control = alt if alt.is_file() else pgcrypto_control
    record["pgcrypto_control_present"] = pgcrypto_control.is_file()

    if cluster.platform_baseline:
        applied = apply_method1(cluster, repo, files)
        record["applied"] = applied.get("applied") or []
        record["failed_at"] = applied.get("failed_at")
        record["stderr"] = applied.get("stderr")
        record["stdout"] = applied.get("stdout")
        if not applied.get("ok"):
            record["hold"] = True
            record["hold_reason"] = (
                "method 1 failed on the official CLI platform baseline at "
                f"{applied.get('failed_at')}: {(applied.get('stderr') or '')[-500:]}"
            )
            return record
        queries = run_class_b_queries(cluster)
        record["class_b_queries_executed"] = True
        record["class_b_query_validation"] = queries
        record["class_b_queries_validated"] = bool(queries.get("validated"))
        if not record["class_b_queries_validated"]:
            record["hold"] = True
            record["hold_reason"] = (
                "Class B queries did not satisfy contracts on the official "
                "CLI platform + method 1 topology"
            )
        return record

    env = os.environ.copy()
    env["PATH"] = f"{cluster.prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin"
    psql = cluster.bin("psql")
    with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as handle:
        handle.write(sql_bytes)
        tmp_path = handle.name
    try:
        applied = subprocess.run(
            [
                str(psql),
                "-h",
                "127.0.0.1",
                "-p",
                str(cluster.port),
                "-U",
                cluster.user,
                "-d",
                cluster.dbname,
                "-v",
                "ON_ERROR_STOP=1",
                "-f",
                tmp_path,
            ],
            capture_output=True,
            text=True,
            env=env,
        )
    finally:
        os.unlink(tmp_path)

    if applied.returncode == 0:
        record["hold"] = True
        record["hold_reason"] = (
            "0001_init.sql applied on bare PG 17.6 unexpectedly; refusing to invent "
            "or continue. Independent review must inspect this anomaly."
        )
        record["applied"] = [first]
        return record

    record["failed_at"] = first
    record["stderr"] = (applied.stderr or "")[-4000:]
    record["stdout"] = (applied.stdout or "")[-1000:]
    record.update(classify_bootstrap_failure(sql_text, applied.stderr or "", first))
    return record


def run_preflight(*, dest_dir: Path | None = None) -> dict[str, Any]:
    dest = dest_dir or (package_root() / "preflight_results")
    dest.mkdir(parents=True, exist_ok=True)
    class_a_cluster: LocalCluster | None = None
    class_b_cluster: LocalCluster | None = None
    payload: dict[str, Any] = {
        "not_section7_fixture_evidence": True,
        "not_production_evidence": True,
        "production_supabase_auth_sql_count": 0,
        "class_inventory": class_inventory(),
        "driver": driver_identity(),
    }
    try:
        class_a_cluster = init_and_start(label="class-a")
        payload["class_a"] = run_class_a_preflight(class_a_cluster)
        payload["class_a"]["port"] = class_a_cluster.port
        payload["class_a"]["data_dir"] = str(class_a_cluster.data_dir)
        if is_official_cli_prefix():
            class_b_cluster = init_official_platform(label="class-b")
        else:
            class_b_cluster = init_and_start(label="class-b")
        payload["class_b"] = run_class_b_preflight(class_b_cluster)
        payload["class_b"]["port"] = class_b_cluster.port
        payload["class_b"]["data_dir"] = str(class_b_cluster.data_dir)
        if class_b_cluster.prepare_record:
            payload["class_b"]["prepare_record"] = class_b_cluster.prepare_record
    finally:
        if class_a_cluster is not None:
            stop_cluster(class_a_cluster)
        if class_b_cluster is not None:
            stop_cluster(class_b_cluster)

    class_b_hold = bool(payload.get("class_b", {}).get("hold"))
    class_a_ok = all(
        item.get("status") == "ok"
        for item in payload.get("class_a", {})
        .get("class_a_query_validation", {})
        .get("queries", {})
        .values()
    )
    contract = payload.get("class_a", {}).get("capture_contract_on_clean_cluster", {})
    contract_ok = contract.get("later_sql_status") == "blocked" and contract.get(
        "p0_status"
    ) in {"FAIL", "SQL_ERROR"}
    payload["class_a_preflight_ok"] = bool(class_a_ok and contract_ok)
    payload["class_b_validated"] = bool(
        payload.get("class_b", {}).get("class_b_queries_validated")
    )
    payload["terminal_verdict"] = (
        VERDICT_HOLD
        if class_b_hold or not payload["class_a_preflight_ok"] or not payload["class_b_validated"]
        else VERDICT_READY
    )
    payload["hold_findings"] = []
    if class_b_hold:
        payload["hold_findings"].append(payload["class_b"].get("hold_reason"))
    if not payload["class_a_preflight_ok"]:
        payload["hold_findings"].append("Class A preflight did not satisfy contracts")
    if not payload["class_b_validated"] and not class_b_hold:
        payload["hold_findings"].append("Class B queries were not validated")
    write_run_evidence(dest, payload)
    (dest / "preflight.json").write_text(canonical_dumps(payload))
    return payload
