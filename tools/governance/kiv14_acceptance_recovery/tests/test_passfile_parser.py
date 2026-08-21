from __future__ import annotations

import os
from pathlib import Path

import pytest
from psycopg.conninfo import conninfo_to_dict

from kiv14_pcsb.authority import CaptureInvocation, parse_capture_authority
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.driver import PersistentCaptureSession, reviewed_psycopg_connect
from kiv14_pcsb.errors import CaptureAuthorityRefused, ConninfoDestinationRefused
from kiv14_pcsb.local_pg import init_and_start_password_auth, stop_cluster
from kiv14_pcsb.safety import parse_canonical_conninfo

from test_capture_binding import (
    DIRECT_CONNINFO,
    DIRECT_CONNINFO_EXPLICIT,
    EFFECTIVE_DIRECT_CONNINFO_EXPLICIT,
    SYNTHETIC_DIRECT_PASSWORD,
    _FakeConn,
    _authority_dict,
    _target_direct,
)


_PASSFILE_TOKEN = "kiv237-passfile-only-token"
_EXPLICIT_TOKEN = "kiv237-explicit-only-token"
_OTHER_TOKEN = "kiv237-other-passfile-token"


def _libpq(conninfo: str) -> dict[str, str | None]:
    return conninfo_to_dict(conninfo)


