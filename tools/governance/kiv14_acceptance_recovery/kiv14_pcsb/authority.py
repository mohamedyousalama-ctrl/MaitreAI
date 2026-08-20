from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any, Mapping, NoReturn

from .constants import (
    ALLOWED_ROUTE_CLASSES,
    CONSUMED_PCSB_IDENTITIES,
    GOVERNANCE_DISCLAIMER,
    PACKAGE_ID,
    ROUTE_CLASS_LOOPBACK,
    ROUTE_CLASS_SESSION_POOLER,
    SESSION_POOLER_PORT,
    TRANSACTION_POOLER_PORT,
)
from .errors import CaptureAuthorityRefused
from .safety import conninfo_nonsecret_identity, is_loopback_or_local_socket
from .statements import package_root

WORK_ORDER_RE = re.compile(r"^KIV-[1-9][0-9]*$")
PCSB_RE = re.compile(r"^PCSB-[1-9][0-9]*$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DIRECT_DB_HOST_RE = re.compile(r"^db\.[^.]+\.supabase\.co$")

AUTHORITY_KEYS = frozenset(
    {
        "work_order_id",
        "pcsb_identity",
        "package_commit",
        "package_manifest_sha256",
        "package_hash_of_hashes",
        "package_id",
        "authorized_target",
        "evidence_directory",
        "governance_disclaimer",
    }
)
TARGET_KEYS = frozenset(
    {
        "route_class",
        "project_name",
        "project_ref",
        "host",
        "port",
        "database",
        "user",
        "sslmode",
    }
)
SECRET_KEY_NAMES = frozenset(
    {
        "password",
        "token",
        "secret",
        "dsn",
        "conninfo",
        "database_url",
        "service_role",
        "jwt",
        "pgpass",
        "credential",
    }
)


@dataclass(frozen=True)
class AuthorizedTarget:
    route_class: str
    project_name: str
    project_ref: str
    host: str
    port: int
    database: str
    user: str
    sslmode: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "route_class": self.route_class,
            "project_name": self.project_name,
            "project_ref": self.project_ref,
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "user": self.user,
            "sslmode": self.sslmode,
        }


@dataclass(frozen=True)
class CaptureAuthority:
    work_order_id: str
    pcsb_identity: str
    package_commit: str
    package_manifest_sha256: str
    package_hash_of_hashes: str
    package_id: str
    authorized_target: AuthorizedTarget
    evidence_directory: str
    governance_disclaimer: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "work_order_id": self.work_order_id,
            "pcsb_identity": self.pcsb_identity,
            "package_commit": self.package_commit,
            "package_manifest_sha256": self.package_manifest_sha256,
            "package_hash_of_hashes": self.package_hash_of_hashes,
            "package_id": self.package_id,
            "authorized_target": self.authorized_target.as_dict(),
            "evidence_directory": self.evidence_directory,
            "governance_disclaimer": self.governance_disclaimer,
        }


@dataclass(frozen=True)
class CaptureInvocation:
    work_order_id: str
    pcsb_identity: str
    evidence_directory: str


def _refuse(message: str) -> NoReturn:
    raise CaptureAuthorityRefused(message)


