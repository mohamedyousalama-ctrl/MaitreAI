from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator
from urllib.parse import parse_qsl, unquote, urlparse

from .constants import (
    CONNINFO_PERMITTED_KEYS,
    CONNINFO_REFUSED_KEYS,
    GOVERNED_CLIENT_ENCODING,
    LIBPQ_HERMETIC_ENV_VARS,
    PRODUCTION_HOST_MARKERS,
    PRODUCTION_PROJECT_REF,
)
from .errors import ConninfoDestinationRefused


class ProductionTargetRefused(RuntimeError):
    """Raised when a DSN/host would target production or an unknown remote."""


class PackageSafetyError(RuntimeError):
    pass


_URI_SCHEMES = frozenset({"postgres", "postgresql"})
_PERMITTED_KEY_SET = frozenset(CONNINFO_PERMITTED_KEYS)
_REFUSED_KEY_SET = frozenset(CONNINFO_REFUSED_KEYS)
_URI_ALLOWED_QUERY_KEYS = frozenset({"sslmode"})
_KEYWORD_WS = frozenset(" \t\r\n")


@dataclass(frozen=True)
class CanonicalConninfo:
    """Non-secret identity plus optional in-memory secret/non-dest extras.

    ``password`` exists only so a later separately authorized connection can
    authenticate. It must never be logged, hashed, or written to evidence.
    """

    host: str
    port: int
    database: str
    user: str
    sslmode: str
    password: str | None = None
    client_encoding: str | None = None

    def public_identity(self) -> dict[str, Any]:
        return {
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "user": self.user,
            "sslmode": self.sslmode,
            "hosts": [self.host],
        }

    def as_keyword_conninfo(self) -> str:
        parts = [
            f"host={_keyword_value(self.host)}",
            f"port={self.port}",
            f"dbname={_keyword_value(self.database)}",
            f"user={_keyword_value(self.user)}",
        ]
        if self.password is not None:
            parts.append(f"password={_keyword_value(self.password)}")
        parts.append(f"sslmode={_keyword_value(self.sslmode)}")
        parts.append(f"client_encoding={_keyword_value(GOVERNED_CLIENT_ENCODING)}")
        return " ".join(parts)


def _refuse_dest(message: str) -> None:
    raise ConninfoDestinationRefused(message)


def _keyword_value(value: str) -> str:
    if value == "" or any(ch in value for ch in " \t\n'\"\\"):
        escaped = value.replace("\\", "\\\\").replace("'", "\\'")
        return f"'{escaped}'"
    return value


def _forbid_ambiguous_host(host: str) -> None:
    if host != host.strip():
        _refuse_dest("authorized conninfo host has surrounding whitespace")
    if not host:
        _refuse_dest("unix-socket / empty-host fallback is refused")
    if host.startswith("/"):
        _refuse_dest("unix-socket host is refused")
    if "," in host:
        _refuse_dest("multi-host conninfo is refused")
    if host.endswith("."):
        _refuse_dest("trailing-dot hostname is refused")
    if any(ch.isspace() for ch in host):
        _refuse_dest("hostname contains whitespace")


def _parse_port(raw: str, *, where: str) -> int:
    text = raw.strip()
    if not text or "," in text:
        _refuse_dest(f"{where} port is missing or is a multi-port list")
    if not text.isdigit():
        _refuse_dest(f"{where} port is not an integer")
    port = int(text)
    if port < 1 or port > 65535:
        _refuse_dest(f"{where} port is out of range")
    return port


def _skip_keyword_ws(text: str, index: int) -> int:
    while index < len(text) and text[index] in _KEYWORD_WS:
        index += 1
    return index


