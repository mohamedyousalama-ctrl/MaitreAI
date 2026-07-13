// ============================================================================
// MaitreAI — WO-V1.0-GOAL-LOGIC (Slice 1): the GOAL INTERPRETER — front-of-turn intent rule.
//
// PURE (no I/O). The founder's V1.0 doctrine moves intent-reasoning to the FRONT of the turn:
// before composing a reply, decide WHAT the customer wants and whether there is ENOUGH to act.
// One general RULE (not a list of cases) routes every inbound to exactly one path:
//   • PRICE-REQUEST → tool-only routing (build basket → quote engine → relay {Q}; the model
//     NEVER states a number).
//   • ACTIONABLE   → run the normal model+tool loop (clear add / modify / confirm-at-point).
//   • AMBIGUOUS    → ask ONE grounded clarifying question (referent/intent robustness form).
//
// It REUSES the existing perception read (perceiveTurn — no new model call); goal_logic bundles
// the perception flag ON so `read` is present. Deterministic backstops (bare number, bare
// assent off a confirmation point, referent with ≠1 candidate, a headcount-planning ask that
// Slice-2's Basket Planner isn't built for) catch what the read misses. Bias = skip-on-doubt
// toward ASK: asking costs one turn; a wrong ACT mutates the basket. «1000» is AMBIGUOUS because
// no slot binds a bare number — never special-cased.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

/** The subset of the perception read (perception.ts) the interpreter consumes. Kept local so
 *  this module stays pure/loadable (perception.ts is server-only). */
export interface GoalRead {
  intent?: string;
  confidence?: "low" | "medium" | "high";
  understood?: boolean;
}

export interface GoalState {
  /** Menu item names (for referent-candidate counting). */
  itemNames: string[];
  /** Active offer names (menu items marked as عرض) — the candidates «العرض» could mean. */
  offerNames: string[];
  /** True when the last assistant turn was a genuine order readback/confirm prompt. */
  atConfirmationPoint: boolean;
  /** True when an open draft with lines exists (so a size/modifier can bind to it). */
  hasOpenDraft: boolean;
}

export type GoalDecision =
  | { action: "price"; reason: string }
  | { action: "act"; reason: string }
  | { action: "ask"; reason: string; kind: ClarifyKind; candidates: string[] };

export type ClarifyKind = "bare_number" | "referent" | "bare_assent" | "headcount" | "unclear";

// A request for a price/total/cost — routes to tool-only (the model never states the number).
const PRICE_REQUEST_RE =
  /(بكام|بكم|كام سعر|السعر|سعره|سعرها|بسعر كام|الاجمالي|الإجمالي|المجموع|التكلفه|الحساب|يطلع كام|هيطلع كام|كام في المجموع|كام كله|how much|price)/u;
// A bare assent — a confirm ONLY at a confirmation point; otherwise "agree to what?".
const BARE_ASSENT_RE = /^(?:اه|ايوه|ايوا|اي|تمام|ماشي|اوك|اوكي|حسنا|ok|yes|تمم|ماشى)[\s.!؟?]*$/u;
// A headcount / feast-planning ask — Slice 2 (Basket Planner) isn't built, so ASK honestly,
// never fabricate a servings/coverage claim (§2A). "enough for N", "food for N people".
const HEADCOUNT_RE = /(يكفي|تكفي|يكفّي|كفايه|كفاية|عشان|علشان|ل)\s*[\d٠-٩]+\s*(?:نفر|اشخاص|أشخاص|ناس|فرد|افراد|أفراد)|[\d٠-٩]+\s*(?:نفر|اشخاص|أشخاص|ناس|أفراد)/u;
// Referent words that need a concrete antecedent («العرض»/«الكبير»/«الوسط»/«الصغير»/«ده»).
const REFERENT_RE = /(?<![ء-ي])(العرض|العروض|الكبير|الكبيره|الوسط|الصغير|الصغيره|الحجم|ده|دي|هو ده)(?![ء-ي])/u;

/** Digits (Arabic-Indic or Western) → Western, for the bare-number test. */
function toWestern(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
/** True iff the message, stripped of punctuation/spaces, is essentially just a number — a bare
 *  number binds to no slot on its own (quantity? budget? a code?) → ambiguous by the rule. */
function isBareNumber(text: string): boolean {
  const n = toWestern(text).replace(/[^\p{L}\p{N}]/gu, "");
  return /^[0-9]{2,}$/.test(n); // ≥2 digits, no letters — «1000», «١٥٠٠»; a lone «2» stays a quantity
}

export function isPriceRequest(text: string): boolean {
  return !!text && PRICE_REQUEST_RE.test(normalizeAr(text));
}

/** Count the concrete candidates a referent word could resolve to, given state. */
function referentCandidates(text: string, state: GoalState): string[] | null {
  const n = normalizeAr(text);
  if (!REFERENT_RE.test(n)) return null;
  // «العرض / العروض» → the active offers are the candidates.
  if (/(?<![ء-ي])(?:العرض|العروض)(?![ء-ي])/.test(n)) return state.offerNames.slice();
  // A size referent («الكبير»…) needs an item in the draft to bind to; none → 0 candidates.
  if (/(?<![ء-ي])(?:الكبير|الكبيره|الوسط|الصغير|الصغيره|الحجم)(?![ء-ي])/.test(n) && !state.hasOpenDraft) return [];
  return null;
}

/**
 * The one RULE. Routes an inbound to price / act / ask against the perception read + state.
 * Deterministic given (text, read, state) — the proof injects synthetic reads.
 */
export function classifyGoal(args: { userMessage: string; read: GoalRead | null; state: GoalState }): GoalDecision {
  const { userMessage, read, state } = args;
  const text = userMessage ?? "";

  // 1. PRICE-REQUEST → tool-only (never a model numeral).
  if (isPriceRequest(text)) return { action: "price", reason: "price_request" };

  // 2. A bare assent is a CONFIRM only at a confirmation point; otherwise "agree to what?".
  if (BARE_ASSENT_RE.test(normalizeAr(text))) {
    return state.atConfirmationPoint
      ? { action: "act", reason: "confirm_at_point" }
      : { action: "ask", reason: "assent_off_point", kind: "bare_assent", candidates: [] };
  }

  // 3. A headcount / feast ask → honest ASK (Slice 2 Planner not built; never fabricate a plan).
  if (HEADCOUNT_RE.test(normalizeAr(text))) {
    return { action: "ask", reason: "headcount_unplannable", kind: "headcount", candidates: [] };
  }

  // 4. A bare number binds to no slot → ambiguous.
  if (isBareNumber(text)) {
    return { action: "ask", reason: "bare_number", kind: "bare_number", candidates: [] };
  }

  // 5. A referent word with ≠1 concrete candidate → ambiguous (name the real candidates).
  const cand = referentCandidates(text, state);
  if (cand !== null && cand.length !== 1) {
    return { action: "ask", reason: "referent_ambiguous", kind: "referent", candidates: cand };
  }

  // 6. The perception read says Karim did NOT understand → ambiguous (skip-on-doubt → ASK).
  if (read && (read.understood === false || read.confidence === "low" || read.intent === "unknown")) {
    return { action: "ask", reason: "read_not_understood", kind: "unclear", candidates: [] };
  }

  // 7. Otherwise it's actionable — run the normal model + tool loop.
  return { action: "act", reason: "actionable" };
}
