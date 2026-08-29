// ============================================================================
// MaitreAI — WO-FINISH-LINE (PART B): the deterministic TURN CONTRACT.
//
// PURE (no I/O, no model calls). Production, DB-proven: a party order hit the
// 6-iteration tool cap and the final text was a BARE FUTURE-PROMISE
// («هختارلك أحسن تنوع!») — no question, no recap, no handoff — so the
// conversation dead-ended silently, the customer with nothing to answer.
//
// The contract, checked at the validation stage AFTER every existing guard (and
// after the ask-back settle, so it never double-appends): every outgoing reply must
// carry ≥1 of —
//   (a) a question / interrogative,
//   (b) a completed-action recap (a rendered PART-A total block is present), or
//   (c) an escalation / handoff line.
// A reply carrying a future-promise pattern (هختار/هجهز/هظبط/هرتب + لك) but none of
// (a)/(b)/(c), or a reply matching none of the three, gets the deterministic
// NEXT-STEP appended: the turn's pending question if one exists, else a rendered
// draft recap + «أكمل؟», else an honest handoff line. Never a dead end.
//
// Read ONLY by respond.ts, gated on brain.finishLine — flag OFF → never invoked →
// byte-identical.
// ============================================================================

import type { OrderDraft } from "./tools";
import { normalizeAr } from "./allergen-gate";
import { replyContainsQuestion } from "./askback-injection";
import { containsRenderedRecap, renderDraftRecap, isDraftPricedConsistent } from "./recap-render";

/** (a) a question mark (Arabic «؟» or Latin «?»). The interrogative signal. */
export function hasQuestion(text: string): boolean {
  return /[?؟]/.test(String(text ?? ""));
}

/** (c) an escalation / handoff line — Karim is transferring / alerting the team. */
const HANDOFF_RE = /(?:أحوّل|أحول|نحوّل|نحول|هحوّل|هحول|حوّلت|حولت|حوّلتك|حولتك|الفريق|موظف|بلّغت|بلغت|نبّهت|نبهت|بحوّل|بحول)/u;
export function hasHandoffLine(text: string): boolean {
  return HANDOFF_RE.test(String(text ?? ""));
}

/** A future-promise pattern: a near-future verb (هختار/هجهز/هظبط/هرتب, ه or ح prefix)
 *  bound to a «لك» beneficiary clitic — «هختارلك», «هجهّزلك», «هظبط لك». Normalized
 *  (diacritics/tatweel stripped) so «هجهّزلك» → «هجهزلك» matches. This is the SYMPTOM
 *  the contract exists to catch; the append gate itself is "none of (a)/(b)/(c)". */
const FUTURE_PROMISE_RE = /[هح](?:ختار|جهز|ظبط|رتب)(?:ها|هم|هملك)?\s*لك/;
export function hasFuturePromise(text: string): boolean {
  return FUTURE_PROMISE_RE.test(normalizeAr(String(text ?? "")));
}

/** The honest handoff line appended when there is neither a pending question nor a
 *  draft to recap — Karim offers to bring in the team rather than dead-ending. */
export function honestHandoffLine(dialect: string): string {
  return dialect === "saudi"
    ? "خلّني أوصلك بأحد من الفريق يكمّل معك 🙏"
    : "خليني أوصلك بحد من الفريق يكمّل معاك 🙏";
}

export type NextStepKind = "pending_question" | "draft_recap" | "sales_nudge" | "handoff";

/**
 * The terminal next-step for a SALES agent.
 *
 * The contract's last resort used to be honestHandoffLine — "let me fetch you a human".
 * For a restaurant host that is backwards: any warm statement without a «؟» resolved to
 * offering to hand the guest away. A live 50-conversation run measured handoff language
 * in 20% of turns, NINE OF TEN of them with escalate:false — so the agent kept offering
 * a transfer that no tool was performing. prompt.ts:463 calls that out by name: never say
 * you are transferring unless escalate_to_human actually ran.
 *
 * §ESC TIER 0 in the same prompt says the everyday case is "HANDLE IT — never bail", and
 * prompt.ts:449 forbids ending an open browse with a content-free deflection. A question
 * that moves the order forward satisfies the contract AND does the job.
 *
 * Deliberately NOT «الأكثر طلباً» — prompt.ts:475 forbids claiming popularity, because the
 * menu data carries no order-volume field to back it.
 */
export function salesNextStepLine(dialect: string): string {
  return dialect === "saudi"
    ? "تبي أعرض لك المنيو وأساعدك تختار؟"
    : "تحب أعرضلك المنيو وأساعدك تختار؟";
}

