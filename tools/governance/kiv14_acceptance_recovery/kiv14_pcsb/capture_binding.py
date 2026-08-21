from __future__ import annotations

from pathlib import Path
from typing import Any

from .authority import (
    CaptureAuthority,
    CaptureInvocation,
    assert_authority_matches_this_package,
    assert_invocation_matches_authority,
    assert_runtime_capture_identity_eligible,
    destination_binding_review_contract,
    later_executor_pre_auth_contract,
)
from .constants import ROUTE_CLASS_DIRECT_POSTGRES
from .driver import PersistentCaptureSession, driver_identity
from .errors import CaptureAuthorityRefused, EvidenceCustodyFailure, FailClosed, SequenceViolation
from .evidence import (
    CaptureArtifactWriter,
    write_capture_evidence,
    verify_digest_list_against_writer,
)
from .sequence import run_full_sequence
from .statements import STATEMENTS, captured_query_sha256, package_root, required_ps_artifacts


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
        assert_runtime_capture_identity_eligible(authority)
        assert_runtime_capture_identity_eligible(invocation)
        assert_invocation_matches_authority(authority, invocation)
        assert_authority_matches_this_package(authority, root=root)
        dest = Path(authority.evidence_directory)
        pkg = root or package_root()
        writer = CaptureArtifactWriter(dest, root=pkg)
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
            "later_executor_pre_auth_contract": (
                later_executor_pre_auth_contract()
                if authority.authorized_target.route_class == ROUTE_CLASS_DIRECT_POSTGRES
                else None
            ),
            "destination_binding_review_contract": destination_binding_review_contract(),
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
            "evidence_custody": None,
        }
        try:
            session.connect(root=pkg)
            pre_auth["connection_attempted"] = True
            write_capture_evidence(dest, "capture_pre_auth.json", pre_auth)
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
            payload["server_version"] = session.server_version
            results = run_full_sequence(
                session,
                root=pkg,
                artifact_sink=writer.write_step,
            )
            payload["sql_log"] = list(session.sql_log)
            payload["steps"] = [_step_record(step) for step in results]
            payload["p0_passed"] = session.p0_passed
            complete, reason = _completeness(results, writer=writer, sql_log=session.sql_log, root=pkg)
            if complete:
                writer.write_digest_list()
                digest_ok, digest_reason = verify_digest_list_against_writer(writer)
                if not digest_ok:
                    complete = False
                    reason = digest_reason
            payload["completeness"] = "complete" if complete else "permanently_incomplete"
            payload["incomplete_reason"] = reason
            payload["evidence_custody"] = _custody_summary(writer)
        except CaptureAuthorityRefused:
            raise
        except EvidenceCustodyFailure as exc:
            payload["incomplete_reason"] = str(exc)
            payload["sql_log"] = list(session.sql_log)
            payload["p0_passed"] = session.p0_passed
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
            payload["evidence_custody"] = _custody_summary(writer)
        except FailClosed as exc:
            payload["incomplete_reason"] = str(exc)
            payload["sql_log"] = list(session.sql_log)
            payload["p0_passed"] = session.p0_passed
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
            payload["evidence_custody"] = _custody_summary(writer)
        except Exception as exc:
            payload["incomplete_reason"] = f"connection/session failure: {exc}"
            payload["sql_log"] = list(session.sql_log)
            payload["pre_p0_backend_pid"] = session.pre_p0_backend_pid
            payload["evidence_custody"] = _custody_summary(writer)
        finally:
            session.close()
        try:
            write_capture_evidence(dest, "capture_run.json", payload, overwrite=False)
        except Exception as exc:
            payload["completeness"] = "permanently_incomplete"
            if not payload.get("incomplete_reason"):
                payload["incomplete_reason"] = f"capture_run evidence write failed: {exc}"
        return payload


def _custody_summary(writer: CaptureArtifactWriter) -> dict[str, Any]:
    return {
        "artifacts_written": [
            {
                "statement_id": writer.written[stmt.id]["statement_id"],
                "ps_artifact": writer.written[stmt.id]["ps_artifact"],
                "sha256": writer.written[stmt.id]["sha256"],
                "bytes": writer.written[stmt.id]["bytes"],
                "lines": writer.written[stmt.id]["lines"],
            }
            for stmt in STATEMENTS
            if stmt.id in writer.written
        ],
        "writer_failed": writer.failed,
        "digest_list": (
            {
                "filename": writer.digest_list_custody.get("filename"),
                "sha256": writer.digest_list_custody.get("sha256"),
                "bytes": writer.digest_list_custody.get("bytes"),
                "lines": writer.digest_list_custody.get("lines"),
                "complete_pcsb_digest": writer.digest_list_custody.get("complete_pcsb_digest"),
            }
            if writer.digest_list_custody
            else None
        ),
    }


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
        "dispatch_ts": step.dispatch_ts,
        "complete_ts": step.complete_ts,
        "sql_window_ts": step.sql_window_ts,
    }


def _statement_status_completeness(results: list[Any]) -> tuple[bool, str | None]:
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


def _completeness(
    results: list[Any],
    *,
    writer: CaptureArtifactWriter,
    sql_log: list[str],
    root: Path,
) -> tuple[bool, str | None]:
    status_ok, status_reason = _statement_status_completeness(results)
    if not status_ok:
        return False, status_reason
    if writer.failed:
        return False, f"evidence writer failure: {writer.failed}"
    if not sql_log or sql_log[0] != "P-0":
        return False, "P-0 was not first SQL"
    represented_ps = {item["ps_artifact"] for item in writer.written.values()}
    missing_ps = [name for name in required_ps_artifacts() if name not in represented_ps]
    if missing_ps:
        return False, "missing §5.3 PS artifacts: " + ", ".join(missing_ps)
    by_id = {step.statement_id: step for step in results}
    for stmt in STATEMENTS:
        step = by_id[stmt.id]
        if not step.dispatch_ts or not step.complete_ts:
            return False, f"{stmt.id} missing in-window host timestamps"
        custody = writer.written.get(stmt.id)
        if custody is None:
            return False, f"{stmt.id} missing in-window artifact custody"
        for field in ("sha256", "bytes", "lines", "query_sha256", "dispatch_ts", "complete_ts"):
            if custody.get(field) in (None, ""):
                return False, f"{stmt.id} custody missing {field}"
        expected_query = captured_query_sha256(stmt, root)
        if custody["query_sha256"] != expected_query:
            return False, f"{stmt.id} query_sha256 mismatch"
        if custody["bytes"] <= 0 or custody["lines"] <= 0:
            return False, f"{stmt.id} invalid byte/line custody"
        if stmt.id in {"PS-TIME-START", "PS-TIME-END"} and not step.sql_window_ts:
            return False, f"{stmt.id} missing authoritative SQL window_ts"
    # Digest list is written only after this gate; caller verifies it.
    return True, None
