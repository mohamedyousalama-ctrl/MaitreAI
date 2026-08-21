from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from kiv14_pcsb.__main__ import cmd_capture, main
from kiv14_pcsb.authority import (
    CaptureInvocation,
    assert_authority_matches_this_package,
    assert_authorized_capture_target,
    current_package_commit,
    live_package_pins,
    load_capture_authority,
    parse_capture_authority,
)
from kiv14_pcsb.statements import package_root
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.constants import (
    GOVERNANCE_DISCLAIMER,
    KIV220_ACCEPTED_HASH_OF_HASHES,
    PACKAGE_ID,
    ROUTE_CLASS_DIRECT_POSTGRES,
    ROUTE_CLASS_LOOPBACK,
    ROUTE_CLASS_SESSION_POOLER,
)
from kiv14_pcsb.driver import PersistentCaptureSession
from kiv14_pcsb.errors import CaptureAuthorityRefused, FailClosed, SequenceViolation
from kiv14_pcsb.evidence import (
    build_package_manifest,
    hash_of_hashes,
    refuse_if_secrets,
    statement_catalog,
    write_capture_evidence,
)
from kiv14_pcsb.safety import ProductionTargetRefused, assert_not_production_target


POOLER_HOST = "aws-1-us-east-2.pooler.supabase.com"
POOLER_USER = "postgres.zlighrbsjexrozrmuwpw"
POOLER_REF = "zlighrbsjexrozrmuwpw"
POOLER_CONNINFO = (
    f"host={POOLER_HOST} port=5432 dbname=postgres user={POOLER_USER} sslmode=require"
)
DIRECT_HOST = "db.zlighrbsjexrozrmuwpw.supabase.co"
DIRECT_USER = "postgres"
DIRECT_CONNINFO = (
    f"host={DIRECT_HOST} port=5432 dbname=postgres user={DIRECT_USER} sslmode=require"
)
EFFECTIVE_DIRECT_CONNINFO = DIRECT_CONNINFO + " client_encoding=UTF8"


def _pins():
    return live_package_pins()


def _target_loopback(port: int = 55432) -> dict:
    return {
        "route_class": ROUTE_CLASS_LOOPBACK,
        "project_name": "disposable-local",
        "project_ref": "loopback",
        "host": "127.0.0.1",
        "port": port,
        "database": "postgres",
        "user": "kiv217",
        "sslmode": "disable",
    }


def _target_pooler() -> dict:
    return {
        "route_class": ROUTE_CLASS_SESSION_POOLER,
        "project_name": "MaitreAi",
        "project_ref": POOLER_REF,
        "host": POOLER_HOST,
        "port": 5432,
        "database": "postgres",
        "user": POOLER_USER,
        "sslmode": "require",
    }


def _target_direct() -> dict:
    return {
        "route_class": ROUTE_CLASS_DIRECT_POSTGRES,
        "project_name": "MaitreAi",
        "project_ref": POOLER_REF,
        "host": DIRECT_HOST,
        "port": 5432,
        "database": "postgres",
        "user": DIRECT_USER,
        "sslmode": "require",
    }


def _authority_dict(*, dest: Path, target: dict, work_order: str = "KIV-999", pcsb: str = "PCSB-9", **overrides):
    pins = _pins()
    payload = {
        "work_order_id": work_order,
        "pcsb_identity": pcsb,
        "package_commit": current_package_commit(),
        "package_manifest_sha256": pins["manifest_sha256"],
        "package_hash_of_hashes": pins["hash_of_hashes"],
        "package_id": PACKAGE_ID,
        "authorized_target": target,
        "evidence_directory": str(dest),
        "governance_disclaimer": GOVERNANCE_DISCLAIMER,
    }
    payload.update(overrides)
    return payload


def _write_authority(tmp_path: Path, payload: dict) -> Path:
    path = tmp_path / "authority.json"
    path.write_text(json.dumps(payload))
    return path


