// ============================================================================
// WO-CONTEXT proof — conversation freshness (A) + allergy retraction (B) + reset
// vocabulary (C). Replays tonight's Wesaya defects (20 Jul evening; thread from 09 Jul):
//   1. a fresh «سلام عليكم» answered with legacy safety text + a stale zone question from a
//      session days old → PART A expires the pending question on a cold (>2h) session.
//   2. «امسح كل اللي فات… أنا معنديش حساسيه» triggered the allergy DEFLECTION → PART B suppresses
//      it on a retraction, clears the ticket note, appends a frozen ack — WITHOUT touching the
//      detector term lists, and WITHOUT ever suppressing a real allergy for another person.
//   3. «امسح كل اللي فات وابدأ من جديد» did not reset → PART C extends the reset vocabulary.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-context.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  detectAllergyRetraction,
  allergyRetractionAck,
  detectAllergyOrDiseaseMention,
  countPriorAllergyMentions,
  collectConversationAllergenTerms,
  buildTicketAllergyNote,
  decideAllergySimple,
  allergySimpleDeflection,
} from "../lib/ai/allergy-simple.ts";
import {
  decideSessionFreshness,
  SESSION_WINDOW_MS,
  ALLERGY_CONTEXT_WINDOW_MS,
} from "../lib/ai/session-freshness.ts";
import { isExplicitResetIntent } from "../lib/ai/draft-lifecycle.ts";
import { assertsAllergenSafety } from "../lib/ai/allergen-gate.ts";
import { scanBannedAllergyPhrases } from "../lib/ai/allergen-companion.ts";
import { respond } from "../lib/ai/respond.ts";
import { matchAddressToZones } from "../lib/delivery/address.ts";
import type { DeliveryArea } from "../lib/types.ts";
import type { OrderDraft } from "../lib/ai/tools.ts";
import type { LlmMessage } from "../lib/ai/llm/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };
const eq = (n: string, a: unknown, b: unknown) => ok(`${n}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`, a === b);

// ─────────────────────────── PART A — session freshness (pure) ───────────────────────────────
{
  eq("A0: SESSION_WINDOW_MS is 2h", SESSION_WINDOW_MS, 2 * 60 * 60 * 1000);
  eq("A0b: ALLERGY_CONTEXT_WINDOW_MS is 24h", ALLERGY_CONTEXT_WINDOW_MS, 24 * 60 * 60 * 1000);

  const cold = decideSessionFreshness({ lastMessageAgeMs: SESSION_WINDOW_MS + 1, lastAllergyMentionAgeMs: null, allergySimpleOn: true });
  ok("A1: idle > 2h → session expired + pending question expired + residues cleared",
    cold.sessionExpired && cold.expirePendingQuestion && cold.clearLegacyResidues && cold.signals.includes("pending_question_expired"));

  const warm = decideSessionFreshness({ lastMessageAgeMs: 1000, lastAllergyMentionAgeMs: null, allergySimpleOn: true });
  ok("A2: warm session (< 2h) → nothing expires", !warm.sessionExpired && !warm.expirePendingQuestion && warm.signals.length === 0);

  ok("A3: brand-new conversation (no prior message) is always fresh",
    !decideSessionFreshness({ lastMessageAgeMs: null, lastAllergyMentionAgeMs: null, allergySimpleOn: true }).sessionExpired);

  const stale = decideSessionFreshness({ lastMessageAgeMs: 1000, lastAllergyMentionAgeMs: ALLERGY_CONTEXT_WINDOW_MS + 1, allergySimpleOn: true, freshAllergyMentionThisTurn: false });
  ok("A4: allergy mention > 24h → allergy_note cleared + allergy_context_expired signal",
    stale.clearAllergyNote && stale.signals.includes("allergy_context_expired"));

  ok("A5: a FRESH mention this turn rebuilds the note (never cleared as stale)",
    !decideSessionFreshness({ lastMessageAgeMs: 1000, lastAllergyMentionAgeMs: ALLERGY_CONTEXT_WINDOW_MS + 1, allergySimpleOn: true, freshAllergyMentionThisTurn: true }).clearAllergyNote);

  ok("A6: an allergy mention within 24h stays live (note kept)",
    !decideSessionFreshness({ lastMessageAgeMs: 1000, lastAllergyMentionAgeMs: 60 * 60 * 1000, allergySimpleOn: true }).clearAllergyNote);

  const off = decideSessionFreshness({ lastMessageAgeMs: SESSION_WINDOW_MS + 1, lastAllergyMentionAgeMs: ALLERGY_CONTEXT_WINDOW_MS + 1, allergySimpleOn: false });
  ok("A7: allergy_simple OFF → residue + allergy-note paths never touched (session still expires generally)",
    off.sessionExpired && off.expirePendingQuestion && !off.clearLegacyResidues && !off.clearAllergyNote);
}

