from __future__ import annotations

from pathlib import Path

import psycopg
import pytest

from kiv14_pcsb.__main__ import cmd_capture, main
from kiv14_pcsb.authority import (
    AuthorizedTarget,
    CaptureAuthority,
    CaptureInvocation,
    assert_authority_matches_this_package,
    assert_authorized_capture_target,
    assert_invocation_matches_authority,
    assert_runtime_capture_identity_eligible,
    bind_authorized_effective_conninfo,
    consumed_capture_identity_contract,
    current_package_commit,
    destination_binding_review_contract,
    live_package_pins,
    load_capture_authority,
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
    KIV242_BLOCKED_COMMIT,
    KIV242_BLOCKED_MANIFEST_BLOB,
    KIV242_BLOCKED_MANIFEST_SHA256,
    KIV242_BLOCKED_PACKAGE_VERSION,
    NEXT_UNUSED_PCSB_IDENTITY,
    PACKAGE_CONTEXT,
    PACKAGE_ID,
    PACKAGE_VERSION,
)
from kiv14_pcsb.driver import PersistentCaptureSession
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
MALFORMED_REFUSAL = "malformed pcsb_identity"
LOOPBACK_CONNINFO = (
    "host=127.0.0.1 port=55432 dbname=postgres user=kiv217 sslmode=disable"
)
OPERATOR_CONTRACT = (
    package_root().parents[2]
    / "docs"
    / "governance"
    / "KIV-217_A2_PCSB_QUERY_DRIVER_PACKAGE.md"
)


