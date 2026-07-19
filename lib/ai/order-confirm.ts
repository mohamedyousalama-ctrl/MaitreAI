// ============================================================================
// MaitreAI — WO-LIVE5-CONFIRM-GATE: the deterministic order-confirmation detector.
//
// PURE (no I/O). Extracted from respond.ts so it is unit-testable in isolation and so
// the same rule guards BOTH the fast-path auto-finalize AND the finalize_draft tool.
//
// Live #1005 (04:00:28): after the order-confirm question, the customer's «ابعتلي صوره العرض»
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

// Tight new-order intent: the order noun must be an unarticled token immediately followed
// by the new/repeat qualifier. This catches «عاوز طلب جديد» / «اوردر تاني» but NOT
// «أكد الطلب الجديد» (the article binds it as the order object being confirmed).
const NEW_ORDER_INTENT_RE =
  /(?<![ء-ي])(?:طلب|اوردر|اورد)\s+(?:جديد|تاني|ثاني)(?![ء-ي])|(?<![ء-ي])(?:اطلب|نطلب|اعمل|اعمللي|عاوز\s+اطلب|عايز\s+اطلب|حاب\s+اطلب|حابب\s+اطلب|ابغي\s+اطلب|ابي\s+اطلب)\s+(?:من\s+جديد|تاني|ثاني|كمان\s*مره|مره\s*تانيه)(?![ء-ي])/;

const CONFIRM_VERB_RE = /(?:ا+كد|تاكيد)/;
const ALLERGY_STATUS_RE = /(?:حساسيه|حساسه|allerg(?:y|ic|en)?)/;
const ORDER_BOUND_CONFIRM_RE = /(?:ا+كد|تاكيد)\s+(?:ال)?(?:طلب|طلبيه|اوردر|اورد)/;

// WO-STATE-TRUTH (PART C) — the deterministic ASSENT list at the recap/confirmation
// checkpoint, matched on normalizeAr'd text (أ/إ/آ→ا، ة→ه، ى→ي، diacritics/tatweel folded):
// اكد / أكد / تأكيد / تأكيد الطلب / تمام / أيوه / ايوه / موافق / اوكي / ok / يلا (+ latin
// okay/yes/confirm). Arabic tokens are boundary-guarded so «يلا» never fires inside «يلاقي»
// and «موافق» never inside a larger word. RECOGNITION ONLY — checkpoint semantics unchanged.
const ASSENT_RE =
  /(?<![ء-ي])(?:اكد|تاكيد|تمام|ايوه|موافق|اوكي|اوكيه|اوك|يلا)(?![ء-ي])|(?<![a-z])(?:ok|okay|okey|yes|confirm)(?![a-z])/i;
// A negated agreement («مش موافق» / «غير موافق») stays NEGATIVE.
const NEGATED_ASSENT_RE = /(?:لا|لأ|مش|ما|غير|مو)\s*مواف/;

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
  // A request to start/repeat an order is not confirmation of the current pending order.
  if (NEW_ORDER_INTENT_RE.test(n)) return false;
  // «أأكد إني ما عنديش حساسية» confirms allergy status, not the order. If the confirm
  // verb is explicitly bound to the order object («أكد الطلب/الأوردر»), keep it valid.
  if (ALLERGY_STATUS_RE.test(n) && CONFIRM_VERB_RE.test(n) && !ORDER_BOUND_CONFIRM_RE.test(n)) return false;
  // Negation / cancellation → not a confirmation (unchanged).
  if (/(?:لا|لأ|مش|ما)\s*(?:تأكد|تاكد|تأكيد|تاكيد|تكمل|تبعت|ترسل)|(?:الغ|إلغاء|cancel)/iu.test(text)) return false;
  // WO-STATE-TRUTH (PART C) — a negated agreement is not assent; the extended assent list
  // (normalized) then recognizes موافق/اوكي/ok/يلا (and the existing أكد/تأكيد/تمام/أيوه).
  if (NEGATED_ASSENT_RE.test(n)) return false;
  if (ASSENT_RE.test(n)) return true;
  // Positive confirmation lexicon (unchanged — matched on the raw text).
  return /(?:أكد|اكد|تأكيد|تاكيد|ابعته|ابعت|ارسله|رسل|كمّل|كمل|تمام|أيوه|ايوه|yes|confirm|send it)/iu.test(text);
}
