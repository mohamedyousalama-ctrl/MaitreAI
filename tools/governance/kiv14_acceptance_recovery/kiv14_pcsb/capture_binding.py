from __future__ import annotations

from pathlib import Path
from typing import Any

from .authority import (
    CaptureAuthority,
    CaptureInvocation,
    assert_authority_matches_this_package,
    assert_invocation_matches_authority,
)
from .driver import PersistentCaptureSession, driver_identity
from .errors import CaptureAuthorityRefused, FailClosed, SequenceViolation
from .evidence import write_capture_evidence
from .sequence import run_full_sequence
from .statements import STATEMENTS, package_root


SKIPPABLE_WHEN_LEDGER_UNREADABLE = frozenset({"P-8b", "P-8c"})
SUCCESS_STATUSES = frozenset({"ok", "pass", "expected_denial", "host", "skipped"})


class AuthorizedCaptureRunner:
    """Single-shot authorized capturer. No retry, reconnect, or second connect."""

    def __init__(self) -> None:
        self._started = False

    def run(
        self,
        *,
        authority: CaptureAuthority,
        invocation: CaptureInvocation,
        conninfo: str,
        root: Path | None = None,
    ) -> dict[str, Any]:
        if self._started:
            raise SequenceViolation("same-work-order retry/restart is forbidden")
        self._started = True
        assert_invocation_matches_authority(authority, invocation)
        assert_authority_matches_this_package(authority, root=root)
        dest = Path(authority.evidence_directory)
        pre_auth = {
            "work_order_id": authority.work_order_id,
            "pcsb_identity": authority.pcsb_identity,
            "package_commit": authority.package_commit,
            "package_manifest_sha256": authority.package_manifest_sha256,
            "package_hash_of_hashes": authority.package_hash_of_hashes,
            "package_id": authority.package_id,
            "driver": driver_identity(),
            "authorized_target": authority.authorized_target.as_dict(),
            "evidence_directory": authority.evidence_directory,
            "governance_disclaimer": authority.governance_disclaimer,
            "connection_attempted": False,
            "sql_attempted": False,
        }
        write_capture_evidence(dest, "capture_pre_auth.json", pre_auth)

        session = PersistentCaptureSession(conninfo, authority=authority)
        payload: dict[str, Any] = {
            "work_order_id": authority.work_order_id,
            "pcsb_identity": authority.pcsb_identity,
            "package_commit": authority.package_commit,
            "package_manifest_sha256": authority.package_manifest_sha256,
            "package_hash_of_hashes": authority.package_hash_of_hashes,
            "driver": driver_identity(),
            "authorized_target": authority.authorized_target.as_dict(),
            "evidence_directory": authority.evidence_directory,
            "governance_disclaimer": authority.governance_disclaimer,
            "completeness": "permanently_incomplete",
            "incomplete_reason": None,
            "retry": False,
            "pre_p0_backend_pid": None,
            "sql_log": [],
            "steps": [],
        }
        try:
            session.connect()
            pre_auth["connection_attempted"] = True
            write_capture_evidence(dest, "capture_pre_auth.json", pre_auth)
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
            payload["server_version"] = session.server_version
            results = run_full_sequence(session, root=root or package_root())
            payload["sql_log"] = list(session.sql_log)
            payload["steps"] = [_step_record(step) for step in results]
            payload["p0_passed"] = session.p0_passed
            complete, reason = _completeness(results)
            payload["completeness"] = "complete" if complete else "permanently_incomplete"
            payload["incomplete_reason"] = reason
        except CaptureAuthorityRefused:
            raise
        except FailClosed as exc:
            payload["incomplete_reason"] = str(exc)
            payload["sql_log"] = list(session.sql_log)
            payload["p0_passed"] = session.p0_passed
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
        except Exception as exc:
            payload["incomplete_reason"] = f"connection/session failure: {exc}"
            payload["sql_log"] = list(session.sql_log)
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
        finally:
            session.close()
        write_capture_evidence(dest, "capture_run.json", payload)
        return payload


def _step_record(step: Any) -> dict[str, Any]:
    return {
        "statement_id": step.statement_id,
        "status": step.status,
        "n_rows": step.n_rows,
        "sqlstate": step.sqlstate,
        "skip_reason": step.skip_reason,
        "detail": step.detail,
        "host_result": step.host_result,
        "rows": list(step.rows),
    }


def _completeness(results: list[Any]) -> tuple[bool, str | None]:
    by_id = {step.statement_id: step for step in results}
    missing: list[str] = []
    for stmt in STATEMENTS:
        step = by_id.get(stmt.id)
        if step is None:
            missing.append(stmt.id)
            continue
        if step.status not in SUCCESS_STATUSES:
            missing.append(f"{stmt.id}:{step.status}")
            continue
        if step.status == "skipped" and stmt.id not in SKIPPABLE_WHEN_LEDGER_UNREADABLE:
            missing.append(f"{stmt.id}:unexpected-skip")
    if missing:
        return False, "missing or unsuccessful statements: " + ", ".join(missing)
    return True, None
