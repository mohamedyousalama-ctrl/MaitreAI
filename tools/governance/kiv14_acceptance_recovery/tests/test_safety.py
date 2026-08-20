from __future__ import annotations

import pytest

from kiv14_pcsb.safety import (
    ProductionTargetRefused,
    assert_not_production_target,
    default_local_conninfo,
    is_loopback_or_local_socket,
)


def test_default_conninfo_is_loopback():
    info = default_local_conninfo(55432)
    assert "127.0.0.1" in info
    assert "supabase" not in info
    assert_not_production_target(info)


def test_refuses_supabase_dsn():
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target(
            "postgresql://postgres.zlighrbsjexrozrmuwpw:secret@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
        )


def test_refuses_project_ref_in_conninfo():
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target("host=127.0.0.1 dbname=zlighrbsjexrozrmuwpw")


def test_refuses_non_loopback():
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target("host=10.0.0.8 port=5432 dbname=postgres user=x")


def test_refuses_allow_remote_even_if_requested():
    with pytest.raises(ProductionTargetRefused):
        assert_not_production_target("host=127.0.0.1 port=1 dbname=x user=x", allow_remote=True)


def test_loopback_helpers():
    assert is_loopback_or_local_socket("127.0.0.1")
    assert is_loopback_or_local_socket("localhost")
    assert is_loopback_or_local_socket(None)
    assert not is_loopback_or_local_socket("db.example.com")
