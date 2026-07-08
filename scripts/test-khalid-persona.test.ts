// Unit tests for the Khalid persona layer (pure, no LLM, no I/O).
// Run: node --experimental-strip-types scripts/test-khalid-persona.test.ts
//
// Asserts the persona-layer CONTRACT (see lib/ai/personas/README.md): region
// resolution (Najdi default), name fallback, and — critically — that the overlay
// text keeps "voice, never facts": it defers to the engine on truth/safety/money and
// gates every pairing on real menu truth. It does NOT test prose quality.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildKhalidPersonaLayer,
  resolveKsaRegion,
  KHALID_DEFAULT_NAME,
  KHALID_PERSONA_ID,
  DEFAULT_KSA_REGION,
  CURATED_EXEMPLARS,
  PHRASE_BUCKETS,
  NAJDI_EXEMPLARS,
  HIJAZI_EXEMPLARS,
} from "../lib/ai/personas/khalid.ts";
import type { KsaRegion } from "../lib/ai/personas/khalid.ts";
import { findLeakage } from "../lib/ai/personas/khalid-dialect-linter.mjs";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// --- region resolution (Najdi default, never throws on junk) ---------------
ok("id is stable", KHALID_PERSONA_ID === "khalid_najdi");
ok("default region is najd", DEFAULT_KSA_REGION === "najd");
ok("resolve najd", resolveKsaRegion("najd") === "najd");
ok("resolve hijaz", resolveKsaRegion("hijaz") === "hijaz");
ok("resolve asir", resolveKsaRegion("asir") === "asir");
ok("resolve eastern", resolveKsaRegion("eastern") === "eastern");
ok("resolve null → najd", resolveKsaRegion(null) === "najd");
ok("resolve unknown → najd", resolveKsaRegion("cairo") === "najd");
ok("resolve empty → najd", resolveKsaRegion("") === "najd");

// --- name fallback ---------------------------------------------------------
const najd = buildKhalidPersonaLayer({ region: "najd", restaurantName: "مطعم الديرة" });
ok("falls back to خالد when no personaName", najd.includes(`«${KHALID_DEFAULT_NAME} النجدي»`));
const custom = buildKhalidPersonaLayer({ region: "najd", personaName: "أبو سعود", restaurantName: "مطعم الديرة" });
ok("honours tenant personaName override", custom.includes("«أبو سعود النجدي»"));
ok("restaurant name is embedded", najd.includes("مطعم الديرة"));

// --- region voice actually varies -------------------------------------------
const regions: KsaRegion[] = ["najd", "hijaz", "asir", "eastern"];
const layers = regions.map((r) => buildKhalidPersonaLayer({ region: r, restaurantName: "X" }));
ok("hijaz layer differs from najd", layers[0] !== layers[1]);
ok("eastern mentions dates (Ahsa)", layers[3].includes("تمر"));
ok("all four regions produce a persona-layer header", layers.every((l) => l.includes("طبقة الشخصية")));

// --- CONTRACT: voice, never facts (the overlay must DEFER, not re-declare) ---
for (const l of layers) {
  ok("defers to engine (voice, never facts)", l.includes("never the facts") && l.includes("VOICE + hospitality only"));
  ok("menu-truth-gated pairings (never invent)", l.includes("REAL tenant menu item") && l.includes("Market knowledge ≠ menu truth"));
  ok("money still = order tools", l.includes("money still comes ONLY from the order tools"));
  ok("safety is sacred / defers to gate", l.includes("SAFETY IS SACRED") && l.includes("deterministic gate"));
  ok("karam never overrides safety", l.includes("karam NEVER softens") || l.includes("Hospitality yields to safety"));
}

// ============================================================================
// WO-KHALID-STEP1 — curated phrase-bank exemplars (5 required proofs a–e).
// (a) flag-OFF byte-identical is proven by the wiring golden
//     (scripts/proof-khalid-wiring-snapshot.test.ts) — the overlay below is only
//     appended when khalid_persona is ON, so the Wesaya flag-OFF path is untouched.
//     Here we prove the overlay-level guarantees b–e.
// ============================================================================
const najdX = buildKhalidPersonaLayer({ region: "najd", restaurantName: "X" });
const hijazX = buildKhalidPersonaLayer({ region: "hijaz", restaurantName: "X" });
const asirX = buildKhalidPersonaLayer({ region: "asir", restaurantName: "X" });
const easternX = buildKhalidPersonaLayer({ region: "eastern", restaurantName: "X" });

// --- (b) flag-ON overlay includes the curated buckets, region-aware ---------
ok("(b) overlay renders the voice-anchors sub-section", najdX.includes("voice anchors by register"));
// 11 of 12 buckets render as anchor groups; upsell_offer is RULE-ONLY (no exemplars) — its
// register label must NOT appear as an anchor line, only the offers rule in the caption.
ok("(b) ≥11 register groups render in the anchors section",
  (najdX.match(/\n {2}• /g) || []).length >= PHRASE_BUCKETS.length - 1);
