from __future__ import annotations

from hashlib import sha256

import pytest

from kiv14_pcsb.constants import (
    KIV220_ACCEPTED_HASH_OF_HASHES,
    TOOLING_PID_EQUIVALENCE_SQL,
)
from kiv14_pcsb.direct_pid_equivalence import (
    assert_tooling_sql_not_in_production_sequence,
    prove_direct_pid_equivalence,
    tooling_pid_equivalence_sql_sha256,
)
from kiv14_pcsb.evidence import hash_of_hashes, statement_catalog
from kiv14_pcsb.safety import ProductionTargetRefused, assert_not_production_target


def test_tooling_pid_sql_cannot_enter_production_hash_set():
    assert_tooling_sql_not_in_production_sequence()
    catalog = statement_catalog()
    digest = tooling_pid_equivalence_sql_sha256()
    production = {item.get("query_sha256") for item in catalog if item.get("query_sha256")}
    assert digest not in production
    assert hash_of_hashes(catalog) == KIV220_ACCEPTED_HASH_OF_HASHES
    assert sha256(TOOLING_PID_EQUIVALENCE_SQL.encode()).hexdigest() == digest


def test_direct_pid_equivalence_on_disposable_pg176(local_conninfo):
    payload = prove_direct_pid_equivalence(local_conninfo)
    assert payload["tooling_only"] is True
    assert payload["not_section_5_3_evidence"] is True
    assert payload["not_production_authorized_capture"] is True
    assert payload["equal"] is True
    assert payload["disconnected"] is True
    assert payload["metadata_pid_before_sql"] == payload["sql_backend_pid"]
    assert payload["metadata_pid_after_sql"] == payload["metadata_pid_before_sql"]
    assert str(payload["server_version"]).startswith("17.6")


def test_direct_pid_equivalence_refuses_production_shaped_conninfo():
    with pytest.raises(ProductionTargetRefused):
        prove_direct_pid_equivalence(
            "host=db.zlighrbsjexrozrmuwpw.supabase.co port=5432 dbname=postgres "
            "user=postgres sslmode=require"
        )
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target(
            "host=aws-1-us-east-2.pooler.supabase.com port=5432 dbname=postgres "
            "user=postgres.zlighrbsjexrozrmuwpw sslmode=require"
        )
