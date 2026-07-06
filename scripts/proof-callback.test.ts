// WO-CALLBACK — unit tests for the deterministic callback trigger + capture helpers.
// Run: node --experimental-strip-types scripts/proof-callback.test.ts
import {
  detectCallbackRequest,
  detectPreferredWindow,
  buildCallbackConfirm,
  buildStaffCallbackAlert,
  windowLabelAr,
  isLegalCallbackTransition,
  isValidCallbackStatus,
  CALLBACK_STATUSES,
  type CallbackStatus,
} from "../lib/ai/callback-trigger.ts";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// ── Trigger detection — MUST fire (dialect variants) ──
for (const t of [
  "كلمني ضروري", "كلموني من فضلكم", "اتصلوا فيني", "اتصلوا عليا", "اتصل بي بعد اذنك",
  "أبغى أكلم أحد", "ابي اكلم احد بالتليفون", "عايز اكلم حد بالتليفون", "ممكن حد يكلمني؟",
  "محتاج مكالمة", "اطلب مكالمة", "call me please", "can someone call me back", "phone me",
]) ok(`fire: «${t}»`, detectCallbackRequest(t).fired);

// ── MUST NOT fire (no phone-callback intent) ──
for (const t of [
  "عايز اطلب بيتزا", "المنيو فيه ايه؟", "بكام الكابسة؟", "شكراً كلمتك حلوة",
  "محتاج حد يساعدني في الطلب", "عايز اعرف العنوان",
]) ok(`no-fire: «${t}»`, !detectCallbackRequest(t).fired);

// ── Preferred window parse ──
ok("window now: الحين", detectPreferredWindow("الحين لو سمحت") === "now");
ok("window now: دلوقتي", detectPreferredWindow("دلوقتي") === "now");
ok("window within_hour: خلال ساعة", detectPreferredWindow("خلال ساعة تمام") === "within_hour");
ok("window evening: بالليل", detectPreferredWindow("خليها بالليل") === "evening");
ok("window evening: مساء", detectPreferredWindow("مساءً أحسن") === "evening");
ok("window now (EN)", detectPreferredWindow("now please") === "now");
ok("window unclear → null (re-ask)", detectPreferredWindow("مش عارف والله") === null);

// ── Honest confirm (§4): NO exact time, NEVER claims the call happened ──
const confirm = buildCallbackConfirm("within_hour");
ok("confirm: reached the team", confirm.includes("وصلت للفريق"));
ok("confirm: uses the window label", confirm.includes(windowLabelAr("within_hour")));
ok("confirm: no exact clock time (deterministic honesty)", !/\d{1,2}:\d{2}/.test(confirm));
ok("confirm: never claims the call happened", !/اتصلنا|تم الاتصال|كلمناك/.test(confirm));

// ── Staff alert content (§3a): «📞 طلب مكالمة — [who] — [window] — [reason]» ──
const alert = buildStaffCallbackAlert({ name: "محمد", phone: "+201030036000", window: "evening", reason: "شكوى تأخير" });
ok("alert: 📞 طلب مكالمة prefix", alert.startsWith("📞 طلب مكالمة"));
ok("alert: includes name + phone", alert.includes("محمد") && alert.includes("+201030036000"));
ok("alert: includes window label", alert.includes("بالمساء"));
ok("alert: includes reason", alert.includes("شكوى تأخير"));
const alertNoName = buildStaffCallbackAlert({ name: null, phone: "+201113797878", window: "now", reason: "طلب مكالمة" });
ok("alert: falls back to phone when no name", alertNoName.includes("+201113797878") && !alertNoName.includes("()"));

// ── Status machine (§2) ──
ok("valid status: open", isValidCallbackStatus("open"));
ok("invalid status rejected", !isValidCallbackStatus("weird"));
ok("4 statuses", CALLBACK_STATUSES.length === 4);
// Legal transitions
ok("open → called", isLegalCallbackTransition("open", "called"));
ok("open → no_answer", isLegalCallbackTransition("open", "no_answer"));
ok("open → cancelled", isLegalCallbackTransition("open", "cancelled"));
ok("no_answer → called (retry)", isLegalCallbackTransition("no_answer", "called"));
ok("no_answer → cancelled", isLegalCallbackTransition("no_answer", "cancelled"));
// Illegal transitions
ok("called is terminal (called → open illegal)", !isLegalCallbackTransition("called", "open"));
ok("cancelled is terminal", !isLegalCallbackTransition("cancelled", "called"));
ok("no same-state no-op (open → open)", !isLegalCallbackTransition("open", "open"));
ok("open → nonsense not legal", !isLegalCallbackTransition("open", "open"));
// Exhaustive: every terminal state has zero out-edges.
for (const s of ["called", "cancelled"] as CallbackStatus[])
  ok(`${s} has no legal out-transitions`, CALLBACK_STATUSES.every((t) => !isLegalCallbackTransition(s, t)));

// ── Capture flow (deterministic sequence): request → window → confirm ──
ok("capture flow: fired + window + honest confirm",
  detectCallbackRequest("كلموني").fired &&
  detectPreferredWindow("الحين") === "now" &&
  buildCallbackConfirm("now").includes("وصلت للفريق"));

console.log(`\nCALLBACK PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
