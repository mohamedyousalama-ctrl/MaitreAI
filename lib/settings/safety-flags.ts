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
  "allergen_symptom_detection", // symptom-phrase → allergen escalation
] as const;

const SAFETY_FLAG_SET = new Set<string>(SAFETY_FLAGS);

/** True when `flag` is a safety flag that no console may flip. */
export function isSafetyFlag(flag: string): boolean {
  return SAFETY_FLAG_SET.has(flag);
}
