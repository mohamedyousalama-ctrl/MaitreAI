from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any, Mapping, NoReturn

from .constants import (
    ALLOWED_ROUTE_CLASSES,
    CONNINFO_PERMITTED_IDENTITY_KEYS,
    CONNINFO_PERMITTED_NONDEST_KEYS,
    CONNINFO_REFUSED_KEYS,
    CONSUMED_PCSB_IDENTITIES,
    DIRECT_POSTGRES_DATABASE,
    DIRECT_POSTGRES_PORT,
    DIRECT_POSTGRES_SSLMODE,
    DIRECT_POSTGRES_USER,
    GOVERNANCE_DISCLAIMER,
    GOVERNED_CLIENT_ENCODING,
    HISTORICAL_KIV226_SESSION_POOLER_HOST,
    HISTORICAL_KIV226_SESSION_POOLER_PORT,
    LIBPQ_ENV_INVENTORY,
    LIBPQ_HERMETIC_ENV_VARS,
    PACKAGE_ID,
    POOLER_HOST_SUFFIX,
    ROUTE_CLASS_DIRECT_POSTGRES,
    ROUTE_CLASS_LOOPBACK,
    ROUTE_CLASS_SESSION_POOLER,
    TRANSACTION_POOLER_PORT,
)
from .errors import CaptureAuthorityRefused, ConninfoDestinationRefused
from .safety import (
    CanonicalConninfo,
    is_loopback_or_local_socket,
    parse_canonical_conninfo,
    reconstruct_keyword_conninfo,
)
from .statements import package_root

WORK_ORDER_RE = re.compile(r"^KIV-[1-9][0-9]*$")
PCSB_RE = re.compile(r"^PCSB-[1-9][0-9]*$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DIRECT_DB_HOST_RE = re.compile(r"^db\.[^.]+\.supabase\.co$")
GIT_HEAD_TIMEOUT_SECONDS = 5
FORBIDDEN_HEAD_SENTINELS = frozenset({"0" * 40})
_EVIDENCE_SAFE_ENV_ALIASES = {"PGPASSWORD": "secret-environment-variable"}

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
    if route_class == ROUTE_CLASS_SESSION_POOLER:
        _refuse(
            "session-mode-pooler is continuity-ineligible after KIV-226 "
            "(PQbackendPID != pg_backend_pid() on Supavisor Session Pooler); "
            "authorized production route_class is direct-postgres only"
        )
    if route_class not in ALLOWED_ROUTE_CLASSES:
        _refuse(f"unauthorized route_class {route_class!r}")
    host = _require_str(target_raw, "host")
    port_raw = target_raw.get("port")
    if not isinstance(port_raw, int) or isinstance(port_raw, bool):
        _refuse("authorized_target.port must be an integer")
    project_ref = _require_str(target_raw, "project_ref")
    database = _require_str(target_raw, "database")
    user = _require_str(target_raw, "user")
    sslmode = _require_str(target_raw, "sslmode")
    _refuse_continuity_ineligible_pooler_identity(
        host=host, port=port_raw, user=user, route_class=route_class
    )
    if route_class == ROUTE_CLASS_DIRECT_POSTGRES:
        _assert_direct_postgres_route_policy(
            host=host,
            port=port_raw,
            database=database,
            user=user,
            sslmode=sslmode,
            project_ref=project_ref,
        )
    if route_class == ROUTE_CLASS_LOOPBACK and not is_loopback_or_local_socket(host):
        _refuse("loopback-disposable route_class requires a loopback host")
    target = AuthorizedTarget(
        route_class=route_class,
        project_name=_require_str(target_raw, "project_name"),
        project_ref=project_ref,
        host=host,
        port=port_raw,
        database=database,
        user=user,
        sslmode=sslmode,
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


def _git_subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"):
        env.pop(key, None)
    return env


def discover_containing_git_repository(start: Path) -> Path:
    """Prove the Git worktree that contains ``start`` without a fixed ancestor index.

    A valid marker is either a ``.git`` directory (normal checkout) or a ``.git``
    file (linked worktree). Absence of a marker is an unprovable / exported tree.
    """
    current = start.resolve()
    if current.is_file():
        current = current.parent
    seen: set[Path] = set()
    while True:
        if current in seen:
            _refuse("repository root cannot be proved (path cycle)")
        seen.add(current)
        git_marker = current / ".git"
        if git_marker.is_dir() or git_marker.is_file():
            return current
        parent = current.parent
        if parent == current:
            _refuse(
                "repository root cannot be proved (no .git directory or worktree file)"
            )
        current = parent


def _git_text(repo: Path, *git_args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo), *git_args],
            capture_output=True,
            text=True,
            timeout=GIT_HEAD_TIMEOUT_SECONDS,
            check=False,
            env=_git_subprocess_env(),
        )
    except FileNotFoundError:
        _refuse("Git executable is unavailable; package identity cannot be proved")
    except subprocess.TimeoutExpired:
        _refuse("Git HEAD resolution timed out; package identity cannot be proved")
    except OSError as exc:
        _refuse(f"Git invocation failed; package identity cannot be proved: {exc}")
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        suffix = f": {detail}" if detail else ""
        _refuse(f"Git HEAD is unavailable; package identity cannot be proved{suffix}")
    return completed.stdout


