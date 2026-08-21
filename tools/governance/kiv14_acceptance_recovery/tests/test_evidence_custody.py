from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path

import psycopg
import pytest

from kiv14_pcsb.authority import CaptureInvocation, parse_capture_authority
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.constants import (
    ARTIFACTS_SUBDIR,
    CONSUMED_PCSB_IDENTITIES,
    DIGEST_LIST_FILENAME,
    HOST_QUERY_SHA256_MARKER,
    KIV220_ACCEPTED_HASH_OF_HASHES,
    NEXT_UNUSED_PCSB_IDENTITY,
    ROUTE_CLASS_LOOPBACK,
)
from kiv14_pcsb.errors import CaptureAuthorityRefused, EvidenceCustodyFailure
from kiv14_pcsb.evidence import (
    CaptureArtifactWriter,
    build_package_manifest,
    complete_pcsb_digest,
    evidence_custody_contract,
    hash_of_hashes,
    refuse_if_secrets,
    statement_catalog,
    write_capture_evidence,
)
from kiv14_pcsb.sequence import host_utc_now
from kiv14_pcsb.statements import STATEMENTS, captured_query_sha256, package_root, required_ps_artifacts

from test_capture_binding import (
    DIRECT_CONNINFO,
    _authority_dict,
    _target_direct,
    _target_loopback,
)


V4_PROSRC = """
coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
"""


class _FakeInfo:
    backend_pid = 4242

    def parameter_status(self, name: str) -> str:
        return {"server_version": "17.6", "server_version_num": "170006"}[name]


class _FakeCursor:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self.description = [
            type("Col", (), {"name": key})() for key in (rows[0] if rows else {})
        ]

    def fetchall(self) -> list[dict]:
        return list(self._rows)


class _Denied(psycopg.Error):
    sqlstate = "42501"


class ScriptedConn:
    closed = False

    def __init__(self) -> None:
        self.info = _FakeInfo()
        self.sql_texts: list[str] = []

    def execute(self, sql: str):
        self.sql_texts.append(sql)
        low = sql.lower()
        if "members_present" in low and "miv_present" in low:
            return _FakeCursor(
                [
                    {
                        "executor": "kiv217",
                        "row_security_setting": "on",
                        "members_present": True,
                        "members_select": True,
                        "members_rls_active": False,
                        "miv_present": True,
                        "miv_select": True,
                        "miv_rls_active": False,
                        "cae_present": True,
                        "cae_select": True,
                        "cae_rls_active": False,
                    }
                ]
            )
        if "set role" in low:
            raise _Denied("permission denied to set role kivo_control_owner")
        if "sql_backend_pid" in low or "window_ts" in low:
            return _FakeCursor(
                [
                    {
                        "executor": "kiv217",
                        "session_user": "kiv217",
                        "current_database": "postgres",
                        "inet_server_port": 5432,
                        "sql_backend_pid": 4242,
                        "window_ts": "2026-08-21T00:00:00Z",
                    }
                ]
            )
        if "prosrc" in low:
            return _FakeCursor(
                [
                    {
                        "uid_rows": 1,
                        "prosrc": V4_PROSRC,
                        "prosrc_md5": "synthetic",
                        "functiondef": "CREATE FUNCTION auth.uid()",
                        "arg_list": "",
                    }
                ]
            )
        if "ledger_present" in low:
            return _FakeCursor(
                [
                    {
                        "ledger_present": False,
                        "ledger_select": False,
                        "ledger_rls_active": False,
                    }
                ]
            )
        return _FakeCursor([{"ok": True}])

    def close(self) -> None:
        self.closed = True


def _run_scripted(tmp_path: Path, monkeypatch, *, pcsb: str = "PCSB-9") -> tuple[dict, Path, ScriptedConn]:
    conn = ScriptedConn()
    reached: list[str] = []

    def factory(conninfo: str):
        reached.append(conninfo)
        return conn

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", factory)
    dest = tmp_path / "ev-custody"
    authority = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_loopback(), pcsb=pcsb)
    )
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    payload = AuthorizedCaptureRunner().run(
        authority=authority,
        invocation=invocation,
        conninfo="host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable",
    )
    return payload, dest, conn


