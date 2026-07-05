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

console.log(`\nKHALID-PERSONA UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
