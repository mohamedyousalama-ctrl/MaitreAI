// ============================================================================
// MaitreAI — WO-ACTION-CLAIM-GUARD: the fabricated-action guard (flag action_claim_guard).
//
// PURE (no I/O, no model calls). Root-fixes the "fabricated action" class proven live:
// the customer said «خليهم ١» (make it 1); the model replied «هخلي البيتزا... واحدة بس ✅»
// but that turn made ZERO tool calls — the draft still said quantity 2 and the next recap
// billed ٢×. The model NARRATED a mutation it never performed and stamped a false ✅.
//
// This module supplies the deterministic detectors the caller (respond.ts, flag ON) uses at
// the SAME outbound-validation stage as the numeral-provenance guard:
//   • detectModificationClaim(reply) — does the reply CLAIM a first-person draft modification?
//   • draftFingerprint(draft)        — a stable hash of the draft lines (itemId/variant/qty)+total,
//                                       so "did the draft actually change this turn?" is exact.
//   • claimNeedsMutationRetry(...)    — reply claims a change AND no draft-mutation tool ran AND
//                                       the fingerprint is unchanged → block + retry once.
//   • retrySucceeded(...)            — the retry mutated (a mutation tool ran OR the fingerprint
//                                       changed) → send the retry; else → deterministic clarify.
// The caller performs the terminal block→retry→clarify action; this module never calls a model.
// Flag OFF → the caller never invokes any of this → byte-identical.
// ============================================================================

import type { OrderDraft } from "./tools";

/** Order-building tools that actually MUTATE the draft (lines / quantities / total / fulfillment
 *  / payment). A turn that ran one of these did change (or could change) the draft, so a
 *  modification claim is NOT fabricated. Read-only tools (get_order_summary, present_*, photos,
 *  escalate) are deliberately excluded — claiming a change after only reading is still a lie. */
export const DRAFT_MUTATION_TOOLS: ReadonlySet<string> = new Set([
  "add_to_order",
  "remove_from_order",
  "set_fulfillment",
  "set_delivery_address",
  "clear_order",
  "set_payment_method",
  "finalize_draft",
]);

/** The strict retry directive appended (for ONE re-run) when a fabricated modification is caught:
 *  actually use the tools before replying — never claim a change you did not perform. */
export const ACTION_CLAIM_RETRY_DIRECTIVE =
  "نفّذ التعديل فعليًا عبر الأدوات قبل الرد. ممنوع تقول إنك عدّلت وأنت ما عدلتش.";

/** The deterministic honest clarify sent when the retry ALSO claims without mutating. Fixed
 *  string table — never a model call, never certifies a change that did not happen. */
const CLARIFY: Record<string, string> = {
  egyptian: "تحب أعدّل الكمية؟ قولّي الكمية الجديدة وأنا أظبطها فورًا 🙏",
  saudi: "تبي أعدّل الكمية؟ قول لي الكمية الجديدة وأنا أظبطها فورًا 🙏",
};

/** The fixed honest clarify line for the given dialect (defaults to the Egyptian line). */
export function actionClaimClarify(dialect: string): string {
  return CLARIFY[dialect] ?? CLARIFY.egyptian;
}

// --- detection primitives ----------------------------------------------------

/** Light Arabic normalization: strip tashkeel + tatweel, unify alef/hamza forms, ة→ه, ى→ي.
 *  Collapses «عدّلت»→«عدلت» and «أضفت»→«اضفت» so one entry covers each spelling. Keeps digits
 *  and the ✅ emoji intact (they carry meaning for the checkmark rule). */
