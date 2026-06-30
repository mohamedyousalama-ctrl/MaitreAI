// ============================================================================
// MaitreAI — DRYRUN-1 tester-allowlist decision (PURE leaf module, no I/O).
// Decides whether Karim may auto-respond to an inbound number. It is an UPSTREAM
// recipient filter: it only decides whether the agent engages at all, NEVER how
// safety runs once it does. The deterministic allergen gate (customer-turn.ts)
// is downstream and untouched — for every number Karim does answer, the allergen
// gate runs unchanged.
//
// Leaf by design (imports only phone.ts) so it is unit-testable without pulling
// the server-only respond-and-send pipeline.
// ============================================================================

import { normalizePhone } from "@/lib/messaging/phone";

/**
 * FAIL-SAFE = HOLD on any uncertainty:
 *  - mode off (default) → allow (feature inert; zero behavior change).
 *  - mode on → allow ONLY if the inbound number, after the SAME normalizePhone
 *    canonicalization applied to every stored entry, is explicitly in the list.
 *    NULL/empty list, or an unmatched/blank number → hold.
 *  - row failed to read (readError && no row) → treat as "on" and hold (we
 *    cannot prove the number is allowed), never respond-to-everyone.
 */
export function evaluateTesterAllowlist(args: {
  testerAllowlistMode: boolean | null | undefined;
  testerAllowlist: string[] | null | undefined;
  country: string | null | undefined;
  phone: string;
  readError: boolean;
  hasRow: boolean;
}): { allow: boolean } {
  const modeOn = args.testerAllowlistMode === true;
  const indeterminate = args.readError && !args.hasRow;
  if (!modeOn && !indeterminate) return { allow: true }; // inert → unchanged path
  const country = args.country ?? null;
  const canonInbound = normalizePhone(args.phone, country);
  const allow = (args.testerAllowlist ?? []).map((n) => normalizePhone(n, country));
  return { allow: canonInbound !== "" && allow.includes(canonInbound) };
}
