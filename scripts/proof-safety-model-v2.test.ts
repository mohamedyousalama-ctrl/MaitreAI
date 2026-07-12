// ============================================================================
// WO-SAFETY-MODEL-V2 — the P0 abolition proof. RED-FIRST by construction: this file
// imports `repairBannedAllergyReply` + `companionNeutralRepairLine` — symbols that DO
// NOT EXIST on origin/main — so on the old tree the ESM link fails and every leg is RED.
// After the change lands, all legs pass.
//
// The new law (founder, out-loud): a §0 banned-phrase trip NEVER holds and NEVER forces
// escalation. The draft is REPAIRED deterministically (sentence-level strip + the
// ratified neutral line + a re-scan double-lock) and the reply SENDS — the conversation
// always flows. Escalation is reserved ONLY for a human request or a §6 checkpoint
// decline; «إيقاف للسلامة» stays a manual staff action; §5 emergency is unaffected.
//
// Binding invariants asserted here: §0 scanner UNTOUCHED (never-say-safe absolute),
// §5 emergency still SYSTEM_HOLDs, §6 checkpoint intact, human-request escalation intact,
// flag-OFF byte-identical (legacy block preserved when companion is off).
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-safety-model-v2.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import {
  repairBannedAllergyReply,
  companionNeutralRepairLine,
  decideCompanionAction,
  buildCheckpointRecap,
} from "../lib/ai/allergen-companion-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — the RATIFIED neutral line (ruling 3) is §0 banned-clean ═══════════
{
  const eg = companionNeutralRepairLine("egyptian");
  const kh = companionNeutralRepairLine("saudi"); // Khalid/KSA variant
  ok("LEG1: egyptian neutral line is EXACTLY the ratified Option A",
    eg === "صحتك تهمنا 🙏 ماقدرش أأكد من نفسي إن الصنف مناسب لحساسيتك — الملاحظة واصلة للمطبخ وبيتأكدوا منها. نكمل؟");
  ok("LEG1: neutral line is §0 banned-clean — egyptian", scanBannedAllergyPhrases(eg).length === 0);
  ok("LEG1: neutral line is §0 banned-clean — Khalid/KSA", scanBannedAllergyPhrases(kh).length === 0);
  ok("LEG1: the Khalid variant MIRRORS the swap (distinct dialect wording)", kh !== eg && kh.includes("مناسب لحساسيتك"));
  ok("LEG1: it uses «مناسب لحساسيتك», NOT the banned «يناسب الحساسية» bigram",
    eg.includes("مناسب لحساسيتك") && !eg.includes("يناسب الحساسية") && !kh.includes("يناسب الحساسية"));
}

// ══ LEG 2 — SENTENCE-LEVEL strip (ruling 1): keep the rest, replace the assurance ══
{
  const draft = "القائمة عندنا: برجر وبيتزا ومشروبات. الصنف ده آمن تماماً على حساسيتك.";
  const out = repairBannedAllergyReply(draft, "egyptian");
  ok("LEG2: the non-safety content SURVIVES (menu preserved)", out.includes("برجر") && out.includes("بيتزا"));
  ok("LEG2: the offending assurance sentence is GONE", !out.includes("آمن"));
  ok("LEG2: the neutral honest line is spliced in", out.includes("مناسب لحساسيتك"));
  ok("LEG2: the repaired reply is §0 banned-clean", scanBannedAllergyPhrases(out).length === 0);
}

// ══ LEG 3 — DOUBLE-LOCK (ruling 1): the final reply is ALWAYS banned-clean ═════
{
  const battery = [
    "الصنف ده آمن تماماً على حساسيتك.",              // آمن + خالي-tone
    "أكيد آمن ومضمون، اطلب براحتك.",                  // آمن + مضمون
    "الطبق يناسب الحساسية بلا قلق.",                  // the exact banned bigram
    "خالي تماماً من المكسرات، اطلب مطمئن.",            // خالي تماماً
    "it is totally safe for you, order away.",         // english «safe»
    "برجر وبيتزا. آمن. عادي ولا حار؟",                 // mixed: menu + safety + flavor «عادي»
  ];
  const allClean = battery.every((d) => scanBannedAllergyPhrases(repairBannedAllergyReply(d, "saudi")).length === 0);
  ok("LEG3: EVERY adversarial banned draft repairs to a §0 banned-clean reply", allClean);
  // Whole-reply-is-one-assurance → collapses to the neutral line alone (safe terminal).
  const solo = repairBannedAllergyReply("الصنف ده آمن.", "saudi");
  ok("LEG3: an all-assurance draft collapses to the neutral line alone",
    solo === companionNeutralRepairLine("saudi"));
  // The mixed draft keeps its menu + flavor question, drops only the assurance.
  const mixed = repairBannedAllergyReply("برجر وبيتزا. آمن. عادي ولا حار؟", "saudi");
  ok("LEG3: mixed draft keeps menu + «عادي/حار» flavor question, strips only the assurance",
    mixed.includes("برجر") && mixed.includes("حار") && !mixed.includes("آمن") && scanBannedAllergyPhrases(mixed).length === 0);
}

// ══ LEG 4 — the repair NEVER over-reaches: clean text + legit «عادي» menu pass through ══
{
  const clean = "أهلاً وسهلاً 🙏 تحب تطلب إيه النهارده؟";
  ok("LEG4: a clean reply is returned UNCHANGED (no over-strip)", repairBannedAllergyReply(clean, "egyptian") === clean);
  // «عادي» as a SIZE/price recap line is menu context (F2c exemption) — never a safety
  // assurance, so the scanner does not flag it and the repair leaves it untouched.
  const menu = "الأحجام المتوفرة: عادي بـ ١٣٠ ج ودوبل بـ ١٦٠ ج.";
  ok("LEG4: a legit «عادي» size/price line is NOT flagged (F2c exemption honored)",
    scanBannedAllergyPhrases(menu).length === 0 && repairBannedAllergyReply(menu, "egyptian") === menu);
}

