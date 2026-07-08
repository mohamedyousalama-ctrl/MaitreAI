// ============================================================================
// WO-KHALID-WIRING — byte-identical snapshot regression gate.
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-khalid-wiring-snapshot.test.ts
// Regenerate the golden (ONLY from pre-change code): GEN_GOLDEN=1 <same command>
//
// The permanent guarantee: for a flag-OFF tenant, buildCustomerAgentSystemPrompt
// produces a prompt BYTE-IDENTICAL to the pre-wiring golden — so the Khalid wiring
// can NEVER perturb Karim's live prompt (the path Wesaya's real conversations run
// through) while khalid_persona is OFF. Flag ON appends the persona overlay +
// playbooks at the end ONLY (proven additive by startsWith).
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";

const GOLDEN = resolve(process.cwd(), "scripts/fixtures/khalid-off-prompt.golden.txt");

// A stable, minimal-but-valid flag-OFF context (KSA/saudi tenant — the الديرة shape).
// The ONLY variable across the assertions below is the khalid_persona wiring.
function baseCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect: "saudi",
    menuItems: [],
    modifiers: [],
    branches: [],
    deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [],
    aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live",
    isOpen: true,
    autoAccept: false,
    personaName: "خالد",
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const offPrompt = buildCustomerAgentSystemPrompt(baseCtx() as any);

// ── Golden generation mode (run ONLY against pre-change code) ──
if (process.env.GEN_GOLDEN === "1") {
  writeFileSync(GOLDEN, offPrompt);
  console.log(`golden written: ${offPrompt.length} bytes → ${GOLDEN}`);
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

const golden = readFileSync(GOLDEN, "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onPrompt = buildCustomerAgentSystemPrompt(baseCtx({ khalidPersona: true, ksaRegion: "najd" }) as any);

// THE gate: flag-OFF is byte-identical to the pre-wiring baseline.
ok("flag-OFF prompt is BYTE-IDENTICAL to the pre-change golden", offPrompt === golden);
ok("flag-OFF contains NO Khalid persona-layer marker", !offPrompt.includes("طبقة الشخصية"));
// WO-KHALID-STEP1 (proof a, semantic): the curated voice anchors NEVER reach the
// flag-OFF (Wesaya) path — neither the sub-section marker nor a sample curated phrase.
ok("STEP1: flag-OFF has NO voice-anchors sub-section", !offPrompt.includes("voice anchors by register"));
ok("STEP1: flag-OFF has NO curated anchor phrase", !offPrompt.includes("هلا والله، منور."));

// Flag-ON behaves: additive-only (appended at the very end), overlay present.
ok("flag-ON differs from flag-OFF", onPrompt !== offPrompt);
ok("flag-ON is ADDITIVE — starts with the EXACT flag-OFF prompt (nothing above changed)", onPrompt.startsWith(offPrompt));
ok("flag-ON is strictly longer (content appended)", onPrompt.length > offPrompt.length);
ok("flag-ON contains the Khalid persona-layer marker", onPrompt.includes("طبقة الشخصية"));
// WO-KHALID-STEP1: flag-ON DOES carry the curated voice anchors (najd shown here;
// the region-aware hijaz check is below, after onHijazi is built).
ok("STEP1: flag-ON carries the voice-anchors sub-section", onPrompt.includes("voice anchors by register"));
ok("STEP1: flag-ON najd carries a Najdi curated anchor", onPrompt.includes("هلا والله، منور."));
// ORDER (Khalid-window verified, pinned permanently): the persona layer is injected
// BEFORE the playbooks — persona@ < playbooks@ in the rendered prompt.
const personaIdx = onPrompt.indexOf("طبقة الشخصية");
const playbooksIdx = onPrompt.indexOf("دفاتر خالد");
ok("flag-ON ORDER: persona layer precedes playbooks (persona@ < playbooks@)",
  personaIdx >= 0 && playbooksIdx >= 0 && personaIdx < playbooksIdx);

// Region resolution flows through (najd default label present in the ON overlay).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onHijazi = buildCustomerAgentSystemPrompt(baseCtx({ khalidPersona: true, ksaRegion: "hijaz" }) as any);
ok("flag-ON region is honored (najd vs hijaz overlays differ)", onHijazi !== onPrompt);
ok("flag-ON hijaz still additive over OFF", onHijazi.startsWith(offPrompt));
// WO-KHALID-STEP1: region-aware curation — hijaz carries the Hijazi anchor, not the Najdi one.
ok("STEP1: flag-ON hijaz carries a Hijazi curated anchor", onHijazi.includes("إيش نقدّم لك اليوم؟"));
ok("STEP1: flag-ON hijaz does NOT carry the Najdi-distinct anchor", !onHijazi.includes("هلا والله، منور."));

// ── WO-ENCYCLOPEDIA (spec §5/§6 properties 8, 9, 10) ──
const SENTINEL = "the eval suite asserts against your outputs.";
// End-anchor holds even WITHOUT the encyclopedia (persona ON, encyclopedia OFF).
ok("ENC: persona ON but ksa_encyclopedia OFF → NO encyclopedia block", !onPrompt.includes("ثقافة السوق"));
ok("ENC end-anchor: prompt ENDS on the forbidden-claims sentinel (no encyclopedia)", onPrompt.trimEnd().endsWith(SENTINEL));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onEnc = buildCustomerAgentSystemPrompt(baseCtx({ khalidPersona: true, ksaRegion: "najd", ksaEncyclopedia: true, ksaCuisineTags: ["rice-dish", "najdi"] }) as any);
const pI = onEnc.indexOf("طبقة الشخصية");
const eI = onEnc.indexOf("ثقافة السوق");
const bI = onEnc.indexOf("دفاتر خالد");
ok("ENC: encyclopedia block present when BOTH flags on", eI >= 0);
ok("ENC ORDER (§8): persona < encyclopedia < playbooks", pI >= 0 && eI >= 0 && bI >= 0 && pI < eI && eI < bI);
ok("ENC end-anchor (§8): prompt STILL ENDS on the forbidden-claims sentinel", onEnc.trimEnd().endsWith(SENTINEL));
ok("ENC additive (§9): flag-ON+encyclopedia still starts with the EXACT flag-OFF prompt", onEnc.startsWith(offPrompt));
// Property 10 — no price / no clearance in the encyclopedia block (slice enc→playbooks).
const encBlock = onEnc.slice(eI, bI);
ok("ENC no-price (§10): encyclopedia block has no currency token", !/ر\.\s?س|ريال|SAR|SR\b|\$|ج\.م/.test(encBlock));
ok("ENC no-clearance (§10): encyclopedia block never renders allergens_note", !/allergens_note|Cultural note only|حساسية آمن/.test(encBlock));
// Property 9 — hard dependency: ksa_encyclopedia ON while khalid_persona OFF → byte-identical golden.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encNoPersona = buildCustomerAgentSystemPrompt(baseCtx({ khalidPersona: false, ksaEncyclopedia: true, ksaCuisineTags: ["rice-dish"] }) as any);
ok("ENC hard-dependency (§9): encyclopedia ON but persona OFF → prompt byte-identical to golden", encNoPersona === golden);

console.log(`\nKHALID-WIRING SNAPSHOT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
