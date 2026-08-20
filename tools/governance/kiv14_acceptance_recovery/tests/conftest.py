from __future__ import annotations

import pytest

from kiv14_pcsb.local_pg import assert_pg176_prefix, init_and_start, stop_cluster
from kiv14_pcsb.safety import default_local_conninfo


@pytest.fixture(scope="session")
def pg176_cluster():
    try:
        assert_pg176_prefix()
    except Exception as exc:
        pytest.skip(f"PostgreSQL 17.6 prefix unavailable: {exc}")
    cluster = init_and_start(label="pytest")
    try:
        yield cluster
    finally:
        stop_cluster(cluster)


@pytest.fixture
def local_conninfo(pg176_cluster):
    return default_local_conninfo(pg176_cluster.port)
