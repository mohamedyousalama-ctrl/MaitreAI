from __future__ import annotations

from kiv14_pcsb.constants import P0_QUERY_SHA256, PGMQ_CONTROL_SHA256, PGMQ_SQL_SHA256, PGMQ_VERSION
from kiv14_pcsb.statements import QueryClass, STATEMENTS, package_root, statement_by_id, verify_p0_pin
from kiv14_pcsb.static_validate import (
    validate_all_statement_contracts,
    validate_bad_example_detects_kiv208,
    validate_statement_order_contract,
)


def test_p0_pin():
    verify_p0_pin()
    assert statement_by_id("P-0").sql_sha256(package_root()) == P0_QUERY_SHA256


def test_all_order_contracts():
    checked = validate_all_statement_contracts()
    assert "PS-GRANT-FUNCTION" in checked
    assert "P-0" in checked


def test_kiv208_detector():
    validate_bad_example_detects_kiv208()


def test_grant_function_has_alias_in_select_list():
    stmt = statement_by_id("PS-GRANT-FUNCTION")
    sql = stmt.sql_text(package_root())
    assert "as function_signature" in sql
    assert "order by function_signature" in sql
    validate_statement_order_contract(stmt, sql)


def test_class_a_and_b_are_explicit():
    assert statement_by_id("PS-TIME-START").query_class is QueryClass.A
    assert statement_by_id("PS-TIME-END").query_class is QueryClass.A
    assert statement_by_id("PS-GRANT-FUNCTION").query_class is QueryClass.B
    assert statement_by_id("PS-COUNT").query_class is QueryClass.B
    assert statement_by_id("PF-4-SET-ROLE").query_class is QueryClass.B
    assert statement_by_id("PS-BODY").query_class is QueryClass.B
    assert statement_by_id("PS-ROLE").query_class is QueryClass.B


def test_capture_order_ends_at_ps_time_end():
    assert STATEMENTS[0].id == "P-0"
    assert STATEMENTS[-1].id == "PS-TIME-END"
    ids = [s.id for s in STATEMENTS]
    assert ids.index("PS-GRANT-FUNCTION") < ids.index("PS-OWN")
    assert ids.index("G2") == ids.index("G1") + 1
    assert ids.index("PS-TIME-START") == ids.index("P-0") + 1


def test_vendored_pgmq_pins():
    from hashlib import sha256

    root = package_root() / "topology" / "pgmq"
    control = (root / "pgmq.control").read_bytes()
    sql = (root / f"pgmq--{PGMQ_VERSION}.sql").read_bytes()
    assert sha256(control).hexdigest() == PGMQ_CONTROL_SHA256
    assert sha256(sql).hexdigest() == PGMQ_SQL_SHA256
    assert b"LANGUAGE C" not in sql
    assert b"MODULE_PATHNAME" not in sql