ok("(b) upsell_offer is rule-only (no anchor line for it)", !najdX.includes("طرح عرض حقيقي من المحرك"));
// Codex P2 fixes are enforced here so they can never silently regress:
ok("(b) offers RULE present (never name/invent a promo)", najdX.includes("العروض (offers)") && najdX.includes("NEVER name or invent a promo"));
ok("(b) escalation RULE present (never pre-claim a handoff)", najdX.includes("تحويل لمسؤول (escalation)") && najdX.includes("REAL engine state"));
// No completed-state escalation claim leaks into any region's anchors.
for (const l of [najdX, hijazX]) {
  for (const banned of ["رفعت الملف", "نبهت المدير", "تابعت بنفسي", "الملف عند مسؤول", "الملف مفتوح ومتابع", "عرض الأسبوع", "عرض الصباح"]) {
    ok(`(b) no fact/state-asserting anchor «${banned}»`, !l.includes(banned));
  }
}
// Najdi core phrases present for najd; a Najdi-distinct greeting is there…
ok("(b) najd overlay carries a Najdi anchor", najdX.includes("هلا والله، منور."));
// …and the Hijazi-distinct greeting is NOT in the najd overlay.
ok("(b) najd overlay does NOT carry a Hijazi-distinct anchor", !najdX.includes("إيش نقدّم لك اليوم؟"));
// hijaz draws the Hijazi set.
ok("(b) hijaz overlay carries a Hijazi anchor", hijazX.includes("إيش نقدّم لك اليوم؟"));
ok("(b) hijaz overlay does NOT carry a Najdi-distinct anchor", !hijazX.includes("هلا والله، منور."));
// najd/asir/eastern all draw the Najdi core.
ok("(b) asir draws the Najdi core", asirX.includes("هلا والله، منور."));
ok("(b) eastern draws the Najdi core", easternX.includes("هلا والله، منور."));

// --- (c) PURITY: no Egyptian/Levantine marker + no placeholder in the anchors
// Scoped to the CURATED anchors (the pre-existing region "note" intentionally
// references «كيفك» as a register Khalid UNDERSTANDS — that is not a curated anchor).
// Word-boundary aware (Arabic): «بدي» must not match بديل/أبدي/نبي, etc.
const AR = "\\u0600-\\u06FF";
const BANNED = ["عايز", "دلوقتي", "يا فندم", "كيفك", "بدي", "هلق", "معلش", "ازيك", "إزيك"];
const joined = CURATED_EXEMPLARS.join("\n");
for (const w of BANNED) {
  const re = new RegExp(`(?<![${AR}])${w}(?![${AR}])`, "u");
  ok(`(c) purity: no Levantine/Egyptian marker «${w}» in curated anchors`, !re.test(joined));
}
ok("(c) no {brand}/{ticket_id} placeholder leaks into the curated anchors",
  !CURATED_EXEMPLARS.some((p) => p.includes("{brand}") || p.includes("{ticket_id}") || p.includes("{")));
ok("(c) no raw brace placeholder in the rendered overlay (najd)", !/\{brand\}|\{ticket_id\}/.test(najdX));
ok("(c) no raw brace placeholder in the rendered overlay (hijaz)", !/\{brand\}|\{ticket_id\}/.test(hijazX));
// VOICE-only discipline: no curated anchor carries a currency/price token.
ok("(c) no currency/price token in any curated anchor",
  !CURATED_EXEMPLARS.some((p) => /ر\.\s?س|ريال|SAR|SR\b|\$|٪|%/.test(p)));

// --- (d) DETERMINISM: same ctx → same string (pure function) -----------------
// Two separate calls into consts (not a literal self-compare — avoids a linter
// noSelfCompare false positive) prove the function is pure/deterministic.
const detA = buildKhalidPersonaLayer({ region: "najd", restaurantName: "مطعم الديرة" });
const detB = buildKhalidPersonaLayer({ region: "najd", restaurantName: "مطعم الديرة" });
ok("(d) determinism: identical ctx → byte-identical overlay", detA === detB);
ok("(d) determinism holds for hijaz too",
  buildKhalidPersonaLayer({ region: "hijaz", restaurantName: "X" }) === hijazX);

// --- (e) safety/deferral lines still present, and SAFETY stays TERMINAL ------
for (const l of [najdX, hijazX, asirX, easternX]) {
  ok("(e) SAFETY IS SACRED still present", l.includes("SAFETY IS SACRED") && l.includes("deterministic gate"));
  ok("(e) defers to engine still present", l.includes("never the facts"));
  ok("(e) anchors caption reasserts voice-not-facts", l.includes("comes ONLY from the engine + tools, NEVER from these lines"));
  // SAFETY IS SACRED remains AFTER the exemplars (safety is the terminal word).
  ok("(e) exemplars precede the SAFETY line (safety stays terminal)",
    l.indexOf("voice anchors by register") < l.indexOf("SAFETY IS SACRED"));
}