class _FakeInfo:
    backend_pid = 4242

    def parameter_status(self, name: str) -> str:
        return {"server_version": "17.6", "server_version_num": "170006"}[name]


class _FakeConn:
    closed = False

    def __init__(self) -> None:
        self.info = _FakeInfo()

    def execute(self, sql: str):
        raise AssertionError(f"raw execute used: {sql!r}")

    def close(self) -> None:
        self.closed = True


def test_hash_of_hashes_unchanged_from_kiv220():
    catalog = statement_catalog()
    digest = hash_of_hashes(catalog)
    assert digest == KIV220_ACCEPTED_HASH_OF_HASHES
    assert build_package_manifest()["hash_of_hashes"] == KIV220_ACCEPTED_HASH_OF_HASHES


def test_default_path_still_refuses_remote_and_allow_remote(monkeypatch):
    def boom(_conninfo: str):
        raise AssertionError("reviewed factory must not be reached on the default path")

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", boom)
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target(POOLER_CONNINFO)
    with pytest.raises(ProductionTargetRefused):
        PersistentCaptureSession(POOLER_CONNINFO).connect()
    with pytest.raises(ProductionTargetRefused):
        PersistentCaptureSession(DIRECT_CONNINFO).connect()
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target("host=127.0.0.1 port=1 dbname=x user=x", allow_remote=True)


def test_missing_malformed_wrong_work_order_refuses_before_connect(tmp_path, monkeypatch):
    def boom(_conninfo: str):
        raise AssertionError("factory reached")

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", boom)
    dest = tmp_path / "ev"
    good = _authority_dict(dest=dest, target=_target_direct())
    with pytest.raises(CaptureAuthorityRefused, match="malformed work_order_id"):
        parse_capture_authority({**good, "work_order_id": "WO-1"})
    with pytest.raises(CaptureAuthorityRefused, match="missing keys"):
        parse_capture_authority({"work_order_id": "KIV-999"})
    authority = parse_capture_authority(good)
    invocation = CaptureInvocation("KIV-1", authority.pcsb_identity, authority.evidence_directory)
    runner = AuthorizedCaptureRunner()
    with pytest.raises(CaptureAuthorityRefused, match="work_order_id does not match"):
        runner.run(authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO)


def test_wrong_pcsb_package_hash_and_target_refuse_before_connect(tmp_path, monkeypatch):
    def boom(_conninfo: str):
        raise AssertionError("factory reached")

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", boom)
    dest = tmp_path / "ev"
    with pytest.raises(CaptureAuthorityRefused, match="permanently incomplete"):
        parse_capture_authority(_authority_dict(dest=dest, target=_target_direct(), pcsb="PCSB-1"))
    with pytest.raises(CaptureAuthorityRefused, match="malformed pcsb_identity"):
        parse_capture_authority(_authority_dict(dest=dest, target=_target_direct(), pcsb="pcsb-3"))
    bad_hash = _authority_dict(
        dest=dest,
        target=_target_direct(),
        package_hash_of_hashes="f" * 64,
    )
    authority = parse_capture_authority(bad_hash)
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="hash_of_hashes"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
        )
    matching = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    with pytest.raises(CaptureAuthorityRefused, match="host does not match"):
        assert_authorized_capture_target(POOLER_CONNINFO, matching)


def test_authorized_target_reaches_reviewed_factory_only_when_bound(tmp_path, monkeypatch):
    reached: list[str] = []

    def fake_connect(conninfo: str):
        reached.append(conninfo)
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", fake_connect)
    dest = tmp_path / "ev"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    with pytest.raises(ProductionTargetRefused):
        PersistentCaptureSession(POOLER_CONNINFO).connect()
    assert reached == []
    session = PersistentCaptureSession(DIRECT_CONNINFO, authority=authority)
    session.connect()
    try:
        assert reached == [EFFECTIVE_DIRECT_CONNINFO]
        assert session.pre_p0_backend_pid == 4242
        assert session.sql_log == []
    finally:
        session.close()


