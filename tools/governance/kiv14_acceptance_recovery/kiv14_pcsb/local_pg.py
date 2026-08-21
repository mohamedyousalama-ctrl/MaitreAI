from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from .constants import DEFAULT_PG176_PREFIX, EXPECTED_SERVER_VERSION_PREFIX
from .errors import Hold
from .safety import default_local_conninfo


def pg176_prefix() -> Path:
    return Path(
        os.environ.get(
            "KIVO_KIV218_PG176_PREFIX",
            os.environ.get("KIVO_KIV217_PG176_PREFIX", DEFAULT_PG176_PREFIX),
        )
    )


def unused_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@dataclass
class LocalCluster:
    prefix: Path
    data_dir: Path
    socket_dir: Path
    port: int
    user: str = "kiv217"
    dbname: str = "postgres"
    process: subprocess.Popen[bytes] | None = None
    password: str | None = None
    bootstrap_user: str = "kiv217"
    platform_baseline: bool = False
    prepare_record: dict | None = None
    log_path_override: Path | None = None

    @property
    def conninfo(self) -> str:
        return default_local_conninfo(
            self.port, dbname=self.dbname, user=self.user, password=self.password
        )

    @property
    def bootstrap_conninfo(self) -> str:
        return default_local_conninfo(
            self.port,
            dbname=self.dbname,
            user=self.bootstrap_user,
            password=self.password,
        )

    @property
    def log_path(self) -> Path:
        if self.log_path_override is not None:
            return self.log_path_override
        return self.data_dir / "log" / "postgresql.log"

    def bin(self, name: str) -> Path:
        return self.prefix / "bin" / name


def assert_pg176_prefix(prefix: Path | None = None) -> Path:
    prefix = prefix or pg176_prefix()
    postgres = prefix / "bin" / "postgres"
    if not postgres.is_file():
        raise Hold(f"PostgreSQL 17.6 prefix missing at {prefix}")
    from .platform import is_official_cli_prefix, prepare_official_prefix

    if is_official_cli_prefix(prefix):
        prepare_official_prefix(prefix)
    version = subprocess.check_output(
        [str(postgres), "--version"],
        text=True,
        env={
            **os.environ,
            "PATH": f"{prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
        },
    ).strip()
    if "17.6" not in version:
        raise Hold(f"expected postgres (PostgreSQL) 17.6, got {version!r}")
    return prefix


