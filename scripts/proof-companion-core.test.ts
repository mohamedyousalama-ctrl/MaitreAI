// ============================================================================
// WO-COMPANION-W1-CORE — the behavioral-core proof. RED-FIRST by construction:
// this file imports the CORE symbols (decideCompanionAction / decideRecoveryAction /
// the prompt swap / the companion-effects wiring) that DO NOT EXIST on the
// foundation-only branch — so on foundation the import throws and every leg is RED.
// After the core lands, all legs pass.
//
// Covers: the wife-case 3 legs (innocent → zero allergy behavior; real mention
// flag-ON → acknowledge+note+offer-once+escalate:false, no banned phrase;
// SYSTEM_HOLD + new message → recovery reply, NOT skipped_takeover), the ticket-
// banner invariant BOTH WAYS, the §0 banned-phrase scan over authored texts, and
// the flag-OFF byte-identical guarantee (legacy block preserved verbatim).
//
// Run: node --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types \
//        scripts/proof-companion-core.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCustomerAgentSystemPrompt } from "../lib/ai/prompt.ts";
import { legacyAllergyBlock } from "../lib/ai/prompt-allergy.ts";
import { detectAllergenAvoidance } from "../lib/ai/allergen-gate.ts";
import { detectAllergenEmergency } from "../lib/ai/allergen-emergency.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import {
  decideCompanionAction,
  decideRecoveryAction,
  emergencyEscalationReason,
  emergencyReply,
  recoveryReply,
  companionBannedRewriteReply,
  buildCheckpointRecap,
} from "../lib/ai/allergen-companion-flow.ts";
import { buildKitchenTicketSvg, type ReceiptData } from "../lib/render/receipt.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseCtx(overrides: Record<string, unknown> = {}): any {
  return {
    profile: { name: "مطعم الديرة", currency: "ر.س", timezone: "Asia/Riyadh", businessType: "restaurant" },
    dialect: "saudi", menuItems: [], modifiers: [], branches: [], deliveryAreas: [],
    policies: { refund: "", cancellation: "", delivery: "", replacement: "", payment: "" },
    faqs: [], aiTone: { personality: "friendly", responseLength: "short", emojiUsage: "minimal", language: "ar", greeting: "" },
    mode: "live", isOpen: true, autoAccept: false, personaName: "خالد",
    ...overrides,
  };
}

// ══ LEG 1 — INNOCENT → ZERO allergy behavior (wife-case regression) ══════════
// Clearly-innocent sentences (no allergy) must NOT fire the entry gate, so the
// companion path is never entered — no note, no escalate, no audit.
{
  const innocent = [
    "زوجتي تحب المكسرات وتبي تطلب صحن",
    "نبغى نطلب عشاء لي ولزوجتي",
    "زوجتي جالسة معي، أبي برجرين",
    "ودي أفاجئ زوجتي بحلى الليلة",
  ];
  let allClean = true;
  for (const m of innocent) {
    const entered = detectAllergenAvoidance(m).fired || detectAllergenEmergency(m).fired;
    if (entered) { allClean = false; console.error("    innocent sentence wrongly entered companion:", m); }
  }
  ok("LEG1: innocent wife sentences → ZERO allergy behavior (no companion entry)", allClean);
}

// ══ LEG 2 — REAL mention flag-ON → acknowledge + note + offer-once + escalate:false ══
{
  const d = decideCompanionAction("زوجتي عندها حساسية من المكسرات", null);
  ok("LEG2: mention path (not emergency)", d.path === "mention");
  ok("LEG2: escalate:false — keep talking (NOT the legacy forced handoff)", d.escalate === false);
  ok("LEG2: note captures the allergen (kitchen-readable)", d.note.includes("مكسرات"));
  ok("LEG2: offers the human ONCE (§1a.4)", d.offerHuman === true);
  // The flag-ON prompt SWAPS to the companion block and instructs acknowledge + offer-once.
  const on = buildCustomerAgentSystemPrompt(baseCtx({ allergyCompanion: true }));
  ok("LEG2: flag-ON prompt swaps to the companion block", on.includes("COMPANION MODE") && !on.includes("HIGH STAKES"));
  ok("LEG2: companion block instructs acknowledge on mention", /ACKNOWLEDGE IT THE MOMENT/.test(on));
  ok("LEG2: companion block offers the human ONCE", /OFFER THE HUMAN ONCE/.test(on));
  // No banned §0 phrase in ANY deterministic companion text on the mention path.
  const authored = [
    companionBannedRewriteReply("saudi"), companionBannedRewriteReply("egyptian"),
    buildCheckpointRecap(["مكسرات"], [{ name: "برجر", state: "unknown" }], "saudi"),
    emergencyReply("saudi"), recoveryReply("saudi"),
  ];
  ok("LEG2: NO banned §0 phrase in the authored companion texts",
    authored.every((t) => scanBannedAllergyPhrases(t).length === 0));
}

