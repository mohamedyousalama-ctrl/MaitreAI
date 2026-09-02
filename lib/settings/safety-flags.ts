// ============================================================================
// MaitreAI — R4 Safety-flag denylist (pure; browser+server safe)
// Some feature flags govern CUSTOMER SAFETY, not product tier. Those must never
// be flippable from ANY console — not by a manager, not by anyone — because
// turning one off is a child-safety failure mode (e.g. disabling the allergen
// euphemism gate lets «بيتعب من البندق» pass undetected without the word «حساسية»).
// migration 0037 already forces deterministic_allergen_safety ON at the DB
// default; this is the WRITE-SIDE guard so a console flag-flip route can reject
// any attempt to touch a safety flag server-side, before it reaches the DB.
//
// Pure + data-only so both the route and its harness share one source of truth.
// ============================================================================

/**
 * Feature flags that protect customer safety. NOT flippable from any console.
 * Enumerated explicitly (not derived) so adding a safety-critical flag is a
 * conscious, reviewed edit here.
 */
export const SAFETY_FLAGS: readonly string[] = [
  "deterministic_allergen_safety", // #87 allergen euphemism gate — must stay ON
  // STILL LOCKED, THOUGH IT NO LONGER GATES ANYTHING — and I briefly removed it, which was
  // backwards. This list is a DENYLIST, not a feature menu: being on it means "no console may
  // write this", so taking it off does not retire a toggle, it removes a lock. Residual
  // `feature_flags` rows still carry the key on real tenants, and a console write would have
  // started succeeding.
  //
  // The flag itself is dead: it gated one of the nine call sites for `detectAllergenSymptom`
  // and was ignored by the other eight, so its OFF position produced a turn that contradicted
  // itself — the safety bridge telling a customer to hold their order while the Brain kept
  // taking it. The detector is unconditional now. It stays here so nothing can write a value
  // that would look like a control and change nothing; the operator-facing description is
  // gone from the console dictionary, and docs/flags.md records it as removed.
  "allergen_symptom_detection", // dead flag, kept LOCKED — see above
] as const;

const SAFETY_FLAG_SET = new Set<string>(SAFETY_FLAGS);

/** True when `flag` is a safety flag that no console may flip. */
export function isSafetyFlag(flag: string): boolean {
  return SAFETY_FLAG_SET.has(flag);
}

/**
 * Feature flags a MANAGER may flip from the console — an explicit ALLOWLIST, not a
 * denylist. Removing the raw flag panel from the UI is not enough: POST
 * /api/settings/flags is still reachable by curl from any authed manager, and an
 * arbitrary key like `console_v2` would brick a tenant back to the old console (or
 * a delivery/infra flag would flip surfaces no manager should touch). So the write
 * route accepts ONLY these operator-facing capability flags; every other key is
 * rejected 403, exactly as a safety flag is. Enumerated explicitly so widening a
 * manager's write surface is a conscious, reviewed edit here.
 *
 *   psp_payments — the tenant's own online-payment credentials card
 *   qz_print     — silent (QZ) receipt printing
 *
 * Safety flags are intentionally absent (they are never writable). This list and
 * SAFETY_FLAGS together are the single source of truth for flag write-policy.
 */
export const MANAGER_WRITABLE_FLAGS: readonly string[] = [
  "psp_payments",
  "qz_print",
] as const;

const MANAGER_WRITABLE_FLAG_SET = new Set<string>(MANAGER_WRITABLE_FLAGS);

/** True when `flag` is an operator-facing capability a manager may flip. */
export function isManagerWritableFlag(flag: string): boolean {
  return MANAGER_WRITABLE_FLAG_SET.has(flag);
}
