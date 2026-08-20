from __future__ import annotations

import pytest

from kiv14_pcsb.driver import PersistentCaptureSession
from kiv14_pcsb.errors import ContinuityFailure, FailClosed, P0GateFailure, SequenceViolation
from kiv14_pcsb.local_pg import statements_logged_for_pid
from kiv14_pcsb.sequence import prove_failed_p0_blocks_later, run_p0
from kiv14_pcsb.statements import package_root, statement_by_id


def test_p0_is_first_sql(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        later = statement_by_id("PS-TIME-START").sql_text(package_root())
        with pytest.raises(SequenceViolation, match="before P-0"):
            session.execute(later, statement_id="PS-TIME-START")
        assert session.sql_log == []
        assert session.pre_p0_backend_pid and session.pre_p0_backend_pid > 0
    finally:
        session.close()


def test_failed_p0_blocks_later_sql(local_conninfo, pg176_cluster):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        record = prove_failed_p0_blocks_later(session)
        assert record["p0_status"] in {"FAIL", "SQL_ERROR"}
        assert record["later_sql_status"] == "blocked"
        assert session.sql_log == ["P-0"]
        assert session.p0_passed is False
        log_text = pg176_cluster.log_path.read_text()
        pid = session.pre_p0_backend_pid
        assert f"[{pid}] " in log_text
    finally:
        session.close()


def test_malformed_p0_blocks_later(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        with pytest.raises((P0GateFailure, FailClosed)):
            run_p0(session)
        assert session.p0_passed is False
        later = statement_by_id("P-1").sql_text(package_root())
        with pytest.raises(SequenceViolation, match="P-0 did not PASS"):
            session.execute(later, statement_id="P-1")
    finally:
        session.close()


def test_pid_drift_fails_closed(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        session.pre_p0_backend_pid = int(session.pre_p0_backend_pid) + 1
        with pytest.raises(ContinuityFailure, match="drift"):
            session.current_backend_pid()
    finally:
        session.close()


def test_closed_connection_fails_closed(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    session.connection.close()
    with pytest.raises(ContinuityFailure, match="closed"):
        session.execute(
            statement_by_id("P-0").sql_text(package_root()),
            statement_id="P-0",
        )
    session.close()


def test_direct_connection_execute_forbidden(local_conninfo):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        with pytest.raises(SequenceViolation, match="direct Connection.execute"):
            session.connection.execute("select 1")
    finally:
        session.close()


def test_no_helper_sql_before_p0_in_log(local_conninfo, pg176_cluster):
    session = PersistentCaptureSession(local_conninfo)
    session.connect()
    try:
        pid = session.pre_p0_backend_pid
        try:
            session.execute(
                statement_by_id("P-0").sql_text(package_root()),
                statement_id="P-0",
            )
        except FailClosed:
            pass
        log_text = pg176_cluster.log_path.read_text()
        statements = statements_logged_for_pid(log_text, int(pid or 0))
        assert statements, "expected log_statement=all to record P-0"
        first = statements[0].lower()
        assert "select 1" not in first
        assert "show " not in first
        assert "members_present" in first
    finally:
        session.close()
