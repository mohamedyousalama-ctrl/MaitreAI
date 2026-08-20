from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import UUID

from .constants import (
    ACCEPTED_REPAIRED_BODY_MD5,
    BACKEND_PID_METHOD,
    DRIVER_PACKAGE,
    DRIVER_VERSION,
    OPERATIVE_PROCEDURE_BLOB,
    OPERATIVE_PROCEDURE_COMMIT,
    OPERATIVE_PROCEDURE_PATH,
    OPERATIVE_PROCEDURE_SHA256,
    PACKAGE_CONTEXT,
    PACKAGE_ID,
    PACKAGE_VERSION,
    P0_QUERY_SHA256,
)
from .driver import driver_identity
from .statements import Origin, QueryClass, STATEMENTS, package_root, verify_p0_pin
from .static_validate import validate_all_statement_contracts, validate_bad_example_detects_kiv208


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return str(value)


def canonical_dumps(obj: Any) -> str:
    return json.dumps(jsonable(obj), sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def file_identity(path: Path, *, repo_relative: str | None = None) -> dict[str, Any]:
    data = path.read_bytes()
    return {
        "path": repo_relative or str(path),
        "sha256": sha256(data).hexdigest(),
        "bytes": len(data),
        "lines": data.count(b"\n"),
    }


def statement_catalog(root: Path | None = None) -> list[dict[str, Any]]:
    pkg = root or package_root()
    verify_p0_pin(pkg)
    catalog: list[dict[str, Any]] = []
    for stmt in STATEMENTS:
        item: dict[str, Any] = {
            "id": stmt.id,
            "ps_artifact": stmt.ps_artifact,
            "origin": stmt.origin.value,
            "query_class": stmt.query_class.value,
            "mutability": stmt.mutability.value,
            "sql_relpath": stmt.sql_relpath,
            "columns": list(stmt.columns),
            "order_by": list(stmt.order_by),
            "cardinality": stmt.cardinality,
            "sql_kind": stmt.sql_kind,
            "expected_sqlstate": stmt.expected_sqlstate,
            "p0_gated": stmt.p0_gated,
            "skip_if": stmt.skip_if,
            "notes": stmt.notes,
            "query_sha256": None,
            "bytes": None,
            "lines": None,
        }
        if stmt.sql_relpath is not None:
            ident = file_identity(pkg / stmt.sql_relpath, repo_relative=stmt.sql_relpath)
            item["query_sha256"] = ident["sha256"]
            item["bytes"] = ident["bytes"]
            item["lines"] = ident["lines"]
        catalog.append(item)
    return catalog


def class_inventory() -> dict[str, list[str]]:
    return {
        "class_a_non_shipped": [
            s.id for s in STATEMENTS if s.query_class == QueryClass.A
        ],
        "class_b_non_shipped": [
            s.id for s in STATEMENTS if s.query_class == QueryClass.B
        ],
        "revision6_shipped": [
            s.id for s in STATEMENTS if s.origin == Origin.SHIPPED
        ],
        "host_side": [s.id for s in STATEMENTS if s.origin == Origin.HOST],
        "capture_order": [s.id for s in STATEMENTS],
    }


def hash_of_hashes(catalog: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for item in catalog:
        digest = item.get("query_sha256") or "NO-SQL"
        lines.append(f"{item['id']} {digest}")
    payload = "\n".join(lines) + "\n"
    return sha256(payload.encode()).hexdigest()


def build_package_manifest(root: Path | None = None) -> dict[str, Any]:
    pkg = root or package_root()
    validate_bad_example_detects_kiv208()
    checked = validate_all_statement_contracts(pkg)
    catalog = statement_catalog(pkg)
    p0 = next(item for item in catalog if item["id"] == "P-0")
    if p0["query_sha256"] != P0_QUERY_SHA256:
        raise RuntimeError("P-0 pin drifted while building manifest")
    manifest = {
        "package_id": PACKAGE_ID,
        "package_version": PACKAGE_VERSION,
        "package_context": PACKAGE_CONTEXT,
        "not_section7_fixture_evidence": True,
        "not_production_evidence": True,
        "production_supabase_auth_sql_count": 0,
        "capture_command": "REFUSED by this package; KIV-217 does not authorize capture",
        "operative_procedure": {
            "commit": OPERATIVE_PROCEDURE_COMMIT,
            "path": OPERATIVE_PROCEDURE_PATH,
            "blob": OPERATIVE_PROCEDURE_BLOB,
            "sha256": OPERATIVE_PROCEDURE_SHA256,
        },
        "driver": driver_identity(),
        "backend_pid_method": BACKEND_PID_METHOD,
        "accepted_repaired_body_md5": ACCEPTED_REPAIRED_BODY_MD5,
        "driver_pin": {
            "python_package": DRIVER_PACKAGE,
            "python_package_version": DRIVER_VERSION,
        },
        "static_order_by_checked_ids": checked,
        "class_inventory": class_inventory(),
        "statements": catalog,
        "hash_of_hashes": hash_of_hashes(catalog),
        "hash_of_hashes_inputs": "newline-joined '{id} {query_sha256|NO-SQL}' over capture order",
    }
    return manifest


def write_package_manifest(dest: Path | None = None, root: Path | None = None) -> Path:
    pkg = root or package_root()
    dest = dest or (pkg / "package_manifest.json")
    manifest = build_package_manifest(pkg)
    dest.write_text(canonical_dumps(manifest))
    return dest


def write_run_evidence(dest_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / "run_evidence.json"
    text = canonical_dumps(payload)
    path.write_text(text)
    digest = sha256(text.encode()).hexdigest()
    (dest_dir / "run_evidence.sha256").write_text(digest + "\n")
    return {"path": str(path), "sha256": digest, "bytes": len(text.encode())}