def test_no_sql_before_p0_and_p0_failure_blocks_later(local_conninfo, tmp_path):
    dest = tmp_path / "ev-local"
    port = int(local_conninfo.split("port=")[1].split()[0])
    authority = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_loopback(port=port))
    )
    session = PersistentCaptureSession(local_conninfo, authority=authority)
    session.connect()
    try:
        with pytest.raises(SequenceViolation, match="before P-0"):
            session.execute("select 1", statement_id="PS-TIME-START")
        assert session.sql_log == []
        from kiv14_pcsb.sequence import run_p0

        with pytest.raises(FailClosed):
            run_p0(session)
        assert session.p0_passed is False
        with pytest.raises(SequenceViolation, match="P-0 did not PASS"):
            session.execute("select 1", statement_id="P-1")
    finally:
        session.close()


def test_pid_drift_and_closed_connection_terminal(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        session.pre_p0_backend_pid = int(session.pre_p0_backend_pid) + 1
        with pytest.raises(FailClosed, match="drift"):
            session.current_backend_pid()
    finally:
        session.close()
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    session.connection.close()
    with pytest.raises(FailClosed, match="closed"):
        session.execute("select 1", statement_id="P-0")
    session.close()


def test_expected_denial_success_is_fail_closed(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        session.p0_passed = True
        session.sql_log.append("P-0")
        with pytest.raises(FailClosed, match="expected denial"):
            session.execute("select 1", statement_id="PF-4-SET-ROLE", expected_sqlstate="42501")
    finally:
        session.close()


def test_evidence_refuses_secrets(tmp_path):
    dest = tmp_path / "ev"
    with pytest.raises(RuntimeError, match="secret-bearing"):
        write_capture_evidence(dest, "bad.json", {"note": "password=super-secret"})
    with pytest.raises(RuntimeError, match="secret-bearing"):
        refuse_if_secrets("postgresql://postgres:secret@host/db", where="unit")
    good = write_capture_evidence(dest, "ok.json", {"work_order_id": "KIV-999", "pcsb_identity": "PCSB-9"})
    assert Path(good["path"]).is_file()
    text = Path(good["path"]).read_text()
    assert "password=" not in text
    assert "postgresql://" not in text


def test_runner_has_no_retry_path(tmp_path, monkeypatch):
    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", lambda _c: _FakeConn())
    dest = tmp_path / "ev-retry"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    runner = AuthorizedCaptureRunner()
    payload = runner.run(authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO)
    assert payload["retry"] is False
    with pytest.raises(SequenceViolation, match="retry"):
        runner.run(authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO)


def test_default_capture_command_still_refused():
    assert cmd_capture() == 2
    assert main(["capture"]) == 2


def test_authorized_capture_cli_refuses_mismatched_binding(tmp_path, monkeypatch):
    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", lambda _c: _FakeConn())
    dest = tmp_path / "ev-cli"
    payload = _authority_dict(dest=dest, target=_target_direct())
    authority_path = _write_authority(tmp_path, payload)
    conn_path = tmp_path / "conninfo"
    conn_path.write_text(POOLER_CONNINFO)
    rc = main(
        [
            "authorized-capture",
            "--authority",
            str(authority_path),
            "--work-order",
            "KIV-1",
            "--pcsb",
            payload["pcsb_identity"],
            "--conninfo-file",
            str(conn_path),
            "--evidence-dir",
            str(dest),
        ]
    )
    assert rc == 2


def test_authority_file_roundtrip(tmp_path):
    dest = tmp_path / "ev"
    path = _write_authority(tmp_path, _authority_dict(dest=dest, target=_target_loopback()))
    loaded = load_capture_authority(path)
    assert loaded.package_id == PACKAGE_ID
    assert loaded.authorized_target.host == "127.0.0.1"


def test_direct_db_host_and_transaction_port_rejected(tmp_path):
    dest = tmp_path / "ev"
    with pytest.raises(CaptureAuthorityRefused, match="continuity-ineligible"):
        parse_capture_authority(_authority_dict(dest=dest, target=_target_pooler()))
    with pytest.raises(CaptureAuthorityRefused, match="6543"):
        parse_capture_authority(
            _authority_dict(dest=dest, target={**_target_direct(), "port": 6543})
        )
    with pytest.raises(CaptureAuthorityRefused, match="6543"):
        parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={**_target_direct(), "port": 6543},
            )
        )
    dedicated = {
        **_target_direct(),
        "port": 6543,
    }
    with pytest.raises(CaptureAuthorityRefused, match="6543"):
        parse_capture_authority(_authority_dict(dest=dest, target=dedicated))
    with pytest.raises(CaptureAuthorityRefused, match="host/project_ref mismatch"):
        parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={
                    **_target_direct(),
                    "host": "db.otherref.supabase.co",
                },
            )
        )
    with pytest.raises(CaptureAuthorityRefused, match="postgres.<ref>"):
        parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={**_target_direct(), "user": POOLER_USER},
            )
        )