export interface TurnContractInput {
  text: string;
  /** WO-PRESENT-NEXTSTEP — this turn carries an interactive presentation (a category
   *  list, item list, quantity/confirm/payment buttons). THE PRESENTATION IS THE NEXT
   *  STEP: the customer's next move is a tap, not an answer to a question.
   *
   *  Without this the contract saw a warm sentence with no «؟», judged it a dead end, and
   *  glued «خلّني أوصلك بأحد من الفريق يكمّل معك 🙏» underneath — so asking «ايش المنيو»
   *  produced a tappable menu WITH an offer to fetch a human stapled to it. prompt.ts:512
   *  explicitly instructs the model to write exactly such an opener («تفضّل، هذي قائمتنا 👇»),
   *  so the engine was punishing the sentence it asked for. It also broke the engine's own
   *  honesty law (prompt.ts:463): never claim a transfer without calling escalate_to_human. */
  hasPresentation?: boolean;
  /** WO-SLOTFILL — this turn is COLLECTING A VALUE the order cannot be finalized without
   *  (a delivery zone or a street address). Like hasPresentation, the customer's next move
   *  is already determined: type the value. It is not a dead end needing a next-step.
   *
   *  The contract has a `pendingQuestion` input meant to cover this, but on a tenant
   *  without `address_flow_v2` all three producers of that value are gated off, so it is
   *  structurally always null and reply-compose's skip never fires. Live on the demo:
   *  «محتاج العنوان التفصيلي (الشارع + علامة مميزة) عشان أكمل الطلب» — an imperative with
   *  no «؟» — was judged unsatisfied, and «تبي أعرض لك المنيو وأساعدك تختار؟» was glued
   *  underneath. Two questions in one turn, and the wrong one: a menu offer in the middle
   *  of taking an address.
   *
   *  Deliberately NOT a blanket suppression. A genuine dead end — empty basket, pickup, or
   *  a delivery draft with nothing missing — still runs the full contract. */
  openSlotFill?: boolean;
  /** True on a safety/allergy turn. The ONLY case where the terminal fallback is still
   *  an offer to fetch a human — everywhere else that was a transfer nobody performed. */
  safetyEvent?: boolean;
  dialect: string;
  draft: OrderDraft;
  /** The turn's pending deterministic question (from the ask-back settle), if any. */
  pendingQuestion?: string | null;
  /** True when this turn already set an escalation/handoff (satisfies (c)). */
  escalated?: boolean;
  /** The kitchen-readable session allergy note, for the draft-recap next-step. */
  allergyNote?: string | null;
  /** WO-SIMPLIFY (PART D) — the previous OUTBOUND message text. The contract never appends a
   *  next-step that the previous message already ended with (kills the 3× identical handoff). */
  previousOutbound?: string | null;
  /** WO-SIMPLIFY (PART D) — true when THIS turn's customer message is a pure social/closing
   *  turn (gratitude / farewell, no order intent). Only a social turn with NO active unmet goal
   *  and NO future-promise is exempt from the contract (a legal terminal state). */
  socialClosing?: boolean;
}

export interface TurnContractResult {
  text: string;
  appended: boolean;
  /** Which next-step was appended (null when the contract was already satisfied). */
  kind: NextStepKind | null;
  /** Whether a future-promise pattern was present (observability). */
  futurePromise: boolean;
  /** WO-SIMPLIFY (PART D) — true when the contract did not apply because there was no active
   *  unmet goal (a post-completion social turn is a legal terminal state — no next-step). */
  socialTerminal?: boolean;
}

/** WO-SIMPLIFY (PART D) — a pure SOCIAL/CLOSING turn: gratitude or farewell with NO order
 *  intent. Order-intent tokens (want/add/remove/total/menu/order/delivery…) disqualify it, so
 *  «شكراً كمان عايز بيتزا» is NOT social-closing. Used to exempt only genuine post-completion
 *  pleasantries from the turn contract (never an active build turn). Pure. */
const SOCIAL_ORDER_INTENT_RE = /(عايز|عاوز|ابغى|ابغي|ابي|اريد|اضيف|ضيف|زود|احذف|شيل|الغي|كام|بكام|الحساب|الاجمالي|الإجمالي|طلب|منيو|قائمه|قائمة|توصيل|استلام|عنوان|ادفع|الدفع)/;
const SOCIAL_CLOSING_RE = /(شكر|متشكر|مشكور|تسلم|ممنون|تمام خلاص|خلاص كده|خلاص كفايه|مع السلامه|الله يخليك|الله يعافيك|(?<![ء-ي])باي(?![ء-ي])|bye|thank|thx|thanks)/i;
export function isSocialClosingTurn(message: string | null | undefined): boolean {
  const n = normalizeAr(String(message ?? ""));
  if (!n) return false;
  if (SOCIAL_ORDER_INTENT_RE.test(n)) return false;
  return SOCIAL_CLOSING_RE.test(n);
}

/** WO-SIMPLIFY (PART D) — an ACTIVE UNMET GOAL exists iff there is an open unconfirmed draft
 *  (lines present, not finalized) OR a pending deterministic question. Only then does the turn
 *  contract apply; a finalized/empty draft with nothing pending is a compliant terminal state
 *  (closing pleasantries), so the contract must NOT append a handoff to a social «شكراً» turn. */
export function hasActiveUnmetGoal(draft: OrderDraft, pendingQuestion?: string | null): boolean {
  const openDraft = Array.isArray(draft.lines) && draft.lines.length > 0 && draft.finalized !== true;
  return openDraft || !!(pendingQuestion && pendingQuestion.trim());
}

