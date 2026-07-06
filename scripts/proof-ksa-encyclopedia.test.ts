// WO-ENCYCLOPEDIA (selection half) — unit tests for the deterministic KSA selector.
// Run: node --experimental-strip-types scripts/proof-ksa-encyclopedia.test.ts
//
// Covers spec §6 properties 1-4 & 7 (determinism · spine invariant · region gating
// · tag gating · flag dependency) + a drift guard that the generated const stays in
// sync with the pack frontmatter. Properties 5/6/8/9/10 (byte caps, drop order,
// ordering+end-anchor, byte-identical-OFF, no-clearance) are the RENDER/injection
// half and land after the curation inject_summary pack-PR.
import {
  selectKsaEntries,
  rankKsaEntries,
  scoreEntry,
  regionMatch,
  tagOverlap,
  categoryBonus,
  shouldInjectEncyclopedia,
  buildKsaEncyclopediaBlock,
  renderKsaEntryLine,
  capLineBytes,
  MAX_ENCYCLOPEDIA_ENTRIES,
  MAX_ENCYCLOPEDIA_BYTES,
  MAX_INJECT_LINE_BYTES,
  CORE_SPINE_IDS,
  KSA_ENTRIES,
  type KsaEntry,
} from "../lib/ai/personas/ksa-encyclopedia.ts";
import { buildEntries } from "./gen-ksa-entries.mjs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const ids = (es: KsaEntry[]) => es.map((e) => e.id);
const REGIONS = ["najd", "hijaz", "asir", "eastern"] as const;
const TIER_A = new Set(["gahwa", "dates", "arabic-tea"]);

// ── DRIFT GUARD: generated const == pack frontmatter (single source stays in sync) ──
ok("generated KSA_ENTRIES is in sync with knowledge/ksa/*.md frontmatter",
  JSON.stringify([...KSA_ENTRIES]) === JSON.stringify(buildEntries()));
ok("all 15 entries present", KSA_ENTRIES.length === 15);
ok("inject_summary present for all 15 (curation pack-PR #326 landed) + within the ≤160-char cap (spec §3)",
  KSA_ENTRIES.every((e) => typeof e.injectSummary === "string" && e.injectSummary!.length > 0 && e.injectSummary!.length <= 160));

// ── Score math (spec §2) ──
const kabsa = KSA_ENTRIES.find((e) => e.id === "kabsa")!;
ok("regionMatch: exact region → 2", regionMatch(kabsa, "najd") === 2);
ok("regionMatch: 'all' fallback → 1", regionMatch(kabsa, "asir") === 1); // kabsa regions include 'all', not asir
ok("regionMatch: neither → 0", regionMatch(KSA_ENTRIES.find((e) => e.id === "jareesh")!, "hijaz") === 0);
ok("categoryBonus: signature → 3", categoryBonus(kabsa) === 3);
ok("categoryBonus: hospitality → 2", categoryBonus(KSA_ENTRIES.find((e) => e.id === "gahwa")!) === 2);
ok("score = tagOverlap*10 + regionMatch + categoryBonus",
  scoreEntry(kabsa, "najd", ["rice-dish"]) === tagOverlap(kabsa, ["rice-dish"]) * 10 + 2 + 3);

// ── Property 1 — DETERMINISM ──
const a = selectKsaEntries("najd", ["najdi", "rice-dish"]);
const b = selectKsaEntries("najd", ["najdi", "rice-dish"]);
ok("P1 determinism: identical ordered output across runs", JSON.stringify(ids(a)) === JSON.stringify(ids(b)));

// ── Property 2 — SPINE INVARIANT (gahwa + dates always, any region, empty tags) ──
for (const r of REGIONS) {
  const spineOnly = selectKsaEntries(r, []);
  ok(`P2 spine invariant [${r}], empty tags → gahwa+dates present`,
    CORE_SPINE_IDS.every((id) => ids(spineOnly).includes(id)));
  ok(`P2 empty tags → NO Tier B (spine only) [${r}]`,
    spineOnly.every((e) => TIER_A.has(e.id)));
}
// Also present with tags.
ok("P2 spine present even with rich tags", CORE_SPINE_IDS.every((id) => ids(selectKsaEntries("najd", ["rice-dish", "najdi"])).includes(id)));

// ── Property 3 — REGION GATING (no Tier B whose regions excludes region & lacks 'all') ──
// jareesh/mathloutha are najd-only; must never appear for hijaz even if tags overlap.
const hijazSel = selectKsaEntries("hijaz", ["najdi", "grain", "comfort", "wheat"]);
ok("P3 region gating: najd-only jareesh excluded for hijaz", !ids(hijazSel).includes("jareesh"));
ok("P3 region gating: najd-only mathloutha excluded for hijaz", !ids(hijazSel).includes("mathloutha"));
// General: every non-spine entry in ANY selection has regionMatch ≥ 1.
for (const r of REGIONS) {
  const sel = selectKsaEntries(r, ["rice-dish", "grain", "sweet", "hospitality", "comfort"]);
  ok(`P3 every Tier-B entry has regionMatch≥1 [${r}]`,
    sel.filter((e) => !TIER_A.has(e.id)).every((e) => regionMatch(e, r) >= 1));
}

