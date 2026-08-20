from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from pathlib import Path
from typing import Any

from .constants import P0_QUERY_SHA256
from .errors import StaticContractFailure


class Origin(str, Enum):
    SHIPPED = "revision-6-shipped"
    COMPOSED = "composed-non-shipped"
    HOST = "host-side-no-sql"


class QueryClass(str, Enum):
    A = "A"
    B = "B"
    HOST = "HOST"
    SHIPPED = "SHIPPED"


class Mutability(str, Enum):
    READ_ONLY = "read-only"
    SESSION_LOCAL_EXPECTED_DENIAL = "session-local-expected-denial"
    HOST_ONLY = "host-only-no-sql"


@dataclass(frozen=True)
class Statement:
    id: str
    ps_artifact: str
    origin: Origin
    query_class: QueryClass
    mutability: Mutability
    sql_relpath: str | None
    columns: tuple[str, ...]
    order_by: tuple[str, ...]
    cardinality: str
    sql_kind: str = "select"
    expected_sqlstate: str | None = None
    p0_gated: bool = False
    skip_if: str | None = None
    notes: str = ""

    def sql_text(self, package_root: Path) -> str:
        if self.sql_relpath is None:
            raise StaticContractFailure(f"{self.id} has no SQL path")
        return (package_root / self.sql_relpath).read_text()

    def sql_sha256(self, package_root: Path) -> str:
        return sha256(self.sql_text(package_root).encode()).hexdigest()


def package_root() -> Path:
    return Path(__file__).resolve().parent.parent


