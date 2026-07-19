// ============================================================================
// WO-GUARD-ORDER — SAFETY-FIRST GUARD PRECEDENCE proof.
//
// BUG (audit-proven P0): in lib/ai/respond.ts the money-replacement guards ran
// BEFORE the allergen-safety / disease-diet output guards. A reply that BOTH
// fabricates a price AND falsely certifies allergen-safety on a genuine-allergy
// turn was wholesale-replaced by safeMoneyReply FIRST — so the safety detectors
// saw the clean money-deferral, and their escalation/notify signals NEVER fired.
// The safety event was silently lost (probe below → escalate:false, only a
// money_mismatch signal).
//
// FIX (evaluation-order + final-text precedence ONLY — no guard internals changed):
//   • capture the model's FINAL text BEFORE any money/confirm/non-menu replacement;
//   • the money guards still run and still fire their money_mismatch signal;
//   • re-expose that ORIGINAL text to the UNCHANGED allergen-safety + disease/diet
//     guards, so their detection + escalation/notify decision run on what the model
//     actually said and their signals fire regardless of later replacements;
//   • the safety/careful line WINS the final delivered text (strictest outcome) —
//     a money-deferral can never mask a safety event again.
//
// NOTE on «escalate fires»: RespondResult.escalate flips true ONLY on a TRANSFER,
// which the SINGLE-DOOR guard (unchanged) reserves for an EXPLICIT human request.
// So the exact probe (allergy, no human ask) fires the notify-without-hold SAFETY
// escalation signal + delivers the safety line (group A); adding an explicit human
// request drives the full transfer → RespondResult.escalate === true (group B).
//
// Run: node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs \
//        --experimental-strip-types scripts/proof-guard-order.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { respond } from "../lib/ai/respond.ts";
import { diseaseDietCarefulLine } from "../lib/ai/disease-diet-guard.ts";
import type { RespondResult } from "../lib/ai/respond.ts";

process.env.AI_ADAPTER = "mock";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log("  ❌", n); } };

// The exact audit probe (customer-facing model reply the mock will echo back).
const PROBE = "الكومبو آمن للحساسية ومفيهوش مكسرات بـ ١٧٠ ج.م";

// Exact guard replies pinned from lib/ai/respond.ts (egyptian dialect).
const SAFE_MONEY = "أقدر أحسبهولك بدقة من السيستم، بس لازم أبني الطلب الأول. تحب أضيف إيه؟";
const SAFE_ALLERGEN_ESC =
  "صحتك أهم حاجة عندنا 🙏 مش هقدر أأكد إن الصنف ده آمن من ناحية الحساسية من غير ما المطبخ يتأكد — هحوّلك لفريق المطعم يساعدوك تختار بأمان.";
const SAFE_ALLERGEN_NOESC =
  "ما اقدرش أأكد إن أي صنف خالي تماماً من مسببات الحساسية 🙏 بس أقدر أرشّحلك حسب المكوّنات المذكورة، وأأكدلك من المطبخ لو حابب.";
const CAREFUL = diseaseDietCarefulLine("egyptian");

// The mock adapter (lib/ai/llm/mock.ts) echoes the user message into the model
// reply, so a claim in the inbound becomes the model's outbound claim — with zero
// tool calls and an empty draft: exactly the shape the output guards inspect.
const BRAIN = (extra: Record<string, unknown>) => ({
  profile: { name: "Wesaya", currency: "ج.م", timezone: "Africa/Cairo", businessType: "restaurant" },
  dialect: "egyptian",
  menuItems: [{ id: "combo", name: "الكومبو", category: "عروض", price: 195, available: true, description: "", imageUrl: "", modifierIds: [], ingredients: [], allergens: [] }],
  modifiers: [], branches: [], deliveryAreas: [], policies: {}, faqs: [],
  aiTone: { responseLength: "balanced", emojiUsage: "balanced" },
  mode: "test", isOpen: true, autoAccept: false, ...extra,
}) as never;

const run = (userMessage: string, extraInput: Record<string, unknown> = {}) =>
  respond({ brain: BRAIN({}), history: [], userMessage, initialDraft: null, ...extraInput }) as Promise<RespondResult>;

// Signal helpers (types/reasons as emitted by respond.ts).
const hasMoney = (o: RespondResult) => o.signals.some((s) => s.type === "money_mismatch" && s.detail?.reason === "money_without_tool");
const hasSafety = (o: RespondResult) => o.signals.some((s) => (s.type === "notify_without_hold" || s.type === "escalation") && s.detail?.source === "safety_claim_guard");
const hasDisease = (o: RespondResult) => o.signals.some((s) => s.type === "missing_data" && s.detail?.reason === "disease_diet_suitability_claim");

