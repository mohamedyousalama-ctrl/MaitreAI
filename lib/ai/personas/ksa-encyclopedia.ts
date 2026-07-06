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

// ── RENDER half (spec §3) ───────────────────────────────────────────────────
/** Static framing line so the model never mistakes the block for orderable menu. */
export const ENCYCLOPEDIA_BLOCK_HEADER = "ثقافة السوق (معرفة فقط، ليست منيو):";

/** UTF-8 byte length (portable, no Buffer dependency). */
const byteLen = (s: string): number => new TextEncoder().encode(s).length;

/** Truncate to ≤ maxBytes UTF-8 bytes at a word boundary, appending «…». Deterministic.
 *  The pack's menu_join_hint is long guidance prose, so most lines exceed the 480-byte
 *  per-line cap (spec §3) and are trimmed here — the curated inject_summary + the
 *  «تُقترح فقط لو كانت ضمن منيو المطعم» clause carry the menu-gated meaning regardless. */
export function capLineBytes(s: string, maxBytes: number): string {
  if (byteLen(s) <= maxBytes) return s;
  let end = s.length;
  while (end > 0 && byteLen(s.slice(0, end)) > maxBytes - 3) end--; // room for «…»
  const lastSpace = s.lastIndexOf(" ", end);
  if (lastSpace > 0) end = lastSpace;
  return s.slice(0, end).replace(/\s+$/, "") + "…";
}

/**
 * Render ONE entry to the compact line (spec §3), capped to MAX_INJECT_LINE_BYTES.
 * Built from frontmatter ONLY (no body). NO price, NO allergens_note (§3/§10) — the
 * allergens_note is caution-only background and is never surfaced as a sell line.
 */
export function renderKsaEntryLine(e: KsaEntry): string {
  const summary = e.injectSummary ?? "";
  const line = `• ${e.nameAr} (${e.nameEn}) — ${summary}. تُقترح فقط لو كانت ضمن منيو المطعم. ${e.menuJoinHint}`.trim();
  return capLineBytes(line, MAX_INJECT_LINE_BYTES);
}

/**
 * Build the full encyclopedia block for injection (spec §3). Selects (§2), renders
 * each line, then enforces the block byte cap with the §3 DROP ORDER: pop from the
 * TAIL — which is Tier-B bottom (lowest score, ties id DESC) then the optional spine
 * (arabic-tea) — but NEVER below the two-entry core spine (gahwa, dates). Whole-entry
 * drops only. Returns "" only if nothing selected (spine always injects when flag ON).
 */
export function buildKsaEncyclopediaBlock(region: string, cuisineTags: readonly string[]): string {
  const list = selectKsaEntries(region, cuisineTags);
  if (!list.length) return "";
  const render = (es: KsaEntry[]) => `\n\n## ${ENCYCLOPEDIA_BLOCK_HEADER}\n${es.map(renderKsaEntryLine).join("\n")}`;
  let block = render(list);
  // Core spine (gahwa, dates) sit at positions 0-1, so stopping at length 2 protects them.
  while (list.length > 2 && byteLen(block) > MAX_ENCYCLOPEDIA_BYTES) {
    list.pop();
    block = render(list);
  }
  return block;
}
