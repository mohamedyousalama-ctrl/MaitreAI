// ============================================================================
// WO-MEMFIX proof — the allergy-memory extractor must store CANONICAL allergen
// entities only, never raw trigger/symptom words. The production bug rendered
// «مسجّل حساسية من حساسه، حكه، قمح، حساسية، بيض» — "allergy" and "itching" listed
// as substances. This proves: (1) canonicalization drops symptom/trigger/mention
// words and keeps real substances; (2) the note-builder applies it at WRITE time;
// (3) the warning renderer + audit writer + memory gate apply it defensively at
// READ time; (4) an allergy mention with no identifiable substance → allergen=null
// + a generic careful line with no fabricated substance list.
//
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs \
//        --experimental-strip-types scripts/proof-memfix.test.ts
// ============================================================================

import {
  canonicalizeAllergens,
  canonicalAllergen,
  isCanonicalAllergen,
  filterAllergenEntities,
  CANONICAL_ALLERGENS,
} from "@/lib/ai/allergen-canonical";
import {
  allergenLabel,
  mergeAllergyNote,
  parseAllergyNote,
} from "@/lib/ai/allergen-companion";
import {
  buildCheckpointRecap,
  decideCompanionAction,
} from "@/lib/ai/allergen-companion-flow";
import { scanBannedAllergyPhrases } from "@/lib/ai/allergen-companion";
import { recordAllergyEvent } from "@/lib/db/allergy-audit";
import { detectMemoryAllergyDraftIntersection } from "@/lib/ai/memory-allergy-gate";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The exact production garbage tokens (order as it rendered).
const GARBAGE = ["حساسه", "حكه", "قمح", "حساسية", "بيض"];
const DISH = [{ name: "برجر", state: "unknown" as const }];

// ── 1. THE garbage case — canonical set is {قمح، بيض} ONLY ──────────────────
{
  const set = canonicalizeAllergens(GARBAGE);
  ok("1a: garbage tokens → canonical set = {قمح، بيض} exactly", eq(set, ["قمح", "بيض"]));
  ok("1b: itching «حكه» never survives as a substance", !set.includes("حكه" as never));
  ok("1c: the mention word «حساسية» never survives as a substance", !set.includes("حساسية" as never));
  ok("1d: symptom «حساسه» never survives as a substance", !set.includes("حساسه" as never));
}

// ── 2. WRITE-time — the note-builder drops trigger words, keeps entities ─────
{
  const note = mergeAllergyNote(null, GARBAGE);
  ok("2a: WRITE note lists canonical substances only", note === "⚠️ حساسية: قمح، بيض");
  ok("2b: parse round-trips to {قمح، بيض}", eq(parseAllergyNote(note), ["قمح", "بيض"]));
  // Monotonic union keeps earlier entities and still drops symptoms mid-stream.
  const merged = mergeAllergyNote("⚠️ حساسية: بيض", ["حكه", "مكسرات", "حساسية"]);
  ok("2c: union adds new entity, drops symptom/mention tokens", merged === "⚠️ حساسية: بيض، مكسرات");
  // Real entities are kept VERBATIM (the customer's own word) at the note level.
  ok("2d: allergenLabel keeps a real substance verbatim («لبن»)", allergenLabel("لبن") === "لبن");
  ok("2e: allergenLabel drops a symptom word («حكه» → dropped)", allergenLabel("حكه") === "");
  ok("2f: allergenLabel maps a bare mention («الحساسية») → generic label", allergenLabel("الحساسية") === "حساسية");
}

// ── 3. No identifiable substance → allergen=null + generic line ─────────────
{
  ok("3a: mention word alone → empty canonical set (allergen = null)", eq(canonicalizeAllergens(["حساسية"]), []));
  ok("3b: pure symptoms → empty canonical set", eq(canonicalizeAllergens(["حكه", "تعب", "ضيق تنفس"]), []));
  const recap = buildCheckpointRecap([], DISH, "egyptian");
  ok("3c: no-substance recap does NOT fabricate a «من …» substance list", !/مسجّل حساسية من/.test(recap));
  ok("3d: no-substance recap uses a generic careful line", /عندك حساسية مسجّلة/.test(recap));
  ok("3e: no-substance recap still requires an explicit acknowledgement", /اكتب لي تأكيدك/.test(recap));
  // Garbage-only allergens list → same generic line, no substance rendered.
  const garbageRecap = buildCheckpointRecap(["حكه", "حساسية"], DISH, "saudi");
  ok("3f: garbage-only recap renders no substance", !/مسجّل حساسية من/.test(garbageRecap) && !/حكه/.test(garbageRecap));
}