def _hand_built_authority(
    *,
    dest: Path,
    pcsb: str,
    target: dict | None = None,
    package_commit: str | None = None,
) -> CaptureAuthority:
    target = target or _target_loopback()
    pins = live_package_pins()
    return CaptureAuthority(
        work_order_id="KIV-999",
        pcsb_identity=pcsb,
        package_commit=package_commit or current_package_commit(),
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


def _spy_actual_psycopg_connect(monkeypatch) -> list[object]:
    reached: list[object] = []

    def fake_connect(*args, **kwargs):
        reached.append(args[0] if args else kwargs)
        return _FakeConn()

    monkeypatch.setattr(psycopg, "connect", fake_connect)
    return reached


def _write_conninfo(tmp_path: Path, conninfo: str = LOOPBACK_CONNINFO) -> Path:
    path = tmp_path / "conninfo"
    path.write_text(conninfo)
    return path


def _cli_args(authority_path: Path, payload: dict, dest: Path, conn_path: Path, pcsb: str) -> list[str]:
    return [
        "authorized-capture",
        "--authority",
        str(authority_path),
        "--work-order",
        payload["work_order_id"],
        "--pcsb",
        pcsb,
        "--conninfo-file",
        str(conn_path),
        "--evidence-dir",
        str(dest),
    ]


DIRECT_OBJECT_MALFORMED = (
    "pcsb-3",
    "Pcsb-3",
    "PCSB-03",
    " PCSB-3",
    "PCSB-3 ",
    "\tPCSB-3\n",
    "PCSB-3\r",
    "PCSB-3\x00",
    "PCSB-\u20133",
    "PCSB_3",
    "PCSB--3",
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
    assert contract["canonical_runtime_guard"] == "assert_runtime_capture_identity_eligible"
    assert contract["canonical_runtime_guard_applies_to_direct_objects"] is True
    manifest = build_package_manifest()
    assert manifest["consumed_capture_identities"] == contract
    assert manifest["package_version"] == PACKAGE_VERSION
    assert manifest["package_context"] == PACKAGE_CONTEXT
    assert PACKAGE_VERSION == "0.1.9-kiv246-consumed-object-boundary-candidate"
    assert PACKAGE_CONTEXT == "KIVO-A2-RECOVERY-CONSUMED-OBJECT-BOUNDARY-BUILDER-246"
    assert manifest["kiv237_accepted_parent"] == {
        "commit": KIV237_ACCEPTED_COMMIT,
        "package_version": KIV237_ACCEPTED_PACKAGE_VERSION,
        "manifest_sha256": KIV237_ACCEPTED_MANIFEST_SHA256,
        "manifest_blob": KIV237_ACCEPTED_MANIFEST_BLOB,
        "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
    }
    assert manifest["kiv242_blocked_parent"] == {
        "commit": KIV242_BLOCKED_COMMIT,
        "package_version": KIV242_BLOCKED_PACKAGE_VERSION,
        "manifest_sha256": KIV242_BLOCKED_MANIFEST_SHA256,
        "manifest_blob": KIV242_BLOCKED_MANIFEST_BLOB,
        "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
    }
    text = OPERATOR_CONTRACT.read_text()
    assert "PCSB-1" in text and "PCSB-2" in text and "PCSB-3" in text
    assert "permanently incomplete" in text
    assert "**consumed / permanently incomplete:** `PCSB-1`, `PCSB-2`, `PCSB-3`" in text
    assert "**next unused, not authorized by this package:** `PCSB-4`" in text
    assert "no PCSB-4" in text
    assert "assert_runtime_capture_identity_eligible" in text


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
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-cli"
    payload = _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-3")
    authority_path = _write_authority(tmp_path, payload)
    conn_path = _write_conninfo(tmp_path)
    rc = main(_cli_args(authority_path, payload, dest, conn_path, "PCSB-3"))
    assert rc == 2
    assert reached == []


def test_load_capture_authority_refuses_consumed_file(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-load"
    for pcsb in CONSUMED_PCSB_IDENTITIES:
        path = _write_authority(
            tmp_path,
            _authority_dict(dest=dest, target=_target_loopback(), pcsb=pcsb),
        )
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            load_capture_authority(path)
    assert reached == []


def test_direct_object_consumed_identities_refuse_every_connect_capable_seam(
    tmp_path, monkeypatch
):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-direct"
    unused = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-9")
    )
    for pcsb in CONSUMED_PCSB_IDENTITIES:
        authority = _hand_built_authority(dest=dest, pcsb=pcsb)
        matching = CaptureInvocation("KIV-999", pcsb, str(dest))
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_runtime_capture_identity_eligible(authority)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_runtime_capture_identity_eligible(matching)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_authority_matches_this_package(authority)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_authorized_capture_target(LOOPBACK_CONNINFO, authority)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            bind_authorized_effective_conninfo(LOOPBACK_CONNINFO, authority)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_invocation_matches_authority(authority, matching)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            PersistentCaptureSession(LOOPBACK_CONNINFO, authority=authority).connect()
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            AuthorizedCaptureRunner().run(
                authority=authority,
                invocation=matching,
                conninfo=LOOPBACK_CONNINFO,
            )
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            assert_invocation_matches_authority(unused, matching)
    assert reached == []


def test_direct_object_malformed_identities_fail_closed(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-malformed"
    unused = parse_capture_authority(
        _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-9")
    )
    for form in DIRECT_OBJECT_MALFORMED:
        authority = _hand_built_authority(dest=dest, pcsb=form)
        invocation = CaptureInvocation("KIV-999", form, str(dest))
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            assert_runtime_capture_identity_eligible(authority)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            assert_runtime_capture_identity_eligible(invocation)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            assert_authority_matches_this_package(authority)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            assert_authorized_capture_target(LOOPBACK_CONNINFO, authority)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            bind_authorized_effective_conninfo(LOOPBACK_CONNINFO, authority)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            PersistentCaptureSession(LOOPBACK_CONNINFO, authority=authority).connect()
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            assert_invocation_matches_authority(unused, invocation)
        with pytest.raises(CaptureAuthorityRefused, match=MALFORMED_REFUSAL):
            AuthorizedCaptureRunner().run(
                authority=unused,
                invocation=invocation,
                conninfo=LOOPBACK_CONNINFO,
            )
    assert reached == []


def test_mismatched_consumed_and_unused_identities_refuse(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-mismatch"
    unused_auth = _hand_built_authority(dest=dest, pcsb="PCSB-4")
    consumed_auth = _hand_built_authority(dest=dest, pcsb="PCSB-3")
    unused_inv = CaptureInvocation("KIV-999", "PCSB-4", str(dest))
    consumed_inv = CaptureInvocation("KIV-999", "PCSB-3", str(dest))
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        assert_invocation_matches_authority(consumed_auth, unused_inv)
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        assert_invocation_matches_authority(unused_auth, consumed_inv)
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        AuthorizedCaptureRunner().run(
            authority=consumed_auth,
            invocation=unused_inv,
            conninfo=LOOPBACK_CONNINFO,
        )
    with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
        AuthorizedCaptureRunner().run(
            authority=unused_auth,
            invocation=consumed_inv,
            conninfo=LOOPBACK_CONNINFO,
        )
    assert reached == []


def test_pcsb4_direct_object_is_not_rejected_merely_as_consumed(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-pcsb4"
    authority = _hand_built_authority(dest=dest, pcsb="PCSB-4")
    assert_runtime_capture_identity_eligible(authority)
    assert_runtime_capture_identity_eligible("PCSB-4")
    assert_authority_matches_this_package(authority)
    mismatch = CaptureInvocation("KIV-1", "PCSB-4", str(dest))
    with pytest.raises(CaptureAuthorityRefused, match="work_order_id does not match"):
        assert_invocation_matches_authority(authority, mismatch)
    with pytest.raises(CaptureAuthorityRefused, match="work_order_id does not match"):
        AuthorizedCaptureRunner().run(
            authority=authority,
            invocation=mismatch,
            conninfo=LOOPBACK_CONNINFO,
        )
    bound = bind_authorized_effective_conninfo(LOOPBACK_CONNINFO, authority)
    assert "127.0.0.1" in bound
    assert "client_encoding=UTF8" in bound
    wrong_commit = _hand_built_authority(dest=dest, pcsb="PCSB-4", package_commit="0" * 40)
    with pytest.raises(CaptureAuthorityRefused, match="package_commit"):
        PersistentCaptureSession(LOOPBACK_CONNINFO, authority=wrong_commit).connect()
    assert reached == []


def test_cli_unused_authority_consumed_or_malformed_pcsb_refuses(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-cli-unused"
    payload = _authority_dict(dest=dest, target=_target_loopback(), pcsb="PCSB-9")
    authority_path = _write_authority(tmp_path, payload)
    conn_path = _write_conninfo(tmp_path)
    for pcsb in (*CONSUMED_PCSB_IDENTITIES, *(form for form in DIRECT_OBJECT_MALFORMED if "\x00" not in form)):
        rc = main(_cli_args(authority_path, payload, dest, conn_path, pcsb))
        assert rc == 2
    assert reached == []


def test_parsed_json_and_file_load_consumed_zero_factory_reach(tmp_path, monkeypatch):
    reached = _spy_actual_psycopg_connect(monkeypatch)
    dest = tmp_path / "ev-parse"
    for pcsb in CONSUMED_PCSB_IDENTITIES:
        payload = _authority_dict(dest=dest, target=_target_loopback(), pcsb=pcsb)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            parse_capture_authority(payload)
        sub = tmp_path / pcsb
        sub.mkdir()
        path = _write_authority(sub, payload)
        with pytest.raises(CaptureAuthorityRefused, match=CONSUMED_REFUSAL):
            load_capture_authority(path)
    assert reached == []