def test_unquoted_keyword_backslash_fails_closed_before_factory(monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    cases = {
        "backslash-letter": (
            r"host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            r"password=foo\Xbar sslmode=disable"
        ),
        "backslash-space": (
            r"host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            r"password=foo\ bar sslmode=disable"
        ),
        "trailing-backslash": (
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            "sslmode=disable password=foo\\"
        ),
        "backslash-quote": (
            r"host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            r"password=foo\'bar sslmode=disable"
        ),
        "user": (
            r"host=127.0.0.1 port=5432 dbname=postgres user=kiv\217 "
            r"sslmode=disable"
        ),
        "dbname": (
            r"host=127.0.0.1 port=5432 dbname=post\gres user=kiv217 "
            r"sslmode=disable"
        ),
        "host": (
            r"host=127\.0.0.1 port=5432 dbname=postgres user=kiv217 "
            r"sslmode=disable"
        ),
    }
    for label, conninfo in cases.items():
        try:
            libpq = _libpq(conninfo)
        except Exception:
            libpq = None
        if label == "backslash-letter" and libpq is not None:
            assert libpq.get("password") != r"foo\Xbar"
            assert libpq.get("password") == "fooXbar"
        with pytest.raises(ConninfoDestinationRefused, match="unquoted keyword backslash"):
            parse_canonical_conninfo(conninfo)
        with pytest.raises(ConninfoDestinationRefused, match="unquoted keyword backslash"):
            reviewed_psycopg_connect(conninfo)
        assert reached == [], label


def test_quoted_backslash_still_matches_libpq():
    conninfo = (
        "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
        r"password='foo\Xbar\'baz' sslmode=disable"
    )
    parsed = parse_canonical_conninfo(conninfo)
    libpq = _libpq(conninfo)
    assert parsed.password == libpq.get("password")
    rebuilt = parse_canonical_conninfo(parsed.as_keyword_conninfo())
    assert rebuilt.password == parsed.password


def test_percent_encoded_uri_host_fails_closed_before_factory(monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    cases = {
        "dot-2e": "postgresql://kiv217@127%2e0%2e0%2e1:5432/postgres?sslmode=disable",
        "mixed-case": "postgresql://kiv217@127%2E0%2e0%2e1:5432/postgres?sslmode=disable",
        "encoded-colon": "postgresql://kiv217@127.0.0.1%3a5432/postgres?sslmode=disable",
        "malformed": "postgresql://kiv217@127.0.0.1%zz:5432/postgres?sslmode=disable",
        "double-encoded": "postgresql://kiv217@127%252e0.0.1:5432/postgres?sslmode=disable",
    }
    for label, conninfo in cases.items():
        with pytest.raises(ConninfoDestinationRefused, match="percent-encoded URI host"):
            parse_canonical_conninfo(conninfo)
        with pytest.raises(ConninfoDestinationRefused, match="percent-encoded URI host"):
            reviewed_psycopg_connect(conninfo)
        assert reached == [], label
    decoded = _libpq("postgresql://kiv217@127%2e0%2e0%2e1:5432/postgres?sslmode=disable")
    assert decoded.get("host") == "127.0.0.1"


def test_uri_userinfo_path_query_still_decode_once():
    parsed = parse_canonical_conninfo(
        "postgresql://kiv%32%31%37:foo%40bar@127.0.0.1:5432/postgres%252db?sslmode=disable"
    )
    libpq = _libpq(
        "postgresql://kiv%32%31%37:foo%40bar@127.0.0.1:5432/postgres%252db?sslmode=disable"
    )
    assert parsed.user == "kiv217"
    assert parsed.password == "foo@bar"
    assert parsed.database == libpq.get("dbname")
    assert parsed.host == "127.0.0.1"
    assert "%2e" not in (parsed.host or "")


def test_operator_supplied_passfile_is_refused(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    fake = tmp_path / "pgpass"
    fake.write_text("*:*:*:*:not-used\n")
    os.chmod(fake, 0o600)
    with pytest.raises(ConninfoDestinationRefused, match="passfile"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            f"sslmode=disable passfile={fake}"
        )
    assert reached == []


def test_direct_postgres_without_explicit_password_never_reaches_factory(
    tmp_path, monkeypatch
):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-nopw"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    with pytest.raises(CaptureAuthorityRefused, match="explicit in-memory password"):
        AuthorizedCaptureRunner().run(
            authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO
        )
    with pytest.raises(CaptureAuthorityRefused, match="explicit in-memory password"):
        PersistentCaptureSession(DIRECT_CONNINFO, authority=authority).connect()
    assert reached == []
    AuthorizedCaptureRunner().run(
        authority=authority, invocation=invocation, conninfo=DIRECT_CONNINFO_EXPLICIT
    )
    assert reached == [EFFECTIVE_DIRECT_CONNINFO_EXPLICIT]
    assert SYNTHETIC_DIRECT_PASSWORD not in (dest / "capture_pre_auth.json").read_text()


@pytest.fixture
def scram_cluster():
    from kiv14_pcsb.local_pg import assert_pg176_prefix

    try:
        assert_pg176_prefix()
    except Exception as exc:
        pytest.skip(f"PostgreSQL 17.6 prefix unavailable: {exc}")
    cluster = init_and_start_password_auth(label="kiv237-passfile", password=_EXPLICIT_TOKEN)
    try:
        yield cluster
    finally:
        stop_cluster(cluster)


def _write_pgpass(home: Path, *, port: int, password: str) -> Path:
    pgpass = home / ".pgpass"
    pgpass.write_text(f"127.0.0.1:{port}:postgres:kiv217:{password}\n")
    os.chmod(pgpass, 0o600)
    return pgpass


def test_matching_temp_pgpass_cannot_authenticate_no_password_path(
    scram_cluster, tmp_path, monkeypatch
):
    home = tmp_path / "home"
    home.mkdir()
    pgpass = _write_pgpass(home, port=scram_cluster.port, password=_EXPLICIT_TOKEN)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("PGPASSWORD", raising=False)
    monkeypatch.delenv("PGPASSFILE", raising=False)
    no_password = (
        f"host=127.0.0.1 port={scram_cluster.port} dbname=postgres "
        "user=kiv217 sslmode=disable client_encoding=UTF8"
    )
    import psycopg
    from psycopg.rows import dict_row

    raw = psycopg.connect(no_password, autocommit=True, row_factory=dict_row)
    try:
        assert raw.info.backend_pid > 0
    finally:
        raw.close()

    with pytest.raises(Exception) as exc:
        reviewed_psycopg_connect(no_password)
    assert _EXPLICIT_TOKEN not in str(exc.value)
    assert _PASSFILE_TOKEN not in str(exc.value)
    assert pgpass.is_file()
    assert os.environ.get("HOME") == str(home)


def test_explicit_password_wins_over_temp_pgpass(scram_cluster, tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    _write_pgpass(home, port=scram_cluster.port, password=_PASSFILE_TOKEN)
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("PGPASSWORD", raising=False)
    monkeypatch.delenv("PGPASSFILE", raising=False)
    explicit = (
        f"host=127.0.0.1 port={scram_cluster.port} dbname=postgres "
        f"user=kiv217 password={_EXPLICIT_TOKEN} sslmode=disable"
    )
    wrong = (
        f"host=127.0.0.1 port={scram_cluster.port} dbname=postgres "
        f"user=kiv217 password={_OTHER_TOKEN} sslmode=disable"
    )
    conn = reviewed_psycopg_connect(explicit)
    try:
        assert conn.info.backend_pid > 0
        row = conn.execute(
            "SELECT pg_catalog.current_setting('client_encoding') AS enc"
        ).fetchone()
        assert str(row["enc"]).upper() == "UTF8"
    finally:
        conn.close()
    with pytest.raises(Exception) as exc:
        reviewed_psycopg_connect(wrong)
    text = str(exc.value)
    assert _PASSFILE_TOKEN not in text
    assert _EXPLICIT_TOKEN not in text
    assert _OTHER_TOKEN not in text


def test_factory_passfile_is_package_controlled_not_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    pgpass = _write_pgpass(home, port=55432, password=_PASSFILE_TOKEN)
    monkeypatch.setenv("HOME", str(home))
    recorded: list[str] = []

    def spy(conninfo="", **_kwargs):
        recorded.append(conninfo)
        got = conninfo_to_dict(conninfo)
        path = got.get("passfile") or ""
        assert path
        assert Path(path).is_file()
        assert Path(path).stat().st_size == 0
        assert path != str(pgpass)
        assert os.path.basename(path) == "pgpass"
        assert "kiv14-pcsb-passfile-" in path
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", spy)
    reviewed_psycopg_connect(
        "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
    )
    assert recorded
    got = conninfo_to_dict(recorded[0])
    assert got.get("passfile") != str(pgpass)
    assert not recorded[0].endswith(str(pgpass))
