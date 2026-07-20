// ============================================================================
// MaitreAI — WO-SIMPLIFY (PART E): the SINGLE deterministic final-compose function.
//
// PURE (no I/O, no model calls). Production, DB-proven: several finish-line injectors
// spliced into the outgoing text INDEPENDENTLY — the deterministic recap, the ask-back
// settle, and the turn contract each appended in turn — and on an inconsistent
// mid-transition draft they interleaved into a corrupted composite reply (a line with a
// price but an EMPTY «الإجمالي:», a recap glued to an info-collection question, two
// questions in one reply). This module owns the ONE ordering pass so it can never happen:
//
//   [cleaned model core]                                   (already vetoed by every guard)
//   → [recap if eligible per PART C, and ONLY from a consistent priced draft (hard guard)]
//   → [exactly ONE trailing question or CTA — the pending deterministic question wins]
//   → [turn-contract next-step, scoped to an active unmet goal (PART D)]
//
// The content guards upstream keep their veto power over WHAT the reply says (they may
// replace/scrub `core`); this function only decides the ORDER and the trailing question,
// once. Gated on brain.finishLine in respond.ts → flag OFF → never invoked → byte-identical.
// ============================================================================

import type { OrderDraft, ToolSignal } from "./tools";
import { recapDue, applyDeterministicRecap, isDraftPricedConsistent } from "./recap-render";
import { injectPendingQuestion, type AskbackMode } from "./askback-injection";
import { enforceTurnContract, type NextStepKind } from "./turn-contract";

export interface ComposeInput {
  /** The cleaned model core after every content guard (money/safety/non-menu/scrub) has run. */
  core: string;
  draft: OrderDraft;
  dialect: string;
  /** The kitchen-readable session allergy note for the recap line, or null to suppress it
   *  (PART A: the simple-allergy posture passes null — the recap never carries an allergy line). */
  allergyNote?: string | null;
  canOrder: boolean;
  toolNames: string[];
  /** True when a safety/handoff event fired this turn (a safety line must never become a recap). */
  safetyEvent: boolean;
  /** brain.finishLine — the assembler runs only when true (respond.ts gates the call too). */
  flagOn: boolean;
  /** The turn's pending deterministic question (address-zone ambiguity), if any. */
  pendingQuestion?: string | null;
  /** True when an escalation/handoff was set this turn (satisfies the contract). */
  escalated?: boolean;
  /** The previous OUTBOUND message text (turn-contract cross-turn de-dup). */
  previousOutbound?: string | null;
  /** True when THIS turn's customer message is a pure social/closing turn (PART D exemption). */
  socialClosing?: boolean;
}

export interface ComposeResult {
  text: string;
  signals: ToolSignal[];
  recapRendered: boolean;
  recapSkippedInconsistent: boolean;
  askbackMode: AskbackMode | "none";
  contractKind: NextStepKind | null;
}

/**
 * Order the final reply ONCE. Recap → single trailing question → scoped contract. Every
 * decision is deterministic and the recap is emitted ONLY from a fully consistent priced
 * draft, so a wrong or empty total can never be displayed.
 */
export function composeFinalReply(input: ComposeInput): ComposeResult {
  const signals: ToolSignal[] = [];
  let text = String(input.core ?? "");
  const pending = input.pendingQuestion?.trim() || null;

  // 1) RECAP (PART C + PART E hard guard). Render only when a recap-trigger tool ran this turn
  //    (recapDue), the draft is a consistent priced draft, and NO pending deterministic question
  //    exists — a pending question means this is an info-collection turn (address ask / zone
  //    disambiguation), which NEVER carries a readback recap; the turn carries the one question.
  let recapRendered = false;
  let recapSkippedInconsistent = false;
  const due = recapDue({
    flagOn: input.flagOn,
    canOrder: input.canOrder,
    draft: input.draft,
    toolNames: input.toolNames,
    safetyEvent: input.safetyEvent,
  });
  if (due && !pending) {
    if (isDraftPricedConsistent(input.draft)) {
      const recapped = applyDeterministicRecap(text, input.draft, {
        dialect: input.dialect,
        allergyNote: input.allergyNote,
        phase: "readback",
      });
      if (recapped !== text) {
        text = recapped;
        recapRendered = true;
        signals.push({ type: "missing_data", detail: { reason: "deterministic_recap_rendered", source: "finish_line_recap" } });
      }
    } else {
      // The draft is mid-transition / inconsistently priced — SKIP the recap entirely rather
      // than render a corrupt total. An empty or wrong «الإجمالي:» is impossible to display.
      recapSkippedInconsistent = true;
      signals.push({ type: "missing_data", detail: { reason: "draft_inconsistent_recap_skipped", source: "recap_consistency_guard" } });
    }
  }

  // 2) ASKBACK — the pending deterministic question is the turn's SINGLE trailing question. The
  //    head-match settle replaces a partial ask (never appends a duplicate «قريب من إيه»).
  let askbackMode: AskbackMode | "none" = "none";
  if (pending) {
    const injected = injectPendingQuestion(text, pending);
    askbackMode = injected.mode;
    if (injected.mode !== "unchanged") {
      text = injected.text;
      signals.push({
        type: "missing_data",
        detail: { reason: "askback_injected", source: "askback_final_settle", mode: injected.mode, question: pending },
      });
    }
  }

  // 3) TURN CONTRACT (PART D) — append the deterministic next-step ONLY when an active unmet goal
  //    exists (open draft / pending question / bare future-promise). A post-completion social turn
  //    is a legal terminal state; the contract never appends an identical next-step twice.
  let contractKind: NextStepKind | null = null;
  if (text.trim()) {
    const contract = enforceTurnContract({
      text,
      dialect: input.dialect,
      draft: input.draft,
      pendingQuestion: pending,
      escalated: input.escalated,
      allergyNote: input.allergyNote,
      previousOutbound: input.previousOutbound,
      socialClosing: input.socialClosing,
    });
    if (contract.appended) {
      text = contract.text;
      contractKind = contract.kind;
      signals.push({
        type: "missing_data",
        detail: { reason: "turn_contract_next_step", source: "finish_line_contract", kind: contract.kind, futurePromise: contract.futurePromise },
      });
    }
  }

  return { text, signals, recapRendered, recapSkippedInconsistent, askbackMode, contractKind };
}