def _require_str(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        _refuse(f"authority field {key!r} missing or not a non-empty string")
    return value.strip()


def _scan_mapping_for_secret_keys(payload: Mapping[str, Any], *, where: str) -> None:
    for key, value in payload.items():
        lowered = str(key).lower()
        if lowered in SECRET_KEY_NAMES or any(part in lowered for part in SECRET_KEY_NAMES):
            _refuse(f"{where} contains forbidden secret-bearing key {key!r}")
        if isinstance(value, Mapping):
            _scan_mapping_for_secret_keys(value, where=f"{where}.{key}")


def parse_capture_authority(payload: Mapping[str, Any]) -> CaptureAuthority:
    if not isinstance(payload, Mapping):
        _refuse("authority payload is not an object")
    extra = set(payload) - AUTHORITY_KEYS
    if extra:
        _refuse(f"authority payload has unknown keys: {sorted(extra)}")
    missing = AUTHORITY_KEYS - set(payload)
    if missing:
        _refuse(f"authority payload missing keys: {sorted(missing)}")
    _scan_mapping_for_secret_keys(payload, where="authority")

    work_order_id = _require_str(payload, "work_order_id")
    if not WORK_ORDER_RE.fullmatch(work_order_id):
        _refuse(f"malformed work_order_id {work_order_id!r}")
    pcsb_identity = _require_str(payload, "pcsb_identity")
    if not PCSB_RE.fullmatch(pcsb_identity):
        _refuse(f"malformed pcsb_identity {pcsb_identity!r}")
    if pcsb_identity in CONSUMED_PCSB_IDENTITIES:
        _refuse(f"{pcsb_identity} is permanently incomplete/consumed and cannot be rebound")
    package_commit = _require_str(payload, "package_commit").lower()
    if not COMMIT_RE.fullmatch(package_commit):
        _refuse("package_commit must be a 40-character lowercase git SHA")
    manifest_sha = _require_str(payload, "package_manifest_sha256").lower()
    if not SHA256_RE.fullmatch(manifest_sha):
        _refuse("package_manifest_sha256 must be 64-character lowercase hex")
    hash_of_hashes = _require_str(payload, "package_hash_of_hashes").lower()
    if not SHA256_RE.fullmatch(hash_of_hashes):
        _refuse("package_hash_of_hashes must be 64-character lowercase hex")
    package_id = _require_str(payload, "package_id")
    if package_id != PACKAGE_ID:
        _refuse(f"package_id {package_id!r} does not match this package")
    disclaimer = _require_str(payload, "governance_disclaimer")
    if disclaimer != GOVERNANCE_DISCLAIMER:
        _refuse("governance_disclaimer does not match the required non-authority statement")
    evidence_directory = _require_str(payload, "evidence_directory")
    target_raw = payload.get("authorized_target")
    if not isinstance(target_raw, Mapping):
        _refuse("authorized_target must be an object")
    extra_target = set(target_raw) - TARGET_KEYS
    if extra_target:
        _refuse(f"authorized_target has unknown keys: {sorted(extra_target)}")
    missing_target = TARGET_KEYS - set(target_raw)
    if missing_target:
        _refuse(f"authorized_target missing keys: {sorted(missing_target)}")
    route_class = _require_str(target_raw, "route_class")
    if route_class not in ALLOWED_ROUTE_CLASSES:
        _refuse(f"unauthorized route_class {route_class!r}")
    host = _require_str(target_raw, "host")
    port_raw = target_raw.get("port")
    if not isinstance(port_raw, int) or isinstance(port_raw, bool):
        _refuse("authorized_target.port must be an integer")
    if port_raw == TRANSACTION_POOLER_PORT:
        _refuse("transaction-mode pooler port 6543 is not an authorized A2 route")
    if route_class == ROUTE_CLASS_SESSION_POOLER:
        if port_raw != SESSION_POOLER_PORT:
            _refuse("session-mode pooler port must be 5432")
        if DIRECT_DB_HOST_RE.fullmatch(host.lower()):
            _refuse("direct db.<ref>.supabase.co host is not an authorized A2 route")
        if is_loopback_or_local_socket(host):
            _refuse("session-mode-pooler route_class cannot bind a loopback host")
    if route_class == ROUTE_CLASS_LOOPBACK and not is_loopback_or_local_socket(host):
        _refuse("loopback-disposable route_class requires a loopback host")
    target = AuthorizedTarget(
        route_class=route_class,
        project_name=_require_str(target_raw, "project_name"),
        project_ref=_require_str(target_raw, "project_ref"),
        host=host,
        port=port_raw,
        database=_require_str(target_raw, "database"),
        user=_require_str(target_raw, "user"),
        sslmode=_require_str(target_raw, "sslmode"),
    )
    return CaptureAuthority(
        work_order_id=work_order_id,
        pcsb_identity=pcsb_identity,
        package_commit=package_commit,
        package_manifest_sha256=manifest_sha,
        package_hash_of_hashes=hash_of_hashes,
        package_id=package_id,
        authorized_target=target,
        evidence_directory=evidence_directory,
        governance_disclaimer=disclaimer,
    )


def load_capture_authority(path: Path) -> CaptureAuthority:
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        _refuse(f"authority file could not be read as JSON: {exc}")
    if not isinstance(payload, dict):
        _refuse("authority file root must be a JSON object")
    return parse_capture_authority(payload)


def assert_invocation_matches_authority(
    authority: CaptureAuthority,
    invocation: CaptureInvocation,
) -> None:
    if invocation.work_order_id != authority.work_order_id:
        _refuse("invocation work_order_id does not match authority document")
    if invocation.pcsb_identity != authority.pcsb_identity:
        _refuse("invocation pcsb_identity does not match authority document")
    if invocation.evidence_directory != authority.evidence_directory:
        _refuse("invocation evidence_directory does not match authority document")


def current_package_commit(root: Path | None = None) -> str | None:
    pkg = root or package_root()
    repo = pkg.resolve().parents[3]
    if not (repo / ".git").exists():
        return None
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    head = out.strip().lower()
    if not COMMIT_RE.fullmatch(head):
        return None
    return head


def live_package_pins(root: Path | None = None) -> dict[str, str]:
    from .evidence import hash_of_hashes, statement_catalog

    pkg = root or package_root()
    manifest_path = pkg / "package_manifest.json"
    data = manifest_path.read_bytes()
    return {
        "package_id": PACKAGE_ID,
        "manifest_sha256": sha256(data).hexdigest(),
        "hash_of_hashes": hash_of_hashes(statement_catalog(pkg)),
    }


def assert_authority_matches_this_package(
    authority: CaptureAuthority,
    *,
    root: Path | None = None,
) -> None:
    pins = live_package_pins(root)
    if authority.package_id != pins["package_id"]:
        _refuse("authority package_id does not match this package")
    if authority.package_manifest_sha256 != pins["manifest_sha256"]:
        _refuse("authority package_manifest_sha256 does not match live package_manifest.json")
    if authority.package_hash_of_hashes != pins["hash_of_hashes"]:
        _refuse("authority package_hash_of_hashes does not match live statement hash-of-hashes")
    head = current_package_commit(root)
    if head is not None and authority.package_commit != head:
        _refuse("authority package_commit does not match git HEAD of this checkout")


def assert_authorized_capture_target(conninfo: str, authority: CaptureAuthority) -> None:
    """Allow connection only to the exact non-secret target bound in authority.

    Checked before connection creation and without SQL. Possession of runtime
    parameters does not create Linear/PM governance authority.
    """
    if not conninfo or not conninfo.strip():
        _refuse("conninfo missing; authentication refused")
    identity = conninfo_nonsecret_identity(conninfo)
    target = authority.authorized_target
    hosts = [h for h in (identity.get("hosts") or []) if h]
    if len(hosts) != 1:
        _refuse("authorized conninfo must name exactly one host")
    host = hosts[0]
    if host.lower() != target.host.lower():
        _refuse("conninfo host does not match authorized_target.host")
    if int(identity["port"]) != int(target.port):
        _refuse("conninfo port does not match authorized_target.port")
    if identity.get("database") != target.database:
        _refuse("conninfo database does not match authorized_target.database")
    if identity.get("user") != target.user:
        _refuse("conninfo user does not match authorized_target.user")
    if identity.get("sslmode") != target.sslmode:
        _refuse("conninfo sslmode does not match authorized_target.sslmode")
    if target.route_class == ROUTE_CLASS_LOOPBACK and not is_loopback_or_local_socket(host):
        _refuse("loopback authority cannot authorize a remote host")
    if target.route_class == ROUTE_CLASS_SESSION_POOLER:
        if is_loopback_or_local_socket(host):
            _refuse("session-mode-pooler authority cannot bind loopback")
        ref = target.project_ref.lower()
        hay = f"{host} {identity.get('user') or ''}".lower()
        if ref not in hay:
            _refuse("authorized project_ref is not bound in conninfo user/host")
        if DIRECT_DB_HOST_RE.fullmatch(host.lower()):
            _refuse("direct db.<ref>.supabase.co host remains unauthorized")
        if int(identity["port"]) == TRANSACTION_POOLER_PORT:
            _refuse("transaction-mode pooler port remains unauthorized")
