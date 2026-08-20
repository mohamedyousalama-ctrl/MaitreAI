from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from .evidence import build_package_manifest, canonical_dumps, write_package_manifest
from .preflight import run_preflight
from .static_validate import validate_all_statement_contracts, validate_bad_example_detects_kiv208
from .statements import verify_p0_pin


def _package_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def cmd_selftest() -> int:
    verify_p0_pin()
    validate_bad_example_detects_kiv208()
    validate_all_statement_contracts()
    tests = _package_dir() / "tests"
    return subprocess.call(
        [sys.executable, "-m", "pytest", "-q", str(tests)],
        cwd=str(_package_dir()),
    )


def cmd_manifest() -> int:
    path = write_package_manifest()
    manifest = build_package_manifest()
    sys.stdout.write(canonical_dumps({"wrote": str(path), "hash_of_hashes": manifest["hash_of_hashes"]}))
    return 0


def cmd_preflight() -> int:
    payload = run_preflight()
    sys.stdout.write(canonical_dumps({"terminal_verdict": payload["terminal_verdict"], "hold_findings": payload["hold_findings"]}))
    return 0 if payload.get("class_a_preflight_ok") and payload.get("class_b_validated") else 1


def cmd_capture() -> int:
    sys.stderr.write(
        "REFUSED: KIV-218 does not authorize production authentication, "
        "Supabase SQL, or PCSB-n capture. Zero production/Supabase auth/SQL.\n"
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kiv14_pcsb",
        description="KIV-218 no-production A2 PCSB query/driver package remediation",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("selftest", help="run package self-tests")
    sub.add_parser("manifest", help="write deterministic package_manifest.json")
    sub.add_parser("preflight", help="Class A + Class B PG 17.6 preflight")
    sub.add_parser("capture", help="always refused under KIV-218")
    args = parser.parse_args(argv)
    if args.command == "selftest":
        return cmd_selftest()
    if args.command == "manifest":
        return cmd_manifest()
    if args.command == "preflight":
        return cmd_preflight()
    if args.command == "capture":
        return cmd_capture()
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
