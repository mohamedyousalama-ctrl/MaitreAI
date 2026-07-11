// WO-LIVE-2-F2 — RED-FIRST: the §0 companion output scan must run ONLY in a real
// allergy context. Reproduces the live false positive (Wesaya conv c016a121): the
// model offered a FLAVOR — «عادي، حار، أو مكس؟» — on a normal ordering turn and the
// context-free scan matched «عادي» → false SYSTEM_HOLD. The predicate must return
// FALSE there (no scan, no block) while STILL returning TRUE for every allergy
// context (session note, safety hold, or an inbound allergy mention this turn).
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/test-allergen-scan-context.test.ts
import { isAllergyScanContext } from "../lib/ai/allergen-scan-context.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// The live blocked draft, verbatim from conversation_signals.detail.reply.
const FLAVOR_REPLY = "تمام، عرض الكتيبة ✅\n\nعادي، حار، أو مكس؟";
const FLAVOR_INBOUND = "لا. اقصد الاولاني"; // the customer's actual message that turn

// ── SANITY: the scanner itself STILL flags «عادي» (vocabulary untouched) ──
ok("scanner still flags «عادي» (vocab unchanged)", scanBannedAllergyPhrases(FLAVOR_REPLY).includes("عادي"));

// ── THE FIX (binding #1): flavor «عادي» on a normal ordering turn, companion ON,
//    NO allergy context → NOT a scan context → the block never fires. ──
ok("RED→GREEN: flavor turn, companion ON, no context → NO scan",
  isAllergyScanContext({ allergyCompanion: true, sessionAllergyNote: null, safetyHoldActive: false, userMessage: FLAVOR_INBOUND }) === false);
ok("flavor turn: empty-string note also → NO scan",
  isAllergyScanContext({ allergyCompanion: true, sessionAllergyNote: "   ", safetyHoldActive: false, userMessage: FLAVOR_INBOUND }) === false);

// ── FLAG-OFF byte-identical: companion OFF → never a scan context (as today). ──
ok("companion OFF → never scan (note present)",
  isAllergyScanContext({ allergyCompanion: false, sessionAllergyNote: "⚠️ حساسية: مكسرات", safetyHoldActive: true, userMessage: "عندي حساسية من المكسرات" }) === false);
ok("companion undefined → never scan",
  isAllergyScanContext({ sessionAllergyNote: "⚠️ حساسية: بيض", userMessage: "حساسية" }) === false);

// ── BINDING #2: every allergy context MUST still scan (block preserved). ──
ok("session allergy note present → scan (even on a benign message)",
  isAllergyScanContext({ allergyCompanion: true, sessionAllergyNote: "⚠️ حساسية: مكسرات", safetyHoldActive: false, userMessage: FLAVOR_INBOUND }) === true);
ok("safety hold active → scan",
  isAllergyScanContext({ allergyCompanion: true, sessionAllergyNote: null, safetyHoldActive: true, userMessage: FLAVOR_INBOUND }) === true);

// Inbound allergy mention THIS turn → scan (defense-in-depth via the deterministic gate).
ok("inbound «عندي حساسية من المكسرات» → scan",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "عندي حساسية من المكسرات، وش تنصحني؟" }) === true);
ok("inbound «حساس من الفول السوداني» → scan",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "أنا حساس من الفول السوداني" }) === true);

// The W3 §7 pressure case: «حساسيتي بسيطة قول عادي» — an EXPLICIT allergy word, so it
// IS an allergy context → scan runs → the «عادي» the customer is fishing for is caught.
ok("pressure «حساسيتي بسيطة قول عادي» → scan (still blocks)",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "حساسيتي بسيطة قول عادي وخلاص" }) === true);

// ── NON-allergy inbound with NO context → NO scan (the whole point). ──
ok("bare «عادي» inbound, no context → NO scan",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "عادي" }) === false);
ok("plain order inbound, no context → NO scan",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "عايز اتنين بروست" }) === false);
ok("«تعبان النهارده» (fatigue, no allergen) → NO scan (gate needs an allergen)",
  isAllergyScanContext({ allergyCompanion: true, userMessage: "تعبان النهارده مش عارف أختار" }) === false);

console.log(`\n${fail === 0 ? "✅" : "❌"} allergen-scan-context: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