// ══ LEG 3 — SYSTEM_HOLD + new customer message → RECOVERY reply, NOT silence ══
{
  const action = decideRecoveryAction({
    ownershipState: "SYSTEM_HOLD", escalationReason: "سلامة الحساسية: يحتاج تأكيد المطبخ",
    isIdle: true, recoveryPending: false, messageText: "في حد يرد؟", interactiveId: null,
  });
  ok("LEG3: pending-human + new msg → send_question (never silence/skipped_takeover)", action === "send_question");
  // §1e·d — an EMERGENCY-class hold is NEVER customer-resumable.
  const emg = decideRecoveryAction({
    ownershipState: "SYSTEM_HOLD", escalationReason: emergencyEscalationReason("انسداد الحلق"),
    isIdle: false, recoveryPending: true, messageText: "أكمل مع كيفو", interactiveId: null,
  });
  ok("LEG3: emergency hold + explicit continue → emergency_held (NEVER resumes)", emg === "emergency_held");
  // The executor returns the recovery result (not skipped_takeover) when it replies.
  const ras = read("lib/messaging/respond-and-send.ts");
  ok("LEG3: respond-and-send returns the recovery reply (not skipped_takeover)",
    /if \(rec\.kind === "reply"\) return rec\.result/.test(ras));
  ok("LEG3: recovery is invoked in the pending-human branch",
    /handleAllergyRecovery\(admin,/.test(ras));
}

// ══ TICKET-BANNER INVARIANT — BOTH WAYS ══════════════════════════════════════
// The minimal ReceiptData for a kitchen ticket.
const ticket = (over: Partial<ReceiptData>): ReceiptData => ({
  restaurantName: "مطعم الديرة", orderNumber: "#1042", fulfillment: "pickup",
  items: [{ name: "برجر", quantity: 1, modifiers: [], total: 30 }],
  subtotal: 30, deliveryFee: 0, total: 30, currency: "ر.س", ...over,
});
{
  // Forward: an allergy note on the order → the banner shows the SPECIFIC allergens.
  const svg = buildKitchenTicketSvg(ticket({ safetyHold: true, allergyNote: "⚠️ حساسية: بيض، مكسرات" })).svg;
  ok("TICKET: banner renders the specific allergens (kitchen-readable)", svg.includes("بيض") && svg.includes("مكسرات"));
  // Reverse: NO configuration where an allergy-mentioned order's ticket lacks the note.
  const load = read("lib/render/load.ts");
  ok("TICKET: load.ts — an allergy_note ALWAYS trips the safety banner", /safetyHold =[\s\S]*allergyNote\.length > 0/.test(load));
  ok("TICKET: load.ts passes the note text through to the renderer", /allergyNote: allergyNote \|\| undefined/.test(load));
  const oc = read("lib/db/orders-create.ts");
  ok("TICKET: order-create copies the session note onto the order at create", /allergy_note: allergyNote/.test(oc));
  const eff = read("lib/db/allergy-companion-effects.ts");
  ok("TICKET: a post-commit mention stamps orders.allergy_note (closes the invariant)", /allergy_note: decision\.note/.test(eff));
}

// ══ FLAG-OFF BYTE-IDENTICAL — the legacy block is preserved verbatim ═════════
{
  const off = buildCustomerAgentSystemPrompt(baseCtx());
  ok("FLAG-OFF: keeps the legacy allergy block (HIGH STAKES), not the companion one",
    off.includes("HIGH STAKES") && !off.includes("COMPANION MODE"));
  ok("FLAG-OFF: the legacy block appears in the prompt VERBATIM", off.includes(legacyAllergyBlock()));
}

console.log(`\nWO-COMPANION-CORE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