// ── 4. Variants normalize onto the canonical entity ─────────────────────────
{
  ok("4a: «البيض» → «بيض» (ال-article tolerated)", eq(canonicalizeAllergens(["البيض"]), ["بيض"]));
  ok("4b: «الجلوتين»/«حليب»/«اسماك» → «قمح»/«ألبان»/«سمك»", eq(canonicalizeAllergens(["الجلوتين", "حليب", "اسماك"]), ["قمح", "ألبان", "سمك"]));
  ok("4c: «فراوله» → «فراولة» (spelling variant)", eq(canonicalizeAllergens(["فراوله"]), ["فراولة"]));
  ok("4d: «فول سوداني» is its own entity (not «مكسرات»)", canonicalAllergen("فول سوداني") === "فول سوداني");
  ok("4e: «قمح» is canonical, «حكه» is not", canonicalAllergen("قمح") === "قمح" && canonicalAllergen("حكه") === null);
  ok("4f: every declared canonical entity is self-idempotent", CANONICAL_ALLERGENS.every((c) => canonicalAllergen(c) === c));
}

// ── 5. READ-time defense — the warning renderer filters legacy garbage rows ──
{
  // A legacy row whose note is the full garbage string still renders substances only.
  const recap = buildCheckpointRecap(GARBAGE, DISH, "saudi");
  ok("5a: warning renderer lists قمح & بيض from a garbage row", /قمح/.test(recap) && /بيض/.test(recap));
  ok("5b: warning renderer never renders «حكه»/«حساسه» as a substance", !/حكه/.test(recap) && !/حساسه/.test(recap));
  ok("5c: warning renderer stays §0 banned-clean (substance branch)", scanBannedAllergyPhrases(recap).length === 0);
  ok("5d: warning renderer stays §0 banned-clean (generic branch)", scanBannedAllergyPhrases(buildCheckpointRecap([], DISH, "saudi")).length === 0);
}

// ── 6. READ-time defense — the memory-allergy gate receives canonical set only ─
{
  // A legacy memory note carrying garbage → only the real entities survive, VERBATIM.
  const filtered = filterAllergenEntities(["حكه", "قمح", "حساسية", "بيض", "لبن"]);
  ok("6a: memory labels filtered to entities only (verbatim)", eq(filtered, ["قمح", "بيض", "لبن"]));
  ok("6b: filter is entity-verbatim (keeps «لبن», does not rewrite to «ألبان»)", filtered.includes("لبن"));
  // The gate, fed the filtered set, fires only on the real allergen intersecting the dish.
  const menuItems = [{ id: "i1", name: "خبز قمح", allergens: ["قمح"] }];
  const draft = { lines: [{ itemId: "i1", name: "خبز قمح", quantity: 1 }] };
  const hit = detectMemoryAllergyDraftIntersection({ memoryAllergens: filtered, draft, menuItems } as never);
  ok("6c: gate fires on the real allergen only (قمح), never a symptom token", hit.fired === true && hit.matchedAllergens.every((a: string) => isCanonicalAllergen(a)));
}

// ── 7. WRITE-time defense — the audit writer stores canonical substances only ─
{
  const captured: Array<Record<string, unknown>> = [];
  const stubAdmin = {
    from() { return { insert(row: Record<string, unknown>) { captured.push(row); return Promise.resolve({ error: null }); } }; },
  };
  const base = { restaurantId: "r1", conversationId: "c1", customerMessage: "m", eventKind: "mention" as const };

  await recordAllergyEvent(stubAdmin as never, { ...base, allergens: GARBAGE });
  ok("7a: audit row stores canonical substances only ({قمح، بيض})", eq(captured[0]?.allergens, ["قمح", "بيض"]));

  await recordAllergyEvent(stubAdmin as never, { ...base, allergens: ["حساسية"] });
  ok("7b: no-substance mention → audit allergens = [] (allergen = null)", eq(captured[1]?.allergens, []));
}

// ── 8. The companion flow decision carries a canonical note end-to-end ──────
{
  // A live-style mention that also carries the symptom word «حكه» (itching).
  const d = decideCompanionAction("عندي حساسية من القمح وحاسس بحكه", null);
  const parsed = parseAllergyNote(d.note);
  ok("8a: companion note captures the real substance (قمح)", d.note.includes("قمح"));
  ok("8b: companion note never carries «حكه»/«حساسه» as a substance", !d.note.includes("حكه") && !d.note.includes("حساسه"));
  ok("8c: every parsed companion-note token is a canonical entity", parsed.length > 0 && parsed.every((a) => isCanonicalAllergen(a)));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-memfix: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
