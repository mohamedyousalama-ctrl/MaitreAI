// ============================================================================
// KSA Encyclopedia — deterministic entry SELECTOR (WO-ENCYCLOPEDIA, selection half).
// PURE, no I/O, no model call — same inputs → same output. Implements the subset
// rule in docs/KSA_ENCYCLOPEDIA_CURATION.md §2 exactly.
//
// SCOPE (this build): selection + ranking + entry-count cap + the flag-dependency
// gate. The RENDER (compact line from inject_summary), the BYTE caps, and the
// prompt.ts injection are the SECOND half — they depend on the curation pack-PR
// adding `inject_summary` to knowledge/ksa/*.md (merged to main first), and land
// on top of it. Nothing here renders a line or fabricates inject_summary.
//
// Inherited laws (spec §0): the encyclopedia injects CULTURE, never menu items /
// prices / availability (LAW 1); it has ZERO effect on the allergen gate (LAW 2).
// ============================================================================
import { KSA_ENTRIES, type KsaEntry } from "./ksa-entries";

export { KSA_ENTRIES, type KsaEntry };

// Hard caps (spec §3). BYTES/LINE are consumed by the render half (deferred).
export const MAX_ENCYCLOPEDIA_ENTRIES = 6;
export const MAX_ENCYCLOPEDIA_BYTES = 3072;
export const MAX_INJECT_LINE_BYTES = 480;

/** Tier-A hospitality spine (spec §1). Core = gahwa, dates (never dropped);
 *  arabic-tea is the optional spine member (dropped before core when over budget). */
export const CORE_SPINE_IDS = ["gahwa", "dates"] as const;
export const OPTIONAL_SPINE_ID = "arabic-tea";
const TIER_A_IDS: ReadonlySet<string> = new Set([...CORE_SPINE_IDS, OPTIONAL_SPINE_ID]);

// ── Deterministic score (spec §2) ──────────────────────────────────────────
export function regionMatch(entry: KsaEntry, region: string): number {
  if (entry.regions.includes(region)) return 2;
  if (entry.regions.includes("all")) return 1;
  return 0;
}
export function tagOverlap(entry: KsaEntry, cuisineTags: readonly string[]): number {
  const set = new Set(cuisineTags);
  return entry.cuisineTags.filter((t) => set.has(t)).length;
}
export function categoryBonus(entry: KsaEntry): number {
  if (entry.cuisineTags.includes("signature")) return 3;
  if (entry.cuisineTags.includes("hospitality")) return 2;
  return 0;
}
export function scoreEntry(entry: KsaEntry, region: string, cuisineTags: readonly string[]): number {
  return tagOverlap(entry, cuisineTags) * 10 + regionMatch(entry, region) + categoryBonus(entry);
}

/**
 * Hard flag dependency (spec §4, property 7): the encyclopedia may inject ONLY if
 * BOTH khalid_persona AND ksa_encyclopedia are ON. ksa_encyclopedia ON while the
 * persona is OFF → inject nothing (the culture block is meaningless without the voice).
 */
export function shouldInjectEncyclopedia(khalidPersonaOn: boolean, ksaEncyclopediaOn: boolean): boolean {
  return khalidPersonaOn === true && ksaEncyclopediaOn === true;
}

/**
 * Pure ranked selection (spec §2). Order: core spine (gahwa, dates) → optional
 * spine (arabic-tea) → Tier B eligible, sorted (score DESC, id ASC) — a TOTAL
 * order, so selection is fully reproducible. Truncated to the ENTRY-count cap.
 * (Byte caps + drop-order land with the render half — this returns the ordered,
 * entry-capped list; the tail is exactly the §3 byte-drop order.)
 *
 * Tier B eligibility (all must hold): tagOverlap ≥ 1 AND regionMatch ≥ 1 AND the
 * entry is not Tier A. Empty/absent cuisineTags → no Tier B is eligible → spine only.
 */
export function rankKsaEntries(entries: readonly KsaEntry[], region: string, cuisineTags: readonly string[]): KsaEntry[] {
  const byId = (id: string) => entries.find((e) => e.id === id);
  const spine = [byId("gahwa"), byId("dates"), byId(OPTIONAL_SPINE_ID)].filter((e): e is KsaEntry => !!e);

  const tierB = entries
    .filter((e) => !TIER_A_IDS.has(e.id))
    .map((e) => ({ e, s: scoreEntry(e, region, cuisineTags), ov: tagOverlap(e, cuisineTags), rm: regionMatch(e, region) }))
    .filter((x) => x.ov >= 1 && x.rm >= 1)
    .sort((a, b) => b.s - a.s || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
    .map((x) => x.e);

  return [...spine, ...tierB].slice(0, MAX_ENCYCLOPEDIA_ENTRIES);
}

/** selectKsaEntries(region, cuisineTags) → ordered, entry-capped list (spec §2). */
export function selectKsaEntries(region: string, cuisineTags: readonly string[]): KsaEntry[] {
  return rankKsaEntries(KSA_ENTRIES, region, cuisineTags);
}
