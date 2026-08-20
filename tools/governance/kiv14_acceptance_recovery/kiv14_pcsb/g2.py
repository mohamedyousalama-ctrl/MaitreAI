from __future__ import annotations

import re
from typing import Any


V4_REQUIRED_PARTS = (
    "request.jwt.claim.sub",
    "request.jwt.claims",
    "coalesce",
    "nullif",
    "::uuid",
)


def g2_v4_equivalent(prosrc: str | None) -> dict[str, Any]:
    """Host-side G2 semantic determination. Never adapts 0109."""
    text = prosrc or ""
    compact = re.sub(r"\s+", " ", text).lower()
    missing = [p for p in V4_REQUIRED_PARTS if p not in compact]
    claim_before_claims = compact.find("request.jwt.claim.sub") <= compact.find(
        "request.jwt.claims"
    ) if "request.jwt.claims" in compact and "request.jwt.claim.sub" in compact else False
    ok = not missing and claim_before_claims
    return {
        "v4_equivalent": ok,
        "missing_parts": missing,
        "claim_sub_before_claims": claim_before_claims,
        "note": "G2 is never an adaptation point. Divergence is HS-33 at capture time.",
    }


def g3_binding_ok(uid_rows: Any, arg_list: Any) -> dict[str, Any]:
    rows = int(uid_rows or 0)
    args = "" if arg_list is None else str(arg_list)
    ok = rows == 1 and args == ""
    return {
        "g3_ok": ok,
        "uid_rows": rows,
        "arg_list": args,
        "note": "Require exactly one zero-argument auth.uid binding.",
    }