def test_hash_of_hashes_remains_query_text_pin():
    catalog = statement_catalog()
    assert hash_of_hashes(catalog) == KIV220_ACCEPTED_HASH_OF_HASHES
    assert build_package_manifest()["hash_of_hashes"] == KIV220_ACCEPTED_HASH_OF_HASHES
    contract = evidence_custody_contract()
    assert contract["completeness_requires_custody"] is True
    assert contract["package_hash_of_hashes_is_query_text_pin_not_captured_artifact_custody"] is True
    assert set(required_ps_artifacts()) == {
        "PS-0",
        "PS-P1",
        "PS-P2",
        "PS-P3",
        "PS-P4",
        "PS-P5",
        "PS-P6",
        "PS-P7",
        "PS-P8",
        "PS-LEDGER",
        "PS-PF4",
        "PS-G",
        "PS-GRANT",
        "PS-OWN",
        "PS-ROLE",
        "PS-COUNT",
        "PS-BODY",
        "PS-TIME",
    }


def test_complete_scripted_capture_writes_per_step_custody_and_digest(tmp_path, monkeypatch):
    payload, dest, conn = _run_scripted(tmp_path, monkeypatch, pcsb="PCSB-5")
    assert payload["completeness"] == "complete"
    assert payload["incomplete_reason"] is None
    assert payload["retry"] is False
    assert conn.sql_texts[0].lower().startswith("select")
    assert "members_present" in conn.sql_texts[0]
    assert payload["sql_log"][0] == "P-0"
    assert payload["sql_log"][-1] == "PS-TIME-END"
    assert any("set role" in text.lower() for text in conn.sql_texts)
    artifacts_dir = dest / ARTIFACTS_SUBDIR
    for stmt in STATEMENTS:
        path = artifacts_dir / f"{stmt.id}.json"
        sidecar = path.with_suffix(path.suffix + ".sha256")
        assert path.is_file(), stmt.id
        data = path.read_bytes()
        digest = sha256(data).hexdigest()
        assert sidecar.read_text().strip() == digest
        record = json.loads(data.decode())
        assert record["statement_id"] == stmt.id
        assert record["ps_artifact"] == stmt.ps_artifact
        assert record["dispatch_ts"]
        assert record["complete_ts"]
        assert record["dispatch_ts"] <= record["complete_ts"]
        assert "Z" in record["dispatch_ts"]
        expected_query = captured_query_sha256(stmt, package_root())
        assert record["query_sha256"] == expected_query
        if stmt.id in {"G2", "G3"}:
            assert record["query_sha256"] == HOST_QUERY_SHA256_MARKER
        if stmt.id in {"PS-TIME-START", "PS-TIME-END"}:
            assert record["sql_window_ts"] == "2026-08-21T00:00:00Z"
        if stmt.id == "PF-4-SET-ROLE":
            assert record["status"] == "expected_denial"
            assert record["sqlstate"] == "42501"
    digest_path = dest / DIGEST_LIST_FILENAME
    listed = json.loads(digest_path.read_text())
    assert listed["completeness_asserted"] is True
    entries = listed["entries"]
    assert [item["statement_id"] for item in entries] == [stmt.id for stmt in STATEMENTS]
    recomputed = complete_pcsb_digest(
        [
            {
                "statement_id": stmt.id,
                "sha256": sha256((artifacts_dir / f"{stmt.id}.json").read_bytes()).hexdigest(),
            }
            for stmt in STATEMENTS
        ]
    )
    assert listed["complete_pcsb_digest"] == recomputed
    assert digest_path.with_suffix(digest_path.suffix + ".sha256").read_text().strip() == sha256(
        digest_path.read_bytes()
    ).hexdigest()
    run_text = (dest / "capture_run.json").read_text().lower()
    assert "password=" not in run_text
    assert "postgresql://" not in run_text


def test_host_timestamps_are_not_sql(tmp_path, monkeypatch):
    before = host_utc_now()
    payload, _dest, conn = _run_scripted(tmp_path, monkeypatch)
    after = host_utc_now()
    assert payload["completeness"] == "complete"
    for step in payload["steps"]:
        assert step["dispatch_ts"] >= before
        assert step["complete_ts"] <= after
        assert "select" not in step["dispatch_ts"].lower()
    assert not any("dispatch_ts" in text.lower() for text in conn.sql_texts)


def test_forced_artifact_write_failure_after_auth_is_permanent_incomplete(tmp_path, monkeypatch):
    def boom(self, stmt, step):
        raise EvidenceCustodyFailure("forced artifact-write failure")

    monkeypatch.setattr(CaptureArtifactWriter, "write_step", boom)
    payload, dest, conn = _run_scripted(tmp_path, monkeypatch)
    assert payload["completeness"] == "permanently_incomplete"
    assert "forced artifact-write failure" in payload["incomplete_reason"]
    assert payload["retry"] is False
    assert payload["sql_log"] == ["P-0"]
    assert not (dest / DIGEST_LIST_FILENAME).exists()
    assert conn.closed is True


