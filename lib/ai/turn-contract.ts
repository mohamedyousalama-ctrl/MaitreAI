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
import { containsRenderedRecap, renderDraftRecap } from "./recap-render";

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

export type NextStepKind = "pending_question" | "draft_recap" | "handoff";

export interface TurnContractInput {
  text: string;
  dialect: string;
  draft: OrderDraft;
  /** The turn's pending deterministic question (from the ask-back settle), if any. */
  pendingQuestion?: string | null;
  /** True when this turn already set an escalation/handoff (satisfies (c)). */
  escalated?: boolean;
  /** The kitchen-readable session allergy note, for the draft-recap next-step. */
  allergyNote?: string | null;
}

export interface TurnContractResult {
  text: string;
  appended: boolean;
  /** Which next-step was appended (null when the contract was already satisfied). */
  kind: NextStepKind | null;
  /** Whether a future-promise pattern was present (observability). */
  futurePromise: boolean;
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
  const satisfied =
    hasQuestion(text) ||
    containsRenderedRecap(text) ||
    hasHandoffLine(text) ||
    input.escalated === true;

  if (satisfied) return { text, appended: false, kind: null, futurePromise };

  // Not satisfied → append the deterministic next-step.
  const q = input.pendingQuestion?.trim();
  if (q && !replyContainsQuestion(text, q)) {
    return { text: `${text.trim()}\n${q}`, appended: true, kind: "pending_question", futurePromise };
  }
  if (input.draft.lines.length > 0) {
    const recap = renderDraftRecap(input.draft, {
      dialect: input.dialect,
      allergyNote: input.allergyNote,
      phase: "readback",
      trailer: input.dialect === "saudi" ? "أكمل؟" : "أكمّل؟",
    });
    return { text: `${text.trim()}\n${recap}`, appended: true, kind: "draft_recap", futurePromise };
  }
  return {
    text: `${text.trim()}\n${honestHandoffLine(input.dialect)}`,
    appended: true,
    kind: "handoff",
    futurePromise,
  };
}
