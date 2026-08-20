from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .driver import DenialResult, PersistentCaptureSession
from .errors import ContinuityFailure, FailClosed, P0GateFailure, SequenceViolation
from .g2 import g2_v4_equivalent, g3_binding_ok
from .p0 import evaluate_p0_row
from .statements import Statement, STATEMENTS, package_root, statement_by_id


@dataclass
class StepResult:
    statement_id: str
    status: str
    n_rows: int | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    skip_reason: str | None = None
    detail: str | None = None
    sqlstate: str | None = None
    host_result: dict[str, Any] | None = None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"t", "true", "1"}
    return bool(value)


def ledger_not_readable(p8a_row: dict[str, Any] | None) -> bool:
    if not p8a_row:
        return True
    return not (
        _as_bool(p8a_row.get("ledger_present"))
        and _as_bool(p8a_row.get("ledger_select"))
    )


def _rows_from_cursor(cur: Any) -> list[dict[str, Any]]:
    if cur is None or isinstance(cur, DenialResult):
        return []
    fetched = cur.fetchall()
    return [dict(row) for row in fetched]


def run_sql_statement(
    session: PersistentCaptureSession,
    stmt: Statement,
    sql: str,
) -> StepResult:
    outcome = session.execute(
        sql,
        statement_id=stmt.id,
        expected_sqlstate=stmt.expected_sqlstate,
    )
    if isinstance(outcome, DenialResult):
        return StepResult(
            statement_id=stmt.id,
            status="expected_denial",
            n_rows=0,
            sqlstate=outcome.sqlstate,
            detail=outcome.message,
        )
    rows = _rows_from_cursor(outcome)
    return StepResult(
        statement_id=stmt.id,
        status="ok",
        n_rows=len(rows),
        rows=rows,
    )


def run_p0(
    session: PersistentCaptureSession,
    *,
    root: Any | None = None,
) -> StepResult:
    pkg = root or package_root()
    stmt = statement_by_id("P-0")
    sql = stmt.sql_text(pkg)
    outcome = session.execute(sql, statement_id="P-0")
    if isinstance(outcome, DenialResult):
        raise FailClosed("P-0 produced a denial instead of a row")
    rows = _rows_from_cursor(outcome)
    row = rows[0] if rows else None
    evaluate_p0_row(row, n_rows=len(rows))
    session.p0_passed = True
    return StepResult(statement_id="P-0", status="pass", n_rows=1, rows=rows)


def run_full_sequence(
    session: PersistentCaptureSession,
    *,
    root: Any | None = None,
) -> list[StepResult]:
    """Capture sequence through PS-TIME end on one persistent connection.

    Caller must already have connected. P-0 is dispatched first by this function.
    """
    pkg = root or package_root()
    results: list[StepResult] = []
    p0 = run_p0(session, root=pkg)
    results.append(p0)

    g1_row: dict[str, Any] | None = None
    p8a_row: dict[str, Any] | None = None

    for stmt in STATEMENTS:
        if stmt.id == "P-0":
            continue
        if stmt.sql_kind == "host":
            if stmt.id == "G2":
                prosrc = None if g1_row is None else g1_row.get("prosrc")
                host = g2_v4_equivalent(prosrc if isinstance(prosrc, str) else None)
                results.append(
                    StepResult(
                        statement_id="G2",
                        status="host",
                        host_result=host,
                    )
                )
                continue
            if stmt.id == "G3":
                uid_rows = None if g1_row is None else g1_row.get("uid_rows")
                arg_list = None if g1_row is None else g1_row.get("arg_list")
                host = g3_binding_ok(uid_rows, arg_list)
                results.append(
                    StepResult(
                        statement_id="G3",
                        status="host",
                        host_result=host,
                    )
                )
                continue
            raise SequenceViolation(f"unhandled host step {stmt.id}")

        if stmt.skip_if == "ledger_not_readable" and ledger_not_readable(p8a_row):
            results.append(
                StepResult(
                    statement_id=stmt.id,
                    status="skipped",
                    skip_reason="ledger_not_readable (host-side; no SQL, no psql \\if)",
                )
            )
            continue

        sql = stmt.sql_text(pkg)
        step = run_sql_statement(session, stmt, sql)
        if stmt.id == "P-8a" and step.rows:
            p8a_row = step.rows[0]
        if stmt.id == "G1" and step.rows:
            g1_row = step.rows[0]
        if stmt.id == "PS-TIME-END":
            _reconcile_end(session, step)
        results.append(step)
    return results


def _reconcile_end(session: PersistentCaptureSession, step: StepResult) -> None:
    meta_pid = session.current_backend_pid()
    if not step.rows:
        raise ContinuityFailure("PS-TIME-END returned no row for PID reconciliation")
    sql_pid = step.rows[0].get("sql_backend_pid")
    if int(sql_pid) != meta_pid:
        raise ContinuityFailure(
            f"PS-TIME-END sql_backend_pid={sql_pid} != metadata pid={meta_pid}"
        )
    if session.pre_p0_backend_pid != meta_pid:
        raise ContinuityFailure("PS-TIME-END metadata PID drifted from pre-P-0 identity")
    step.detail = (
        f"reconciled pre-P-0 metadata pid {session.pre_p0_backend_pid} "
        f"with PS-TIME-END sql_backend_pid {sql_pid}"
    )


def prove_failed_p0_blocks_later(
    session: PersistentCaptureSession,
    *,
    root: Any | None = None,
) -> dict[str, Any]:
    """On a clean cluster P-0 must FAIL/error; later SQL must not run."""
    pkg = root or package_root()
    p0_sql = statement_by_id("P-0").sql_text(pkg)
    later_sql = statement_by_id("PS-TIME-START").sql_text(pkg)
    record: dict[str, Any] = {
        "pre_p0_backend_pid": session.pre_p0_backend_pid,
        "server_version": session.server_version,
        "first_statement_id_attempted": "P-0",
        "p0_status": None,
        "later_sql_status": None,
    }
    try:
        outcome = session.execute(p0_sql, statement_id="P-0")
        if isinstance(outcome, DenialResult):
            record["p0_status"] = "denial"
            record["p0_detail"] = outcome.message
        else:
            rows = _rows_from_cursor(outcome)
            evaluate_p0_row(rows[0] if rows else None, n_rows=len(rows))
            record["p0_status"] = "UNEXPECTED_PASS"
            record["p0_row"] = rows[0] if rows else None
    except P0GateFailure as exc:
        record["p0_status"] = "FAIL"
        record["p0_detail"] = str(exc)
    except FailClosed as exc:
        record["p0_status"] = "SQL_ERROR"
        record["p0_detail"] = str(exc)

    try:
        session.execute(later_sql, statement_id="PS-TIME-START")
        record["later_sql_status"] = "LEAK"
    except SequenceViolation as exc:
        record["later_sql_status"] = "blocked"
        record["later_sql_detail"] = str(exc)
    return record