def test_timestamp_omission_prevents_complete(tmp_path, monkeypatch):
    real = CaptureArtifactWriter.write_step

    def drop_ts(self, stmt, step):
        step.dispatch_ts = None
        return real(self, stmt, step)

    monkeypatch.setattr(CaptureArtifactWriter, "write_step", drop_ts)
    payload, dest, _conn = _run_scripted(tmp_path, monkeypatch)
    assert payload["completeness"] == "permanently_incomplete"
    assert "timestamps" in (payload["incomplete_reason"] or "")
    assert not (dest / DIGEST_LIST_FILENAME).exists()


def test_digest_list_omission_prevents_complete(tmp_path, monkeypatch):
    monkeypatch.setattr(CaptureArtifactWriter, "write_digest_list", lambda self: None)
    payload, dest, _conn = _run_scripted(tmp_path, monkeypatch)
    assert payload["completeness"] == "permanently_incomplete"
    assert "digest list" in (payload["incomplete_reason"] or "").lower()
    assert not (dest / DIGEST_LIST_FILENAME).exists()


def test_digest_list_mismatch_prevents_complete(tmp_path, monkeypatch):
    real = CaptureArtifactWriter.write_digest_list

    def corrupt(self):
        custody = real(self)
        self.digest_list_custody["complete_pcsb_digest"] = "0" * 64
        return custody

    monkeypatch.setattr(CaptureArtifactWriter, "write_digest_list", corrupt)
    payload, _dest, _conn = _run_scripted(tmp_path, monkeypatch)
    assert payload["completeness"] == "permanently_incomplete"
    assert "mismatch" in (payload["incomplete_reason"] or "")


def test_append_only_step_artifact_refuses_overwrite(tmp_path):
    writer = CaptureArtifactWriter(tmp_path / "ev")
    from kiv14_pcsb.sequence import StepResult
    from kiv14_pcsb.statements import statement_by_id

    stmt = statement_by_id("G3")
    step = StepResult(
        statement_id="G3",
        status="host",
        dispatch_ts=host_utc_now(),
        complete_ts=host_utc_now(),
        host_result={"g3_ok": True},
    )
    writer.write_step(stmt, step)
    with pytest.raises(EvidenceCustodyFailure, match="duplicate|append-only"):
        writer.write_step(stmt, step)


def test_adversarial_payload_classes_are_refused(tmp_path):
    dest = tmp_path / "ev"
    with pytest.raises(RuntimeError, match="secret-bearing"):
        write_capture_evidence(dest, "password.json", {"note": "password=super-secret"})
    with pytest.raises(RuntimeError, match="secret-bearing"):
        refuse_if_secrets("postgresql://postgres:secret@host/db", where="unit")
    with pytest.raises(RuntimeError, match="secret-bearing"):
        write_capture_evidence(
            dest,
            "jwt.json",
            {"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.aaaaaaaa"},
        )
    with pytest.raises(RuntimeError, match="secret-bearing"):
        write_capture_evidence(dest, "srole.json", {"k": "SUPABASE_SERVICE_ROLE"})
    with pytest.raises(EvidenceCustodyFailure, match="email"):
        write_capture_evidence(dest, "email.json", {"rows": [{"note": "user@example.com"}]})
    with pytest.raises(EvidenceCustodyFailure, match="phone"):
        write_capture_evidence(dest, "phone.json", {"rows": [{"note": "415-555-0100"}]})
    with pytest.raises(EvidenceCustodyFailure, match="forbidden payload key"):
        write_capture_evidence(dest, "body.json", {"rows": [{"message_body": "hello"}]})
    with pytest.raises(EvidenceCustodyFailure, match="forbidden payload key"):
        write_capture_evidence(dest, "member.json", {"member_row": {"id": "x"}})
    good = write_capture_evidence(
        dest,
        "ok.json",
        {"statement_id": "G1", "prosrc": V4_PROSRC, "functiondef": "CREATE FUNCTION auth.uid()"},
    )
    text = Path(good["path"]).read_text()
    assert "password=" not in text
    assert "@example.com" not in text


def test_consumed_pcsb4_refuses_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or ScriptedConn(),
    )
    dest = tmp_path / "ev-pcsb4"
    with pytest.raises(CaptureAuthorityRefused, match="permanently incomplete"):
        parse_capture_authority(_authority_dict(dest=dest, target=_target_direct(), pcsb="PCSB-4"))
    assert "PCSB-4" in CONSUMED_PCSB_IDENTITIES
    assert NEXT_UNUSED_PCSB_IDENTITY == "PCSB-5"
    assert reached == []
    # Production-shaped conninfo is never passed to the factory from this path.
    assert DIRECT_CONNINFO