def init_and_start(
    *,
    label: str,
    port: int | None = None,
    prefix: Path | None = None,
    base_dir: Path | None = None,
) -> LocalCluster:
    prefix = assert_pg176_prefix(prefix)
    port = port or unused_loopback_port()
    base = base_dir or Path(f"/tmp/kivo-kiv217-pg176/runs/{label}-{port}")
    if base.exists():
        shutil.rmtree(base)
    data_dir = base / "data"
    socket_dir = base / "sock"
    log_dir = data_dir / "log"
    socket_dir.mkdir(parents=True)
    initdb = prefix / "bin" / "initdb"
    env = {
        **os.environ,
        "PATH": f"{prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
    }
    subprocess.check_call(
        [
            str(initdb),
            "-D",
            str(data_dir),
            "--username=kiv217",
            "--auth=trust",
            "--encoding=UTF8",
            "--no-locale",
            "--no-sync",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
        env=env,
    )
    conf = data_dir / "postgresql.conf"
    extra = (
        "\n"
        "listen_addresses = '127.0.0.1'\n"
        f"port = {port}\n"
        f"unix_socket_directories = '{socket_dir}'\n"
        "logging_collector = on\n"
        "log_directory = 'log'\n"
        "log_filename = 'postgresql.log'\n"
        "log_statement = 'all'\n"
        "log_connections = on\n"
        "log_disconnections = on\n"
        "log_line_prefix = '%m [%p] '\n"
        "shared_preload_libraries = ''\n"
    )
    conf.write_text(conf.read_text() + extra)
    log_dir.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "PATH": f"{prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
    }
    proc = subprocess.Popen(
        [
            str(prefix / "bin" / "postgres"),
            "-D",
            str(data_dir),
            "-c",
            "listen_addresses=127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    cluster = LocalCluster(
        prefix=prefix,
        data_dir=data_dir,
        socket_dir=socket_dir,
        port=port,
        process=proc,
        bootstrap_user="kiv217",
        platform_baseline=False,
    )
    try:
        _wait_ready(cluster)
    except Exception:
        stop_cluster(cluster)
        raise
    return cluster


def init_and_start_password_auth(
    *,
    label: str,
    password: str,
    port: int | None = None,
    prefix: Path | None = None,
    base_dir: Path | None = None,
) -> LocalCluster:
    """Disposable loopback PostgreSQL 17.6 that requires a password (scram-sha-256).

    Used only to prove default ``~/.pgpass`` cannot authenticate the reviewed
    factory. The password stays in memory for this process; it is never logged.
    """
    prefix = assert_pg176_prefix(prefix)
    port = port or unused_loopback_port()
    base = base_dir or Path(f"/tmp/kivo-kiv217-pg176/runs/{label}-{port}")
    if base.exists():
        shutil.rmtree(base)
    data_dir = base / "data"
    socket_dir = base / "sock"
    log_dir = data_dir / "log"
    socket_dir.mkdir(parents=True)
    pwfile = base / "initdb.pw"
    pwfile.parent.mkdir(parents=True, exist_ok=True)
    pwfile.write_text(password + "\n")
    os.chmod(pwfile, 0o600)
    initdb = prefix / "bin" / "initdb"
    env = {
        **os.environ,
        "PATH": f"{prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
    }
    try:
        subprocess.check_call(
            [
                str(initdb),
                "-D",
                str(data_dir),
                "--username=kiv217",
                "--auth=scram-sha-256",
                "--pwfile",
                str(pwfile),
                "--encoding=UTF8",
                "--no-locale",
                "--no-sync",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
            env=env,
        )
    finally:
        try:
            pwfile.unlink()
        except FileNotFoundError:
            pass
    conf = data_dir / "postgresql.conf"
    extra = (
        "\n"
        "listen_addresses = '127.0.0.1'\n"
        f"port = {port}\n"
        f"unix_socket_directories = '{socket_dir}'\n"
        "password_encryption = scram-sha-256\n"
        "logging_collector = on\n"
        "log_directory = 'log'\n"
        "log_filename = 'postgresql.log'\n"
        "log_statement = 'all'\n"
        "log_connections = on\n"
        "log_disconnections = on\n"
        "log_line_prefix = '%m [%p] '\n"
        "shared_preload_libraries = ''\n"
    )
    conf.write_text(conf.read_text() + extra)
    log_dir.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        [
            str(prefix / "bin" / "postgres"),
            "-D",
            str(data_dir),
            "-c",
            "listen_addresses=127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    cluster = LocalCluster(
        prefix=prefix,
        data_dir=data_dir,
        socket_dir=socket_dir,
        port=port,
        process=proc,
        password=password,
        bootstrap_user="kiv217",
        platform_baseline=False,
    )
    try:
        _wait_ready(cluster, user="kiv217", password=password)
    except Exception:
        stop_cluster(cluster)
        raise
    return cluster


def _wait_ready(
    cluster: LocalCluster,
    timeout: float = 20.0,
    *,
    user: str | None = None,
    password: str | None = None,
) -> None:
    pg_isready = cluster.bin("pg_isready")
    deadline = time.time() + timeout
    last = ""
    env = os.environ.copy()
    env["PATH"] = f"{cluster.prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin"
    if password:
        env["PGPASSWORD"] = password
    while time.time() < deadline:
        if cluster.process is not None and cluster.process.poll() is not None:
            raise RuntimeError(
                f"postgres exited early with code {cluster.process.returncode}"
            )
        result = subprocess.run(
            [
                str(pg_isready),
                "-h",
                "127.0.0.1",
                "-p",
                str(cluster.port),
                "-U",
                user or cluster.user,
                "-d",
                cluster.dbname,
            ],
            capture_output=True,
            text=True,
            env=env,
        )
        if result.returncode == 0:
            return
        last = (result.stdout or "") + (result.stderr or "")
        time.sleep(0.1)
    raise RuntimeError(f"postgres not ready on 127.0.0.1:{cluster.port}: {last}")


def stop_cluster(cluster: LocalCluster) -> None:
    pg_ctl = cluster.bin("pg_ctl")
    env = {
        **os.environ,
        "PATH": f"{cluster.prefix / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin",
    }
    if cluster.password:
        env["PGPASSWORD"] = cluster.password
    if pg_ctl.is_file():
        subprocess.run(
            [str(pg_ctl), "-D", str(cluster.data_dir), "-m", "fast", "stop"],
            capture_output=True,
            text=True,
            env=env,
        )
    if cluster.process is not None and cluster.process.poll() is None:
        cluster.process.terminate()
        try:
            cluster.process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            cluster.process.kill()


def statements_logged_for_pid(log_text: str, pid: int) -> list[str]:
    """Extract log_statement text for one backend PID, including continuations."""
    marker = f"[{pid}] "
    lines = log_text.splitlines()
    found: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if marker in line and (
            " statement: " in line.lower() or " execute " in line.lower()
        ):
            chunk = [line]
            i += 1
            while i < len(lines) and not lines[i].startswith("20"):
                chunk.append(lines[i])
                i += 1
            found.append("\n".join(chunk))
            continue
        i += 1
    return found


def require_server_17_6(server_version: str | None) -> None:
    if not server_version or not server_version.startswith(EXPECTED_SERVER_VERSION_PREFIX):
        raise Hold(f"expected server_version 17.6*, got {server_version!r}")