def _parse_quoted_keyword_value(text: str, index: int) -> tuple[str, int]:
    """Parse a single-quoted libpq keyword value starting after the opening quote.

    libpq treats ``\\X`` as literal ``X`` inside quotes. Keyword values are not
    URI-percent-decoded. Unmatched quotes fail closed. The value is never
    interpolated into the refusal message.
    """
    chars: list[str] = []
    n = len(text)
    while index < n:
        ch = text[index]
        if ch == "\\":
            if index + 1 >= n:
                _refuse_dest("keyword conninfo has an unmatched quoted value")
            chars.append(text[index + 1])
            index += 2
            continue
        if ch == "'":
            index += 1
            if index < n and text[index] not in _KEYWORD_WS:
                _refuse_dest("keyword conninfo has an unmatched quoted value")
            return "".join(chars), index
        if ch == "\x00":
            _refuse_dest("keyword conninfo contains a NUL")
        chars.append(ch)
        index += 1
    _refuse_dest("keyword conninfo has an unmatched quoted value")
    raise AssertionError("unreachable")


def _split_keyword_tokens(text: str) -> list[tuple[str, str]]:
    """Split keyword conninfo using libpq keyword grammar, not URI grammar.

    Percent-encoded bytes remain literal. Only single-quote quoting is
    recognized. Double quotes are ordinary unquoted characters.
    """
    if "\x00" in text:
        _refuse_dest("keyword conninfo contains a NUL")
    tokens: list[tuple[str, str]] = []
    index = 0
    n = len(text)
    while True:
        index = _skip_keyword_ws(text, index)
        if index >= n:
            break
        key_start = index
        while index < n and text[index] not in _KEYWORD_WS and text[index] != "=":
            index += 1
        key = text[key_start:index]
        if not key:
            _refuse_dest("keyword conninfo contains an empty key")
        index = _skip_keyword_ws(text, index)
        if index >= n or text[index] != "=":
            _refuse_dest("keyword conninfo contains a token that is not key=value")
        index += 1
        index = _skip_keyword_ws(text, index)
        if index < n and text[index] == "'":
            value, index = _parse_quoted_keyword_value(text, index + 1)
        else:
            value_start = index
            while index < n and text[index] not in _KEYWORD_WS:
                if text[index] == "\\":
                    _refuse_dest(
                        "unquoted keyword backslash is refused; quote the value "
                        "or omit the backslash"
                    )
                if text[index] == "\x00":
                    _refuse_dest("keyword conninfo contains a NUL")
                index += 1
            value = text[value_start:index]
        tokens.append((key, value))
    return tokens


def _governed_client_encoding(raw: str | None) -> str:
    if raw is None or raw == "":
        return GOVERNED_CLIENT_ENCODING
    if raw.upper() != GOVERNED_CLIENT_ENCODING:
        _refuse_dest("client_encoding must be UTF8; environment encoding is not a substitute")
    return GOVERNED_CLIENT_ENCODING


def _canonical_from_fields(fields: dict[str, str], *, default_port: int | None) -> CanonicalConninfo:
    unknown = sorted(set(fields) - _PERMITTED_KEY_SET - {"database"})
    refused_hit = sorted(set(fields) & _REFUSED_KEY_SET)
    if refused_hit:
        _refuse_dest(f"conninfo contains refused destination/indirection key(s): {refused_hit}")
    if unknown:
        _refuse_dest(f"conninfo contains unreviewed key(s): {unknown}")
    if "hostaddr" in fields:
        _refuse_dest("hostaddr is refused on the reviewed connection path")
    if "service" in fields:
        _refuse_dest("service= / service-file indirection is refused")
    if "dbname" in fields and "database" in fields:
        _refuse_dest("conninfo names both dbname and database")
    host = fields.get("host")
    if host is None:
        _refuse_dest("authorized conninfo must name exactly one host")
    _forbid_ambiguous_host(host)
    port_raw = fields.get("port")
    if port_raw is None:
        if default_port is None:
            _refuse_dest("keyword conninfo must name port explicitly")
        port = default_port
    else:
        port = _parse_port(port_raw, where="conninfo")
    database = fields.get("dbname") or fields.get("database")
    user = fields.get("user")
    sslmode = fields.get("sslmode")
    if not database:
        _refuse_dest("conninfo database/dbname is missing")
    if not user:
        _refuse_dest("conninfo user is missing")
    if not sslmode:
        _refuse_dest("conninfo sslmode must be explicit; environment sslmode is not a substitute")
    password = fields.get("password")
    client_encoding = _governed_client_encoding(fields.get("client_encoding"))
    return CanonicalConninfo(
        host=host,
        port=port,
        database=database,
        user=user,
        sslmode=sslmode,
        password=password,
        client_encoding=client_encoding,
    )