// ══ LEG 5 — REPAIR-NOT-HOLD wiring in respond.ts (the live f095c714 §0 path) ═══
{
  const r = read("lib/ai/respond.ts");
  ok("LEG5: §0 block now REPAIRS via repairBannedAllergyReply", /text = repairBannedAllergyReply\(text, input\.brain\.dialect\)/.test(r));
  ok("LEG5: §0 block signal is NON-escalating audit («companion_banned_phrase_repaired»)", /companion_banned_phrase_repaired/.test(r));
  ok("LEG5: the §0 HOLD reason string is GONE (no more SYSTEM_HOLD on a §0 trip)",
    !r.includes("سلامة الحساسية (رفيق): عبارة ممنوعة"));
  // Legacy safety-claim block is COMPANION-GATED: no escalation in companion mode.
  ok("LEG5: legacy block reads the companion flag", /const companion = input\.brain\.allergyCompanion === true;/.test(r));
  ok("LEG5: legacy block does NOT escalate in companion mode", /const wantsEscalate = !companion && shouldEscalateOnSafetyClaim/.test(r));
  ok("LEG5: legacy block repairs with the neutral line in companion mode", /text = companionNeutralRepairLine\(input\.brain\.dialect\)/.test(r));
}

// ══ LEG 6 — FLAG-OFF byte-identical: the legacy escalation path is preserved ══
{
  const r = read("lib/ai/respond.ts");
  // WO-SAFETY-MODEL-V3: the safety-claim block now routes three ways (SINGLE DOOR) — the
  // §0 REPAIR path (companion neutral line) is unchanged; the transfer only happens on an
  // explicit human request, else notify_without_hold.
  ok("V3: safety-claim routes transfer↔notify_without_hold↔missing_data",
    /type: transfer \? "escalation" : wantsEscalate \? "notify_without_hold" : "missing_data"/.test(r));
  ok("V3: the EXPLICIT-request transfer variant sets ctx.escalation + safeAllergenReply",
    /if \(transfer\) \{\s*ctx\.escalation = ctx\.escalation \?\? \{ reason \};/.test(r) && /text = safeAllergenReply\(input\.brain\.dialect\)/.test(r));
  ok("FLAG-OFF: non-companion non-escalating variant still uses safeAllergenNoEscalateReply",
    /text = safeAllergenNoEscalateReply\(input\.brain\.dialect\)/.test(r));
}

// ══ LEG 7 — INVARIANTS: scanner untouched · §5 emergency · §6 checkpoint · human-req ══
{
  // §0 scanner is UNTOUCHED — never-say-safe stays absolute.
  ok("INV: scanner still bans «آمن»", scanBannedAllergyPhrases("الصنف هذا آمن").includes("آمن"));
  ok("INV: scanner still bans «يناسب الحساسية»", scanBannedAllergyPhrases("الطبق يناسب الحساسية").includes("يناسب الحساسية"));
  ok("INV: scanner still bans english «safe»", scanBannedAllergyPhrases("this is safe").includes("safe"));
  // §5 EMERGENCY is unaffected — an active reaction STILL escalates to a SYSTEM_HOLD.
  const emg = decideCompanionAction("حلقي يتورم وصعب أتنفس", null);
  ok("INV: §5 emergency STILL escalates + SYSTEM_HOLD + emergency-class",
    emg.path === "emergency" && emg.escalate === true && emg.systemHold === true && emg.emergencyClass === true);
  // A plain mention still keeps talking (companion contract) — no regression.
  const men = decideCompanionAction("عندي حساسية من البيض", null);
  ok("INV: a plain mention keeps talking (escalate:false), note captured",
    men.path === "mention" && men.escalate === false && men.note.includes("بيض"));
  // §6 CHECKPOINT intact — recap still requires ack + OFFERS the human (the decline path
  // that legitimately escalates), and respond.ts still intercepts the finalize.
  const recap = buildCheckpointRecap(["بيض"], [{ name: "برجر", state: "unknown" }], "saudi");
  ok("INV: §6 recap still offers the human + requires confirmation", /موظف/.test(recap) && /تأكيد|أكد/.test(recap));
  ok("INV: §6 recap is itself §0 banned-clean", scanBannedAllergyPhrases(recap).length === 0);
  const r = read("lib/ai/respond.ts");
  ok("INV: respond.ts still intercepts the finalize at the §6 checkpoint", /needsAllergyCheckpoint/.test(r));
  // Human-request / genuine-avoidance escalation path (allergen gate) is untouched.
  ok("INV: the genuine-avoidance escalation path (allergen gate) is intact",
    /shouldEscalateOnSafetyClaim/.test(r) && /assertsAllergenSafety/.test(r));
  // WO-SAFETY-MODEL-V3: the AUTOMATIC SYSTEM_HOLD flip is gone — a transfer now lands in
  // HUMAN_ACTIVE and only on an explicit human request; the manual «إيقاف للسلامة» lives in
  // the console operator path (conversation-store), untouched.
  const ct = read("lib/ai/customer-turn.ts");
  ok("INV: V3 SINGLE DOOR — explicit transfer → HUMAN_ACTIVE; the automatic SYSTEM_HOLD flip is gone",
    /setOwnershipState\(admin, conversationId, "HUMAN_ACTIVE"/.test(ct) &&
    !/nextOwnership = flipPatch\.is_safety_hold === true \? "SYSTEM_HOLD"/.test(ct));
}

console.log(`\nWO-SAFETY-MODEL-V2 PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