def test_pcsb5_is_unused_and_not_package_authorized():
    contract = evidence_custody_contract()
    assert NEXT_UNUSED_PCSB_IDENTITY == "PCSB-5"
    assert NEXT_UNUSED_PCSB_IDENTITY not in CONSUMED_PCSB_IDENTITIES
    manifest = build_package_manifest()
    identities = manifest["consumed_capture_identities"]
    assert identities["next_unused_pcsb_identity"] == "PCSB-5"
    assert identities["next_unused_authorized_by_this_package"] is False
    assert contract["completeness_requires_custody"] is True


def test_disposable_pg176_live_capture_records_p0_first_and_refuses_false_complete(
    tmp_path, local_conninfo
):
    from kiv14_pcsb.safety import parse_canonical_conninfo

    ident = parse_canonical_conninfo(local_conninfo)
    dest = tmp_path / "ev-live"
    authority = parse_capture_authority(
        _authority_dict(
            dest=dest,
            target={
                "route_class": ROUTE_CLASS_LOOPBACK,
                "project_name": "disposable-local",
                "project_ref": "loopback",
                "host": ident.host,
                "port": ident.port,
                "database": ident.database,
                "user": ident.user,
                "sslmode": ident.sslmode,
            },
            pcsb="PCSB-5",
        )
    )
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    payload = AuthorizedCaptureRunner().run(
        authority=authority, invocation=invocation, conninfo=local_conninfo
    )
    assert payload["retry"] is False
    assert payload["completeness"] == "permanently_incomplete"
    assert payload["sql_log"][:1] == ["P-0"]
    assert not (dest / DIGEST_LIST_FILENAME).exists()
    run_text = (dest / "capture_run.json").read_text().lower()
    assert "password=" not in run_text
    if ident.password:
        assert ident.password.lower() not in run_text


def test_complete_disposable_official_platform_capture(tmp_path):
    from kiv14_pcsb.local_pg import assert_pg176_prefix, stop_cluster
    from kiv14_pcsb.platform import init_official_platform, is_official_cli_prefix
    from kiv14_pcsb.preflight import run_class_b_preflight
    from kiv14_pcsb.safety import parse_canonical_conninfo

    try:
        assert_pg176_prefix()
    except Exception as exc:
        pytest.skip(f"PostgreSQL 17.6 prefix unavailable: {exc}")
    if not is_official_cli_prefix():
        pytest.skip("official supabase 17.6.1.150-cli prefix not present")
    cluster = init_official_platform(label="pytest-kiv254-custody")
    try:
        prepared = run_class_b_preflight(cluster)
        assert prepared.get("class_b_queries_validated") is True, prepared.get("hold_reason")
        ident = parse_canonical_conninfo(cluster.conninfo)
        dest = tmp_path / "ev-official"
        authority = parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={
                    "route_class": ROUTE_CLASS_LOOPBACK,
                    "project_name": "disposable-local",
                    "project_ref": "loopback",
                    "host": ident.host,
                    "port": ident.port,
                    "database": ident.database,
                    "user": ident.user,
                    "sslmode": ident.sslmode,
                },
                pcsb="PCSB-5",
            )
        )
        invocation = CaptureInvocation(
            authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
        )
        payload = AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=cluster.conninfo
        )
        assert payload["completeness"] == "complete", payload.get("incomplete_reason")
        assert payload["sql_log"][0] == "P-0"
        artifacts_dir = dest / ARTIFACTS_SUBDIR
        for stmt in STATEMENTS:
            path = artifacts_dir / f"{stmt.id}.json"
            assert path.is_file(), stmt.id
            data = path.read_bytes()
            assert sha256(data).hexdigest() == path.with_suffix(path.suffix + ".sha256").read_text().strip()
        listed = json.loads((dest / DIGEST_LIST_FILENAME).read_text())
        recomputed = complete_pcsb_digest(
            [
                {
                    "statement_id": stmt.id,
                    "sha256": sha256((artifacts_dir / f"{stmt.id}.json").read_bytes()).hexdigest(),
                }
                for stmt in STATEMENTS
            ]
        )
        assert listed["complete_pcsb_digest"] == recomputed
        run_text = (dest / "capture_run.json").read_text().lower()
        assert "password=" not in run_text
        assert "postgresql://" not in run_text
    finally:
        stop_cluster(cluster)