// ── A — THE EXACT PROBE: money + false allergen-safety on an allergy turn ────
// Before the fix: safeMoneyReply replaced the text first → the allergen guard saw
// clean text → NO safety signal, escalate:false. After the fix: the safety event
// survives — the notify-without-hold escalation signal fires AND the safety line
// is delivered, while the money_mismatch signal is retained.
{
  const out = await run(PROBE);
  ok("A1: money guard STILL fires (money_mismatch / money_without_tool present)", hasMoney(out));
  ok("A2: SAFETY escalation signal now FIRES (was lost) — safety_claim_guard", hasSafety(out));
  ok("A3: delivered text is the SAFETY line — not the money-deferral", out.reply === SAFE_ALLERGEN_NOESC);
  ok("A4: the money-deferral no longer masks the safety event (reply !== safeMoneyReply)", out.reply !== SAFE_MONEY);
}

// ── B — SAME probe + an EXPLICIT human request → full transfer / escalate:true ─
{
  const out = await run(PROBE + " وعايز أكلم موظف");
  ok("B1: RespondResult.escalate === true (single-door transfer on explicit human ask)", out.escalate === true);
  ok("B2: an ESCALATION signal is present from the safety guard", out.signals.some((s) => s.type === "escalation" && s.detail?.source === "safety_claim_guard"));
  ok("B3: escalationReason is the allergen-safety reason", typeof out.escalationReason === "string" && out.escalationReason.includes("سلامة الحساسية"));
  ok("B4: delivered text is the ESCALATING safety line", out.reply === SAFE_ALLERGEN_ESC);
  ok("B5: money_mismatch signal STILL present alongside the safety escalation", hasMoney(out));
}

// ── C — MONEY-ONLY fabrication (no safety claim) → UNCHANGED behavior ─────────
{
  const out = await run("الكومبو بـ ١٧٠ ج.م");
  ok("C1: delivered text is exactly safeMoneyReply (legacy behavior unchanged)", out.reply === SAFE_MONEY);
  ok("C2: money_mismatch fires", hasMoney(out));
  ok("C3: NO safety / disease signal (none present in the reply)", !hasSafety(out) && !hasDisease(out));
  ok("C4: not escalated", out.escalate === false);
}

// ── D — SAFETY-ONLY claim (no money) → UNCHANGED behavior ────────────────────
{
  const out = await run("الكومبو آمن للحساسية ومفيهوش مكسرات");
  ok("D1: delivered text is the safety line", out.reply === SAFE_ALLERGEN_NOESC);
  ok("D2: safety signal present", hasSafety(out));
  ok("D3: NO money signal (no currency amount in the reply)", !hasMoney(out));
}

// ── E — DISEASE + MONEY combo → the disease/diet careful line WINS ───────────
{
  const out = await run("الطبق ده مناسب لمرضى السكري وبـ ١٧٠ ج.م");
  ok("E1: delivered text is the disease/diet careful line (wins over money-deferral)", out.reply === CAREFUL);
  ok("E2: disease/diet suitability signal fires", hasDisease(out));
  ok("E3: money_mismatch signal STILL present (money guard ran as today)", hasMoney(out));
}

// ── F — NEITHER money nor safety → the plain model echo passes through ────────
{
  const out = await run("تمام هجهزلك الطلب");
  ok("F1: reply is the plain model echo (untouched)", out.reply.includes("استلمت رسالتك") && out.reply.includes("تمام"));
  ok("F2: no money / safety / disease signals", !hasMoney(out) && !hasSafety(out) && !hasDisease(out));
  ok("F3: not escalated", out.escalate === false);
}

// ── G — source wiring: capture-before-money, restore-before-safety, guards intact ─
{
  const rs = readFileSync(resolve(process.cwd(), "lib/ai/respond.ts"), "utf8");
  const iCapture = rs.indexOf("const originalModelText = text;");
  const iMoney = rs.indexOf("const usedMoneyTool =");
  const iRestore = rs.indexOf("text = originalModelText;");
  const iAllergen = rs.indexOf("if (text.trim() && assertsAllergenSafety(text)) {");
  ok("G1: the model's final text is captured BEFORE the money guard", iCapture > 0 && iMoney > 0 && iCapture < iMoney);
  ok("G2: the safety-restore runs AFTER capture and BEFORE the allergen guard", iRestore > iCapture && iRestore < iAllergen);
  ok("G3: the money guard is UNCHANGED (legacy safeMoneyReply assignment intact)", /text = safeMoneyReply\(input\.brain\.dialect\);/.test(rs));
  ok("G4: allergen + disease guard internals UNCHANGED (both still evaluate `text`)",
    /if \(text\.trim\(\) && assertsAllergenSafety\(text\)\) \{/.test(rs) &&
    /if \(text\.trim\(\) && assertsDiseaseDietClaim\(text\)\) \{/.test(rs));
  ok("G5: the restore is GATED on an original-text safety claim (no-op otherwise)",
    /if \(assertsAllergenSafety\(originalModelText\) \|\| assertsDiseaseDietClaim\(originalModelText\)\) \{/.test(rs));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} guard-order (safety-first precedence): ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
