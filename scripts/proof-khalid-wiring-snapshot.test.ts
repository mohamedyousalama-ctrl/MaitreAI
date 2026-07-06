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

// Flag-ON behaves: additive-only (appended at the very end), overlay present.
ok("flag-ON differs from flag-OFF", onPrompt !== offPrompt);
ok("flag-ON is ADDITIVE — starts with the EXACT flag-OFF prompt (nothing above changed)", onPrompt.startsWith(offPrompt));
ok("flag-ON is strictly longer (content appended)", onPrompt.length > offPrompt.length);
ok("flag-ON contains the Khalid persona-layer marker", onPrompt.includes("طبقة الشخصية"));
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

console.log(`\nKHALID-WIRING SNAPSHOT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
