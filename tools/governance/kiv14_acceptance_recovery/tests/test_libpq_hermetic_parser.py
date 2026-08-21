from __future__ import annotations

import os

import pytest

from kiv14_pcsb.authority import (
    CaptureInvocation,
    destination_binding_review_contract,
    parse_capture_authority,
)
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.constants import GOVERNED_CLIENT_ENCODING, LIBPQ_HERMETIC_ENV_VARS
from kiv14_pcsb.driver import PersistentCaptureSession, reviewed_psycopg_connect
from kiv14_pcsb.errors import ConninfoDestinationRefused
from kiv14_pcsb.safety import parse_canonical_conninfo

from test_capture_binding import (
    DIRECT_HOST,
    EFFECTIVE_DIRECT_CONNINFO,
    _FakeConn,
    _authority_dict,
    _target_direct,
)


_ENV_TOKEN = "kiv234-env-only-token"
_EXPLICIT_TOKEN = "kiv234-explicit-only-token"


def _spy_connect(recorded, monkeypatch):
    def spy(conninfo="", **_kwargs):
        recorded.append(
            {
                "conninfo": conninfo,
                **{key: os.environ.get(key) for key in LIBPQ_HERMETIC_ENV_VARS},
            }
        )
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", spy)


def test_keyword_percent_literals_are_not_uri_decoded():
    parsed = parse_canonical_conninfo(
        "host=127%2e0%2e0%2e1 port=5432 dbname=postgres user=kiv%32%31%37 "
        "password=foo%40bar sslmode=disable"
    )
    assert parsed.host == "127%2e0%2e0%2e1"
    assert parsed.user == "kiv%32%31%37"
    assert parsed.password == "foo%40bar"
    rebuilt = parsed.as_keyword_conninfo()
    assert "password=foo%40bar" in rebuilt
    assert "foo@bar" not in rebuilt
    assert "127.0.0.1" not in rebuilt
    assert "kiv217" not in rebuilt.split("user=", 1)[1].split()[0]


def test_uri_percent_decoding_is_uri_only():
    parsed = parse_canonical_conninfo(
        "postgresql://kiv%32%31%37:foo%40bar@127.0.0.1:5432/postgres?sslmode=disable"
    )
    assert parsed.host == "127.0.0.1"
    assert parsed.user == "kiv217"
    assert parsed.password == "foo@bar"
    rebuilt = parsed.as_keyword_conninfo()
    assert "password=foo@bar" in rebuilt
    assert "user=kiv217" in rebuilt


def test_quoted_keyword_backslash_matches_libpq():
    parsed = parse_canonical_conninfo(
        "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
        "password='foo\\'bar' sslmode=disable"
    )
    assert parsed.password == "foo'bar"
    rebuilt = parse_canonical_conninfo(parsed.as_keyword_conninfo())
    assert rebuilt.password == "foo'bar"


def test_special_character_keyword_values_round_trip_or_fail_closed():
    cases = {
        "space": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password='a b' sslmode=disable",
        "equals": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password=a=b sslmode=disable",
        "percent": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password=p%40q sslmode=disable",
        "at": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password=p@q sslmode=disable",
        "colon": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password=p:q sslmode=disable",
        "unicode": "host=127.0.0.1 port=5432 dbname=postgres user=kiv217-ü password=sø sslmode=disable",
        "backslash": r"host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password='a\\b' sslmode=disable",
    }
    expected_passwords = {
        "space": "a b",
        "equals": "a=b",
        "percent": "p%40q",
        "at": "p@q",
        "colon": "p:q",
        "unicode": "sø",
        "backslash": "a\\b",
    }
    for label, conninfo in cases.items():
        parsed = parse_canonical_conninfo(conninfo)
        if "password=" in conninfo:
            assert parsed.password == expected_passwords[label], label
            again = parse_canonical_conninfo(parsed.as_keyword_conninfo())
            assert again.password == expected_passwords[label], label
        assert parsed.client_encoding == GOVERNED_CLIENT_ENCODING


def test_malformed_quoting_and_duplicate_aliases_fail_closed():
    with pytest.raises(ConninfoDestinationRefused, match="unmatched quoted"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password='foo sslmode=disable"
        )
    with pytest.raises(ConninfoDestinationRefused, match="unmatched quoted"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 password='foo'bar sslmode=disable"
        )
    with pytest.raises(ConninfoDestinationRefused, match="dbname and database"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres database=other user=kiv217 sslmode=disable"
        )
    with pytest.raises(ConninfoDestinationRefused, match="duplicate"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 user=other sslmode=disable"
        )


def test_non_utf8_client_encoding_keyword_fails_closed():
    with pytest.raises(ConninfoDestinationRefused, match="UTF8"):
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 sslmode=disable "
            "client_encoding=SQL_ASCII"
        )


def test_refusal_messages_do_not_echo_secret_material():
    with pytest.raises(ConninfoDestinationRefused) as exc:
        parse_canonical_conninfo(
            "host=127.0.0.1 port=5432 dbname=postgres user=kiv217 "
            f"password='{_EXPLICIT_TOKEN} sslmode=disable"
        )
    assert _EXPLICIT_TOKEN not in str(exc.value)