/** True iff `previous` already ends with `nextStep` (normalized) — so an identical next-step is
 *  never appended twice across turns (the DB-proven 3×-handoff repeat). Compares the trailing
 *  segment after trimming/whitespace-collapse. */
function previousAlreadyEndsWith(previous: string | null | undefined, nextStep: string): boolean {
  const prev = normalizeAr(String(previous ?? "")).replace(/\s+/g, " ").trim();
  const step = normalizeAr(nextStep).replace(/\s+/g, " ").trim();
  if (!prev || !step) return false;
  return prev.endsWith(step) || prev.includes(step);
}

/**
 * Enforce the turn contract. Satisfied ⇔ the reply carries (a) a question, (b) a
 * rendered recap, or (c) a handoff line / an escalation was set this turn. When NOT
 * satisfied, append the deterministic next-step (pending question → draft recap +
 * «أكمل؟» → honest handoff). Pure; only ever ADDS the already-computed next-step.
 * Integrates with the ask-back settle: a pending question already relayed in `text`
 * counts as (a) and is never appended again.
 */
export function enforceTurnContract(input: TurnContractInput): TurnContractResult {
  const text = String(input.text ?? "");
  const futurePromise = hasFuturePromise(text);

  // WO-SIMPLIFY (PART D) — SCOPING. The contract is EXEMPT only on a genuine post-completion
  // social turn: a pure gratitude/farewell message with NO active unmet goal (no open unconfirmed
  // draft, no pending question) and NO bare future-promise this turn. That is a legal terminal
  // state (closing pleasantries), so the contract never appends a handoff to it (the DB-proven
  // «شكراً» → 3× handoff-appendix bug). Any active build/order turn still runs the contract.
  const exemptSocialTerminal =
    input.socialClosing === true &&
    !hasActiveUnmetGoal(input.draft, input.pendingQuestion) &&
    !futurePromise;
  if (exemptSocialTerminal) {
    return { text, appended: false, kind: null, futurePromise, socialTerminal: true };
  }

  const satisfied =
    hasQuestion(text) ||
    containsRenderedRecap(text) ||
    hasHandoffLine(text) ||
    // An attached list/buttons IS the next step — see hasPresentation above.
    input.hasPresentation === true ||
    // A value the order cannot close without is being collected — see openSlotFill above.
    // NEVER over a future-promise or a safety turn. This sat in the disjunction ahead of
    // `safetyEvent` (consulted far below), so an allergen turn on a zone-less delivery
    // draft silently lost the honest handoff line the contract exists to guarantee — and a
    // bare future-promise («هجهزلك أحسن تنوع») became a dead end with nothing to answer,
    // which is the exact production failure this module was written for.
    (input.openSlotFill === true && !futurePromise && input.safetyEvent !== true) ||
    input.escalated === true;

  if (satisfied) return { text, appended: false, kind: null, futurePromise };

  // Not satisfied → append the deterministic next-step (unless the previous outbound message
  // already ended with the very same step — never repeat an identical next-step across turns).
  const q = input.pendingQuestion?.trim();
  if (q && !replyContainsQuestion(text, q)) {
    if (previousAlreadyEndsWith(input.previousOutbound, q)) {
      return { text, appended: false, kind: null, futurePromise };
    }
    return { text: `${text.trim()}\n${q}`, appended: true, kind: "pending_question", futurePromise };
  }
  // The draft-recap next-step is rendered ONLY from a consistent priced draft (PART E hard guard):
  // an inconsistent mid-transition draft falls through to the honest handoff, so the contract can
  // never ship an empty/wrong «الإجمالي:» either.
  if (input.draft.lines.length > 0 && isDraftPricedConsistent(input.draft)) {
    const recap = renderDraftRecap(input.draft, {
      dialect: input.dialect,
      allergyNote: input.allergyNote,
      phase: "readback",
      trailer: input.dialect === "saudi" ? "أكمل؟" : "أكمّل؟",
    });
    return { text: `${text.trim()}\n${recap}`, appended: true, kind: "draft_recap", futurePromise };
  }
  // A SALES NEXT-STEP, NOT A HANDOFF. This used to go straight to "let me fetch you a
  // human" — see salesNextStepLine for why that was the wrong terminal state for a host.
  //
  // The handoff is kept for the one case where it is honest: a SAFETY turn, where the
  // engine genuinely wants a human in the loop. Everywhere else the agent asks a question
  // that advances the order, which satisfies the contract without promising a transfer
  // that no tool is performing.
  const handoff = honestHandoffLine(input.dialect);
  if (input.safetyEvent === true) {
    if (previousAlreadyEndsWith(input.previousOutbound, handoff) || hasHandoffLine(text)) {
      return { text, appended: false, kind: null, futurePromise };
    }
    return { text: `${text.trim()}\n${handoff}`, appended: true, kind: "handoff", futurePromise };
  }
  const nudge = salesNextStepLine(input.dialect);
  if (previousAlreadyEndsWith(input.previousOutbound, nudge) || hasHandoffLine(text)) {
    return { text, appended: false, kind: null, futurePromise };
  }
  return {
    text: `${text.trim()}\n${nudge}`,
    appended: true,
    kind: "sales_nudge",
    futurePromise,
  };
}