// ─────────────────────────── PART B — allergy retraction (pure) ──────────────────────────────
{
  ok("B1: «امسح كل اللي فات… أنا معنديش حساسيه» is a retraction", detectAllergyRetraction("امسح كل اللي فات… أنا معنديش حساسيه"));
  ok("B2: «مش حساسي» / «انسى موضوع الحساسية» / «بدون موضوع الحساسية» are retractions",
    detectAllergyRetraction("لا انا مش حساسي") && detectAllergyRetraction("انسى موضوع الحساسية") && detectAllergyRetraction("بدون موضوع الحساسية"));
  ok("B3: «ما عنديش حساسية» / «مفيش عندي حساسية» are retractions",
    detectAllergyRetraction("ما عنديش حساسية") && detectAllergyRetraction("مفيش عندي حساسية"));
  ok("B4: a positive «عندي حساسية من المكسرات» is NOT a retraction", !detectAllergyRetraction("عندي حساسية من المكسرات"));

  // SAFETY INVARIANT — a positive allergy assertion for ANOTHER person in the SAME sentence
  // is NEVER a retraction; the detector still fires and captures the real allergen.
  const MIX = "أنا معنديش بس ابني عنده حساسية لبن";
  ok("B5 (INVARIANT): mixed sentence is NOT a retraction", !detectAllergyRetraction(MIX));
  ok("B6 (INVARIANT): the detector still fires on the mixed sentence", detectAllergyOrDiseaseMention(MIX).fired);
  eq("B7 (INVARIANT): the captured note allergen is لبن", detectAllergyOrDiseaseMention(MIX).term, "لبن");
  eq("B8 (INVARIANT): a deflection fires on the mixed sentence (first mention)", decideAllergySimple({ history: [], userMessage: MIX }).action, "deflect");

  // The frozen ack — honest, no reassurance, no health commentary.
  const ack = allergyRetractionAck("egyptian");
  ok("B9: the retraction ack is frozen «تمام 👍» and never reassures",
    ack === "تمام 👍" && !assertsAllergenSafety(ack) && scanBannedAllergyPhrases(ack).length === 0);

  // Context wipe: a retraction resets the running mention count AND wipes the collected terms,
  // so a LATER fresh positive mention is a FIRST mention again (deflection returns — see S5).
  const hist: LlmMessage[] = [
    { role: "user", content: "عندي حساسية من المكسرات" }, { role: "assistant", content: "x" },
    { role: "user", content: "امسح كل اللي فات انا معنديش حساسيه" }, { role: "assistant", content: "y" },
  ];
  eq("B10: prior-mention count RESETS after a retraction", countPriorAllergyMentions(hist), 0);
  eq("B11: collected session terms are WIPED after a retraction", collectConversationAllergenTerms(hist, "سلام").length, 0);
  eq("B12: a retraction turn contributes no term to the ticket note",
    buildTicketAllergyNote(collectConversationAllergenTerms(hist, "امسح كل اللي فات انا معنديش حساسيه")), "⚠️ العميل ذكر حساسية/حالة صحية: غير محدد");
}

// ─────────────────────────── PART C — reset vocabulary (pure) ────────────────────────────────
{
  ok("C1: «امسح كل اللي فات» resets", isExplicitResetIntent("امسح كل اللي فات"));
  ok("C2: «ابدأ من جديد» / «من الأول» reset", isExplicitResetIntent("ابدأ من جديد") && isExplicitResetIntent("من الأول"));
  ok("C3: «الغي كل حاجة» / «كنسل كل حاجة» reset", isExplicitResetIntent("الغي كل حاجة") && isExplicitResetIntent("كنسل كل حاجة"));
  ok("C4: «نبدأ من الصفر» resets", isExplicitResetIntent("نبدأ من الصفر"));
  ok("C5: tonight's exact «امسح كل اللي فات وابدأ من جديد» resets", isExplicitResetIntent("امسح كل اللي فات وابدأ من جديد"));
  ok("C6: the legacy vocab still works («طلب جديد» / «الغي الطلب كله»)", isExplicitResetIntent("عايز اعمل طلب جديد") && isExplicitResetIntent("الغي الطلب كله"));
  ok("C7: an ordinary order-build is NOT a reset", !isExplicitResetIntent("عايز اطلب بيتزا") && !isExplicitResetIntent("زود واحدة كمان") && !isExplicitResetIntent("اضيف مياه"));
}

