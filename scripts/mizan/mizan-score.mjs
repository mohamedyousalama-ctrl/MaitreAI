// ============================================================================
// MIZAN — pure scoring + gate logic (WO-KHALID-STEP4). No I/O, no agent, no runtime
// change. Imported by the harness (mizan-eval.mjs) and the unit test (test-mizan).
//
// ★ Boundary: MIZAN is a DIALECT/QUALITY measurement layer, NOT a safety gate. The
// deterministic allergen gate + engine remain the safety floor; MIZAN's safety suites
// ASSERT that existing behaviour holds — they never reimplement it.
//
// The automated dialect scorer REUSES the Step-2 linter (no duplicated banlists).
// Subjective dialect AUTHENTICITY is never machine-guessed — those stay human slots.
// ============================================================================
import { findLeakage, overLength, emojiCount } from "../../lib/ai/personas/khalid-dialect-linter.mjs";

// --- objective machine scorers ----------------------------------------------

/** Leakage-rate over a set of replies (reuses the Step-2 linter). % clean = ok/total. */
export function scoreLeakage(replies) {
  const list = (replies || []).map((r) => String(r ?? ""));
  const offenders = [];
  let clean = 0;
  for (const r of list) {
    const lk = findLeakage(r);
    if (lk.ok) clean++;
    else offenders.push({ reply: r, hits: lk.hits });
  }
  const total = list.length;
  return { total, clean, cleanPct: total ? clean / total : 1, offenders };
}

/** Fold Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII, so Saudi
 *  numerals in prices/phones/OTPs are matched (CodeRabbit). */
export function toAsciiDigits(s) {
  return String(s ?? "").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}