def test_secret_key_in_authority_rejected(tmp_path):
    dest = tmp_path / "ev"
    payload = _authority_dict(dest=dest, target=_target_direct())
    payload["password"] = "nope"
    with pytest.raises(CaptureAuthorityRefused, match="unknown keys"):
        parse_capture_authority(payload)


def _copy_package(dest: Path) -> Path:
    shutil.copytree(
        package_root(),
        dest,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git"),
    )
    return dest


def _git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["GIT_AUTHOR_NAME"] = "kiv224-test"
    env["GIT_AUTHOR_EMAIL"] = "kiv224-test@example.invalid"
    env["GIT_COMMITTER_NAME"] = "kiv224-test"
    env["GIT_COMMITTER_EMAIL"] = "kiv224-test@example.invalid"
    env.pop("GIT_DIR", None)
    env.pop("GIT_WORK_TREE", None)
    env.pop("GIT_COMMON_DIR", None)
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=check,
        text=True,
        capture_output=True,
        env=env,
    )


def _seed_nested_package_repo(base: Path, *, extra_parents: int = 0) -> tuple[Path, Path, str]:
    base.mkdir(parents=True, exist_ok=True)
    repo = base / "repo"
    repo.mkdir()
    pkg = repo
    for index in range(extra_parents):
        pkg = pkg / f"extra-{index}"
    pkg = pkg / "tools" / "governance" / "kiv14_acceptance_recovery"
    _copy_package(pkg)
    _git(repo, "init", "--initial-branch=main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "seed nested package layout")
    head = _git(repo, "rev-parse", "HEAD").stdout.strip().lower()
    return repo, pkg, head


def test_normal_checkout_exact_commit_passes_package_identity(tmp_path, monkeypatch):
    reached: list[str] = []

    def fake_connect(conninfo: str):
        reached.append(conninfo)
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", fake_connect)
    dest = tmp_path / "ev-match"
    head = current_package_commit()
    assert len(head) == 40
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    assert authority.package_commit == head
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    AuthorizedCaptureRunner().run(
        authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
    )
    assert reached == [EFFECTIVE_DIRECT_CONNINFO]


def test_wrong_arbitrary_commit_never_reaches_factory(tmp_path, monkeypatch):
    reached: list[str] = []

    def fake_connect(conninfo: str):
        reached.append(conninfo)
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", fake_connect)
    dest = tmp_path / "ev-wrong"
    wrong = "a" * 40
    live = current_package_commit()
    assert wrong != live
    authority = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_direct(), package_commit=wrong)
    )
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="package_commit"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
        )
    with pytest.raises(CaptureAuthorityRefused, match="package_commit"):
        PersistentCaptureSession(POOLER_CONNINFO, authority=authority).connect()
    assert reached == []