def current_package_commit(root: Path | None = None) -> str:
    """Return the exact 40-character lowercase HEAD SHA of the package checkout.

    Unavailable, unprovable, malformed, timed-out, or sentinel Git identity is a
    pre-authentication refusal. Detached HEAD is accepted only when this SHA is
    independently proved. Manifest/hash pins are not a substitute.
    """
    pkg = (root or package_root()).resolve()
    repo = discover_containing_git_repository(pkg)
    toplevel = _git_text(repo, "rev-parse", "--show-toplevel").strip()
    if not toplevel:
        _refuse("Git worktree toplevel is unavailable; package identity cannot be proved")
    proved_root = Path(toplevel).resolve()
    if proved_root != repo.resolve():
        _refuse("Git worktree toplevel does not match the discovered repository root")
    head = _git_text(repo, "rev-parse", "--verify", "HEAD").strip().lower()
    if not COMMIT_RE.fullmatch(head):
        _refuse("Git HEAD is malformed; package identity cannot be proved")
    if head in FORBIDDEN_HEAD_SENTINELS:
        _refuse("zero-SHA Git identity is not a proved package commit")
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
    if authority.package_commit != head:
        _refuse("authority package_commit does not match git HEAD of this checkout")


def _is_pooler_host(host: str) -> bool:
    return host.lower().endswith(POOLER_HOST_SUFFIX) or POOLER_HOST_SUFFIX.lstrip(".") in host.lower()


def expected_direct_postgres_host(project_ref: str) -> str:
    return f"db.{project_ref}.supabase.co"


def _refuse_continuity_ineligible_pooler_identity(
    *,
    host: str,
    port: int,
    user: str,
    route_class: str,
) -> None:
    host_l = host.lower()
    if route_class == ROUTE_CLASS_SESSION_POOLER:
        _refuse(
            "session-mode-pooler is continuity-ineligible after KIV-226 "
            "(PQbackendPID != pg_backend_pid() on Supavisor Session Pooler)"
        )
    if (
        host_l == HISTORICAL_KIV226_SESSION_POOLER_HOST.lower()
        and port == HISTORICAL_KIV226_SESSION_POOLER_PORT
    ):
        _refuse("historical KIV-226 Shared Session Pooler target is continuity-ineligible")
    if _is_pooler_host(host_l):
        _refuse(
            "Supavisor *.pooler.supabase.com hosts are continuity-ineligible under "
            "operative d5d22306… after KIV-226"
        )
    if port == TRANSACTION_POOLER_PORT:
        _refuse(
            "transaction-mode / dedicated-pooler port 6543 is not an authorized A2 route"
        )
    if "." in user and user.lower().startswith("postgres."):
        _refuse("Shared Pooler username form postgres.<ref> cannot authorize a direct-postgres route")


