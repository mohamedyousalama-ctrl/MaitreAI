from __future__ import annotations

from typing import Any, Mapping

from .errors import P0GateFailure


P0_BOOL_TRUE_COLUMNS = (
    "members_present",
    "members_select",
    "miv_present",
    "miv_select",
    "cae_present",
    "cae_select",
)
P0_BOOL_FALSE_COLUMNS = (
    "members_rls_active",
    "miv_rls_active",
    "cae_rls_active",
)


def _as_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.lower()
        if lowered in {"t", "true", "1"}:
            return True
        if lowered in {"f", "false", "0"}:
            return False
    return bool(value)


def evaluate_p0_row(row: Mapping[str, Any] | None, *, n_rows: int) -> dict[str, Any]:
    if n_rows != 1 or row is None:
        raise P0GateFailure(f"P-0 cardinality failure: n_rows={n_rows}")
    missing = [c for c in (*P0_BOOL_TRUE_COLUMNS, *P0_BOOL_FALSE_COLUMNS) if c not in row]
    if missing:
        raise P0GateFailure(f"P-0 malformed row, missing columns: {missing}")
    failures: list[str] = []
    for col in P0_BOOL_TRUE_COLUMNS:
        got = _as_bool(row[col])
        if got is not True:
            failures.append(f"{col}={row[col]!r} (need true)")
    for col in P0_BOOL_FALSE_COLUMNS:
        got = _as_bool(row[col])
        if got is not False:
            failures.append(f"{col}={row[col]!r} (need false)")
    if failures:
        raise P0GateFailure("P-0 FAIL: " + "; ".join(failures))
    return dict(row)
