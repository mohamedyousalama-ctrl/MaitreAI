from __future__ import annotations

from kiv14_pcsb.local_pg import assert_pg176_prefix, init_and_start, stop_cluster
from kiv14_pcsb.preflight import run_class_a_preflight, run_class_b_preflight
from kiv14_pcsb.statements import QueryClass, STATEMENTS


def test_class_a_preflight_on_clean_17_6(pg176_cluster):
    result = run_class_a_preflight(pg176_cluster)
    assert result["kivo_or_supabase_objects_created"] is False
    assert result["not_section7_fixture_evidence"] is True
    contract = result["capture_contract_on_clean_cluster"]
    assert contract["p0_status"] in {"FAIL", "SQL_ERROR"}
    assert contract["later_sql_status"] == "blocked"
    queries = result["class_a_query_validation"]["queries"]
    assert set(queries) == {
        s.id for s in STATEMENTS if s.query_class == QueryClass.A
    }
    for stmt_id, item in queries.items():
        assert item["status"] == "ok", stmt_id
    assert result["class_a_query_validation"]["server_version"].startswith("17.6")


def test_class_b_method1_holds_on_auth_users():
    try:
        assert_pg176_prefix()
    except Exception as exc:
        import pytest

        pytest.skip(f"PostgreSQL 17.6 prefix unavailable: {exc}")
    cluster = init_and_start(label="pytest-class-b")
    try:
        result = run_class_b_preflight(cluster)
        assert result["hold"] is True
        assert result["invented_auth_objects"] is False
        assert result["class_b_queries_executed"] is False
        assert result["class_b_queries_validated"] is False
        assert result["blob_0108_match"] is True
        assert result["blob_0109_match"] is True
        blob = (result.get("hold_reason") or "") + (result.get("stderr") or "")
        assert result["source_references_auth_users"] is True
        assert "auth.users" in blob.lower()
        assert result["class_b_queries_validated"] is False
    finally:
        stop_cluster(cluster)
