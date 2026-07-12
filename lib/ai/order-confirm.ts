// ============================================================================
// MaitreAI — WO-LIVE5-CONFIRM-GATE: the deterministic order-confirmation detector.
//
// PURE (no I/O). Extracted from respond.ts so it is unit-testable in isolation and so
// the same rule guards BOTH the fast-path auto-finalize AND the finalize_draft tool.
//
// Live #1005 (04:00:28): after «تأكد الطلب؟», the customer's «ابعتلي صوره العرض»
// («send ME a photo of the offer») matched the confirmation verb «ابعت» («send [the
// order]») and, at a confirmation point, auto-finalized a PHANTOM order. The real
// agreement two turns earlier — «ماشي» — was never detected.
//
// Fix: a RECEIVE/photo/menu request can NEVER read as an order confirmation, even when
// it contains a "send" verb. Two independent disqualifiers on the normalized text —
//   • receive-direction morphology: a send/show verb + a "to-me" clitic
//     (ابعتلي / ابعت لي / ارسل لي / وريني / شوفني) — the customer wants to RECEIVE, not
//     to send the order onward;
//   • a media/menu-noun object (reusing media-intent's SHOW_MEDIA_RE vocabulary:
//     صور/صوره/منيو/قايمه/كتالوج/…) — a "send me the X" request.
// «ابعت الطلب» / «ابعتها» / «أكد» / «تمام» carry neither → still confirmations.
// ============================================================================

import { normalizeAr } from "./allergen-gate";
import { SHOW_MEDIA_RE } from "./media-intent";

// A send/show verb bound to a first-person "to-me / me" clitic (لي/لى/ني/نى). Matched on
// normalizeAr'd text. «ابعتلي» = ابعت+لي; «ارسل لي»; «وريني» = وري+ني; «شوفني» = شوف+ني.
const RECEIVE_DIRECTION_RE = /(?:ابعت|بعت|ابعث|ارسل|رسل)\s*(?:لي|لى)|(?:وري|ورين|فرجي|شوف|اشوف|ورجي)(?:ني|نى)/;

/**
 * True iff `text` is an EXPLICIT order confirmation. Negations («لا تأكد», «الغِ»,
 * «cancel») and receive/photo/menu requests are disqualified first; the positive
 * lexicon (أكد/تأكيد/ابعت/رسل/كمل/تمام/أيوه/yes/confirm/send it) is matched on the raw
 * text so every legitimate confirmation form is unchanged from before CONFIRM-GATE.
 */
export function isExplicitOrderConfirmation(text: string): boolean {
  const n = normalizeAr(text);
  // CONFIRM-GATE — a receive / photo / menu request is never an order confirmation,
  // even though «ابعت» ("send") is a confirmation verb (live #1005 phantom-order bug).
  if (RECEIVE_DIRECTION_RE.test(n) || SHOW_MEDIA_RE.test(n)) return false;
  // Negation / cancellation → not a confirmation (unchanged).
  if (/(?:لا|لأ|مش|ما)\s*(?:تأكد|تاكد|تأكيد|تاكيد|تكمل|تبعت|ترسل)|(?:الغ|إلغاء|cancel)/iu.test(text)) return false;
  // Positive confirmation lexicon (unchanged — matched on the raw text).
  return /(?:أكد|اكد|تأكيد|تاكيد|ابعته|ابعت|ارسله|رسل|كمّل|كمل|تمام|أيوه|ايوه|yes|confirm|send it)/iu.test(text);
}
