from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import psycopg
from psycopg import pq
from psycopg.rows import dict_row

from .constants import BACKEND_PID_METHOD, DRIVER_NAME, DRIVER_VERSION
from .errors import ContinuityFailure, FailClosed, SequenceViolation
from .safety import assert_not_production_target


def driver_identity() -> dict[str, Any]:
    return {
        "driver_name": DRIVER_NAME,
        "driver_package": "psycopg[binary]",
        "driver_version": DRIVER_VERSION,
        "imported_psycopg_version": psycopg.__version__,
        "bundled_libpq_version_num": pq.version(),
        "bundled_libpq_note": (
            "psycopg[binary]==3.2.9 ships libpq 170005 (17.5) talking to server 17.6; "
            "backend PID is still PQbackendPID / BackendKeyData, not SQL"
        ),
        "backend_pid_method": BACKEND_PID_METHOD,
        "autocommit": True,
        "prepare_threshold": None,
        "client_encoding": "UTF8 via startup packet / conninfo (not SET SQL)",
    }


@dataclass(frozen=True)
class DenialResult:
    statement_id: str
    sqlstate: str
    message: str


@dataclass
class PersistentCaptureSession:
    """One persistent psycopg connection object spanning a capture run.

    P-0 must be the first SQL. Backend PID is read from libpq metadata before
    any SQL. Disconnect/reconnect is fail-closed.
    """

    conninfo: str
    _conn: psycopg.Connection[Any] | None = None
    _raw_execute: Any = None
    pre_p0_backend_pid: int | None = None
    server_version: str | None = None
    server_version_num: str | None = None
    sql_log: list[str] = field(default_factory=list)
    p0_passed: bool = False
    closed: bool = False

    def connect(self) -> None:
        if self._conn is not None:
            raise SequenceViolation("connect called twice on the same session object")
        assert_not_production_target(self.conninfo)
        conn = psycopg.connect(
            self.conninfo,
            autocommit=True,
            prepare_threshold=None,
            row_factory=dict_row,
        )
        pid = conn.info.backend_pid
        if not pid or pid <= 0:
            conn.close()
            raise ContinuityFailure(
                "client metadata did not expose a positive backend PID without SQL"
            )
        self.pre_p0_backend_pid = int(pid)
        self.server_version = conn.info.parameter_status("server_version")
        self.server_version_num = conn.info.parameter_status("server_version_num")
        self._raw_execute = conn.execute
        self._guard_direct_sql(conn)
        self._conn = conn

    def _guard_direct_sql(self, conn: psycopg.Connection[Any]) -> None:
        # Only wrap Connection.execute. Cursor.execute is read-only on psycopg 3.2
        # and Connection.execute uses cursor() internally, so cursor wrapping
        # would break the lawful session.execute path.
        def _forbid_execute(*_a: Any, **_k: Any) -> Any:
            raise SequenceViolation(
                "direct Connection.execute is forbidden; use PersistentCaptureSession.execute"
            )

        conn.execute = _forbid_execute  # type: ignore[method-assign]

    @property
    def connection(self) -> psycopg.Connection[Any]:
        if self.closed or self._conn is None:
            raise ContinuityFailure("session has no live connection object")
        if self._conn.closed:
            raise ContinuityFailure("connection closed; reconnect is forbidden")
        return self._conn

    def current_backend_pid(self) -> int:
        pid = int(self.connection.info.backend_pid)
        if self.pre_p0_backend_pid is None:
            raise ContinuityFailure("pre-P-0 backend PID was not recorded")
        if pid != self.pre_p0_backend_pid:
            raise ContinuityFailure(
                f"backend PID drift: pre-P-0={self.pre_p0_backend_pid} now={pid}"
            )
        return pid

    def execute(
        self,
        sql: str,
        *,
        statement_id: str,
        expected_sqlstate: str | None = None,
    ) -> psycopg.Cursor[Any] | DenialResult:
        if self.closed:
            raise ContinuityFailure("execute after session close")
        if self._raw_execute is None:
            raise ContinuityFailure("session has no live execute handle")
        if self.sql_log and statement_id == "P-0":
            raise SequenceViolation("P-0 is not first SQL")
        if not self.sql_log and statement_id != "P-0":
            raise SequenceViolation(
                f"{statement_id} cannot run before P-0; no SQL of any kind precedes P-0"
            )
        if self.sql_log and not self.p0_passed and statement_id != "P-0":
            raise SequenceViolation(
                f"{statement_id} blocked: P-0 did not PASS; later SQL is forbidden"
            )
        self.current_backend_pid()
        self.sql_log.append(statement_id)
        try:
            cur = self._raw_execute(sql)
        except psycopg.Error as exc:
            sqlstate = exc.sqlstate
            if expected_sqlstate and sqlstate == expected_sqlstate:
                return DenialResult(
                    statement_id=statement_id,
                    sqlstate=sqlstate or "",
                    message=str(exc),
                )
            raise FailClosed(
                f"{statement_id} failed closed sqlstate={sqlstate}: {exc}"
            ) from exc
        if expected_sqlstate:
            raise FailClosed(
                f"{statement_id} succeeded; expected denial SQLSTATE {expected_sqlstate}"
            )
        return cur

    def close(self) -> None:
        self.closed = True
        if self._conn is not None and not self._conn.closed:
            self._conn.close()
        self._conn = None
        self._raw_execute = None
