from __future__ import annotations

from urllib.parse import unquote, urlparse

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
    """Refuse production/Supabase endpoints. Remote non-loopback is refused unless
    a later separately authorized capture work order sets allow_remote (KIV-217
    never does).
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


def default_local_conninfo(port: int, dbname: str = "postgres", user: str = "kiv217") -> str:
    return (
        f"host=127.0.0.1 port={port} dbname={dbname} user={user} "
        "sslmode=disable client_encoding=UTF8"
    )