// Currency-amount tokens (Arabic «ر.س»/«ريال» or Latin SAR/SR), e.g. «45 ر.س», «12.5 ريال».
// No trailing \b — it is ASCII-only and never matches next to an Arabic letter (ريال/ر.س).
// Applied to ASCII-folded text so Arabic-Indic amounts are caught.
const PRICE_RE = /(\d[\d.,]*)\s*(?:ر\.?\s?س|ريال|SAR|SR)/gi;
/** Canonical numeric form so 45.5 == 45.50 (CodeRabbit). Non-numeric → NaN (never matches). */
const canonicalAmount = (s) => {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/** Price integrity: any currency amount in the reply that is NOT in the tenant's known
 *  money set (menu prices + fees + engine-computed totals, passed in) is an "invented"
 *  price. Gate = 0. Compared as canonical NUMBERS (45.5 == 45.50). Proxy. */
export function scorePriceIntegrity(reply, allowedPrices) {
  const allowed = (allowedPrices || []).map(canonicalAmount).filter((n) => Number.isFinite(n));
  const src = toAsciiDigits(reply);
  const invented = [];
  for (const m of src.matchAll(PRICE_RE)) {
    const amt = canonicalAmount(m[1]);
    if (!allowed.some((a) => a === amt)) invented.push(m[0].trim());
  }
  return { inventedCount: invented.length, invented };
}

const norm = (s) => String(s ?? "").replace(/[ً-ْ]/g, "").replace(/[أإآ]/g, "ا").trim().toLowerCase();

/** Normalize an expected item: accepts a bare name string OR {name, qty, without:[...]}. */
function normExpected(e) {
  if (typeof e === "string") return { name: norm(e), qty: null, without: [] };
  return { name: norm(e && e.name), qty: e && e.qty != null ? Number(e.qty) : null, without: (e && e.without ? e.without : []).map(norm) };
}
/** Normalize a captured draft line into {name, qty, modText} — modText is the line's whole
 *  modifier/note surface flattened to one normalized string, so a captured removal
 *  («بدون بصل», removed:["بصل"], notes:"…") is detectable regardless of the exact field. */
function normLine(x) {
  if (x == null) return { name: "", qty: null, modText: "" };
  if (typeof x === "string") return { name: norm(x), qty: null, modText: "" };
  const name = norm(x.name ?? x.title ?? "");
  const qtyRaw = x.qty ?? x.quantity ?? x.count ?? null;
  const modBits = [].concat(x.modifiers ?? [], x.mods ?? [], x.removed ?? [], x.without ?? [], x.extras ?? [], x.notes ? [x.notes] : []);
  const modText = norm(modBits.map((m) => (m && m.name ? m.name : m)).join(" "));
  return { name, qty: qtyRaw != null ? Number(qtyRaw) : null, modText };
}

/** Order accuracy: fraction of the customer's expected items captured CORRECTLY — matching
 *  name AND (when specified) quantity AND «without» removals. A draft with one mandi instead
 *  of two, or a burger whose onion-removal was dropped, is NOT counted correct.
 *  NOTE (proxy): the «without» check requires the removed item to be REFERENCED in the line's
 *  modifier/note fields (removal captured). Exact add-vs-remove semantics depend on the draft
 *  schema and can be tightened once confirmed on the seeded tenant. */
export function scoreOrderAccuracy(draft, expected) {
  const exp = (expected || []).map(normExpected).filter((e) => e.name);
  if (!exp.length) return { matched: 0, expected: 0, accuracy: 1, issues: [] };
  const lines = ((draft && (draft.items || draft.lines)) || []).map(normLine);
  const issues = [];
  let matched = 0;
  for (const e of exp) {
    const line = lines.find((l) => l.name && (l.name.includes(e.name) || e.name.includes(l.name)));
    if (!line) { issues.push(`missing:${e.name}`); continue; }
    if (e.qty != null && line.qty != null && line.qty !== e.qty) { issues.push(`qty:${e.name} want ${e.qty} got ${line.qty}`); continue; }
    const droppedRemoval = e.without.filter((w) => !line.modText.includes(w));
    if (droppedRemoval.length) { issues.push(`modifier:${e.name} removal not captured (${droppedRemoval.join(",")})`); continue; }
    matched++;
  }
  return { matched, expected: exp.length, accuracy: matched / exp.length, issues };
}

/** Length & emoji discipline (reuses the Step-2 advisory helpers). */
export function scoreLengthEmoji(reply, maxLen) {
  const r = String(reply ?? "");
  return { chars: r.length, over: overLength(r, maxLen), emoji: emojiCount(r) };
}

// --- safety-suite ASSERTIONS (assert existing gates hold; never reimplement) --

/** PDPL/privacy: the reply must never echo a full phone (9+ consecutive digits), a card
 *  PAN (13–19 digits), or an OTP-looking 4–6 digit code labelled as a code. Behavioral
 *  assertion over the agent OUTPUT — the engine owns the actual redaction. */
export function assertPrivacy(reply) {
  // Fold Arabic-Indic digits first — Saudi phones/OTPs are often «٠٥٠…» / «١٢٣٤» (CodeRabbit).
  const r = toAsciiDigits(reply);
  const leaks = [];
  if (/\d{9,}/.test(r.replace(/[\s-]/g, ""))) leaks.push("long_digit_run(phone/card)");
  // No \b around «رمز/كود» — ASCII-only \b never matches next to an Arabic letter. Wider gap
  // ({0,20}) catches verbose wording «رمز التحقق الخاص بك هو 1234»; extra OTP keywords added.
  if (/(?:otp|رمز|كود|verification|تحقق|تأكيد)[^\d]{0,20}\d{4,6}(?!\d)/i.test(r)) leaks.push("otp_echo");
  return { ok: leaks.length === 0, leaks };
}

// --- launch gates -----------------------------------------------------------

/** Evaluate one metric against a gate. Returns PASS / FAIL / PENDING-HUMAN.
 *  Human-scored metrics with no score yet are PENDING (never machine-guessed). */
export function evaluateGate(gate, value) {
  if (gate.metric === "human" && (value === null || value === undefined)) return "PENDING-HUMAN";
  if (value === null || value === undefined) return "PENDING";
  const t = gate.threshold;
  const ok = gate.op === ">=" ? value >= t : gate.op === "<=" ? value <= t : gate.op === "==" ? value === t : gate.op === "===" ? value === t : false;
  return ok ? "PASS" : "FAIL";
}

/** Overall release readiness: FAIL if any gate FAILs; otherwise PENDING while ANY gate
 *  is PENDING/PENDING-HUMAN (a human suite is unscored); PASS only when all PASS. */
export function overallReadiness(statuses) {
  if (statuses.some((s) => s === "FAIL")) return "NOT-RELEASE-READY (a gate FAILED)";
  if (statuses.some((s) => s === "PENDING-HUMAN" || s === "PENDING")) return "PENDING (awaiting native-panel scores — Step 5)";
  return "RELEASE-READY (all gates PASS)";
}

// --- honest-limits caveats (printed into every report) ----------------------
export const HONEST_LIMITS = [
  "MIZAN pass ≠ safe. Safety is the deterministic allergen gate + engine; MIZAN is a dialect/quality gate only.",
  "Automated scores are PROXIES. Dialect authenticity needs ≥3 native reviewers (Step 5) — never a machine number.",
  "Phase-1 sample size (target 100–200/suite) is NOT regression-grade; needs 5–10× before it gates releases.",
  "Coverage is Najdi + Hijazi only; Eastern/Southern are Phase 2.",
  "Offline scores drift — re-measure on live traffic periodically.",
];
