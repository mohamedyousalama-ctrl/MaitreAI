from __future__ import annotations

from kiv14_pcsb.evidence import (
    build_package_manifest,
    canonical_dumps,
    hash_of_hashes,
    statement_catalog,
)
from kiv14_pcsb.g2 import g2_v4_equivalent, g3_binding_ok


V4 = """
coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
"""


def test_manifest_reproducible():
    first = canonical_dumps(build_package_manifest())
    second = canonical_dumps(build_package_manifest())
    assert first == second
    manifest = build_package_manifest()
    assert manifest["hash_of_hashes"] == hash_of_hashes(manifest["statements"])
    assert manifest["production_supabase_auth_sql_count"] == 0
    assert manifest["not_section7_fixture_evidence"] is True
    assert manifest["evidence_custody"]["completeness_requires_custody"] is True
    assert manifest["evidence_custody"]["append_only_step_artifacts"] is True


def test_catalog_includes_every_statement():
    catalog = statement_catalog()
    ids = [item["id"] for item in catalog]
    assert ids[0] == "P-0"
    assert ids[-1] == "PS-TIME-END"
    grant = next(item for item in catalog if item["id"] == "PS-GRANT-FUNCTION")
    assert "function_signature" in grant["order_by"]
    assert grant["query_class"] == "B"


def test_g2_v4_semantics():
    ok = g2_v4_equivalent(V4)
    assert ok["v4_equivalent"] is True
    bad = g2_v4_equivalent("auth.uid()")
    assert bad["v4_equivalent"] is False


def test_g3_binding():
    assert g3_binding_ok(1, "")["g3_ok"] is True
    assert g3_binding_ok(2, "")["g3_ok"] is False
    assert g3_binding_ok(1, "uuid")["g3_ok"] is False
