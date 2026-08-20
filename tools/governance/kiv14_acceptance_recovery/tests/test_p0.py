from __future__ import annotations

import pytest

from kiv14_pcsb.errors import P0GateFailure
from kiv14_pcsb.p0 import evaluate_p0_row


def _pass_row(**overrides):
    row = {
        "executor": "kiv217",
        "row_security_setting": "on",
        "members_present": True,
        "members_select": True,
        "members_rls_active": False,
        "miv_present": True,
        "miv_select": True,
        "miv_rls_active": False,
        "cae_present": True,
        "cae_select": True,
        "cae_rls_active": False,
    }
    row.update(overrides)
    return row


def test_p0_pass():
    out = evaluate_p0_row(_pass_row(), n_rows=1)
    assert out["members_present"] is True


def test_p0_fail_missing_table():
    with pytest.raises(P0GateFailure, match="members_present"):
        evaluate_p0_row(_pass_row(members_present=False), n_rows=1)


def test_p0_fail_rls_active():
    with pytest.raises(P0GateFailure, match="members_rls_active"):
        evaluate_p0_row(_pass_row(members_rls_active=True), n_rows=1)


def test_p0_cardinality():
    with pytest.raises(P0GateFailure, match="cardinality"):
        evaluate_p0_row(_pass_row(), n_rows=0)
    with pytest.raises(P0GateFailure, match="cardinality"):
        evaluate_p0_row(_pass_row(), n_rows=2)


def test_p0_malformed_missing_column():
    row = _pass_row()
    del row["cae_select"]
    with pytest.raises(P0GateFailure, match="missing columns"):
        evaluate_p0_row(row, n_rows=1)
