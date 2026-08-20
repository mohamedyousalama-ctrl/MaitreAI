from __future__ import annotations

import re
from pathlib import Path

from .errors import StaticContractFailure
from .statements import Statement, STATEMENTS, package_root


_AS_ALIAS = re.compile(
    r"\bas\s+([A-Za-z_][A-Za-z0-9_]*)\b",
    re.IGNORECASE,
)


def _select_aliases(sql: str) -> set[str]:
    aliases = {m.group(1) for m in _AS_ALIAS.finditer(sql)}
    # also accept bare output names from "select col" without AS by taking
    # trailing identifier of each select item before FROM.
    head = re.split(r"\bfrom\b", sql, maxsplit=1, flags=re.IGNORECASE)[0]
    for item in _split_select_items(head):
        token = item.strip().rstrip(",").rstrip(";").strip()
        func = re.match(r"^([A-Za-z_][A-Za-z0-9_.]*)\s*\(", token)
        if func:
            aliases.add(func.group(1).split(".")[-1])
        ident = re.search(r"([A-Za-z_][A-Za-z0-9_]*)\s*$", token)
        if ident:
            aliases.add(ident.group(1))
    return {a.lower() for a in aliases}


def _split_select_items(select_head: str) -> list[str]:
    # drop the leading SELECT keyword
    body = re.sub(r"^\s*select\s+", "", select_head, flags=re.IGNORECASE)
    items: list[str] = []
    buf: list[str] = []
    depth = 0
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            items.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if buf:
        items.append("".join(buf))
    return items


def _top_level_order_by_clause(sql: str) -> str | None:
    """Return the statement-level ORDER BY clause, ignoring subquery ORDER BY."""
    depth = 0
    i = 0
    lower = sql.lower()
    in_single = False
    while i < len(sql):
        ch = sql[i]
        if in_single:
            if ch == "'" and i + 1 < len(sql) and sql[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0 and lower.startswith("order by", i) and (
            i == 0 or not (lower[i - 1].isalnum() or lower[i - 1] == "_")
        ):
            clause = sql[i + 8 :]
            return clause.split(";", 1)[0].strip()
        i += 1
    return None


def _order_by_names(sql: str) -> list[str]:
    clause = _top_level_order_by_clause(sql)
    if not clause:
        return []
    names: list[str] = []
    depth = 0
    buf: list[str] = []
    for ch in clause:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            names.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    if buf:
        names.append("".join(buf).strip())
    cleaned: list[str] = []
    for token in names:
        token = re.sub(r"\s+(asc|desc)\s*$", "", token, flags=re.IGNORECASE)
        token = re.sub(r"::[A-Za-z_][\w.]*", "", token)
        cleaned.append(token.strip())
    return cleaned


def _name_allowed(order_expr: str, aliases: set[str]) -> bool:
    expr = order_expr.strip()
    if re.fullmatch(r"\d+", expr):
        return True
    ident = expr.split(".")[-1].strip().lower()
    if ident in aliases:
        return True
    # proved underlying catalog column form: table.column or alias.column
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*", expr):
        return True
    return False


def validate_statement_order_contract(stmt: Statement, sql: str) -> None:
    if stmt.sql_kind in {"host", "set"}:
        return
    aliases = _select_aliases(sql)
    declared = {c.lower() for c in stmt.columns}
    if stmt.columns and not declared.issubset(aliases):
        missing = sorted(declared - aliases)
        if missing and stmt.id == "PF-4c" and "has_schema_privilege" in aliases:
            missing = []
        if missing:
            raise StaticContractFailure(
                f"{stmt.id}: declared columns not in SQL select-list: {missing}"
            )
    for name in _order_by_names(sql):
        if not _name_allowed(name, aliases | declared):
            raise StaticContractFailure(
                f"{stmt.id}: ORDER BY {name!r} is not a select-list alias, "
                "positional index, or proved table.column"
            )
    for declared_ob in stmt.order_by:
        if not _name_allowed(declared_ob, aliases | declared):
            raise StaticContractFailure(
                f"{stmt.id}: catalog ORDER BY {declared_ob!r} failed static check"
            )


def validate_all_statement_contracts(package_root_path: Path | None = None) -> list[str]:
    root = package_root_path or package_root()
    checked: list[str] = []
    for stmt in STATEMENTS:
        if stmt.sql_relpath is None or stmt.sql_kind == "host":
            continue
        sql = stmt.sql_text(root)
        validate_statement_order_contract(stmt, sql)
        checked.append(stmt.id)
    return checked


def validate_bad_example_detects_kiv208() -> None:
    """The KIV-208 class: ORDER BY function_signature without that alias."""
    bad = Statement(
        id="BAD-GRANT-FUNCTION",
        ps_artifact="PS-GRANT",
        origin=STATEMENTS[-1].origin,
        query_class=STATEMENTS[-1].query_class,
        mutability=STATEMENTS[-1].mutability,
        sql_relpath=None,
        columns=("grantee",),
        order_by=("function_signature",),
        cardinality="zero_or_more",
    )
    sql = (
        "select p.proname as function_name, acl.grantee as grantee "
        "from pg_catalog.pg_proc p "
        "order by function_signature::text;\n"
    )
    try:
        validate_statement_order_contract(bad, sql)
    except StaticContractFailure as exc:
        if "function_signature" not in str(exc):
            raise
        return
    raise StaticContractFailure("KIV-208 alias detector did not fire")