def test_runner_and_session_factory_receive_governed_utf8(tmp_path, monkeypatch):
    recorded: list[dict[str, str | None]] = []
    _spy_connect(recorded, monkeypatch)
    dest = tmp_path / "ev-utf8"
    authority = parse_capture_authority(_authority_dict(dest=dest, target=_target_direct()))
    invocation = CaptureInvocation(
        authority.work_order_id, authority.pcsb_identity, authority.evidence_directory
    )
    AuthorizedCaptureRunner().run(
        authority=authority,
        invocation=invocation,
        conninfo=f"postgresql://postgres@{DIRECT_HOST}:5432/postgres?sslmode=require",
    )
    session = PersistentCaptureSession(
        f"host={DIRECT_HOST} port=5432 dbname=postgres user=postgres sslmode=require",
        authority=authority,
    )
    session.connect()
    session.close()
    assert len(recorded) == 2
    for item in recorded:
        assert item["conninfo"] == EFFECTIVE_DIRECT_CONNINFO
        assert "client_encoding=UTF8" in (item["conninfo"] or "")
        for key in LIBPQ_HERMETIC_ENV_VARS:
            assert item[key] is None


def test_pgpassword_cannot_supply_or_override_secret(monkeypatch):
    recorded: list[dict[str, str | None]] = []
    _spy_connect(recorded, monkeypatch)
    monkeypatch.setenv("PGPASSWORD", _ENV_TOKEN)

    reviewed_psycopg_connect(
        "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
    )
    assert recorded[0]["PGPASSWORD"] is None
    assert _ENV_TOKEN not in (recorded[0]["conninfo"] or "")
    assert "password=" not in (recorded[0]["conninfo"] or "")

    reviewed_psycopg_connect(
        "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 "
        f"password={_EXPLICIT_TOKEN} sslmode=disable"
    )
    assert recorded[1]["PGPASSWORD"] is None
    assert f"password={_EXPLICIT_TOKEN}" in (recorded[1]["conninfo"] or "")
    assert _ENV_TOKEN not in (recorded[1]["conninfo"] or "")
    assert os.environ.get("PGPASSWORD") == _ENV_TOKEN


def test_stripped_env_restored_after_success_and_failure(monkeypatch):
    monkeypatch.setenv("PGCLIENTENCODING", "SQL_ASCII")
    monkeypatch.setenv("PGOPTIONS", "-c search_path=pg_catalog")
    monkeypatch.setenv("PGAPPNAME", "kiv232-adversary")
    monkeypatch.setenv("PGPASSWORD", _ENV_TOKEN)

    recorded: list[str] = []

    def spy(conninfo="", **_kwargs):
        recorded.append(conninfo)
        return _FakeConn()

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", spy)
    reviewed_psycopg_connect(
        "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
    )
    assert os.environ.get("PGCLIENTENCODING") == "SQL_ASCII"
    assert os.environ.get("PGOPTIONS") == "-c search_path=pg_catalog"
    assert os.environ.get("PGAPPNAME") == "kiv232-adversary"
    assert os.environ.get("PGPASSWORD") == _ENV_TOKEN

    def boom(conninfo="", **_kwargs):
        raise RuntimeError("synthetic-connect-failure")

    monkeypatch.setattr("kiv14_pcsb.driver.psycopg.connect", boom)
    with pytest.raises(RuntimeError, match="synthetic-connect-failure"):
        reviewed_psycopg_connect(
            "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
        )
    assert os.environ.get("PGCLIENTENCODING") == "SQL_ASCII"
    assert os.environ.get("PGPASSWORD") == _ENV_TOKEN
    assert _ENV_TOKEN not in "".join(recorded)


def test_review_contract_records_hermetic_inventory():
    contract = destination_binding_review_contract()
    stripped = set(contract["stripped_libpq_environment"])
    assert "PGCLIENTENCODING" in stripped
    assert "PGOPTIONS" in stripped
    assert "PGAPPNAME" in stripped
    assert "secret-environment-variable" in stripped
    assert "PGPASSWORD" not in stripped
    from kiv14_pcsb.constants import LIBPQ_HERMETIC_ENV_VARS as live_names
    assert "PGPASSWORD" in live_names
    assert contract["governed_client_encoding"] == "UTF8"
    assert contract["hermetic_libpq_environment"] is True
    inventory = contract["libpq_environment_inventory"]
    assert set(inventory["startup_session_gucs"]) >= {
        "PGCLIENTENCODING",
        "PGOPTIONS",
        "PGAPPNAME",
    }


def test_pgclientencoding_cannot_change_loopback_utf8(local_conninfo, monkeypatch):
    monkeypatch.setenv("PGCLIENTENCODING", "SQL_ASCII")
    conn = reviewed_psycopg_connect(local_conninfo)
    try:
        assert conn.info.encoding.lower().replace("-", "") == "utf8"
        row = conn.execute(
            "SELECT pg_catalog.current_setting('client_encoding') AS enc"
        ).fetchone()
        assert str(row["enc"]).upper() == "UTF8"
    finally:
        conn.close()
    assert os.environ.get("PGCLIENTENCODING") == "SQL_ASCII"


def test_pgoptions_cannot_inject_startup_gucs(local_conninfo, monkeypatch):
    monkeypatch.setenv(
        "PGOPTIONS",
        "-c search_path=pg_catalog -c default_transaction_read_only=on",
    )
    conn = reviewed_psycopg_connect(local_conninfo)
    try:
        row = conn.execute(
            "SELECT pg_catalog.current_setting('search_path') AS search_path, "
            "pg_catalog.current_setting('default_transaction_read_only') AS read_only"
        ).fetchone()
        assert "pg_catalog" != str(row["search_path"]).strip()
        assert str(row["read_only"]).lower() in {"off", "false"}
    finally:
        conn.close()


def test_pgappname_cannot_alter_reviewed_session(local_conninfo, monkeypatch):
    monkeypatch.setenv("PGAPPNAME", "kiv232-adversary")
    conn = reviewed_psycopg_connect(local_conninfo)
    try:
        row = conn.execute(
            "SELECT pg_catalog.current_setting('application_name') AS app"
        ).fetchone()
        assert str(row["app"]) != "kiv232-adversary"
    finally:
        conn.close()
    assert os.environ.get("PGAPPNAME") == "kiv232-adversary"
