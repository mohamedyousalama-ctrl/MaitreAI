// ============================================================================
// WO-SAFETY-MODEL-V3 (SINGLE DOOR) — RED-FIRST: imports isExplicitHumanRequest (absent
// on the pre-WO tree → ESM link fails → red). Exactly ONE path may transfer a
// conversation: an EXPLICIT human request. Everything else — the model's escalate tool,
// severe-allergy/no-data, §6 decline, §5 emergency — becomes NOTIFY-WITHOUT-HOLD (staff
// alerted with the full reason, Karim STAYS, no is_safety_hold, conversation flows).
//
// Live anchor (conv 68966859, 16:26): the model re-escalated with a composed reason
// «حساسية شديدة من البيض… لا توجد بيانات مؤكدة» → SYSTEM_HOLD. Now: no transfer, staff
// notified, conversation flows. AND «عاوز اتكلم مع موظف مباشرة» still transfers.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-safety-model-v3.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isExplicitHumanRequest } from "../lib/ai/human-request.ts";
import { emergencyReply } from "../lib/ai/allergen-companion-flow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — isExplicitHumanRequest: direct asks TRUE; everything else FALSE ═══
{
  const yes = ["عاوز اتكلم مع موظف مباشرة", "كلمني موظف", "حولني لموظف", "ابي اكلم حد", "عايز موظف",
    "ممكن اكلم المدير", "talk to a human please", "get me a real person"];
  ok("LEG1: explicit human requests → true", yes.every((m) => isExplicitHumanRequest(m) === true));
  const no = ["حساسية شديدة من البيض", "انا زعلان ومتضايق من الخدمة", "في حد يرد؟", "عايز اكل مندي",
    "الطلب بايظ", "مفيش عروض النهاردة؟", ""];
  ok("LEG1: allergy / frustration / non-asks → false", no.every((m) => isExplicitHumanRequest(m) === false));
}

