// ============================================================================
// MaitreAI — WO-SAFETY-MODEL-V3 (SINGLE DOOR). The ONE deterministic detector that
// gates every conversation transfer. isExplicitHumanRequest is TRUE only when the
// customer DIRECTLY asks to talk to / be transferred to a human (staff / منظف / مدير /
// person). It is deliberately NARROW: frustration, an allergy mention, and the model's
// own judgment are NOT human requests — so no prompt reasoning or tool call can transfer
// a conversation unless the customer actually asked. PURE, no I/O.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// A HUMAN target: staff / someone / a person / a manager — NOT «المطبخ»/«الشيف» (those
// are order-context, not a request for the human agent). «حد» (someone) is included but
// only fires paired with a talk/want verb below (so «في حد يرد؟» alone never transfers).
const HUMAN_AR = /(?:موظف[هة]?|مندوب|مدير[هة]?|بشري|انسان|شخص|بني ?ادم|(?<![ء-ي])حد(?![ء-ي])|(?<![ء-ي])احد(?![ء-ي]))/;
// TALK / TRANSFER intent.
const TALK_AR = /(?:اكلم|أكلم|اتكلم|نكلم|كلمني|كلّمني|كلمن|احكي|اتواصل|تواصل|حول(?:ني|وني|ني)?|حوّل|وصل(?:ني|وني)|وصّل|تحويل|رد ?علي|يرد ?علي)/;
// WANT intent (a bare want + human — «عايز موظف»).
const WANT_AR = /(?:عايز|عاوز|ابغي|ابغى|ابي|ودي|بدي|محتاج|اريد|أريد|ممكن|اقدر ?اكلم)/;

// English / Franco — a talk/want verb near a human target, or a fixed phrase.
const EN_RE = /\b(?:talk|speak|transfer|connect|get|want|need|reach)\b[\s\S]{0,24}\b(?:human|agent|person|someone|representative|rep|staff|manager)\b|\breal person\b|\bhuman (?:please|agent|being)\b|\b(?:agent|representative) please\b/i;

/**
 * The SINGLE DOOR predicate. True iff the message is a DIRECT request for a human —
 * (a human target token) AND (a talk/transfer or want intent), or an English equivalent.
 * Never fires on frustration, allergy mentions, or model judgment. Pure.
 */
export function isExplicitHumanRequest(message: string | null | undefined): boolean {
  const raw = String(message ?? "");
  if (!raw.trim()) return false;
  const n = normalizeAr(raw);
  if (HUMAN_AR.test(n) && (TALK_AR.test(n) || WANT_AR.test(n))) return true;
  return EN_RE.test(raw);
}
