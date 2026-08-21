from __future__ import annotations

import json
import os

import pytest

from kiv14_pcsb.authority import (
    CaptureInvocation,
    assert_authorized_capture_target,
    destination_binding_review_contract,
    parse_capture_authority,
)
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.constants import (
    GOVERNED_CLIENT_ENCODING,
    KIV220_ACCEPTED_HASH_OF_HASHES,
    LIBPQ_HERMETIC_ENV_VARS,
    PACKAGE_ID,
)
from kiv14_pcsb.driver import PersistentCaptureSession, reviewed_psycopg_connect
from kiv14_pcsb.errors import CaptureAuthorityRefused, ConninfoDestinationRefused, SequenceViolation
from kiv14_pcsb.evidence import hash_of_hashes, statement_catalog
from kiv14_pcsb.safety import ProductionTargetRefused, parse_canonical_conninfo

from test_capture_binding import (
    DIRECT_CONNINFO,
    DIRECT_CONNINFO_EXPLICIT,
    DIRECT_HOST,
    DIRECT_URI_EXPLICIT,
    EFFECTIVE_DIRECT_CONNINFO_EXPLICIT,
    POOLER_CONNINFO,
    SYNTHETIC_DIRECT_PASSWORD,
    _FakeConn,
    _authority_dict,
    _target_direct,
)


PRODUCTION_SHAPED_URI = (
    f"postgresql://postgres@{DIRECT_HOST}:5432/postgres?sslmode=require"
)


def test_uri_hostaddr_cannot_pass_direct_postgres_authority(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-hostaddr"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    poisoned = PRODUCTION_SHAPED_URI + "&hostaddr=127.0.0.1"
    with pytest.raises(ConninfoDestinationRefused, match="hostaddr"):
        assert_authorized_capture_target(poisoned, authority)
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="hostaddr"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=poisoned
        )
    with pytest.raises(CaptureAuthorityRefused, match="hostaddr"):
        PersistentCaptureSession(poisoned, authority=authority).connect()
    assert reached == []