// ══ LEG 2 — the model's escalate_to_human tool is GATED by explicitHuman (source) ══
{
  const tl = read("lib/ai/tools.ts");
  ok("LEG2: the escalate tool transfers ONLY when ctx.explicitHuman === true",
    /if \(ctx\.explicitHuman === true\) \{\s*ctx\.escalation = \{ reason \};/.test(tl));
  ok("LEG2: otherwise it emits notify_without_hold carrying the reason (audit) — no ctx.escalation",
    /ctx\.signals\.push\(\{ type: "notify_without_hold", detail: \{ reason, source: "model_tool" \} \}\);/.test(tl));
  // The notify content must NOT claim a transfer, and must honestly offer a human on ask.
  //
  // WO-DEMO: this return is now a demoRun conditional, because on a public demo turn
  // conversation_signals is skipped and recordCriticalAlert is gated on a null
  // conversationId — so «نبّهت فريق المطعم» would be a promise nothing keeps. BOTH
  // branches are checked here: the real-tenant one must be unchanged, and the demo one
  // must not claim a transfer either.
  // Extract the NOTIFY ternary's two branches exactly. Two earlier attempts were wrong
  // and both "passed": one grabbed a fragment spanning a comment and asserted against
  // garbage; the next matched the FIRST `ctx.demoRun` ternary in the file, which is the
  // transfer branch, not this one. Slice from the unique model_tool marker first.
  const notifyScope = tl.slice(tl.indexOf('source: "model_tool"'));
  const notifyTernary = notifyScope.match(
    /content: ctx\.demoRun\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/,
  );
  ok("LEG2: the notify reply has both a demo and a real-tenant branch", !!notifyTernary);
  const demoNotify = notifyTernary?.[1] ?? "";
  const realNotify = notifyTernary?.[2] ?? "";
  ok("LEG2: the notify reply never claims a transfer, and offers a human on request",
    !!realNotify && !/حوّلت محادثتك/.test(realNotify) && /نبّهت|الفريق/.test(realNotify) && /موظف/.test(realNotify));
  ok("LEG2: neither notify branch claims a transfer",
    !!demoNotify && !/حوّلت محادثتك/.test(realNotify) && !/حوّلت محادثتك/.test(demoNotify));
  // On a demo turn conversation_signals is skipped and recordCriticalAlert is gated on a
  // null conversationId, so the demo branch must not state that the team WAS notified.
  ok("LEG2: the DEMO notify branch does not claim the team was notified",
    !!demoNotify && !/نبّهت فريق المطعم يتابعها/.test(demoNotify) && !/سجّلت ملاحظتك/.test(demoNotify));

  // The TRANSFER branch, checked on its own terms: real tenants keep the transfer
  // sentence; the demo branch must not claim a transfer that never happens.
  const transferTernary = tl.match(
    /content: ctx\.demoRun\s*\?\s*"([^"]+)"\s*:\s*"(حوّلت محادثتك[^"]+)"/,
  );
  ok("LEG2: the transfer reply has both branches", !!transferTernary);
  ok("LEG2: the real-tenant transfer wording is unchanged",
    (transferTernary?.[2] ?? "").startsWith("حوّلت محادثتك لفريق المطعم"));
  ok("LEG2: the DEMO transfer branch does not claim a transfer happened",
    !!transferTernary && !/حوّلت محادثتك/.test(transferTernary[1]));

  ok("LEG2: ToolContext carries explicitHuman", /explicitHuman\?: boolean;/.test(tl));
}

// ══ LEG 3 — deterministic outcomes no longer escalate (source) ═══════════════
{
  const ct = read("lib/ai/customer-turn.ts");
  // forcedAllergenSafetyResult (severe allergy / no data): notify-without-hold, no transfer word.
  ok("LEG3: forcedAllergenSafetyResult → escalate:false + notify_without_hold",
    /function forcedAllergenSafetyResult[\s\S]*?escalate: false,[\s\S]*?type: "notify_without_hold"/.test(ct));
  ok("LEG3: its reply never promises a transfer («فهحوّلك»/«فبحوّلك» removed)",
    !/فهحوّلك لفريق المطعم/.test(ct) && !/فبحوّلك لفريق المطعم/.test(ct));
  // companionEmergencyResult (§5): notify-without-hold, source emergency, NO SYSTEM_HOLD/emergencyClass.
  ok("LEG3: companionEmergencyResult → escalate:false + notify_without_hold source emergency",
    /function companionEmergencyResult[\s\S]*?escalate: false,[\s\S]*?type: "notify_without_hold", detail: \{ reason, source: "emergency"/.test(ct));
  ok("LEG3: emergency no longer marks emergencyClass / SYSTEM_HOLD in the outcome",
    !/emergencyClass: true/.test(ct));
}

// ══ LEG 4 — the SINGLE-DOOR flip + notify executor (source) ═══════════════════
{
  const ct = read("lib/ai/customer-turn.ts");
  // WO-KHALID-ORDER renamed the id in this gate from `conversationId` to
  // `staffFacingConversationId` (= null on a public-demo turn). The SINGLE DOOR is
  // unchanged and is still asserted here; what was added is a second, narrower
  // condition — a stranger on the public demo can no longer flip a conversation to a
  // human. The explicit-human requirement below is the part that must never weaken.
  ok("LEG4: the flip is gated on an explicit human request",
    /const explicitHuman = isExplicitHumanRequest\(input\.userMessage\);/.test(ct) &&
    /if \(result\.escalate && explicitHuman && staffFacingConversationId\)/.test(ct));
  ok("LEG4: the ONE door lands in HUMAN_ACTIVE with is_safety_hold:false (never SYSTEM_HOLD)",
    /setOwnershipState\(admin, staffFacingConversationId, "HUMAN_ACTIVE"/.test(ct) && /is_safety_hold: false,/.test(ct));
  ok("LEG4: the demo can never take that door (the id is null when demoRun is set)",
    /const staffFacingConversationId = input\.demoRun === true \? null : conversationId;/.test(ct));
  ok("LEG4: the automatic SYSTEM_HOLD flip is GONE (manual hold only)",
    !/nextOwnership = flipPatch\.is_safety_hold === true \? "SYSTEM_HOLD"/.test(ct));
  ok("LEG4: notify-without-hold fires recordCriticalAlert (loud for emergencies) with NO ownership change",
    /recordCriticalAlert\(admin, \{[\s\S]*?type: nfy\.emergency \? "allergy_emergency_active" : "safety_notify_no_hold"/.test(ct));
}

// ══ LEG 5 — respond.ts wiring (explicitHuman into ctx + legacy gate) ═════════
{
  const r = read("lib/ai/respond.ts");
  ok("LEG5: respond sets ctx.explicitHuman = isExplicitHumanRequest(userMessage)",
    /explicitHuman: isExplicitHumanRequest\(input\.userMessage\)/.test(r));
  ok("LEG5: the legacy safety-claim block transfers ONLY on an explicit request",
    /const transfer = wantsEscalate && ctx\.explicitHuman === true;/.test(r));
  ok("LEG5: otherwise it's notify_without_hold (no ctx.escalation)",
    /type: transfer \? "escalation" : wantsEscalate \? "notify_without_hold" : "missing_data"/.test(r));
}

// ══ LEG 6 — §5 emergency reply stays URGENT (advise emergency services) ═══════
{
  ok("LEG6: the emergency reply advises emergency services (urgent guidance, no reassurance)",
    /الإسعاف|الطوارئ/.test(emergencyReply("saudi")) && /الإسعاف|الطوارئ/.test(emergencyReply("egyptian")));
  // The two notify-without-hold alert types exist (audit trail carriers).
  const al = read("lib/alerts/record.ts");
  ok("LEG6: the alert types safety_notify_no_hold + allergy_emergency_active exist",
    /"safety_notify_no_hold"/.test(al) && /"allergy_emergency_active"/.test(al));
}

console.log(`\nWO-SAFETY-MODEL-V3 PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
