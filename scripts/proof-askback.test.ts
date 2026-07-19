// WO-ASKBACK proof: deterministic ask-back injection at the validation stage of respond().
// The DB-proven bug: a zone-ambiguous address made set_delivery_address (address_flow_v2)
// push a missing_data/address_zone_ambiguous signal carrying the exact question, but an output
// guard stripped the model text down to a bare «تمام!» — the pending question never reached the
// customer, who stalled. The final-settle net recovers the pending question (from the turn's
// signals OR by re-detecting a still-open draft ambiguity) and, when the settled reply neither
// contains it nor carries real content, APPENDS it (or replaces a contentless pleasantry with
// greeting+question). Pure string ops, no model calls; only ADDS required content.
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-askback.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  pendingDeterministicQuestion,
  injectPendingQuestion,
  replyContainsQuestion,
  isContentless,
  contentAfterPleasantries,
} from "../lib/ai/askback-injection.ts";
import { matchAddressToZones } from "../lib/delivery/address.ts";
import { respond } from "../lib/ai/respond.ts";
import type { ToolSignal, OrderDraft } from "../lib/ai/tools.ts";
import type { DeliveryArea } from "../lib/types.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  ❌", name); }
};
const eq = (name: string, actual: unknown, expected: unknown) => {
  ok(`${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`, actual === expected);
};

const zones: DeliveryArea[] = [
  { id: "catch", name: "الجيزه كلها", deliveryFee: 30, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "coop", name: "التعاون هرم", deliveryFee: 31, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "talbeya", name: "الطالبية هرم", deliveryFee: 55, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
  { id: "mishaal", name: "مشعل هرم", deliveryFee: 45, minOrder: 0, estimatedTime: "45 دقيقة", active: true },
];

// The exact deterministic question the address_flow_v2 path generates for «شارع الهرم».
const AMB = matchAddressToZones("شارع الهرم", zones);
if (AMB.kind !== "ambiguous") { console.log("  ❌ fixture: «شارع الهرم» must be ambiguous"); process.exit(1); }
const Q = AMB.question; // e.g. «قريب من إيه — التعاون هرم ولا الطالبية هرم ولا مشعل هرم؟»

const ambiguousSignal = (question = Q): ToolSignal => ({
  type: "missing_data",
  detail: { reason: "address_zone_ambiguous", address: "شارع الهرم", candidates: AMB.candidates.map((c) => c.zone.name), question },
});

// ── A — pendingDeterministicQuestion: recover the pending question from turn signals ─────────
ok("A1: an address_zone_ambiguous signal yields its question",
  pendingDeterministicQuestion([ambiguousSignal()]) === Q);
ok("A2: NO pending question when there are no signals", pendingDeterministicQuestion([]) === null);
ok("A3: an unrelated missing_data reason (goal_clarify) is NOT a deterministic ask-back",
  pendingDeterministicQuestion([{ type: "missing_data", detail: { reason: "goal_clarify", kind: "item" } }]) === null);
ok("A4: address_zone_no_match carries no question → null",
  pendingDeterministicQuestion([{ type: "missing_data", detail: { reason: "address_zone_no_match", address: "x" } }]) === null);
ok("A5: latest ambiguous signal wins when several are present",
  pendingDeterministicQuestion([ambiguousSignal("قريب من إيه — أ؟"), ambiguousSignal("قريب من إيه — ب؟")]) === "قريب من إيه — ب؟");
ok("A6: a non-missing_data signal type is ignored",
  pendingDeterministicQuestion([{ type: "money_mismatch", detail: { reason: "address_zone_ambiguous", question: "x؟" } }]) === null);

// ── B — contentless detection: pleasantry-only replies vs. real content ──────────────────────
ok("B1: bare «تمام!» is contentless", isContentless("تمام!"));
ok("B2: «ممتاز 👍» (pleasantry + emoji) is contentless", isContentless("ممتاز 👍"));
ok("B3: «حاضر يا فندم» trims to < 12 chars of content → contentless", isContentless("حاضر يا فندم"));
ok("B4: an empty reply is contentless", isContentless("   "));
ok("B5: the full zone question is NOT contentless", !isContentless(Q));
ok("B6: a substantive reply «هبعتلك اللينك حالاً دلوقتي كده» is NOT contentless", !isContentless("هبعتلك اللينك حالاً دلوقتي كده"));
eq("B7: contentAfterPleasantries strips «تمام» + punctuation to empty", contentAfterPleasantries("تمام!"), "");

// ── C — replyContainsQuestion: verbatim relay is detected (whitespace/diacritic tolerant) ────
ok("C1: a reply that relays the question verbatim is detected as containing it",
  replyContainsQuestion(`تمام، ${Q}`, Q));
ok("C2: extra whitespace / diacritics do not defeat containment",
  replyContainsQuestion(`  ${Q.replace(/ /g, "  ")}  `, Q));
ok("C3: an unrelated reply does not contain the question",
  !replyContainsQuestion("أهلاً بيك، تحب تطلب إيه؟", Q));

// ── D — injectPendingQuestion: the core settle (the listed cases) ────────────────────────────
{
  // Contentless + pending → REPLACE with greeting + question (the exact DB bug: «تمام!» delivered).
  const r = injectPendingQuestion("تمام!", Q);
  eq("D1: contentless «تمام!» + pending → mode replaced", r.mode, "replaced");
  ok("D1b: the delivered reply now carries the pending question", r.text.includes(Q));
  ok("D1c: the delivered reply opens with a greeting", r.text.startsWith("تمام!"));
}
{
  // Normal reply that ALREADY relays the question → unchanged (never double-ask).
  const already = `ماشي، ${Q}`;
  const r = injectPendingQuestion(already, Q);
  eq("D2: reply already containing the question → mode unchanged", r.mode, "unchanged");
  eq("D2b: the text is returned byte-identical", r.text, already);
}
{
  // Substantive reply that does NOT relay the question → APPEND it, preserving the original.
  const body = "تمام هبعتلك صورة المنيو حالاً 📸";
  const r = injectPendingQuestion(body, Q);
  eq("D3: substantive reply + pending → mode appended", r.mode, "appended");
  ok("D3b: the original content is preserved", r.text.includes(body));
  ok("D3c: the pending question is appended", r.text.includes(Q));
  ok("D3d: the question is on its own line", r.text.endsWith(`\n${Q}`));
}
{
  // A guard-stripped reply (its OWN «؟» but not the zone question) + pending → append the zone question.
  const stripped = "لسه ما أكدتش الطلب؛ تحب أراجعه معاك؟";
  const r = injectPendingQuestion(stripped, Q);
  eq("D4: guard-stripped reply + pending → mode appended", r.mode, "appended");
  ok("D4b: the guard line is preserved", r.text.includes(stripped));
  ok("D4c: the zone question is delivered too", r.text.includes(Q));
}
{
  // Empty reply + pending → REPLACE (greeting + question) — never send an empty body.
  const r = injectPendingQuestion("", Q);
  eq("D5: empty reply + pending → mode replaced", r.mode, "replaced");
  ok("D5b: the delivered reply carries the question", r.text.includes(Q));
}
{
  // No pending question → the reply is untouched.
  const r = injectPendingQuestion("تمام!", "");
  eq("D6: no pending question → mode unchanged", r.mode, "unchanged");
  eq("D6b: text unchanged", r.text, "تمام!");
}

// ── E — END-TO-END through respond() (mock adapter, re-detection path) ────────────────────────
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "pizza", name: "بيتزا مارجريتا", category: "بيتزا", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [] }],
  modifiers: [], branches: [], deliveryAreas: zones, policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, ...extra,
}) as never;