def _assert_direct_postgres_route_policy(
    *,
    host: str,
    port: int,
    database: str,
    user: str,
    sslmode: str,
    project_ref: str,
) -> None:
    if is_loopback_or_local_socket(host):
        _refuse("direct-postgres route_class cannot bind a loopback host")
    if port != DIRECT_POSTGRES_PORT:
        _refuse("direct-postgres port must be 5432; other ports cannot silently match a pooler")
    expected_host = expected_direct_postgres_host(project_ref)
    if host.lower() != expected_host.lower():
        _refuse(
            "direct-postgres host/project_ref mismatch; expected db.<project_ref>.supabase.co"
        )
    if not DIRECT_DB_HOST_RE.fullmatch(host.lower()):
        _refuse("direct-postgres host must be db.<project_ref>.supabase.co")
    if user != DIRECT_POSTGRES_USER:
        _refuse("direct-postgres user must be the official direct role postgres")
    if database != DIRECT_POSTGRES_DATABASE:
        _refuse("direct-postgres database must be postgres")
    if sslmode != DIRECT_POSTGRES_SSLMODE:
        _refuse("direct-postgres sslmode must be require")


def later_executor_pre_auth_contract() -> dict[str, Any]:
    """Operator contract for a later production capturer. Does not freeze DNS AAAA."""
    from .constants import (
        KIV228_FEASIBILITY_DIRECT_HOST,
        KIV228_FEASIBILITY_DIRECT_PORT,
        KIV228_FEASIBILITY_PROJECT_NAME,
        KIV228_FEASIBILITY_PROJECT_REF,
        KIV228_FEASIBILITY_REGION,
    )

    return {
        "bind_identity": "hostname/project/port/database/user/sslmode — never a transient AAAA literal",
        "kiv228_observed_aaaa_must_not_be_frozen": True,
        "required_checks_before_authentication": [
            "authoritative current direct host/project association",
            "current DNS address family (A and AAAA recorded separately)",
            "executor-host reachability for at least one currently supported address family",
            "no unapproved paid/infrastructure change",
        ],
        "ipv4_only_executor_or_paid_ipv4_addon": (
            "HOLD and return to Founder before any change"
        ),
        "kiv228_feasibility_receipt": {
            "project_name": KIV228_FEASIBILITY_PROJECT_NAME,
            "project_ref": KIV228_FEASIBILITY_PROJECT_REF,
            "region": KIV228_FEASIBILITY_REGION,
            "direct_host": KIV228_FEASIBILITY_DIRECT_HOST,
            "direct_port": KIV228_FEASIBILITY_DIRECT_PORT,
            "ipv6_characteristic": (
                "current hostname may be IPv6-only; DNS may legitimately change"
            ),
            "aaaa_literal_frozen": False,
        },
        "governance_note": (
            "These runtime fields do not create Linear/PM governance authority. "
            "Only a separately released Linear work order does."
        ),
    }


def _evidence_safe_env_names(names: tuple[str, ...] | list[str]) -> list[str]:
    """Serialize env names for evidence/manifest without secret-scanner tokens."""
    return [_EVIDENCE_SAFE_ENV_ALIASES.get(name, name) for name in names]