def test_uri_query_host_cannot_override_netloc(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-qhost"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    poisoned = PRODUCTION_SHAPED_URI + "&host=127.0.0.1"
    with pytest.raises(ConninfoDestinationRefused, match="host="):
        assert_authorized_capture_target(poisoned, authority)
    with pytest.raises(CaptureAuthorityRefused, match="host="):
        PersistentCaptureSession(poisoned, authority=authority).connect()
    assert reached == []


def test_libpq_destination_environment_cannot_redirect_passing_authority(
    tmp_path, monkeypatch
):
    recorded: list[dict[str, str | None]] = []

    def spy(conninfo="", **_kwargs):
        recorded.append(
            {
                "conninfo": conninfo,
                **{key: os.environ.get(key) for key in LIBPQ_HERMETIC_ENV_VARS},
            }
        )
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", spy)
    dest = tmp_path / "ev-env"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    monkeypatch.setenv("PGHOSTADDR", "127.0.0.1")
    monkeypatch.setenv("PGHOST", "127.0.0.1")
    monkeypatch.setenv("PGPORT", "1")
    monkeypatch.setenv("PGDATABASE", "other")
    monkeypatch.setenv("PGUSER", "other")
    monkeypatch.setenv("PGSERVICE", "evil")
    monkeypatch.setenv("PGSERVICEFILE", str(tmp_path / "pg_service.conf"))
    monkeypatch.setenv("PGCLIENTENCODING", "SQL_ASCII")
    monkeypatch.setenv("PGOPTIONS", "-c search_path=pg_catalog -c default_transaction_read_only=on")
    monkeypatch.setenv("PGAPPNAME", "kiv232-adversary")
    monkeypatch.setenv("PGPASSWORD", "kiv234-env-only")
    session = PersistentCaptureSession(DIRECT_CONNINFO_EXPLICIT, authority=authority)
    session.connect()
    try:
        assert recorded, "reviewed factory must still reach psycopg.connect"
        from psycopg.conninfo import conninfo_to_dict

        got = conninfo_to_dict(recorded[0]["conninfo"] or "")
        expected = conninfo_to_dict(EFFECTIVE_DIRECT_CONNINFO_EXPLICIT)
        for key in ("host", "port", "dbname", "user", "sslmode", "client_encoding", "password"):
            assert got.get(key) == expected.get(key)
        assert got.get("passfile")
        assert os.path.basename(got["passfile"]) == "pgpass"
        assert "kiv14-pcsb-passfile-" in (got["passfile"] or "")
        for key in LIBPQ_HERMETIC_ENV_VARS:
            assert recorded[0][key] is None
        assert got.get("host") == authority.authorized_target.host
        assert int(got.get("port") or 0) == authority.authorized_target.port
        assert got.get("dbname") == authority.authorized_target.database
        assert got.get("user") == authority.authorized_target.user
        assert got.get("sslmode") == authority.authorized_target.sslmode
        assert got.get("client_encoding") == GOVERNED_CLIENT_ENCODING
        assert got.get("password") == SYNTHETIC_DIRECT_PASSWORD
    finally:
        session.close()


def test_service_file_indirection_refuses_before_socket(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    service = tmp_path / "pg_service.conf"
    service.write_text(
        "[evil]\nhost=127.0.0.1\nhostaddr=127.0.0.1\nport=5432\ndbname=postgres\nuser=postgres\n"
    )
    dest = tmp_path / "ev-svc"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    with pytest.raises(ConninfoDestinationRefused, match="service"):
        parse_canonical_conninfo("service=evil")
    with pytest.raises(CaptureAuthorityRefused, match="service"):
        PersistentCaptureSession("service=evil", authority=authority).connect()
    with pytest.raises(CaptureAuthorityRefused, match="service"):
        PersistentCaptureSession(
            DIRECT_CONNINFO + " service=evil", authority=authority
        ).connect()
    assert reached == []
    assert service.is_file()


def test_ambiguous_forms_fail_closed(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-amb"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    cases = {
        "multi-host": DIRECT_CONNINFO.replace(DIRECT_HOST, f"{DIRECT_HOST},127.0.0.1"),
        "multi-port": DIRECT_CONNINFO.replace("port=5432", "port=5432,6543"),
        "duplicate-host": DIRECT_CONNINFO + " host=127.0.0.1",
        "hostaddr-keyword": DIRECT_CONNINFO + " hostaddr=127.0.0.1",
        "empty-host": "host= port=5432 dbname=postgres user=postgres sslmode=require",
        "unix-socket": "host=/tmp port=5432 dbname=postgres user=postgres sslmode=require",
        "keyword-uri-mix-missing-sslmode": f"host={DIRECT_HOST} port=5432 dbname=postgres user=postgres",
    }
    for label, conninfo in cases.items():
        with pytest.raises(CaptureAuthorityRefused):
            PersistentCaptureSession(conninfo, authority=authority).connect()
        assert reached == [], label
    assert reached == []


def test_canonical_direct_identity_reaches_factory_equal_to_authority(
    tmp_path, monkeypatch
):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-canon"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    payload = AuthorizedCaptureRunner().run(
        authority=authority, invocation=invocation, conninfo=DIRECT_URI_EXPLICIT
    )
    assert reached == [EFFECTIVE_DIRECT_CONNINFO_EXPLICIT]
    parsed = parse_canonical_conninfo(reached[0])
    target = authority.authorized_target
    assert parsed.host == target.host
    assert parsed.port == target.port
    assert parsed.database == target.database
    assert parsed.user == target.user
    assert parsed.sslmode == target.sslmode
    assert payload["retry"] is False
    pre_auth = json.loads((dest / "capture_pre_auth.json").read_text())
    contract = pre_auth["destination_binding_review_contract"]
    assert contract["effective_destination_equals_authority_identity"] is True
    assert contract["review_method"]["production_dns_tcp_auth_sql_permitted"] is False
    assert "password" not in json.dumps(pre_auth).lower()


def test_default_capture_and_generic_remote_remain_refused(monkeypatch):
    def boom(_conninfo: str):
        raise AssertionError("reviewed factory must not be reached")

    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", boom)
    with pytest.raises(ProductionTargetRefused):
        PersistentCaptureSession(DIRECT_CONNINFO).connect()
    with pytest.raises(ProductionTargetRefused):
        PersistentCaptureSession(POOLER_CONNINFO).connect()
    from kiv14_pcsb.__main__ import cmd_capture, main

    assert cmd_capture() == 2
    assert main(["capture"]) == 2


def test_production_sql_hash_set_unchanged():
    digest = hash_of_hashes(statement_catalog())
    assert digest == KIV220_ACCEPTED_HASH_OF_HASHES


def test_no_retry_after_destination_bound_connect(tmp_path, monkeypatch):
    monkeypatch.setattr("kiv14_pcsb.driver.reviewed_psycopg_connect", lambda _c: _FakeConn())
    dest = tmp_path / "ev-retry"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    runner = AuthorizedCaptureRunner()
    payload = runner.run(
        authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO_EXPLICIT
    )
    assert payload["retry"] is False
    with pytest.raises(SequenceViolation, match="retry"):
        runner.run(authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO)


def test_review_contract_forbids_production_contact():
    contract = destination_binding_review_contract()
    assert contract["review_method"]["production_dns_tcp_auth_sql_required"] is False
    assert contract["review_method"]["production_dns_tcp_auth_sql_permitted"] is False
    assert PACKAGE_ID == "KIV-217-A2-PCSB-QUERY-DRIVER-PACKAGE"
    assert contract["opaque_conninfo_never_passed_to_libpq"] is True


def test_pghostaddr_cannot_redirect_live_loopback(local_conninfo, monkeypatch):
    monkeypatch.setenv("PGHOSTADDR", "127.0.0.2")
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        assert session.pre_p0_backend_pid and session.pre_p0_backend_pid > 0
        assert session.sql_log == []
    finally:
        session.close()


def test_reviewed_factory_reconstructs_before_psycopg(monkeypatch):
    recorded: list[str] = []

    def spy(conninfo="", **_kwargs):
        recorded.append(conninfo)
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", spy)
    monkeypatch.setenv("PGHOSTADDR", "127.0.0.1")
    conn = reviewed_psycopg_connect(
        "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
    )
    from psycopg.conninfo import conninfo_to_dict

    assert len(recorded) == 1
    got = conninfo_to_dict(recorded[0])
    assert got.get("host") == "127.0.0.1"
    assert got.get("port") == "55432"
    assert got.get("dbname") == "postgres"
    assert got.get("user") == "kiv217"
    assert got.get("sslmode") == "disable"
    assert got.get("client_encoding") == "UTF8"
    assert not got.get("password")
    assert got.get("passfile")
    assert os.path.basename(got["passfile"]) == "pgpass"
    assert "kiv14-pcsb-passfile-" in (got["passfile"] or "")
    assert "host=127.0.0.1" in recorded[0]
    assert conn.info.backend_pid == 4242