def test_missing_repo_and_exported_tree_refuse_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-export"
    export = _copy_package(tmp_path / "exported-tree")
    with pytest.raises(CaptureAuthorityRefused, match="repository root cannot be proved"):
        current_package_commit(export)
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="repository root cannot be proved"):
        AuthorizedCaptureRunner().run(
            authority=authority,
            invocation=invocation,
            conninfo=DIRECT_CONNINFO,
            root=export,
        )
    missing = tmp_path / "no-repo" / "tools" / "governance" / "kiv14_acceptance_recovery"
    missing.mkdir(parents=True)
    with pytest.raises(CaptureAuthorityRefused, match="repository root cannot be proved"):
        current_package_commit(missing)
    assert reached == []


def test_git_executable_error_and_timeout_refuse_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-gitfail"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )

    def missing_git(*_a, **_k):
        raise FileNotFoundError("git")

    monkeypatch.setattr("kiv14_pcsb.authority.subprocess.run", missing_git)
    with pytest.raises(CaptureAuthorityRefused, match="Git executable is unavailable"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
        )

    def timeout_git(*_a, **_k):
        raise subprocess.TimeoutExpired(cmd=["git"], timeout=5)

    monkeypatch.setattr("kiv14_pcsb.authority.subprocess.run", timeout_git)
    runner = AuthorizedCaptureRunner()
    with pytest.raises(CaptureAuthorityRefused, match="timed out"):
        runner.run(authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO)
    assert reached == []


def test_malformed_and_unavailable_head_refuse_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-head"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    empty = tmp_path / "empty-git"
    empty.mkdir()
    (empty / "tools" / "governance" / "kiv14_acceptance_recovery").mkdir(parents=True)
    _git(empty, "init", "--initial-branch=main")
    with pytest.raises(CaptureAuthorityRefused, match="Git HEAD is unavailable"):
        current_package_commit(empty / "tools" / "governance" / "kiv14_acceptance_recovery")

    real_run = subprocess.run

    def malformed_head(cmd, *args, **kwargs):
        if isinstance(cmd, (list, tuple)) and "HEAD" in cmd and "--verify" in cmd:
            return subprocess.CompletedProcess(cmd, 0, stdout="not-a-sha\n", stderr="")
        return real_run(cmd, *args, **kwargs)

    monkeypatch.setattr("kiv14_pcsb.authority.subprocess.run", malformed_head)
    with pytest.raises(CaptureAuthorityRefused, match="Git HEAD is malformed"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
        )
    assert reached == []


def test_detached_head_match_accepted_mismatch_refuses(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    _repo, pkg, head = _seed_nested_package_repo(tmp_path / "detach")
    _git(_repo, "checkout", "--detach", "HEAD")
    proved = current_package_commit(pkg)
    assert proved == head
    dest = tmp_path / "ev-detach"
    matching = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_direct(), package_commit=head)
    )
    invocation = CaptureInvocation(
        matching.work_order_id, matching.pcsb_identity, matching.evidence_directory
    )
    AuthorizedCaptureRunner().run(
        authority=matching,
        invocation=invocation,
        conninfo=DIRECT_CONNINFO,
        root=pkg,
    )
    assert reached == [EFFECTIVE_DIRECT_CONNINFO]
    reached.clear()
    mismatch = parse_capture_authority(
        _authority_dict(dest=dest / "b", target=_target_direct(), package_commit="b" * 40)
    )
    mismatch_invocation = CaptureInvocation(
        mismatch.work_order_id, mismatch.pcsb_identity, mismatch.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="package_commit"):
        AuthorizedCaptureRunner().run(
            authority=mismatch,
            invocation=mismatch_invocation,
            conninfo=DIRECT_CONNINFO,
            root=pkg,
        )
    assert reached == []