def destination_binding_review_contract() -> dict[str, Any]:
    """How a future reviewer proves destination binding without production contact."""
    return {
        "effective_destination_equals_authority_identity": True,
        "opaque_conninfo_never_passed_to_libpq": True,
        "governed_client_encoding": GOVERNED_CLIENT_ENCODING,
        "client_encoding_forced_at_libpq_boundary": True,
        "permitted_authorized_capture_identity_keys": list(CONNINFO_PERMITTED_IDENTITY_KEYS),
        "permitted_non_destination_keys": list(CONNINFO_PERMITTED_NONDEST_KEYS),
        "runtime_secret_material": (
            "in-memory only from explicit accepted conninfo; never from "
            "environment / passfile / service-file defaults; never logged, "
            "hashed, or evidenced"
        ),
        "refused_conninfo_keys": list(CONNINFO_REFUSED_KEYS),
        "keyword_conninfo_parser": {
            "grammar": "libpq keyword/value; URI percent-decoding is not applied",
            "quoted_values": "single-quote with backslash escapes, or fail closed",
            "duplicate_keys": "fail closed",
        },
        "uri_conninfo_parser": {
            "percent_decoding": "URI userinfo/path/query only",
            "query_host_or_hostaddr": "fail closed",
        },
        "libpq_environment_inventory": {
            class_name: _evidence_safe_env_names(names)
            for class_name, names in LIBPQ_ENV_INVENTORY.items()
        },
        "stripped_libpq_environment": _evidence_safe_env_names(LIBPQ_HERMETIC_ENV_VARS),
        "hermetic_libpq_environment": True,
        "environment_restored_after_success_and_failure": True,
        "review_method": {
            "adversarial_live_targets": "loopback / reserved / fake only",
            "production_shaped_strings": (
                "parser and factory-mock tests only; never DNS-resolve or TCP-connect"
            ),
            "production_dns_tcp_auth_sql_required": False,
            "production_dns_tcp_auth_sql_permitted": False,
            "kiv230_process_note": (
                "Package review must not connect to the production endpoint to "
                "prove destination binding."
            ),
        },
        "kiv230_r2_closed": [
            "uri_query_hostaddr",
            "uri_query_host_override_of_netloc",
            "PGHOSTADDR",
            "PGHOST",
            "PGPORT",
            "PGDATABASE",
            "PGUSER",
            "PGSERVICE",
            "PGSERVICEFILE",
            "service_and_service_file",
            "hostaddr",
            "multi_host_multi_port",
            "duplicate_identity_keys",
            "unix_socket_empty_host",
        ],
        "kiv232_r3_closed": [
            "PGCLIENTENCODING",
            "PGOPTIONS",
            "PGAPPNAME",
            "secret-environment-variable",
            "recognized_libpq_environment_inventory",
        ],
        "kiv232_r4_closed": [
            "keyword_percent_literals_not_uri_decoded",
            "quoted_backslash_keyword_values_match_libpq_or_fail_closed",
        ],
        "governance_note": (
            "These runtime fields do not create Linear/PM governance authority. "
            "Only a separately released Linear work order does."
        ),
    }


def bind_authorized_effective_conninfo(conninfo: str, authority: CaptureAuthority) -> str:
    """Validate conninfo against authority and return the libpq keyword string.

    The returned string is reconstructed from the authority-bound identity, not
    from the original opaque conninfo. Password may be carried in memory from
    the parsed input and is never written to evidence. client_encoding is
    always UTF8 at the libpq boundary.
    """
    parsed = assert_authorized_capture_target(conninfo, authority)
    target = authority.authorized_target
    return reconstruct_keyword_conninfo(
        parsed,
        host=target.host,
        port=int(target.port),
        database=target.database,
        user=target.user,
        sslmode=target.sslmode,
    )


def assert_authorized_capture_target(
    conninfo: str, authority: CaptureAuthority
) -> CanonicalConninfo:
    """Allow connection only to the exact non-secret target bound in authority.

    Checked before connection creation and without SQL. Possession of runtime
    parameters does not create Linear/PM governance authority. Returns the
    parsed canonical identity so callers can reconstruct effective libpq
    parameters from the same validated identity.
    """
    if not conninfo or not conninfo.strip():
        _refuse("conninfo missing; authentication refused")
    try:
        parsed = parse_canonical_conninfo(conninfo)
    except ConninfoDestinationRefused:
        raise
    identity = parsed.public_identity()
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
    _refuse_continuity_ineligible_pooler_identity(
        host=host,
        port=int(identity["port"]),
        user=identity.get("user") or "",
        route_class=target.route_class,
    )
    if target.route_class == ROUTE_CLASS_LOOPBACK and not is_loopback_or_local_socket(host):
        _refuse("loopback authority cannot authorize a remote host")
    if target.route_class == ROUTE_CLASS_DIRECT_POSTGRES:
        _assert_direct_postgres_route_policy(
            host=host,
            port=int(identity["port"]),
            database=identity.get("database") or "",
            user=identity.get("user") or "",
            sslmode=identity.get("sslmode") or "",
            project_ref=target.project_ref,
        )
    return parsed