// ─────────────────── END-TO-END through respond() — cold session expires the stale question ──
// A zone-ambiguous address that would re-derive the stale «… هرم؟» question every turn.
const TARGET = "المطبعة والمحولات هرم";
const ADDRESS = "الهرم. شارع اللبيني";
const zones: DeliveryArea[] = [
  { id: "faisal", name: "فيصل", deliveryFee: 20, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "matbaa", name: TARGET, deliveryFee: 38, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
] as unknown as DeliveryArea[];
const AMB = matchAddressToZones(ADDRESS, zones);
if (AMB.kind !== "ambiguous") { console.log("  ❌ fixture: the address must be ambiguous"); process.exit(1); }
const QUESTION_FRAGMENT = "هرم"; // the ambiguity question offers the «… هرم» candidate zones

const ambiguousDeliveryDraft = (): OrderDraft => ({
  lines: [{ itemId: "pizza", name: "بيتزا مارجريتا", quantity: 2, unitPrice: 195, choices: [], modifiers: [], lineTotal: 390 }],
  fulfillment: "delivery", deliveryZone: null, address: ADDRESS, deliveryFee: 0,
  subtotal: 390, tax: 0, taxRate: 0, total: 390, currency: "ج.م", paymentMethod: null, finalized: false,
}) as unknown as OrderDraft;

const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [], variants: [], choiceGroups: [] }],
  modifiers: [], branches: [], deliveryAreas: zones, policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, finishLine: true, addressFlowV2: true, ...extra,
}) as never;

{
  const history: LlmMessage[] = [{ role: "assistant", content: "قريب من إيه — التعاون هرم ولا الطالبية هرم؟" }];
  // CONTROL — a warm session (sessionExpired=false) still surfaces the pending zone question.
  const warm = await respond({ brain: BRAIN({}), history, userMessage: "سلام عليكم", initialDraft: ambiguousDeliveryDraft(), sessionExpired: false });
  ok("EE1 (control): a warm session surfaces the pending zone question", warm.reply.includes(QUESTION_FRAGMENT) && /[؟?]/.test(warm.reply));
  // COLD — the same turn on a >2h session expires the stale question + emits pending_question_expired.
  const cold = await respond({ brain: BRAIN({}), history, userMessage: "سلام عليكم", initialDraft: ambiguousDeliveryDraft(), sessionExpired: true });
  ok("EE2: a cold session DROPS the stale zone question", !cold.reply.includes(QUESTION_FRAGMENT));
  ok("EE3: … and emits the pending_question_expired signal",
    cold.signals.some((s) => s.detail?.reason === "pending_question_expired" && s.detail?.source === "session_freshness"));
  ok("EE4: … and the greeting never carries legacy safety text",
    !/صحتك تهمنا/.test(cold.reply) && !/ماقدرش أأكد/.test(cold.reply) && !assertsAllergenSafety(cold.reply));
}