def test_worktree_git_file_layout_is_provable(tmp_path):
    repo, _pkg, head = _seed_nested_package_repo(tmp_path / "wt-src")
    worktree = tmp_path / "wt-src" / "linked-worktree"
    _git(repo, "worktree", "add", "--detach", str(worktree))
    git_marker = worktree / ".git"
    assert git_marker.is_file()
    wt_pkg = worktree / "tools" / "governance" / "kiv14_acceptance_recovery"
    proved = current_package_commit(wt_pkg)
    assert proved == head
    deeper_repo, deeper_pkg, deeper_head = _seed_nested_package_repo(
        tmp_path / "deep", extra_parents=3
    )
    assert (deeper_repo / ".git").is_dir()
    assert current_package_commit(deeper_pkg) == deeper_head
    # Fixed parents[3] from this extra-deep package path is not the repo root.
    assert deeper_pkg.resolve().parents[3] != deeper_repo.resolve()


def test_manifest_and_hash_mismatch_still_refuse(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-pins"
    bad_manifest = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_direct(), package_manifest_sha256="c" * 64)
    )
    invocation = CaptureInvocation(
        bad_manifest.work_order_id,
        bad_manifest.pcsb_identity,
        bad_manifest.evidence_directory,
    )
    with pytest.raises(CaptureAuthorityRefused, match="package_manifest_sha256"):
        AuthorizedCaptureRunner().run(
            authority=bad_manifest, invocation=invocation, conninfo=DIRECT_CONNINFO
        )
    bad_hash = parse_capture_authority(
        _authority_dict(dest=dest / "h", target=_target_direct(), package_hash_of_hashes="d" * 64)
    )
    hash_invocation = CaptureInvocation(
        bad_hash.work_order_id, bad_hash.pcsb_identity, bad_hash.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="hash_of_hashes"):
        AuthorizedCaptureRunner().run(
            authority=bad_hash, invocation=hash_invocation, conninfo=DIRECT_CONNINFO
        )
    assert reached == []
    matching = parse_capture_authority(_authority_dict(dest=dest / "ok", target=_target_direct()))
    assert_authority_matches_this_package(matching)


def test_session_pooler_and_pooler_hosts_refuse_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-pooler"
    with pytest.raises(CaptureAuthorityRefused, match="continuity-ineligible"):
        parse_capture_authority(_authority_dict(dest=dest, target=_target_pooler()))
    with pytest.raises(CaptureAuthorityRefused, match=r"pooler\.supabase\.com"):
        parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={
                    **_target_direct(),
                    "host": "aws-0-eu-west-1.pooler.supabase.com",
                    "user": DIRECT_USER,
                },
            )
        )
    with pytest.raises(CaptureAuthorityRefused, match="KIV-226"):
        parse_capture_authority(
            _authority_dict(
                dest=dest,
                target={
                    **_target_direct(),
                    "host": POOLER_HOST,
                    "user": DIRECT_USER,
                },
            )
        )
    assert reached == []


def test_correct_direct_postgres_reaches_factory_after_pre_connect_checks(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-direct-ok"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    payload = AuthorizedCaptureRunner().run(
        authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
    )
    assert reached == [EFFECTIVE_DIRECT_CONNINFO]
    assert payload["retry"] is False
    pre_auth = dest / "capture_pre_auth.json"
    text = pre_auth.read_text()
    assert "password" not in text.lower()
    assert "2600:1f16" not in text
    contract = payload["authorized_target"]
    assert contract["route_class"] == ROUTE_CLASS_DIRECT_POSTGRES
    assert contract["host"] == DIRECT_HOST
    import json as _json

    recorded = _json.loads(text)
    assert recorded["later_executor_pre_auth_contract"]["kiv228_feasibility_receipt"][
        "aaaa_literal_frozen"
    ] is False
    assert recorded["later_executor_pre_auth_contract"]["kiv228_observed_aaaa_must_not_be_frozen"] is True
    assert recorded["connection_attempted"] is True
    assert recorded["sql_attempted"] is False