const draftWithAddress = (over: Partial<OrderDraft> = {}): OrderDraft => ({
  lines: [], fulfillment: "delivery", deliveryZone: null, address: "شارع الهرم", deliveryFee: 0,
  subtotal: 0, tax: 0, taxRate: 0, total: 0, currency: "ج.م", paymentMethod: null, finalized: false, ...over,
}) as OrderDraft;

{
  // Flag ON + draft carries a still-open zone ambiguity (address written, no zone resolved):
  // respond() RE-DETECTS the pending question and appends it to the (substantive) mock reply.
  const out = await respond({
    brain: BRAIN({ addressFlowV2: true }), history: [], userMessage: "عنواني شارع الهرم", initialDraft: draftWithAddress(),
  });
  ok("E1: re-detected pending zone question is delivered in the reply", out.reply.includes(Q));
  ok("E1b: an askback_injected audit signal is recorded", out.signals.some((s) => s.type === "missing_data" && s.detail.reason === "askback_injected"));
  ok("E1c: no model call was needed for the injection (deterministic)", out.calls_used === 1);
}
{
  // Flag ON but the draft's zone is already RESOLVED → nothing pending → reply untouched.
  const out = await respond({
    brain: BRAIN({ addressFlowV2: true }), history: [], userMessage: "تمام كده", initialDraft: draftWithAddress({ deliveryZone: "التعاون هرم", deliveryFee: 31 }),
  });
  ok("E2: resolved zone → no zone question appended", !out.reply.includes(Q));
  ok("E2b: no askback_injected signal is written", !out.signals.some((s) => s.detail.reason === "askback_injected"));
}
{
  // Flag OFF (address_flow_v2 absent) → NO re-detection → byte-identical (safety: never over-inject).
  const out = await respond({
    brain: BRAIN({}), history: [], userMessage: "عنواني شارع الهرم", initialDraft: draftWithAddress(),
  });
  ok("E3: flag OFF → no zone question injected", !out.reply.includes(Q));
  ok("E3b: flag OFF → no askback_injected signal", !out.signals.some((s) => s.detail.reason === "askback_injected"));
}

// ── F — source wiring: the injection sits at the FINAL settle (after every guard, before return)
const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
ok("F1: respond.ts imports the ask-back settle helpers",
  /import \{ pendingDeterministicQuestion, injectPendingQuestion \} from "\.\/askback-injection";/.test(rs));
ok("F2: respond.ts re-detects a still-open draft ambiguity via matchAddressToZones",
  /matchAddressToZones\(ctx\.draft\.address, input\.brain\.deliveryAreas\)/.test(rs));
{
  const injectIdx = rs.indexOf("injectPendingQuestion(text, pendingQuestion)");
  const scrubIdx = rs.indexOf("scrubBannedWords(text)"); // the last guard before the settle
  const returnIdx = rs.indexOf("return {\n    reply: text,");
  ok("F3: the injection runs AFTER the final banned-word scrub guard", injectIdx > scrubIdx && scrubIdx > 0);
  ok("F4: the injection runs BEFORE the reply is returned", injectIdx > 0 && injectIdx < returnIdx);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} proof-askback: ${pass}/${pass + fail} passed`);
console.log("sample delivered ask-back:", injectPendingQuestion("تمام!", Q).text.replace(/\n/g, " ⏎ "));
if (fail > 0) process.exit(1);