STATEMENTS: tuple[Statement, ...] = (
    Statement(
        id="P-0",
        ps_artifact="PS-0",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_0.sql",
        columns=(
            "executor",
            "row_security_setting",
            "members_present",
            "members_select",
            "members_rls_active",
            "miv_present",
            "miv_select",
            "miv_rls_active",
            "cae_present",
            "cae_select",
            "cae_rls_active",
        ),
        order_by=(),
        cardinality="exactly_one",
        notes="First SQL. Host inspects the row. No later SQL without PASS.",
    ),
    Statement(
        id="PS-TIME-START",
        ps_artifact="PS-TIME",
        origin=Origin.COMPOSED,
        query_class=QueryClass.A,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_time_start.sql",
        columns=(
            "executor",
            "session_user",
            "current_database",
            "inet_server_port",
            "sql_backend_pid",
            "window_ts",
        ),
        order_by=(),
        cardinality="exactly_one",
        notes="After observed P-0 PASS only. sql_backend_pid is post-P-0 SQL reconciliation, not the pre-P-0 identity.",
    ),
    Statement(
        id="P-1",
        ps_artifact="PS-P1",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_1.sql",
        columns=("table_rows", "owned_ok", "rls_on", "force_rls_on"),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="P-2",
        ps_artifact="PS-P2",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_2.sql",
        columns=("type_present",),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="P-3",
        ps_artifact="PS-P3",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_3.sql",
        columns=("function_signature", "current_owner"),
        order_by=("1",),
        cardinality="exactly_21_on_expected_state",
        notes="Byte-identical PF-4f.",
    ),
    Statement(
        id="P-4",
        ps_artifact="PS-P4",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_4.sql",
        columns=(
            "fn_rows",
            "fn_owner",
            "is_security_definer",
            "proconfig",
            "returns_setof",
            "result_shape",
            "arg_list",
            "acl",
            "body_md5",
            "still_unrepaired",
        ),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="P-5",
        ps_artifact="PS-P5",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_5.sql",
        columns=(
            "role_present",
            "auth_schema_present",
            "auth_usage",
            "auth_create",
            "public_create",
        ),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="P-6",
        ps_artifact="PS-P6",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_6.sql",
        columns=("a1_columns", "a1_nonnull_rows"),
        order_by=(),
        cardinality="exactly_one",
        p0_gated=True,
    ),
    Statement(
        id="P-7",
        ps_artifact="PS-P7",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_7.sql",
        columns=("members_n", "miv_rows", "miv_open_rows", "miv_non_v1_rows"),
        order_by=(),
        cardinality="exactly_one",
        p0_gated=True,
    ),
    Statement(
        id="P-8a",
        ps_artifact="PS-P8",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_8a.sql",
        columns=("ledger_present", "ledger_select", "ledger_rls_active"),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="P-8b",
        ps_artifact="PS-LEDGER",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_8b.sql",
        columns=(
            "ledger_rows",
            "max_version",
            "name_0108_candidates",
            "name_0109_candidates",
        ),
        order_by=(),
        cardinality="exactly_one_when_run",
        skip_if="ledger_not_readable",
    ),
    Statement(
        id="P-8c",
        ps_artifact="PS-LEDGER",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/p_8c.sql",
        columns=("version", "name"),
        order_by=("m.version",),
        cardinality="ledger_rows",
        skip_if="ledger_not_readable",
        notes="ORDER BY uses proved underlying catalog/table column m.version.",
    ),
    Statement(
        id="PF-4a2",
        ps_artifact="PS-PF4",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/pf_4a2.sql",
        columns=(
            "role_rows",
            "ok_not_super",
            "ok_no_login",
            "ok_no_bypassrls",
            "ok_no_createdb",
            "ok_no_createrole",
            "ok_no_inherit",
            "ok_no_replication",
        ),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="PF-4b2",
        ps_artifact="PS-PF4",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/pf_4b2.sql",
        columns=(
            "membership_rows",
            "rows_with_set",
            "rows_with_inherit",
            "rows_without_admin",
            "rows_with_nonsuperuser_grantor",
            "rows_not_held_by_executor",
        ),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="PF-4b-detail",
        ps_artifact="PS-PF4",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/pf_4b_detail.sql",
        columns=(
            "member_role",
            "granted_role",
            "grantor_role",
            "admin_option",
            "inherit_option",
            "set_option",
        ),
        order_by=("member_role.rolname", "target_role.rolname", "grantor_role.rolname"),
        cardinality="membership_rows",
        notes="ORDER BY uses proved underlying catalog columns, not missing aliases.",
    ),
    Statement(
        id="PF-4c",
        ps_artifact="PS-PF4",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/pf_4c.sql",
        columns=("has_schema_privilege",),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="PF-4-USAGE",
        ps_artifact="PS-PF4",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/pf_4_usage.sql",
        columns=("has_usage",),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="PF-4-SET-ROLE",
        ps_artifact="PS-PF4",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.SESSION_LOCAL_EXPECTED_DENIAL,
        sql_relpath="statements/composed/pf_4_set_role.sql",
        columns=(),
        order_by=(),
        cardinality="zero_or_error",
        sql_kind="set",
        expected_sqlstate="42501",
        notes="Expected denial. Success is fail-closed. No RESET/repair path.",
    ),
    Statement(
        id="G1",
        ps_artifact="PS-G",
        origin=Origin.SHIPPED,
        query_class=QueryClass.SHIPPED,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/shipped/g1.sql",
        columns=("uid_rows", "prosrc", "prosrc_md5", "functiondef", "arg_list"),
        order_by=(),
        cardinality="exactly_one",
    ),
    Statement(
        id="G2",
        ps_artifact="PS-G",
        origin=Origin.HOST,
        query_class=QueryClass.HOST,
        mutability=Mutability.HOST_ONLY,
        sql_relpath="statements/shipped/g2_expression.sql",
        columns=(),
        order_by=(),
        cardinality="host_determination",
        sql_kind="host",
        notes="Host-side V4 semantic determination against G1.prosrc. Not dispatched as SQL.",
    ),
    Statement(
        id="G3",
        ps_artifact="PS-G",
        origin=Origin.HOST,
        query_class=QueryClass.HOST,
        mutability=Mutability.HOST_ONLY,
        sql_relpath=None,
        columns=(),
        order_by=(),
        cardinality="host_determination",
        sql_kind="host",
        notes="Host-side: G1 uid_rows==1 and arg_list==''.",
    ),
    Statement(
        id="PS-GRANT-TABLE",
        ps_artifact="PS-GRANT",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_grant_table.sql",
        columns=(
            "schema_name",
            "table_name",
            "grantor",
            "grantee",
            "privilege_type",
            "is_grantable",
        ),
        order_by=("schema_name", "table_name", "grantee", "privilege_type", "grantor"),
        cardinality="zero_or_more",
        notes="Prospective only. Never recovered B-11. ORDER BY uses select-list aliases.",
    ),
    Statement(
        id="PS-GRANT-COLUMN",
        ps_artifact="PS-GRANT",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_grant_column.sql",
        columns=(
            "schema_name",
            "table_name",
            "column_name",
            "grantor",
            "grantee",
            "privilege_type",
            "is_grantable",
        ),
        order_by=(
            "schema_name",
            "table_name",
            "column_name",
            "grantee",
            "privilege_type",
            "grantor",
        ),
        cardinality="zero_or_more",
        notes="Prospective only. Never recovered B-11.",
    ),
    Statement(
        id="PS-GRANT-FUNCTION",
        ps_artifact="PS-GRANT",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_grant_function.sql",
        columns=(
            "schema_name",
            "function_name",
            "identity_args",
            "function_signature",
            "grantor",
            "grantee",
            "privilege_type",
            "is_grantable",
        ),
        order_by=("function_signature", "grantee", "grantor", "privilege_type"),
        cardinality="zero_or_more",
        notes=(
            "Closes the KIV-208 defect: ORDER BY function_signature is a select-list alias. "
            "Prospective only. Never recovered B-11."
        ),
    ),
    Statement(
        id="PS-OWN",
        ps_artifact="PS-OWN",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_own.sql",
        columns=(
            "schema_name",
            "table_name",
            "owner",
            "relrowsecurity",
            "relforcerowsecurity",
        ),
        order_by=("schema_name", "table_name"),
        cardinality="zero_or_more",
    ),
    Statement(
        id="PS-ROLE",
        ps_artifact="PS-ROLE",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_role.sql",
        columns=(
            "rolname",
            "rolsuper",
            "rolinherit",
            "rolcreaterole",
            "rolcreatedb",
            "rolcanlogin",
            "rolreplication",
            "rolbypassrls",
        ),
        order_by=("r.rolname",),
        cardinality="zero_or_more",
        notes="ORDER BY uses proved pg_roles column. Named roles may be absent.",
    ),
    Statement(
        id="PS-COUNT",
        ps_artifact="PS-COUNT",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_count.sql",
        columns=(
            "members_n",
            "conversations_n",
            "cae_n",
            "members_id_fingerprint",
        ),
        order_by=(),
        cardinality="exactly_one",
        p0_gated=True,
        notes="Non-disclosing. No emails/phones/bodies.",
    ),
    Statement(
        id="PS-BODY",
        ps_artifact="PS-BODY",
        origin=Origin.COMPOSED,
        query_class=QueryClass.B,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_body.sql",
        columns=("fn_rows", "body_md5", "equals_accepted_repaired", "still_unrepaired"),
        order_by=(),
        cardinality="exactly_one",
        notes="Third body is BLOCK at capture time. Package records the comparison contract.",
    ),
    Statement(
        id="PS-TIME-END",
        ps_artifact="PS-TIME",
        origin=Origin.COMPOSED,
        query_class=QueryClass.A,
        mutability=Mutability.READ_ONLY,
        sql_relpath="statements/composed/ps_time_end.sql",
        columns=(
            "executor",
            "session_user",
            "current_database",
            "inet_server_port",
            "sql_backend_pid",
            "window_ts",
        ),
        order_by=(),
        cardinality="exactly_one",
    ),
)


def statement_by_id(stmt_id: str) -> Statement:
    for stmt in STATEMENTS:
        if stmt.id == stmt_id:
            return stmt
    raise KeyError(stmt_id)


def verify_p0_pin(package_root_path: Path | None = None) -> None:
    root = package_root_path or package_root()
    actual = statement_by_id("P-0").sql_sha256(root)
    if actual != P0_QUERY_SHA256:
        raise StaticContractFailure(
            f"P-0 query SHA-256 {actual} != pinned Revision-6 identity {P0_QUERY_SHA256}"
        )


def ordered_sql_statements() -> tuple[Statement, ...]:
    return tuple(s for s in STATEMENTS if s.sql_kind != "host")