// ── Property 4 — TAG GATING (no Tier B with zero cuisine_tags overlap) ──
for (const r of REGIONS) {
  const tags = ["rice-dish", "dessert", "grain"];
  const sel = selectKsaEntries(r, tags);
  ok(`P4 every Tier-B entry has tagOverlap≥1 [${r}]`,
    sel.filter((e) => !TIER_A.has(e.id)).every((e) => tagOverlap(e, tags) >= 1));
}
ok("P4 unrelated tags → spine only (no bogus Tier B)",
  selectKsaEntries("najd", ["sushi", "taco"]).every((e) => TIER_A.has(e.id)));

// ── Ordering + cap (spec §2 assembly) ──
const najdRice = selectKsaEntries("najd", ["rice-dish"]);
ok("cap: never exceeds MAX_ENCYCLOPEDIA_ENTRIES", selectKsaEntries("najd", ["saudi"]).length <= MAX_ENCYCLOPEDIA_ENTRIES);
ok("order: gahwa@0, dates@1 (fixed spine order)", najdRice[0]?.id === "gahwa" && najdRice[1]?.id === "dates");
ok("order: Tier-B kabsa(score15) before mandi(score14) for najd+rice-dish",
  ids(najdRice).indexOf("kabsa") >= 0 && ids(najdRice).indexOf("kabsa") < ids(najdRice).indexOf("mandi"));
// Tier-B tie-break: (score DESC, id ASC) — verify the Tier-B slice is sorted so.
const tierBslice = najdRice.filter((e) => !TIER_A.has(e.id));
let sortedOk = true;
for (let i = 1; i < tierBslice.length; i++) {
  const p = scoreEntry(tierBslice[i - 1], "najd", ["rice-dish"]);
  const c = scoreEntry(tierBslice[i], "najd", ["rice-dish"]);
  if (p < c || (p === c && tierBslice[i - 1].id > tierBslice[i].id)) sortedOk = false;
}
ok("order: Tier-B sorted (score DESC, id ASC)", sortedOk);

// ── Property 7 — FLAG DEPENDENCY (hard-dependent on khalid_persona) ──
ok("P7 both ON → inject", shouldInjectEncyclopedia(true, true) === true);
ok("P7 encyclopedia ON but persona OFF → NO inject", shouldInjectEncyclopedia(false, true) === false);
ok("P7 persona ON but encyclopedia OFF → NO inject", shouldInjectEncyclopedia(true, false) === false);
ok("P7 both OFF → NO inject", shouldInjectEncyclopedia(false, false) === false);

// rankKsaEntries is pure over its entries arg (spec's testable seam).
ok("rankKsaEntries pure: empty entries → empty", rankKsaEntries([], "najd", ["x"]).length === 0);

// ── RENDER + CAPS (spec §3, property 5) ──
const BYTES = (s: string) => new TextEncoder().encode(s).length;
ok("capLineBytes: over-cap string truncated to ≤ cap with ellipsis",
  BYTES(capLineBytes("• " + "طويلة ".repeat(200), 480)) <= 480 && capLineBytes("• " + "طويلة ".repeat(200), 480).endsWith("…"));
ok("capLineBytes: under-cap string untouched", capLineBytes("short line", 480) === "short line");
ok("renderKsaEntryLine: every entry's line ≤ MAX_INJECT_LINE_BYTES",
  KSA_ENTRIES.every((e) => BYTES(renderKsaEntryLine(e)) <= MAX_INJECT_LINE_BYTES));
ok("renderKsaEntryLine: uses the curated inject_summary + menu-gated clause, NOT allergens_note",
  KSA_ENTRIES.every((e) => renderKsaEntryLine(e).includes("تُقترح فقط لو كانت ضمن منيو المطعم")));

const COMBOS: Array<[string, string[]]> = [
  ["najd", ["rice-dish", "najdi"]], ["hijaz", ["rice-dish", "sweet"]], ["eastern", ["hospitality"]],
  ["asir", ["comfort", "grain"]], ["najd", []], ["hijaz", ["dessert", "ramadan"]],
];
for (const [region, tags] of COMBOS) {
  const block = buildKsaEncyclopediaBlock(region, tags);
  ok(`P5 caps [${region}/${tags.join(",")}]: block ≤ ${MAX_ENCYCLOPEDIA_BYTES} bytes`, BYTES(block) <= MAX_ENCYCLOPEDIA_BYTES);
  ok(`P5 caps [${region}/${tags.join(",")}]: every line ≤ ${MAX_INJECT_LINE_BYTES} bytes`,
    block.split("\n").every((l) => BYTES(l) <= MAX_INJECT_LINE_BYTES));
  ok(`P6 core spine survives [${region}/${tags.join(",")}]: gahwa + dates in block`,
    CORE_SPINE_IDS.every((id) => block.includes(KSA_ENTRIES.find((e) => e.id === id)!.nameAr)));
  ok(`P10 no currency token in block [${region}/${tags.join(",")}]`, !/ر\.\s?س|ريال|SAR|SR\b|\$|ج\.م/.test(block));
  ok(`block header present [${region}/${tags.join(",")}]`, block.includes("ثقافة السوق"));
}

console.log(`\nKSA-ENCYCLOPEDIA SELECTOR: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