// --- (f) SOURCE-OF-TRUTH LINKAGE: every curated anchor exists VERBATIM in the bank --
// Proves the exemplars were curated FROM the YAML banks (no fabrication, no drift). A
// future edit to either side that breaks the link fails here.
const here = dirname(fileURLToPath(import.meta.url));
function bankPhrases(file: string): { set: Set<string>; lines: number } {
  const raw = readFileSync(join(here, "..", "lib", "ai", "personas", "phrase-bank", file), "utf8");
  const set = new Set<string>();
  let lines = 0;
  for (const m of raw.matchAll(/^\s*text:\s*"(.+)"\s*$/gm)) { set.add(m[1]); lines++; }
  return { set, lines };
}
const naj = bankPhrases("najdi.yaml");
const hij = bankPhrases("hijazi.yaml");
const najdiBank = naj.set, hijaziBank = hij.set;
// 720 entries each (60×12); unique count is a bit lower because a few phrases recur
// across buckets — the membership checks below are the real source-of-truth guard.
ok("(f) bank parsed: 720 Najdi entries", naj.lines === 720);
ok("(f) bank parsed: 720 Hijazi entries", hij.lines === 720);
for (const b of PHRASE_BUCKETS) {
  for (const p of NAJDI_EXEMPLARS[b]) ok(`(f) Najdi anchor in bank: «${p}»`, najdiBank.has(p));
  for (const p of HIJAZI_EXEMPLARS[b]) ok(`(f) Hijazi anchor in bank: «${p}»`, hijaziBank.has(p));
}

// ============================================================================
// WO-KHALID-STEP3 — sharpened dialect/style prompt RULES (overlay text only).
// (flag-OFF byte-identical is proven by the wiring golden — the overlay only renders
//  when khalid_persona is ON; here we prove the rules are present, terminal-safe, and
//  the rule text itself is leakage-clean and agrees with the Step-2 linter.)
// ============================================================================
function styleSection(o: string): string {
  const s = o.indexOf("STYLE RULES");
  const e = o.indexOf("- SAFETY IS SACRED");
  return s >= 0 && e > s ? o.slice(s, e) : "";
}
for (const l of [najdX, hijazX, asirX, easternX]) {
  // (b) the sharpened rule sections are all present.
  ok("(step3) STYLE RULES section present", l.includes("STYLE RULES"));
  ok("(step3) LENGTH rule present", l.includes("LENGTH:") && l.includes("1–3 short sentences"));
  ok("(step3) LIGHT-MIRROR rule present + precise", l.includes("LIGHT-MIRROR") && l.includes("ONE or TWO cues per reply at MOST"));
  ok("(step3) LIGHT-MIRROR forbids full-switch/MSA/Egyptian/Levantine",
    l.includes("NEVER switch fully to Hijazi") && l.includes("NEVER to MSA") && l.includes("Egyptian, Levantine, or Iraqi"));
  ok("(step3) REGISTER BANS present (no فندم/حضرتك/سيادتكم)",
    l.includes("REGISTER BANS") && l.includes("فندم") && l.includes("حضرتك") && l.includes("سيادتكم"));
  ok("(step3) RELIGIOUS-PHRASE BUDGET present (~1/turn, no chains)",
    l.includes("RELIGIOUS-PHRASE BUDGET") && l.includes("ONE per turn") && l.includes("caricature"));
  ok("(step3) EMOJI restraint present", l.includes("EMOJI:") && l.includes("NONE on a serious apology"));
  ok("(step3) TONE modulation present (happy/delay/complaint/VIP)",
    l.includes("TONE:") && l.includes("happy path") && l.includes("Mild delay") && l.includes("Real complaint") && l.includes("VIP"));
  // (constraint) escalation still DEFERS to the engine — never self-authorized.
  ok("(step3) complaint→escalate defers to engine (no self-authorize)",
    l.includes("escalate ONLY when the ENGINE's criteria are met") && l.includes("NEVER self-authorize a handoff"));
  // (constraint) STYLE precedes the TERMINAL safety line.
  ok("(step3) STYLE rules precede the terminal SAFETY line",
    l.indexOf("STYLE RULES") < l.indexOf("SAFETY IS SACRED"));
  // (alignment) the rules point at the SAME target as the Step-2 linter.
  ok("(step3) rules reference the Step-2 leakage-linter (same target)", l.includes("Step-2 leakage-linter"));
  // (alignment) the rule text does NOT ban a word the linter treats as NATIVE (خالص/شلونك).
  ok("(step3) rule text does not ban the linter-native «خالص»", !styleSection(l).includes("خالص"));
  ok("(step3) rule text does not ban the linter-native «شلونك»", !styleSection(l).includes("شلونك"));
  // (purity) run the Step-2 linter over the NEW rule text — must be leakage-clean.
  ok("(step3) STYLE rule text is leakage-clean (Step-2 linter)", findLeakage(styleSection(l)).ok);
}
// determinism already covered above; re-confirm the STYLE section is stable (two-const,
// lint-safe — not a literal self-compare).
const styleA = styleSection(buildKhalidPersonaLayer({ region: "najd", restaurantName: "X" }));
const styleB = styleSection(buildKhalidPersonaLayer({ region: "najd", restaurantName: "X" }));
ok("(step3) determinism: STYLE section identical across two builds", styleA === styleB && styleA.length > 0);

console.log(`\nKHALID-PERSONA UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
