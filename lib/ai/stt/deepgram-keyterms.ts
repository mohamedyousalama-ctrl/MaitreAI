// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE: Nova-3 native keyterm prompting (PURE, no I/O).
// Deepgram Nova-3 accepts up to ~100 `keyterm` phrases that bias recognition toward
// a domain vocabulary (the tenant's menu). We cap at KEYTERM_CAP (~80) and — BINDING
// SAFETY RULE — NEVER boost allergen-class words: a keyterm whose any token is an
// allergen term is dropped, so STT is never nudged toward (or away from) hearing an
// allergen. Menu items that merely CONTAIN an allergen word are excluded too (belt +
// suspenders); the fail-closed phonetic net owns allergen recognition, not a bias list.
// ============================================================================

import { normalizeAr } from "../allergen-gate";
import { ALLERGENS } from "../allergen-vocab";

export const KEYTERM_CAP = 80;

/** The normalized allergen token blocklist — gate terms + aliases + labels from the
 *  canonical allergen vocabulary. A keyterm containing any of these is never boosted. */
function allergenTokenSet(): Set<string> {
  const set = new Set<string>();
  for (const a of ALLERGENS) {
    for (const t of [a.arLabel, a.enLabel, ...a.gateTerms, ...a.aliases]) {
      const n = normalizeAr(String(t ?? ""));
      for (const tok of n.split(/\s+/).filter(Boolean)) set.add(tok);
    }
  }
  return set;
}

/**
 * Build the Deepgram keyterm list from the tenant's menu item names. Pure.
 * - de-duplicated by normalized form, display form preserved for the API;
 * - capped at KEYTERM_CAP;
 * - a keyterm ANY of whose tokens is an allergen term is DROPPED (allergen words are
 *   never boosted — the binding safety rule).
 */
export function buildDeepgramKeyterms(
  itemNames: Array<string | null | undefined>,
  cap: number = KEYTERM_CAP
): string[] {
  const blocked = allergenTokenSet();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of itemNames ?? []) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const norm = normalizeAr(s);
    if (!norm || seen.has(norm)) continue;
    const toks = norm.split(/\s+/).filter(Boolean);
    if (toks.some((t) => blocked.has(t))) continue; // allergen word → never a keyterm
    seen.add(norm);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** True when a term would be excluded from keyterms because it is/contains an allergen
 *  word — exported for the proof's safety assertion. */
export function isAllergenKeyterm(term: string): boolean {
  const blocked = allergenTokenSet();
  return normalizeAr(String(term ?? "")).split(/\s+/).filter(Boolean).some((t) => blocked.has(t));
}
