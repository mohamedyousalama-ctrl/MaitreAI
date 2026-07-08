// Unit tests for the Khalid persona layer (pure, no LLM, no I/O).
// Run: node --experimental-strip-types scripts/test-khalid-persona.test.ts
//
// Asserts the persona-layer CONTRACT (see lib/ai/personas/README.md): region
// resolution (Najdi default), name fallback, and — critically — that the overlay
// text keeps "voice, never facts": it defers to the engine on truth/safety/money and
// gates every pairing on real menu truth. It does NOT test prose quality.
import {
  buildKhalidPersonaLayer,
  resolveKsaRegion,
  KHALID_DEFAULT_NAME,
  KHALID_PERSONA_ID,
  DEFAULT_KSA_REGION,
  CURATED_EXEMPLARS,
  PHRASE_BUCKETS,
} from "../lib/ai/personas/khalid.ts";
import type { KsaRegion } from "../lib/ai/personas/khalid.ts";

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
ok("(b) all 12 buckets grouped in the anchors section",
  (najdX.match(/\n {2}• /g) || []).length >= PHRASE_BUCKETS.length);
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
ok("(d) determinism: identical ctx → byte-identical overlay",
  buildKhalidPersonaLayer({ region: "najd", restaurantName: "مطعم الديرة" }) ===
  buildKhalidPersonaLayer({ region: "najd", restaurantName: "مطعم الديرة" }));
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

console.log(`\nKHALID-PERSONA UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