function normalize(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** First-person past / near-future modification verbs about the order (normalized forms). */
const MOD_VERBS = [
  "هخلي",
  "خليت",
  "خليتها",
  "عدلت", // covers عدّلت after diacritic strip
  "شيلت",
  "شلت",
  "ضفت",
  "اضفت", // covers أضفت
  "تم التعديل",
  "تم التغيير",
  "خلصت التعديل",
];

/** Generic order-context words the verb must co-occur with (normalized). */
const ORDER_WORDS = ["طلب", "اوردر", "الكميه", "كميه"];

/** Quantity words used both for verb co-occurrence and for the ✅ adjacency rule (normalized). */
const QTY_WORDS = ["واحده", "واحد", "اتنين", "اثنين", "تنين", "تلاته", "ثلاثه", "اربعه", "اربع", "خمسه"];

/** A digit-count written with «×» (e.g. «٢×» / «×2») — the quantity-multiplier notation. */
const DIGIT_TIMES = /[0-9٠-٩۰-۹]+\s*×|×\s*[0-9٠-٩۰-۹]+/;

/** Any significant word (≥3 chars) of a draft item name appears in the text → an item reference. */
function mentionsItem(norm: string, itemNames: string[]): boolean {
  for (const name of itemNames) {
    for (const word of normalize(name).split(/\s+/)) {
      if (word.length >= 3 && norm.includes(word)) return true;
    }
  }
  return false;
}

/** True when a ✅ sits adjacent (±24 chars) to a quantity word or a «N×» multiplier. */
function checkmarkNearQuantity(norm: string): boolean {
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] !== "✅") continue;
    const window = norm.slice(Math.max(0, i - 24), i + 24);
    if (QTY_WORDS.some((w) => window.includes(w)) || DIGIT_TIMES.test(window)) return true;
  }
  return false;
}

/**
 * Does the reply CLAIM a first-person modification of the order? Conservative — fires only on:
 *   Rule A — a modification verb co-occurring with an order word, a quantity word, or a draft
 *            item reference (so a bare «عدلت» about something unrelated never trips it); OR
 *   Rule B — a ✅ adjacent to a quantity word / «N×» multiplier (the «واحدة بس ✅» stamp).
 * Greetings and questions (no verb, no ✅-near-quantity) are NOT detected.
 */
export function detectModificationClaim(replyText: string, itemNames: string[] = []): boolean {
  if (!replyText || !replyText.trim()) return false;
  const norm = normalize(replyText);
  const hasVerb = MOD_VERBS.some((v) => norm.includes(v));
  const hasOrderCtx =
    ORDER_WORDS.some((w) => norm.includes(w)) || QTY_WORDS.some((w) => norm.includes(w)) || mentionsItem(norm, itemNames);
  const ruleA = hasVerb && hasOrderCtx;
  const ruleB = norm.includes("✅") && checkmarkNearQuantity(norm);
  return ruleA || ruleB;
}

/**
 * A stable fingerprint of the order draft: the lines (itemId + variant + quantity) plus the total.
 * Sorted so it is invariant to line ordering; identical before/after ⇒ the draft did NOT change.
 */
export function draftFingerprint(draft: OrderDraft | null | undefined): string {
  const lines = (draft?.lines ?? [])
    .map((l) => ({ itemId: l.itemId, variant: l.variant?.name ?? null, quantity: l.quantity }))
    .sort((a, b) => `${a.itemId}|${a.variant}`.localeCompare(`${b.itemId}|${b.variant}`));
  return JSON.stringify({ lines, total: draft?.total ?? 0 });
}

/** True when the reply claims a modification but NO draft mutation happened this turn (no
 *  mutation tool ran AND the fingerprint is unchanged) → the caller must block + retry once. */
export function claimNeedsMutationRetry(args: {
  replyText: string;
  itemNames?: string[];
  executedTools: string[];
  beforeFingerprint: string;
  afterFingerprint: string;
}): boolean {
  const { replyText, itemNames = [], executedTools, beforeFingerprint, afterFingerprint } = args;
  if (!detectModificationClaim(replyText, itemNames)) return false;
  if (executedTools.some((t) => DRAFT_MUTATION_TOOLS.has(t))) return false;
  return beforeFingerprint === afterFingerprint;
}

/** True when the retry ACTUALLY mutated the draft — a mutation tool ran during the retry OR the
 *  fingerprint changed — so its reply is honest and may be sent; else the caller sends clarify. */
export function retrySucceeded(args: {
  executedToolsSinceRetry: string[];
  fingerprintBeforeRetry: string;
  fingerprintAfterRetry: string;
}): boolean {
  const { executedToolsSinceRetry, fingerprintBeforeRetry, fingerprintAfterRetry } = args;
  return (
    executedToolsSinceRetry.some((t) => DRAFT_MUTATION_TOOLS.has(t)) ||
    fingerprintBeforeRetry !== fingerprintAfterRetry
  );
}
