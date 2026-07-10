// ============================================================================
// WO-COMPANION-W1-CORE — allergen-companion-flow unit suite. Pure decisions +
// authored texts (spec §1a, §5, §6, §1e). Also enforces the §0 red line: NO
// authored companion text may ever contain a banned safety phrase.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/test-allergen-companion-flow.test.ts
// ============================================================================

import {
  decideCompanionAction,
  emergencyReply,
  recoveryReply,
  recoveryChoiceTitles,
  buildCheckpointRecap,
  truthStatePhrase,
  isEmergencyClassHold,
  emergencyEscalationReason,
  isExplicitContinueChoice,
  isExplicitRealertChoice,
  EMERGENCY_HOLD_MARKER,
} from "../lib/ai/allergen-companion-flow.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ── §1a MENTION path ────────────────────────────────────────────────────────
{
  const d = decideCompanionAction("عندي حساسية من المكسرات", null);
  ok("mention: path=mention", d.path === "mention");
  ok("mention: does NOT escalate (keep talking)", d.escalate === false);
  ok("mention: no SYSTEM_HOLD", d.systemHold === false);
  ok("mention: not emergency-class", d.emergencyClass === false);
  ok("mention: offers human once", d.offerHuman === true);
  ok("mention: captures the named allergen in the note", d.note.includes("مكسرات"));
  ok("mention: audit kind = mention", d.auditKind === "mention");
}

// Monotonic union across a session — a second allergen ADDS, never drops the first.
{
  const d1 = decideCompanionAction("عندي حساسية من البيض", null);
  const d2 = decideCompanionAction("وكمان حساسية من المكسرات", d1.note);
  ok("union: keeps the first allergen", d2.note.includes("بيض"));
  ok("union: adds the second allergen", d2.note.includes("مكسرات"));
}

// ── §5 EMERGENCY path ───────────────────────────────────────────────────────
{
  const d = decideCompanionAction("حلقي يتورم وما أقدر أتنفس", null);
  ok("emergency: path=emergency", d.path === "emergency");
  ok("emergency: ALWAYS escalates", d.escalate === true);
  ok("emergency: SYSTEM_HOLD", d.systemHold === true);
  ok("emergency: emergency-class (non-resumable)", d.emergencyClass === true);
  ok("emergency: does NOT offer a keep-going path", d.offerHuman === false);
  ok("emergency: audit kind = emergency", d.auditKind === "emergency");
  ok("emergency: carries a label", !!d.emergencyLabel);
}

// Emergency WINS over a co-stated mention; preserves an existing specific note.
{
  const prior = decideCompanionAction("عندي حساسية من الفول السوداني", null).note;
  const d = decideCompanionAction("صار لي تحسس الحين ونفسي ضاق", prior);
  ok("emergency wins even with a prior mention", d.path === "emergency");
  ok("emergency preserves the earlier specific allergen note", d.note.includes("فول سوداني"));
  ok("emergency does NOT dilute the note with a generic label", !/حساسية:\s*فول سوداني، حساسية/.test(d.note));
}

// ── §1e·d emergency-class marker round-trips ────────────────────────────────
{
  const reason = emergencyEscalationReason("انسداد الحلق");
  ok("emergency reason carries the marker", reason.includes(EMERGENCY_HOLD_MARKER));
  ok("isEmergencyClassHold true on an emergency reason", isEmergencyClassHold(reason) === true);
  ok("isEmergencyClassHold false on a plain reason", isEmergencyClassHold("سلامة الحساسية: يحتاج تأكيد المطبخ") === false);
  ok("isEmergencyClassHold false on null", isEmergencyClassHold(null) === false);
}

// ── §1e·a explicit affirmative — conservative, never inferred ────────────────
ok("continue: explicit 'أكمل مع كيفو' → true", isExplicitContinueChoice("أكمل مع كيفو") === true);
ok("continue: explicit 'كمّل معك' → true", isExplicitContinueChoice("كمّل معك") === true);
ok("continue: 'continue with Kivo' → true", isExplicitContinueChoice("continue with kivo") === true);
ok("continue: negated 'لا تكمل' → false", isExplicitContinueChoice("لا تكمل") === false);
ok("continue: ambiguous 'تمام' → false (never inferred)", isExplicitContinueChoice("تمام") === false);
ok("continue: empty → false", isExplicitContinueChoice("") === false);
ok("realert: 'نبّه الفريق' → true", isExplicitRealertChoice("نبّه الفريق مرة ثانية") === true);
ok("realert: 'أبي أكلم موظف' → true", isExplicitRealertChoice("أبي أكلم موظف") === true);

// ── §6 checkpoint recap ─────────────────────────────────────────────────────
{
  const recap = buildCheckpointRecap(["بيض", "مكسرات"], [{ name: "برجر", state: "unknown" }], "saudi");
  ok("checkpoint: lists all allergens", recap.includes("بيض") && recap.includes("مكسرات"));
  ok("checkpoint: names the dish", recap.includes("برجر"));
  ok("checkpoint: requires an explicit acknowledgement", /اكتب لي تأكيدك/.test(recap));
  ok("checkpoint: offers the human on uncertainty", /موظف/.test(recap));
}
ok("truthState clear_verified is a DATA statement, not a guarantee", /ما يظهر فيها/.test(truthStatePhrase("clear_verified", "saudi")));

// ── §0 RED LINE — NO authored companion text contains a banned safety phrase ──
{
  const authored: string[] = [
    emergencyReply("saudi"), emergencyReply("egyptian"),
    recoveryReply("saudi"), recoveryReply("egyptian"),
    recoveryChoiceTitles("saudi").realert, recoveryChoiceTitles("saudi").continue,
    recoveryChoiceTitles("egyptian").realert, recoveryChoiceTitles("egyptian").continue,
    buildCheckpointRecap(["مكسرات"], [{ name: "بروست", state: "unknown" }], "saudi"),
    buildCheckpointRecap(["مكسرات"], [{ name: "بروست", state: "clear_verified" }], "egyptian"),
    ...(["contains", "clear_verified", "clear_prep_unknown", "severe_shared_risk", "unknown"] as const).flatMap(
      (s) => [truthStatePhrase(s, "saudi"), truthStatePhrase(s, "egyptian")]
    ),
  ];
  let clean = true;
  for (const t of authored) {
    const hits = scanBannedAllergyPhrases(t);
    if (hits.length) { clean = false; console.error("    banned phrase in authored text:", JSON.stringify(hits), "→", t); }
  }
  ok("NO authored companion text contains a §0 banned safety phrase", clean);
  // The emergency reply never reassures («كل شيء بيكون تمام» is banned by §5).
  ok("emergency reply carries no false reassurance", !/كل شي.?ء? بيكون تمام|تمام إن شاء/.test(emergencyReply("saudi")));
}

console.log(`\nALLERGEN-COMPANION-FLOW UNIT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