def parse_canonical_conninfo(conninfo: str) -> CanonicalConninfo:
    """Fail-closed parser: identity must be explicit, unambiguous, and allowlisted.

    URI query may not override netloc. hostaddr, service, multi-host/port lists,
    duplicate identity keys, unix sockets, empty host, unquoted keyword
    backslash, and percent-encoded URI hosts are refused. The returned identity
    is the only identity later passed to libpq.
    """
    if not conninfo or not conninfo.strip():
        _refuse_dest("conninfo missing; authentication refused")
    text = conninfo.strip()
    if "://" in text:
        return _parse_uri_conninfo(text)
    return _parse_keyword_conninfo(text)


def _parse_uri_conninfo(text: str) -> CanonicalConninfo:
    parsed = urlparse(text)
    if parsed.scheme.lower() not in _URI_SCHEMES:
        _refuse_dest(f"unsupported conninfo URI scheme {parsed.scheme!r}")
    if parsed.params:
        _refuse_dest("URI params (semicolon) form is refused")
    if parsed.fragment:
        _refuse_dest("URI fragment is refused")
    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    seen: set[str] = set()
    query: dict[str, str] = {}
    for raw_key, raw_value in query_pairs:
        key = raw_key.strip().lower()
        if key in seen:
            _refuse_dest(f"URI query has duplicate key {key!r}")
        seen.add(key)
        if key in {"host", "hostaddr"}:
            _refuse_dest(
                "URI query host=/hostaddr= cannot override or replace the URI netloc host"
            )
        if key in {"port", "dbname", "database", "user", "password", "service", "passfile"}:
            _refuse_dest(f"URI query {key}= is refused; identity belongs in the URI netloc/path")
        if key not in _URI_ALLOWED_QUERY_KEYS:
            if key in _REFUSED_KEY_SET or key not in _PERMITTED_KEY_SET:
                _refuse_dest(f"URI query key {key!r} is refused")
            _refuse_dest(f"URI query key {key!r} is not permitted")
        query[key] = raw_value
    _refuse_percent_encoded_uri_host(parsed)
    host = parsed.hostname
    if host is None:
        _refuse_dest("URI netloc host is missing; unix-socket / empty-host fallback is refused")
    _forbid_ambiguous_host(host)
    if parsed.port is None:
        port = 5432
    else:
        port = int(parsed.port)
        if port < 1 or port > 65535:
            _refuse_dest("URI port is out of range")
    path = parsed.path or ""
    if path in {"", "/"}:
        _refuse_dest("URI database path is missing")
    if path.count("/") > 1:
        _refuse_dest("URI database path is ambiguous")
    database = unquote(path.lstrip("/"))
    if not database:
        _refuse_dest("URI database path is missing")
    user = unquote(parsed.username) if parsed.username else None
    if not user:
        _refuse_dest("URI user is missing")
    password = unquote(parsed.password) if parsed.password is not None else None
    sslmode = query.get("sslmode")
    if not sslmode:
        _refuse_dest("URI sslmode must be explicit in the query; environment sslmode is not a substitute")
    return CanonicalConninfo(
        host=host,
        port=port,
        database=database,
        user=user,
        sslmode=sslmode,
        password=password,
        client_encoding=GOVERNED_CLIENT_ENCODING,
    )


def _uri_netloc_host(parsed) -> str:
    """Return the raw URI host from netloc, before urllib hostname decoding."""
    netloc = parsed.netloc
    if not netloc:
        _refuse_dest("URI netloc host is missing; unix-socket / empty-host fallback is refused")
    authority = netloc.rsplit("@", 1)[-1]
    if authority.startswith("["):
        close = authority.find("]")
        if close < 0:
            _refuse_dest("URI IPv6 host is malformed")
        host = authority[1:close]
        remainder = authority[close + 1 :]
        if remainder and not remainder.startswith(":"):
            _refuse_dest("URI IPv6 host is malformed")
        return host
    if ":" in authority:
        return authority.rsplit(":", 1)[0]
    return authority


