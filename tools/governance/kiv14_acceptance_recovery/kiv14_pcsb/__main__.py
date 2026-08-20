from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from .authority import CaptureInvocation, load_capture_authority
from .capture_binding import AuthorizedCaptureRunner
from .direct_pid_equivalence import prove_direct_pid_equivalence
from .errors import CaptureAuthorityRefused, ContinuityFailure, FailClosed, Hold, SequenceViolation
from .evidence import build_package_manifest, canonical_dumps, write_package_manifest
from .local_pg import init_and_start, stop_cluster
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
        "REFUSED: default capture remains disabled. Authorized capture requires "
        "the reviewed `authorized-capture` command with a matching CaptureAuthority "
        "document and explicit invocation binding. Runtime parameters do not create "
        "governance authority. This invocation performs zero production authentication.\n"
    )
    return 2


def cmd_authorized_capture(args: argparse.Namespace) -> int:
    try:
        authority = load_capture_authority(Path(args.authority))
        invocation = CaptureInvocation(
            work_order_id=args.work_order,
            pcsb_identity=args.pcsb,
            evidence_directory=args.evidence_dir,
        )
        conninfo = Path(args.conninfo_file).read_text()
        payload = AuthorizedCaptureRunner().run(
            authority=authority,
            invocation=invocation,
            conninfo=conninfo,
        )
    except CaptureAuthorityRefused as exc:
        sys.stderr.write(f"REFUSED before authentication: {exc}\n")
        return 2
    except (FailClosed, SequenceViolation) as exc:
        sys.stderr.write(f"FAIL-CLOSED: {exc}\n")
        return 1
    completeness = payload.get("completeness")
    sys.stdout.write(
        canonical_dumps(
            {
                "completeness": completeness,
                "incomplete_reason": payload.get("incomplete_reason"),
                "pcsb_identity": payload.get("pcsb_identity"),
                "work_order_id": payload.get("work_order_id"),
            }
        )
    )
    return 0 if completeness == "complete" else 1


def cmd_prove_direct_pid_equivalence() -> int:
    """Disposable loopback PG 17.6 only. Never production/Supabase."""
    cluster = None
    try:
        cluster = init_and_start(label="kiv229-direct-pid-equivalence")
        payload = prove_direct_pid_equivalence(cluster.conninfo)
    except Hold as exc:
        sys.stderr.write(f"HOLD: {exc}\n")
        return 2
    except (ContinuityFailure, FailClosed, SequenceViolation) as exc:
        sys.stderr.write(f"FAIL-CLOSED: {exc}\n")
        return 1
    finally:
        if cluster is not None:
            stop_cluster(cluster)
    sys.stdout.write(canonical_dumps(payload))
    return 0 if payload.get("equal") else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kiv14_pcsb",
        description="KIV-229 no-production A2 direct-postgres route package",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("selftest", help="run package self-tests")
    sub.add_parser("manifest", help="write deterministic package_manifest.json")
    sub.add_parser("preflight", help="Class A + Class B PG 17.6 preflight")
    sub.add_parser("capture", help="always refused unless using authorized-capture")
    authorized = sub.add_parser(
        "authorized-capture",
        help="reviewed authority-bound capture; refuses unless all bindings match",
    )
    authorized.add_argument("--authority", required=True, help="JSON CaptureAuthority path")
    authorized.add_argument("--work-order", required=True, help="must match authority.work_order_id")
    authorized.add_argument("--pcsb", required=True, help="must match authority.pcsb_identity")
    authorized.add_argument("--conninfo-file", required=True, help="runtime libpq conninfo; not logged")
    authorized.add_argument("--evidence-dir", required=True, help="must match authority.evidence_directory")
    sub.add_parser(
        "prove-direct-pid-equivalence",
        help="tooling-only disposable PG17.6 PQbackendPID == pg_backend_pid(); never production",
    )
    args = parser.parse_args(argv)
    if args.command == "selftest":
        return cmd_selftest()
    if args.command == "manifest":
        return cmd_manifest()
    if args.command == "preflight":
        return cmd_preflight()
    if args.command == "capture":
        return cmd_capture()
    if args.command == "authorized-capture":
        return cmd_authorized_capture(args)
    if args.command == "prove-direct-pid-equivalence":
        return cmd_prove_direct_pid_equivalence()
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
