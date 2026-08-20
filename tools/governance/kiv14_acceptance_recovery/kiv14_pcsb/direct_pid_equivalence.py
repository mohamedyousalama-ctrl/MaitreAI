"""No-production direct-connection PID-equivalence proof.

This is tooling validation only. It is not production evidence, not §5.3
evidence, and not part of the production ``authorized-capture`` statement
sequence. The tooling SQL constant must never enter the production statement
manifest / hash-of-hashes set.

Use loopback/disposable PostgreSQL 17.6 only. Zero production/Supabase
authentication or SQL.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from .constants import (
    DRIVER_PACKAGE,
    DRIVER_VERSION,
    EXPECTED_SERVER_VERSION_PREFIX,
    TOOLING_PID_EQUIVALENCE_NOT_PRODUCTION_SEQUENCE,
    TOOLING_PID_EQUIVALENCE_SQL,
)
from .driver import reviewed_psycopg_connect
from .errors import ContinuityFailure, Hold
from .safety import assert_not_production_target
from .statements import STATEMENTS, package_root


def tooling_pid_equivalence_sql_sha256() -> str:
    return sha256(TOOLING_PID_EQUIVALENCE_SQL.encode("utf-8")).hexdigest()


def assert_tooling_sql_not_in_production_sequence() -> None:
    digest = tooling_pid_equivalence_sql_sha256()
    root = package_root()
    for stmt in STATEMENTS:
        if stmt.sql_relpath is None:
            continue
        sql = stmt.sql_text(root)
        if sql.strip() == TOOLING_PID_EQUIVALENCE_SQL.strip():
            raise Hold("tooling PID-equivalence SQL leaked into the production statement set")
        if sha256(sql.encode("utf-8")).hexdigest() == digest:
            raise Hold("tooling PID-equivalence SQL SHA matches a production statement")
    if not TOOLING_PID_EQUIVALENCE_NOT_PRODUCTION_SEQUENCE:
        raise Hold("tooling PID-equivalence flag must remain not-production-sequence")


def prove_direct_pid_equivalence(conninfo: str) -> dict[str, Any]:
    """Connect directly, record PQbackendPID before SQL, then prove pg_backend_pid().

    Disconnects terminally. No retry. Loopback/disposable only.
    """
    assert_tooling_sql_not_in_production_sequence()
    assert_not_production_target(conninfo)
    conn = reviewed_psycopg_connect(conninfo)
    payload: dict[str, Any] = {
        "tooling_only": True,
        "not_section_5_3_evidence": True,
        "not_production_authorized_capture": True,
        "driver_package": DRIVER_PACKAGE,
        "driver_version": DRIVER_VERSION,
        "tooling_sql": TOOLING_PID_EQUIVALENCE_SQL,
        "tooling_sql_sha256": tooling_pid_equivalence_sql_sha256(),
        "metadata_pid_before_sql": None,
        "sql_backend_pid": None,
        "equal": False,
        "disconnected": False,
    }
    try:
        metadata_pid = int(conn.info.backend_pid)
        if metadata_pid <= 0:
            raise ContinuityFailure(
                "client metadata did not expose a positive backend PID without SQL"
            )
        payload["metadata_pid_before_sql"] = metadata_pid
        payload["server_version"] = conn.info.parameter_status("server_version")
        if not str(payload["server_version"] or "").startswith(EXPECTED_SERVER_VERSION_PREFIX):
            raise Hold(f"expected server_version 17.6*, got {payload['server_version']!r}")
        cur = conn.execute(TOOLING_PID_EQUIVALENCE_SQL)
        row = cur.fetchone()
        if row is None:
            raise ContinuityFailure("tooling PID query returned no row")
        sql_pid = int(row["sql_backend_pid"])
        payload["sql_backend_pid"] = sql_pid
        end_metadata = int(conn.info.backend_pid)
        payload["metadata_pid_after_sql"] = end_metadata
        if sql_pid != metadata_pid:
            raise ContinuityFailure(
                f"direct PID inequality: metadata={metadata_pid} sql={sql_pid}"
            )
        if end_metadata != metadata_pid:
            raise ContinuityFailure(
                f"metadata PID drifted during tooling proof: {metadata_pid} -> {end_metadata}"
            )
        payload["equal"] = True
    finally:
        if not conn.closed:
            conn.close()
        payload["disconnected"] = True
    return payload