// ─────────────────── MULTI-TURN SCENARIO — replay tonight's Wesaya thread ─────────────────────
{
  // S1 — aged thread + stale zone question → a returning «سلام عليكم» gets a CLEAN fresh reply
  // (no stale question, no legacy safety text). Session freshness fires because the last outbound
  // is days old (> 2h).
  const agedDecision = decideSessionFreshness({ lastMessageAgeMs: 3 * 24 * 60 * 60 * 1000, lastAllergyMentionAgeMs: null, allergySimpleOn: true });
  const history: LlmMessage[] = [{ role: "assistant", content: "شارع اللبيني هرم — التعاون هرم؟" }];
  const s1 = await respond({ brain: BRAIN({}), history, userMessage: "سلام عليكم", initialDraft: ambiguousDeliveryDraft(), sessionExpired: agedDecision.expirePendingQuestion });
  ok("S1: aged thread → greeting reply is clean (no stale «… هرم؟», no legacy safety)",
    agedDecision.sessionExpired && !s1.reply.includes(QUESTION_FRAGMENT) && !assertsAllergenSafety(s1.reply) && !/صحتك تهمنا/.test(s1.reply));

  // S2 — «امسح كل اللي فات… أنا معنديش حساسيه»: retraction → NO deflection + note cleared. The same
  // message ALSO carries a reset intent, which is honored (Part C).
  const S2_MSG = "امسح كل اللي فات… أنا معنديش حساسيه";
  ok("S2: retraction suppresses the deflection AND the reset intent is honored",
    detectAllergyRetraction(S2_MSG) && isExplicitResetIntent(S2_MSG) &&
    collectConversationAllergenTerms([], S2_MSG).length === 0);

  // S3 — the mixed sentence «أنا معنديش بس ابني عنده حساسية لبن» → deflection fires; the note
  // captures the real allergen (raw «لبن», canonicalized to the dairy label «ألبان»).
  const S3_MSG = "أنا معنديش بس ابني عنده حساسية لبن";
  ok("S3: mixed sentence → deflection fires + ticket note captures the dairy allergen",
    !detectAllergyRetraction(S3_MSG) &&
    decideAllergySimple({ history: [], userMessage: S3_MSG }).action === "deflect" &&
    detectAllergyOrDiseaseMention(S3_MSG).term === "لبن" &&
    buildTicketAllergyNote(collectConversationAllergenTerms([], S3_MSG)) === "⚠️ العميل ذكر حساسية/حالة صحية: ألبان");

  // S4 — «امسح كل اللي فات» → reset (archive) AND the pending question expires (Part A path via the
  // reset branch: sessionExpired is forced true on an explicit reset).
  ok("S4: «امسح كل اللي فات» → reset + pending-question expiry path",
    isExplicitResetIntent("امسح كل اللي فات"));

  // S5 — a FRESH positive mention AFTER a retraction re-triggers the deflection normally.
  const afterRetraction: LlmMessage[] = [
    { role: "user", content: "عندي حساسية من المكسرات" }, { role: "assistant", content: allergySimpleDeflection("egyptian", 0) },
    { role: "user", content: "امسح كل اللي فات انا معنديش حساسيه" }, { role: "assistant", content: "تمام 👍" },
  ];
  const s5 = decideAllergySimple({ history: afterRetraction, userMessage: "بجد عندي حساسية من الجلوتين" });
  ok("S5: fresh mention AFTER a retraction → deflection RETURNS (first-mention again)",
    s5.action === "deflect" && s5.firstMention === true);
}

// ─────────────────── SOURCE WIRING — the parts sit where the WO placed them ──────────────────
const ct = readFileSync(resolve(process.cwd(), "lib/ai/customer-turn.ts"), "utf8");
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
ok("W1 (PART A): customer-turn computes the session-freshness decision", /decideSessionFreshness\(\{/.test(ct));
ok("W2 (PART A): respond expires the pending question on a cold/reset session", /input\.sessionExpired && pendingQuestion/.test(rs) && /reason: "pending_question_expired"/.test(rs));
ok("W3 (PART A): the reset intent also forces the pending-question expiry (Part C→A)", /sessionExpiredForTurn = freshness\.expirePendingQuestion \|\| draftResetIntent/.test(ct));
ok("W4 (PART A): the 24h-stale allergy note is cleared + signalled", /freshness\.clearAllergyNote/.test(ct) && /reason: "allergy_context_expired"/.test(ct));
ok("W5 (PART A): cold-session residue sweep is gated on allergy_simple only", /if \(clearLegacyResiduesThisTurn\)/.test(ct));
ok("W6 (PART B): the retraction gate precedes/overrides the deflect branch",
  /const allergyRetracted =/.test(ct) && /action === "deflect" && !allergyRetracted/.test(ct));
ok("W7 (PART B): a retraction clears the note + appends the frozen ack + signals allergy_retracted",
  /allergyRetractionAck\(dialect\)/.test(ct) && /reason: "allergy_retracted"/.test(ct));
ok("W8 (PART B): the SAFETY INVARIANT lives in detectAllergyRetraction (term lists untouched)",
  /POSITIVE_ALLERGY_ASSERTION_RE\.test\(n\)\) return false/.test(readFileSync(resolve(process.cwd(), "lib/ai/allergy-simple.ts"), "utf8")));
ok("W9 (PART C): the extended reset vocabulary is in draft-lifecycle", /امسح\\s\*كل\\s\*اللي\\s\*فات/.test(readFileSync(resolve(process.cwd(), "lib/ai/draft-lifecycle.ts"), "utf8")));

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-context: ${pass}/${pass + fail} passed`);
console.log("sample ambiguity question:", AMB.kind === "ambiguous" ? AMB.question : "(none)");
if (fail > 0) process.exit(1);
