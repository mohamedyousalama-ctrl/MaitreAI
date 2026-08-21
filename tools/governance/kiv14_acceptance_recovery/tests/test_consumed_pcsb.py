from __future__ import annotations

from pathlib import Path

import pytest

from kiv14_pcsb.__main__ import cmd_capture, main
from kiv14_pcsb.authority import (
    AuthorizedTarget,
    CaptureAuthority,
    CaptureInvocation,
    assert_invocation_matches_authority,
    consumed_capture_identity_contract,
    current_package_commit,
    destination_binding_review_contract,
    live_package_pins,
    parse_capture_authority,
)
from kiv14_pcsb.capture_binding import AuthorizedCaptureRunner
from kiv14_pcsb.constants import (
    CONSUMED_PCSB_IDENTITIES,
    GOVERNANCE_DISCLAIMER,
    KIV220_ACCEPTED_HASH_OF_HASHES,
    KIV237_ACCEPTED_COMMIT,
    KIV237_ACCEPTED_MANIFEST_BLOB,
    KIV237_ACCEPTED_MANIFEST_SHA256,
    KIV237_ACCEPTED_PACKAGE_VERSION,
    NEXT_UNUSED_PCSB_IDENTITY,
    PACKAGE_CONTEXT,
    PACKAGE_ID,
    PACKAGE_VERSION,
)
from kiv14_pcsb.errors import CaptureAuthorityRefused
from kiv14_pcsb.evidence import build_package_manifest, hash_of_hashes, statement_catalog
from kiv14_pcsb.statements import package_root

from test_capture_binding import (
    DIRECT_CONNINFO,
    _FakeConn,
    _authority_dict,
    _target_direct,
    _target_loopback,
    _write_authority,
)


CONSUMED_REFUSAL = "permanently incomplete/consumed and cannot be rebound"
OPERATOR_CONTRACT = (
    package_root().parents[2]
    / "docs"
    / "governance"
    / "KIV-217_A2_PCSB_QUERY_DRIVER_PACKAGE.md"
)


def _hand_built_authority(*, dest: Path, pcsb: str, target: dict | None = None) -> CaptureAuthority:
    target = target or _target_loopback()
    pins = live_package_pins()
    return CaptureAuthority(
        work_order_id="KIV-999",
        pcsb_identity=pcsb,
        package_commit=current_package_commit(),
        package_manifest_sha256=pins["manifest_sha256"],
        package_hash_of_hashes=pins["hash_of_hashes"],
        package_id=PACKAGE_ID,
        authorized_target=AuthorizedTarget(
            route_class=target["route_class"],
            project_name=target["project_name"],
            project_ref=target["project_ref"],
            host=target["host"],
            port=target["port"],
            database=target["database"],
            user=target["user"],
            sslmode=target["sslmode"],
        ),
        evidence_directory=str(dest),
        governance_disclaimer=GOVERNANCE_DISCLAIMER,
    )