def _refuse_percent_encoded_uri_host(parsed) -> None:
    """Fail closed on percent-encoded URI hosts rather than silently mismatch libpq.

    libpq percent-decodes the URI host; urllib.parse.hostname does not match that
    grammar. The governed direct hostname does not require encoded host bytes.
    """
    host = _uri_netloc_host(parsed)
    if "%" in host:
        _refuse_dest("percent-encoded URI host is refused")


def _parse_keyword_conninfo(text: str) -> CanonicalConninfo:
    tokens = _split_keyword_tokens(text)
    fields: dict[str, str] = {}
    for key, value in tokens:
        lowered = key.lower()
        if lowered in fields:
            _refuse_dest(f"duplicate conninfo key {lowered!r} is refused")
        fields[lowered] = value
    return _canonical_from_fields(fields, default_port=None)


def conninfo_nonsecret_identity(conninfo: str) -> dict[str, Any]:
    """Parse host/user/port/database/sslmode only. Never returns password."""
    return parse_canonical_conninfo(conninfo).public_identity()


def reconstruct_keyword_conninfo(
    identity: CanonicalConninfo,
    *,
    host: str | None = None,
    port: int | None = None,
    database: str | None = None,
    user: str | None = None,
    sslmode: str | None = None,
) -> str:
    """Build the exact keyword conninfo later passed to libpq.

    Identity fields may be taken from the authority-bound target. Password, if
    present, stays in memory only for the connect call. client_encoding is
    always reconstructed as UTF8.
    """
    bound = CanonicalConninfo(
        host=host if host is not None else identity.host,
        port=port if port is not None else identity.port,
        database=database if database is not None else identity.database,
        user=user if user is not None else identity.user,
        sslmode=sslmode if sslmode is not None else identity.sslmode,
        password=identity.password,
        client_encoding=GOVERNED_CLIENT_ENCODING,
    )
    return bound.as_keyword_conninfo()


@contextmanager
def package_controlled_passfile() -> Iterator[str]:
    """Yield an empty 0600 passfile that is not the user's ``~/.pgpass``.

    libpq 170005 still substitutes ``~/.pgpass`` when password is empty and
    neither ``passfile=`` nor ``PGPASSFILE`` is set. Operator-supplied
    ``passfile=`` remains refused. The factory injects this package-owned empty
    file for the connect call only. The real user passfile is never opened.
    """
    tmpdir = tempfile.mkdtemp(prefix="kiv14-pcsb-passfile-")
    os.chmod(tmpdir, 0o700)
    path = os.path.join(tmpdir, "pgpass")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.close(fd)
        yield path
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


def keyword_conninfo_with_package_passfile(keyword_conninfo: str, passfile_path: str) -> str:
    """Append the package-controlled passfile to already-reconstructed keyword conninfo."""
    return f"{keyword_conninfo} passfile={_keyword_value(passfile_path)}"


@contextmanager
def hermetic_libpq_environment() -> Iterator[None]:
    """Remove recognized libpq environment/default sources for one connect call.

    Values are restored after success, refusal, and exception. Secret values are
    never interpolated into logs or exception messages.
    """
    saved: dict[str, str] = {}
    for key in LIBPQ_HERMETIC_ENV_VARS:
        if key in os.environ:
            saved[key] = os.environ.pop(key)
    try:
        yield
    finally:
        for key in LIBPQ_HERMETIC_ENV_VARS:
            os.environ.pop(key, None)
        os.environ.update(saved)


def cleared_libpq_destination_environment() -> Iterator[None]:
    """Historical name: hermetic strip of every recognized libpq env default."""
    return hermetic_libpq_environment()


def is_loopback_or_local_socket(host: str | None) -> bool:
    if host is None or host == "":
        # Historical helper: empty host meant a Unix-domain socket. Canonical
        # parsing now refuses that fallback; this predicate remains for
        # route-class checks on already-parsed hosts.
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
    hosts: list[str] = []
    if conninfo:
        identity = parse_canonical_conninfo(conninfo)
        hosts.append(identity.host)
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
