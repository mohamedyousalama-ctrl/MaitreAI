from __future__ import annotations

from kiv14_pcsb.preflight import classify_bootstrap_failure, is_auth_users_hold
from kiv14_pcsb.statements import QueryClass, STATEMENTS


def test_auth_users_hold_detector():
    assert is_auth_users_hold('ERROR:  relation "auth.users" does not exist')
    assert is_auth_users_hold('ERROR:  schema "auth" does not exist')
    assert not is_auth_users_hold("syntax error at or near SELECT")
    classified = classify_bootstrap_failure(
        "user_id uuid not null references auth.users(id)",
        'ERROR:  could not open extension control file ".../pgcrypto.control"',
        "supabase/migrations/0001_init.sql",
    )
    assert classified["hold"] is True
    assert classified["invented_auth_objects"] is False
    assert "auth.users" in classified["hold_reason"]
    assert "pgcrypto" in classified["hold_reason"]


def test_class_b_not_validated_on_bare_cluster_by_policy():
    class_b = [s.id for s in STATEMENTS if s.query_class == QueryClass.B]
    assert class_b
    assert "PS-GRANT-FUNCTION" in class_b
    assert "PS-TIME-START" not in class_b
