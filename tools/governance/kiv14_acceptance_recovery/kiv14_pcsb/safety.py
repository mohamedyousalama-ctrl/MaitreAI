from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from .constants import PRODUCTION_HOST_MARKERS, PRODUCTION_PROJECT_REF


class ProductionTargetRefused(RuntimeError):
    """Raised when a DSN/host would target production or an unknown remote."""


class PackageSafetyError(RuntimeError):
    pass


def _hosts_from_conninfo(conninfo: str) -> list[str]:
    text = conninfo.strip()
    hosts: list[str] = []
    if "://" in text:
        parsed = urlparse(text)
        if parsed.hostname:
            hosts.append(parsed.hostname)
        return hosts
    for part in text.replace("\n", " ").split():
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if key in {"host", "hostaddr"}:
            hosts.append(unquote(value.strip("'\"")))
    return hosts


def conninfo_nonsecret_identity(conninfo: str) -> dict[str, Any]:
    """Parse host/user/port/database/sslmode only. Never returns password."""
    text = conninfo.strip()
    if "://" in text:
        parsed = urlparse(text)
        query = parse_qs(parsed.query)
        sslmode = None
        if "sslmode" in query and query["sslmode"]:
            sslmode = query["sslmode"][0]
        database = unquote(parsed.path.lstrip("/")) if parsed.path else None
        return {
            "host": parsed.hostname,
            "port": parsed.port if parsed.port is not None else 5432,
            "database": database or None,
            "user": unquote(parsed.username) if parsed.username else None,
            "sslmode": sslmode,
            "hosts": [parsed.hostname] if parsed.hostname else [],
        }
    fields: dict[str, str] = {}
    for part in text.replace("\n", " ").split():
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if key == "password":
            continue
        fields[key] = unquote(value.strip("'\""))
    host = fields.get("host") or fields.get("hostaddr")
    port_raw = fields.get("port")
    port = int(port_raw) if port_raw else 5432
    return {
        "host": host,
        "port": port,
        "database": fields.get("dbname") or fields.get("database"),
        "user": fields.get("user"),
        "sslmode": fields.get("sslmode"),
        "hosts": _hosts_from_conninfo(conninfo),
    }


def is_loopback_or_local_socket(host: str | None) -> bool:
    if host is None or host == "":
        # libpq default without host is a Unix-domain socket — local only.
        return True
    lowered = host.lower()
    return lowered in {"127.0.0.1", "::1", "localhost", "/tmp", "/var/run/postgresql"} or lowered.startswith("/")


def assert_not_production_target(
    conninfo: str | None = None,
    *,
    host: str | None = None,
    allow_remote: bool = False,
) -> None:
    """Refuse production/Supabase endpoints and any non-loopback host.

    ``allow_remote=True`` remains an unconditional refusal. The only reviewed
    production-capable path is ``assert_authorized_capture_target`` after a
    matching ``CaptureAuthority`` document is supplied. Runtime flags do not
    create Linear/PM governance authority.
    """
    if allow_remote:
        raise ProductionTargetRefused(
            "KIV-217 package preparation/testing must not enable remote/production targets"
        )
    haystacks = []
    if conninfo:
        haystacks.append(conninfo.lower())
        haystacks.extend(h.lower() for h in _hosts_from_conninfo(conninfo))
    if host:
        haystacks.append(host.lower())
    joined = " ".join(haystacks)
    for marker in PRODUCTION_HOST_MARKERS:
        if marker.lower() in joined:
            raise ProductionTargetRefused(
                f"refusing production/Supabase target matching {marker!r}"
            )
    if PRODUCTION_PROJECT_REF in joined:
        raise ProductionTargetRefused("refusing production project ref")
    hosts = []
    if conninfo:
        hosts.extend(_hosts_from_conninfo(conninfo))
    if host:
        hosts.append(host)
    for item in hosts:
        if not is_loopback_or_local_socket(item):
            raise ProductionTargetRefused(
                f"refusing non-local host {item!r} during package preparation/testing"
            )


def default_local_conninfo(
    port: int,
    dbname: str = "postgres",
    user: str = "kiv217",
    password: str | None = None,
) -> str:
    parts = [
        f"host=127.0.0.1 port={port} dbname={dbname} user={user}",
        "sslmode=disable client_encoding=UTF8",
    ]
    if password:
        parts.insert(1, f"password={password}")
    return " ".join(parts)
