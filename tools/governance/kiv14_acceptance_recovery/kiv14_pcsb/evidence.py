from __future__ import annotations

import json
import re
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import UUID

from .authority import consumed_capture_identity_contract, destination_binding_review_contract
from .constants import (
    ACCEPTED_REPAIRED_BODY_MD5,
    BACKEND_PID_METHOD,
    CAPTURE_COMMAND_DEFAULT,
    DRIVER_PACKAGE,
    DRIVER_VERSION,
    KIV217_PUBLISHED_BRANCH,
    KIV217_PUBLISHED_COMMIT,
    KIV220_ACCEPTED_COMMIT,
    KIV220_ACCEPTED_HASH_OF_HASHES,
    KIV220_ACCEPTED_MANIFEST_SHA256,
    KIV221_BLOCKED_COMMIT,
    KIV221_BLOCKED_MANIFEST_BLOB,
    KIV221_BLOCKED_MANIFEST_SHA256,
    KIV224_ACCEPTED_COMMIT,
    KIV224_ACCEPTED_MANIFEST_BLOB,
    KIV224_ACCEPTED_MANIFEST_SHA256,
    KIV224_ACCEPTED_PACKAGE_VERSION,
    KIV229_BLOCKED_COMMIT,
    KIV229_BLOCKED_MANIFEST_BLOB,
    KIV229_BLOCKED_MANIFEST_SHA256,
    KIV229_BLOCKED_PACKAGE_VERSION,
    KIV231_BLOCKED_COMMIT,
    KIV231_BLOCKED_MANIFEST_BLOB,
    KIV231_BLOCKED_MANIFEST_SHA256,
    KIV231_BLOCKED_PACKAGE_VERSION,
    KIV234_BLOCKED_COMMIT,
    KIV234_BLOCKED_MANIFEST_BLOB,
    KIV234_BLOCKED_MANIFEST_SHA256,
    KIV234_BLOCKED_PACKAGE_VERSION,
    KIV237_ACCEPTED_COMMIT,
    KIV237_ACCEPTED_MANIFEST_BLOB,
    KIV237_ACCEPTED_MANIFEST_SHA256,
    KIV237_ACCEPTED_PACKAGE_VERSION,
    KIV242_BLOCKED_COMMIT,
    KIV242_BLOCKED_MANIFEST_BLOB,
    KIV242_BLOCKED_MANIFEST_SHA256,
    KIV242_BLOCKED_PACKAGE_VERSION,
    KIV246_ACCEPTED_COMMIT,
    KIV246_ACCEPTED_MANIFEST_BLOB,
    KIV246_ACCEPTED_MANIFEST_SHA256,
    KIV246_ACCEPTED_PACKAGE_VERSION,
    ARTIFACTS_SUBDIR,
    DIGEST_LIST_FILENAME,
    DIGEST_LIST_SCHEMA,
    HOST_QUERY_SHA256_MARKER,
    STEP_ARTIFACT_SCHEMA,
    OPERATIVE_PROCEDURE_BLOB,
    OPERATIVE_PROCEDURE_COMMIT,
    OPERATIVE_PROCEDURE_PATH,
    OPERATIVE_PROCEDURE_SHA256,
    PACKAGE_CONTEXT,
    PACKAGE_ID,
    PACKAGE_VERSION,
    P0_QUERY_SHA256,
    PG176_TARBALL_ASSET,
    PG176_TARBALL_SHA256,
    SUPABASE_POSTGRES_COMMIT,
    SUPABASE_POSTGRES_TAG,
)
from .driver import driver_identity
from .errors import EvidenceCustodyFailure
from .statements import (
    Origin,
    QueryClass,
    STATEMENTS,
    captured_query_sha256,
    package_root,
    required_ps_artifacts,
    verify_p0_pin,
)
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
        "capture_command": CAPTURE_COMMAND_DEFAULT,
        "kiv220_accepted_parent": {
            "commit": KIV220_ACCEPTED_COMMIT,
            "manifest_sha256": KIV220_ACCEPTED_MANIFEST_SHA256,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv221_blocked_parent": {
            "commit": KIV221_BLOCKED_COMMIT,
            "manifest_sha256": KIV221_BLOCKED_MANIFEST_SHA256,
            "manifest_blob": KIV221_BLOCKED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv224_accepted_parent": {
            "commit": KIV224_ACCEPTED_COMMIT,
            "package_version": KIV224_ACCEPTED_PACKAGE_VERSION,
            "manifest_sha256": KIV224_ACCEPTED_MANIFEST_SHA256,
            "manifest_blob": KIV224_ACCEPTED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv229_blocked_parent": {
            "commit": KIV229_BLOCKED_COMMIT,
            "package_version": KIV229_BLOCKED_PACKAGE_VERSION,
            "manifest_sha256": KIV229_BLOCKED_MANIFEST_SHA256,
            "manifest_blob": KIV229_BLOCKED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv231_blocked_parent": {
            "commit": KIV231_BLOCKED_COMMIT,
            "package_version": KIV231_BLOCKED_PACKAGE_VERSION,
            "manifest_sha256": KIV231_BLOCKED_MANIFEST_SHA256,
            "manifest_blob": KIV231_BLOCKED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv234_blocked_parent": {
            "commit": KIV234_BLOCKED_COMMIT,
            "package_version": KIV234_BLOCKED_PACKAGE_VERSION,
            "manifest_sha256": KIV234_BLOCKED_MANIFEST_SHA256,
            "manifest_blob": KIV234_BLOCKED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv237_accepted_parent": {
            "commit": KIV237_ACCEPTED_COMMIT,
            "package_version": KIV237_ACCEPTED_PACKAGE_VERSION,
            "manifest_sha256": KIV237_ACCEPTED_MANIFEST_SHA256,
            "manifest_blob": KIV237_ACCEPTED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv242_blocked_parent": {
            "commit": KIV242_BLOCKED_COMMIT,
            "package_version": KIV242_BLOCKED_PACKAGE_VERSION,
            "manifest_sha256": KIV242_BLOCKED_MANIFEST_SHA256,
            "manifest_blob": KIV242_BLOCKED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "kiv246_accepted_parent": {
            "commit": KIV246_ACCEPTED_COMMIT,
            "package_version": KIV246_ACCEPTED_PACKAGE_VERSION,
            "manifest_sha256": KIV246_ACCEPTED_MANIFEST_SHA256,
            "manifest_blob": KIV246_ACCEPTED_MANIFEST_BLOB,
            "hash_of_hashes": KIV220_ACCEPTED_HASH_OF_HASHES,
        },
        "consumed_capture_identities": consumed_capture_identity_contract(),
        "evidence_custody": evidence_custody_contract(),
        "destination_binding": destination_binding_review_contract(),
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
        "kiv217_published_custody": {
            "branch": KIV217_PUBLISHED_BRANCH,
            "commit": KIV217_PUBLISHED_COMMIT,
        },
        "platform_baseline": {
            "supabase_postgres_tag": SUPABASE_POSTGRES_TAG,
            "supabase_postgres_commit": SUPABASE_POSTGRES_COMMIT,
            "cli_tarball_asset": PG176_TARBALL_ASSET,
            "cli_tarball_sha256": PG176_TARBALL_SHA256,
            "source_pin_path": "topology/SOURCE_PIN.json",
            "not_third_kivo_bootstrap": True,
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


SECRET_PATTERNS = (
    re.compile(r"password\s*=", re.I),
    re.compile(r"postgres(ql)?://[^\s\"']+", re.I),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\."),
    re.compile(r"service_role[_-]?key", re.I),
    re.compile(r"\bsbp_[A-Za-z0-9]", re.I),
    re.compile(r"SUPABASE_SERVICE", re.I),
    re.compile(r"PGPASSWORD", re.I),
)
FORBIDDEN_PAYLOAD_KEYS = frozenset(
    {
        "email",
        "e_mail",
        "phone",
        "phone_number",
        "mobile",
        "member_email",
        "customer_phone",
        "message_body",
        "raw_message",
        "sms_body",
        "whatsapp_body",
        "member_row",
        "member_rows",
        "password",
        "conninfo",
        "database_url",
        "service_role",
        "jwt",
    }
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b", re.I)
PHONE_PATTERN = re.compile(
    r"\b(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b"
)


def evidence_custody_contract() -> dict[str, Any]:
    """Hash-pinnable in-window per-step/per-PS artifact custody contract."""
    return {
        "schema": STEP_ARTIFACT_SCHEMA,
        "grouping": (
            "one canonical redacted artifact file per underlying SQL/host step "
            "in STATEMENTS capture order; logical §5.3 mapping is Statement.ps_artifact"
        ),
        "required_ps_artifacts": list(required_ps_artifacts()),
        "required_statement_ids": [stmt.id for stmt in STATEMENTS],
        "artifacts_subdir": ARTIFACTS_SUBDIR,
        "digest_list_filename": DIGEST_LIST_FILENAME,
        "digest_list_schema": DIGEST_LIST_SCHEMA,
        "digest_algorithm": (
            "sha256 of newline-joined '{statement_id} {artifact_sha256}' "
            "over STATEMENTS capture order, trailing newline"
        ),
        "host_timestamps": (
            "dispatch_ts and complete_ts recorded in the authorized runner "
            "process at execution time; timestamp collection does not use SQL"
        ),
        "ps_time_sql_timestamps": (
            "PS-TIME window_ts SQL values remain authoritative and are also "
            "copied onto the matching step artifact as sql_window_ts"
        ),
        "host_query_sha256_marker": HOST_QUERY_SHA256_MARKER,
        "append_only_step_artifacts": True,
        "completeness_requires_custody": True,
        "combined_capture_run_json_is_not_custody_substitute": True,
        "package_hash_of_hashes_is_query_text_pin_not_captured_artifact_custody": True,
    }


def _scan_forbidden_keys(value: Any, *, where: str) -> None:
    if isinstance(value, dict):
        for key, inner in value.items():
            lowered = str(key).lower()
            if lowered in FORBIDDEN_PAYLOAD_KEYS:
                raise EvidenceCustodyFailure(
                    f"refusing forbidden payload key {key!r} at {where}"
                )
            _scan_forbidden_keys(inner, where=f"{where}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, inner in enumerate(value):
            _scan_forbidden_keys(inner, where=f"{where}[{index}]")


def refuse_if_secrets(text: str, *, where: str) -> None:
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            raise RuntimeError(f"refusing to write secret-bearing evidence at {where}")
    if EMAIL_PATTERN.search(text):
        raise EvidenceCustodyFailure(f"refusing email-bearing evidence at {where}")
    if PHONE_PATTERN.search(text):
        raise EvidenceCustodyFailure(f"refusing phone-bearing evidence at {where}")


def refuse_forbidden_evidence(payload: dict[str, Any], *, where: str) -> str:
    _scan_forbidden_keys(payload, where=where)
    text = canonical_dumps(payload)
    refuse_if_secrets(text, where=where)
    return text


def write_capture_evidence(
    dest_dir: Path,
    filename: str,
    payload: dict[str, Any],
    *,
    overwrite: bool = True,
) -> dict[str, Any]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / filename
    sidecar = path.with_suffix(path.suffix + ".sha256")
    if (path.exists() or sidecar.exists()) and not overwrite:
        raise EvidenceCustodyFailure(
            f"append-only evidence refusal: {filename} already exists under this run"
        )
    text = refuse_forbidden_evidence(payload, where=str(path))
    data = text.encode("utf-8")
    path.write_bytes(data)
    digest = sha256(data).hexdigest()
    sidecar.write_text(digest + "\n")
    return {
        "path": str(path),
        "filename": filename,
        "sha256": digest,
        "bytes": len(data),
        "lines": data.count(b"\n"),
    }


def step_artifact_filename(statement_id: str) -> str:
    if "/" in statement_id or "\\" in statement_id or ".." in statement_id:
        raise EvidenceCustodyFailure(f"refusing unsafe artifact id {statement_id!r}")
    return f"{statement_id}.json"


def complete_pcsb_digest(entries: list[dict[str, Any]]) -> str:
    lines = [f"{item['statement_id']} {item['sha256']}" for item in entries]
    payload = "\n".join(lines) + "\n"
    return sha256(payload.encode("utf-8")).hexdigest()


def build_step_artifact_payload(
    stmt: Any,
    step: Any,
    *,
    root: Path | None = None,
) -> dict[str, Any]:
    pkg = root or package_root()
    query_sha256 = captured_query_sha256(stmt, pkg)
    return {
        "schema": STEP_ARTIFACT_SCHEMA,
        "statement_id": stmt.id,
        "ps_artifact": stmt.ps_artifact,
        "status": step.status,
        "n_rows": step.n_rows,
        "sqlstate": step.sqlstate,
        "skip_reason": step.skip_reason,
        "detail": step.detail,
        "host_result": jsonable(step.host_result),
        "rows": jsonable(list(step.rows)),
        "dispatch_ts": step.dispatch_ts,
        "complete_ts": step.complete_ts,
        "sql_window_ts": step.sql_window_ts,
        "origin": stmt.origin.value,
        "query_class": stmt.query_class.value,
        "query_sha256": query_sha256,
    }


class CaptureArtifactWriter:
    """Append-only in-window per-step artifact + digest-list writer."""

    def __init__(self, dest_dir: Path, *, root: Path | None = None) -> None:
        self.dest_dir = dest_dir
        self.root = root or package_root()
        self.artifacts_dir = dest_dir / ARTIFACTS_SUBDIR
        self.written: dict[str, dict[str, Any]] = {}
        self.digest_list_custody: dict[str, Any] | None = None
        self.failed: str | None = None

    def write_step(self, stmt: Any, step: Any) -> dict[str, Any]:
        if self.failed:
            raise EvidenceCustodyFailure(
                f"evidence writer already failed closed: {self.failed}"
            )
        if stmt.id in self.written:
            self.failed = f"duplicate step artifact {stmt.id}"
            raise EvidenceCustodyFailure(self.failed)
        if not step.dispatch_ts or not step.complete_ts:
            self.failed = f"{stmt.id} missing in-window host timestamps"
            raise EvidenceCustodyFailure(self.failed)
        filename = step_artifact_filename(stmt.id)
        try:
            payload = build_step_artifact_payload(stmt, step, root=self.root)
            custody = write_capture_evidence(
                self.artifacts_dir, filename, payload, overwrite=False
            )
        except Exception as exc:
            self.failed = f"{stmt.id} artifact write failed: {exc}"
            if isinstance(exc, EvidenceCustodyFailure):
                raise
            raise EvidenceCustodyFailure(self.failed) from exc
        record = {
            "statement_id": stmt.id,
            "ps_artifact": stmt.ps_artifact,
            "artifact_filename": filename,
            "status": step.status,
            "sha256": custody["sha256"],
            "bytes": custody["bytes"],
            "lines": custody["lines"],
            "dispatch_ts": step.dispatch_ts,
            "complete_ts": step.complete_ts,
            "sql_window_ts": step.sql_window_ts,
            "query_sha256": payload["query_sha256"],
        }
        self.written[stmt.id] = record
        return record

    def write_digest_list(self) -> dict[str, Any]:
        if self.failed:
            raise EvidenceCustodyFailure(
                f"refusing complete digest list after writer failure: {self.failed}"
            )
        missing = [stmt.id for stmt in STATEMENTS if stmt.id not in self.written]
        if missing:
            raise EvidenceCustodyFailure(
                "refusing complete digest list; missing artifacts: " + ", ".join(missing)
            )
        entries = [self.written[stmt.id] for stmt in STATEMENTS]
        digest = complete_pcsb_digest(entries)
        payload = {
            "schema": DIGEST_LIST_SCHEMA,
            "ordering": "STATEMENTS capture order; one artifact per underlying SQL/host step",
            "required_statement_ids": [stmt.id for stmt in STATEMENTS],
            "required_ps_artifacts": list(required_ps_artifacts()),
            "entries": [
                {
                    "statement_id": item["statement_id"],
                    "ps_artifact": item["ps_artifact"],
                    "artifact_filename": item["artifact_filename"],
                    "sha256": item["sha256"],
                    "bytes": item["bytes"],
                    "lines": item["lines"],
                    "query_sha256": item["query_sha256"],
                    "dispatch_ts": item["dispatch_ts"],
                    "complete_ts": item["complete_ts"],
                }
                for item in entries
            ],
            "complete_pcsb_digest": digest,
            "completeness_asserted": True,
        }
        custody = write_capture_evidence(
            self.dest_dir, DIGEST_LIST_FILENAME, payload, overwrite=False
        )
        self.digest_list_custody = {
            **custody,
            "complete_pcsb_digest": digest,
            "entries": payload["entries"],
        }
        return self.digest_list_custody


def verify_digest_list_against_writer(writer: CaptureArtifactWriter) -> tuple[bool, str | None]:
    custody = writer.digest_list_custody
    if custody is None:
        return False, "complete-PCSB digest list was not written"
    entries = [writer.written[stmt.id] for stmt in STATEMENTS]
    expected = complete_pcsb_digest(entries)
    if custody.get("complete_pcsb_digest") != expected:
        return False, "complete-PCSB digest list digest mismatch"
    listed = custody.get("entries") or []
    if [item["statement_id"] for item in listed] != [stmt.id for stmt in STATEMENTS]:
        return False, "complete-PCSB digest list ordering mismatch"
    for item, live in zip(listed, entries):
        if item["sha256"] != live["sha256"]:
            return False, f"digest list sha256 mismatch for {live['statement_id']}"
    path = Path(custody["path"])
    recomputed = sha256(path.read_bytes()).hexdigest()
    if recomputed != custody["sha256"]:
        return False, "digest list file sha256 mismatch"
    return True, None