def test_pcsb1_authority_refuses_as_consumed(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        parse_capture_authority(
            _authority_dict(dest=tmp_path / "ev", target=_target_direct(), pcsb="PCSB-1")
        )
    assert reached == []


def test_pcsb2_authority_refuses_as_consumed(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        parse_capture_authority(
            _authority_dict(dest=tmp_path / "ev", target=_target_direct(), pcsb="PCSB-2")
        )
    assert reached == []


def test_pcsb3_authority_refuses_as_permanently_incomplete(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    with pytest.raises(CaptureAuthorityRefused, match=r"PCSB-3 is permanently incomplete/consumed"):
        parse_capture_authority(
            _authority_dict(dest=tmp_path / "ev", target=_target_loopback(), pcsb="PCSB-3")
        )
    assert reached == []


def test_pcsb4_is_not_rejected_merely_as_consumed(tmp_path):
    authority = parse_capture_authority(
        _authority_dict(
            dest=tmp_path / "ev",
            target=_target_loopback(),
            pcsb=NEXT_UNUSED_PCSB_IDENTITY,
        )
    )
    assert authority.pcsb_identity == "PCSB-4"
    assert "PCSB-4" not in CONSUMED_PCSB_IDENTITIES


def test_invocation_cannot_bypass_consumed_identity(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev"
    unused = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-9")
    )
    consumed_invocation = CaptureInvocation("KIV-999", "PCSB-3", str(dest))
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        assert_invocation_matches_authority(unused, consumed_invocation)
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        AuthorizedCaptureRunner().run(
            authority=unused,
            invocation=consumed_invocation,
            conninfo=DIRECT_CONNINFO,
        )
    hand_built = _hand_built_authority(dest=dest, pcsb="PCSB-3")
    matching = CaptureInvocation("KIV-999", "PCSB-3", str(dest))
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        AuthorizedCaptureRunner().run(
            authority=hand_built,
            invocation=matching,
            conninfo=DIRECT_CONNINFO,
        )
    assert reached == []


def test_alternative_formatting_cannot_rebind_pcsb3(tmp_path):
    dest = tmp_path / "ev"
    base = _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-9")
    consumed_forms = (
        "PCSB-3",
        " PCSB-3",
        "PCSB-3 ",
        "\tPCSB-3\n",
        "PCSB-3\r",
        "PCSB-3\u00a0",
    )
    malformed_forms = (
        "pcsb-3",
        "Pcsb-3",
        "PCSB-03",
        "PCSB-3\x00",
        "PCSB-\u20133",
    )
    for form in consumed_forms:
        payload = {**base, "pcsb_identity": form}
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            parse_capture_authority(payload)
    for form in malformed_forms:
        payload = {**base, "pcsb_identity": form}
        with pytest.raises(CaptureAuthorityRefused):
            parse_capture_authority(payload)
        with pytest.raises(CaptureAuthorityRefused, match="malformed pcsb_identity"):
            parse_capture_authority(payload)


def test_manifest_and_operator_contract_declare_consumed_and_unused():
    contract = consumed_capture_identity_contract()
    assert contract["consumed_pcsb_identities"] == ["PCSB-1", "PCSB-2", "PCSB-3"]
    assert contract["next_unused_pcsb_identity"] == "PCSB-4"
    assert contract["next_unused_authorized_by_this_package"] is False
    manifest = build_package_manifest()
    assert manifest["consumed_capture_identities"] == contract
    assert manifest["package_version"] == PACKAGE_VERSION
    assert manifest["package_context"] == PACKAGE_CONTEXT
    assert PACKAGE_VERSION == "0.1.8-kiv242-consumed-pcsb-candidate"
    assert PACKAGE_CONTEXT == "KIVO-A2-RECOVERY-CONSUMED-PCSB-BUILDER-242"
    assert manifest["kiv237_accepted_parent"] == {
        "commit": KIV237_ACCEPTED_COMMIT,
        "package_version": KIV237_ACCEPTED_PACKAGE_VERSION,
        "manifest_sha256": KIV237_ACCEPTED_MANIFEST_SHA256,
        "manifest_blob": KIV237_ACCEPTED_MANIFEST_BLOB,
        "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
    }
    text = OPERATOR_CONTRACT.read_text()
    assert "PCSB-1" in text and "PCSB-2" in text and "PCSB-3" in text
    assert "permanently incomplete" in text
    assert "**consumed / permanently incomplete:** `PCSB-1`, `PCSB-2`, `PCSB-3`" in text
    assert "**next unused, not authorized by this package:** `PCSB-4`" in text
    assert "no PCSB-4" in text


def test_production_hash_of_hashes_unchanged():
    catalog = statement_catalog()
    assert hash_of_hashes(catalog) == KIV220_ACCEPTED_HASH_OF_HASHES
    assert build_package_manifest()["hash_of_hashes"] == KIV220_ACCEPTED_HASH_OF_HASHES


def test_passfile_parser_destination_hermetic_controls_unchanged():
    binding = destination_binding_review_contract()
    assert binding["default_filesystem_passfile_neutralized"] is True
    assert binding["package_controlled_empty_passfile_injected_at_libpq_boundary"] is True
    assert binding["operator_supplied_passfile_refused"] is True
    assert binding["direct_postgres_requires_explicit_in_memory_secret"] is True
    assert binding["hermetic_libpq_environment"] is True
    assert binding["effective_destination_equals_authority_identity"] is True
    assert binding["keyword_conninfo_parser"]["unquoted_backslash"] == "fail closed"
    assert binding["uri_conninfo_parser"]["percent_encoded_host"] == "fail closed"


def test_default_capture_remains_refused():
    assert cmd_capture() == 2
    assert main(["capture"]) == 2


def test_authorized_capture_cli_refuses_pcsb3_before_factory(tmp_path, monkeypatch):
    reached: list[str] = []
    monkeypatch.setattr(
        "kiv14_pcsb.driver.reviewed_psycopg_connect",
        lambda conninfo: reached.append(conninfo) or _FakeConn(),
    )
    dest = tmp_path / "ev-cli"
    payload = _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-3")
    authority_path = _write_authority(tmp_path, payload)
    conn_path = tmp_path / "conninfo"
    conn_path.write_text("host=127.0.0.1 port=1 dbname=postgres user=kiv217 sslmode=disable")
    rc = main(
        [
            "authorized-capture",
            "--authority",
            str(authority_path),
            "--work-order",
            payload["work_order_id"],
            "--pcsb",
            "PCSB-3",
            "--conninfo-file",
            str(conn_path),
            "--evidence-dir",
            str(dest),
        ]
    )
    assert rc == 2
    assert reached == []
