"""Official Supabase PG 17.6 CLI platform baseline helpers.

Presents platform objects the Kivo lineage does not create. Not a third Kivo
bootstrap. Not production. Not capture.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from hashlib import sha256
from pathlib import Path
from typing import Any

from .constants import (
    INTEGRATION_MERGE,
    METHOD1_SINGLE_TRANSACTION_PREFIXES,
    OFFICIAL_CLI_BOOTSTRAP_USER,
    OFFICIAL_CLI_LOCAL_PASSWORD,
    OFFICIAL_CLI_QUERY_USER,
    PGMQ_CONTROL_SHA256,
    PGMQ_SQL_SHA256,
    PGMQ_VERSION,
)
from .errors import Hold
from .local_pg import LocalCluster, unused_loopback_port
from .statements import package_root


def isolated_prefix_env(prefix: Path, *, password: str | None = None) -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin"
    if password is not None:
        env["PGPASSWORD"] = password
    return env


def is_official_cli_prefix(prefix: Path | None = None) -> bool:
    from .local_pg import pg176_prefix

    prefix = prefix or pg176_prefix()
    migrate = prefix / "share" / "supabase-cli" / "migrations" / "migrate.sh"
    init_sh = prefix / "share" / "supabase-cli" / "bin" / "supabase-postgres-init.sh"
    pgcrypto = prefix / "share" / "postgresql" / "extension" / "pgcrypto.control"
    return migrate.is_file() and init_sh.is_file() and pgcrypto.is_file()


def _codesign_verify(path: Path) -> bool:
    result = subprocess.run(
        ["/usr/bin/codesign", "--verify", str(path)],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def repair_darwin_libiconv_signature(prefix: Path) -> dict[str, Any]:
    """Adhoc re-sign official libiconv.dylib when AMFI rejects the tarball signature."""
    dylib = prefix / "lib" / "libiconv.dylib"
    record: dict[str, Any] = {
        "path": str(dylib),
        "present": dylib.is_file(),
        "repaired": False,
        "needed": False,
    }
    if not dylib.is_file():
        return record
    if _codesign_verify(dylib):
        return record
    record["needed"] = True
    subprocess.check_call(["/usr/bin/codesign", "--force", "--sign", "-", str(dylib)])
    if not _codesign_verify(dylib):
        raise Hold(f"official libiconv.dylib remained unsigned after host codesign repair: {dylib}")
    record["repaired"] = True
    return record


def _sha256_file(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def install_official_pgmq_sql(prefix: Path) -> dict[str, Any]:
    """Copy vendored official pgmq 1.5.1 SQL/control into the CLI prefix if absent.

    SQL-only. No invented queue schema. Bytes must MATCH the package pins.
    """
    ext = prefix / "share" / "postgresql" / "extension"
    ext.mkdir(parents=True, exist_ok=True)
    vendor = package_root() / "topology" / "pgmq"
    control_src = vendor / "pgmq.control"
    sql_src = vendor / f"pgmq--{PGMQ_VERSION}.sql"
    if not control_src.is_file() or not sql_src.is_file():
        raise Hold("vendored official pgmq 1.5.1 files are missing from the package")
    control_digest = _sha256_file(control_src)
    sql_digest = _sha256_file(sql_src)
    if control_digest != PGMQ_CONTROL_SHA256 or sql_digest != PGMQ_SQL_SHA256:
        raise Hold(
            "vendored pgmq bytes drifted from pins: "
            f"control={control_digest} sql={sql_digest}"
        )
    dest_control = ext / "pgmq.control"
    dest_sql = ext / f"pgmq--{PGMQ_VERSION}.sql"
    copied = False
    if not dest_control.is_file() or not dest_sql.is_file():
        shutil.copy2(control_src, dest_control)
        shutil.copy2(sql_src, dest_sql)
        copied = True
    elif _sha256_file(dest_control) != PGMQ_CONTROL_SHA256 or _sha256_file(dest_sql) != PGMQ_SQL_SHA256:
        raise Hold("prefix pgmq files exist but do not MATCH the official vendored pins")
    return {
        "copied": copied,
        "control": str(dest_control),
        "sql": str(dest_sql),
        "control_sha256": PGMQ_CONTROL_SHA256,
        "sql_sha256": PGMQ_SQL_SHA256,
        "version": PGMQ_VERSION,
    }


def prepare_official_prefix(prefix: Path) -> dict[str, Any]:
    if not is_official_cli_prefix(prefix):
        raise Hold(
            f"prefix {prefix} is not the pinned official supabase 17.6.1.150-cli layout "
            "(missing migrate.sh, supabase-postgres-init.sh, or pgcrypto.control)"
        )
    return {
        "libiconv": repair_darwin_libiconv_signature(prefix),
        "pgmq": install_official_pgmq_sql(prefix),
        "official_cli_prefix": True,
    }


def method1_psql_extra(filename: str) -> list[str]:
    return ["--single-transaction"] if filename.startswith(METHOD1_SINGLE_TRANSACTION_PREFIXES) else []


def init_official_platform(
    *,
    label: str,
    port: int | None = None,
    prefix: Path | None = None,
    base_dir: Path | None = None,
) -> LocalCluster:
    from .local_pg import _wait_ready, pg176_prefix

    prefix = prefix or pg176_prefix()
    prepare = prepare_official_prefix(prefix)
    port = port or unused_loopback_port()
    base = base_dir or Path(f"/tmp/kivo-kiv218-pg176/runs/{label}-{port}")
    if base.exists():
        shutil.rmtree(base)
    data_dir = base / "data"
    socket_dir = base / "sock"
    socket_dir.mkdir(parents=True)
    log_path = base / "postgres.log"
    init_sh = prefix / "share" / "supabase-cli" / "bin" / "supabase-postgres-init.sh"
    os.chmod(init_sh, 0o755)
    getkey = prefix / "share" / "supabase-cli" / "config" / "pgsodium_getkey.sh"
    if getkey.is_file():
        os.chmod(getkey, 0o755)
    env = isolated_prefix_env(prefix, password=OFFICIAL_CLI_LOCAL_PASSWORD)
    env["PGDATA"] = str(data_dir)
    env["POSTGRES_USER"] = OFFICIAL_CLI_BOOTSTRAP_USER
    env["POSTGRES_PASSWORD"] = OFFICIAL_CLI_LOCAL_PASSWORD
    env["POSTGRES_DB"] = "postgres"
    log_handle = log_path.open("w")
    proc = subprocess.Popen(
        [
            str(init_sh),
            "-c",
            "listen_addresses=127.0.0.1",
            "-c",
            f"port={port}",
            "-c",
            f"unix_socket_directories={socket_dir}",
        ],
        cwd=str(prefix),
        env=env,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
    )
    cluster = LocalCluster(
        prefix=prefix,
        data_dir=data_dir,
        socket_dir=socket_dir,
        port=port,
        user=OFFICIAL_CLI_QUERY_USER,
        dbname="postgres",
        process=proc,
        password=OFFICIAL_CLI_LOCAL_PASSWORD,
        bootstrap_user=OFFICIAL_CLI_BOOTSTRAP_USER,
        platform_baseline=True,
        prepare_record=prepare,
        log_path_override=log_path,
    )
    try:
        _wait_ready(
            cluster,
            timeout=90.0,
            user=OFFICIAL_CLI_BOOTSTRAP_USER,
            password=OFFICIAL_CLI_LOCAL_PASSWORD,
        )
        _run_official_migrate(cluster)
    except Exception:
        from .local_pg import stop_cluster

        stop_cluster(cluster)
        raise
    return cluster


def _run_official_migrate(cluster: LocalCluster) -> None:
    migrate = cluster.prefix / "share" / "supabase-cli" / "migrations" / "migrate.sh"
    os.chmod(migrate, 0o755)
    env = isolated_prefix_env(cluster.prefix, password=OFFICIAL_CLI_LOCAL_PASSWORD)
    env["POSTGRES_DB"] = cluster.dbname
    env["POSTGRES_HOST"] = "127.0.0.1"
    env["POSTGRES_PORT"] = str(cluster.port)
    env["POSTGRES_PASSWORD"] = OFFICIAL_CLI_LOCAL_PASSWORD
    env["PGHOST"] = "127.0.0.1"
    env["PGPORT"] = str(cluster.port)
    env["PGDATABASE"] = cluster.dbname
    result = subprocess.run(
        [str(migrate)],
        cwd=str(migrate.parent),
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise Hold(
            "official supabase-cli migrate.sh failed on the pinned 17.6 CLI cluster: "
            + (result.stderr or result.stdout or "")[-2000:]
        )


def apply_method1(
    cluster: LocalCluster,
    repo: Path,
    files: list[str],
) -> dict[str, Any]:
    """Apply integration-tree SQL in filename order via psql as bootstrap."""
    applied: list[str] = []
    env = isolated_prefix_env(cluster.prefix, password=cluster.password)
    psql = cluster.bin("psql")
    for relpath in files:
        name = Path(relpath).name
        sql_bytes = subprocess.check_output(
            ["git", "show", f"{INTEGRATION_MERGE}:{relpath}"],
            cwd=repo,
        )
        extra = method1_psql_extra(name)
        with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as handle:
            handle.write(sql_bytes)
            tmp_path = handle.name
        try:
            cmd = [
                str(psql),
                *extra,
                "-h",
                "127.0.0.1",
                "-p",
                str(cluster.port),
                "-U",
                cluster.bootstrap_user,
                "-d",
                cluster.dbname,
                "-v",
                "ON_ERROR_STOP=1",
                "-f",
                tmp_path,
            ]
            ran = subprocess.run(cmd, capture_output=True, text=True, env=env)
        finally:
            os.unlink(tmp_path)
        if ran.returncode != 0:
            return {
                "ok": False,
                "applied": applied,
                "failed_at": relpath,
                "stderr": (ran.stderr or "")[-4000:],
                "stdout": (ran.stdout or "")[-1000:],
                "psql_extra": extra,
            }
        applied.append(relpath)
    return {"ok": True, "applied": applied, "failed_at": None, "stderr": None, "psql_extra": None}
