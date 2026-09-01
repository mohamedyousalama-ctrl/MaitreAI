// ============================================================================
// MaitreAI — WHAT A CALLER HEARS WHEN THE ANSWER MAY NOT BE SPOKEN.
//
// THE PRODUCT RULE, UNCHANGED. Four categories of reply are TEXT-ONLY by design and this
// file does not touch that: a safety hold, a money figure, a payment link, a receipt. The
// authoritative reply — the one carrying the price, the total, the link, the order number,
// the allergen decision — is never synthesized. `voiceHardZeroReason` decides that, and it
// is not relaxed here by one character.
//
// WHY THIS EXISTS ANYWAY. On WhatsApp, suppressing the audio costs nothing: the text is
// already in the customer's hand, and the voice note was only ever an accompaniment. On a
// CALL there is no text in anyone's hand. The same rule that is invisible on WhatsApp
// becomes DEAD AIR: the Founder asked «كم سعر الكبسة؟» — the single most common question a
// restaurant caller asks — and heard three seconds of thinking followed by nothing at all,
// then the microphone reopening. The demo looked broken while behaving exactly as designed.
//
// SO THE CARRIER SPEAKS THE FACT THAT THE TURN HAPPENED, AND NEVER THE PROTECTED VALUE.
// It is a fixed string from a closed list in this file. It contains no digit in any script,
// no number word, no currency token, no link and no order number, and it is put through
// `voiceHardZeroReason` ITSELF before it may be spoken — so it cannot smuggle out the thing
// the rule exists to protect, even if someone later edits it carelessly.
//
// AND A SAFETY HOLD IS NOT IN THIS FILE. An allergy or emergency turn stays silent, with
// no carrier at all. Speaking a soothing sentence over a turn whose entire purpose is that a
// human must check something is precisely the wrong instinct, and «997» must never be
// synthesized: it is the one sentence in this product where a mis-heard digit has a
// physical consequence.
// ============================================================================

import { voiceHardZeroReason, type VoiceZeroReason } from "@/lib/messaging/voice-budget";

/** The categories a caller may hear an acknowledgement for. Deliberately NOT the safety
 *  hold: that one is silent, and adding it here would be a safety change, not a UX one. */
export type CarrierReason = Extract<VoiceZeroReason, "money_figure" | "payment_link" | "receipt">;

/** Fixed, figure-free acknowledgements. Najdi, phone register, one short question or one
 *  short closing — never a statement that leaves the line silent while the guest waits. */
const CARRIERS: Readonly<Record<CarrierReason, string>> = {
  // «سعرها وصلك مكتوب» — the price HAS been answered, in the one place it cannot be
  // misheard. Then a question, so the turn hands the floor back.
  money_figure: "أبشر، السعر وصلك مكتوب الحين. تحب أضيفه للطلب؟",
  // «طريقة الدفع» deliberately, never «رابط الدفع» — the latter would trip the payment-link
  // rule on this very string, which is the check below doing its job.
  payment_link: "تمام، طريقة الدفع وصلتك الحين. أنا معك لين تخلص.",
  // No order number, no total. The details are in the text where they can be read back.
  receipt: "تمام، اعتمدنا طلبك. تفاصيله وصلتك مكتوبة. الله يعطيك العافية.",
};

/** Anything that would let a protected value out through the carrier itself. Checked
 *  independently of `voiceHardZeroReason` because that function is tuned for model prose,
 *  and a carrier is a fixed string we control: it should be held to the stricter bar. */
const ANY_DIGIT = /[0-9٠-٩۰-۹]/;
// `\b` CANNOT ANCHOR BESIDE ARABIC SCRIPT. JavaScript's word boundary is defined over
// [A-Za-z0-9_], so between two Arabic letters there is no boundary at all and this pattern
// matched NOTHING it was written to catch. Driven: a carrier edited to «تمام، اعتمدنا طلبك
// رقم مية وواحد» passed straight through and would have been spoken, while the header
// promised the check held "even if someone later edits it carelessly" — which is the only
// scenario it exists for. Three-quarters of the guard worked (digits, currency, links); the
// number words were decoration.
//
// `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` with the `u` flag is the same intent expressed over
// every script: not preceded or followed by a letter or a digit, so «واحد» is caught and
// «الواحد» is not spuriously matched inside a longer word.
const NUMBER_WORD =
  /(?<![\p{L}\p{N}])(واحد|اثنين|ثنتين|ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة|عشرين|ثلاثين|أربعين|خمسين|ستين|سبعين|ثمانين|تسعين|مية|مئة|ألف)(?![\p{L}\p{N}])/u;
const CURRENCY = /ر\.?\s?س|ريال|جنيه|SAR|EGP/i;
const LINKISH = /https?:|www\.|\.com|رابط|لينك/i;

/**
 * May this exact sentence be spoken as a carrier?
 *
 * EXPORTED SO IT CAN BE DRIVEN. Inline, these four checks were unreachable from any proof:
 * `CARRIERS` is a module constant, so the only strings that ever reached them were the
 * three we already know are clean, and a guard tested only against inputs that pass it is
 * not tested at all. That is precisely how `NUMBER_WORD` shipped with a `\b` that JavaScript
 * cannot anchor beside Arabic script — matching nothing, for as long as it existed, while
 * the header promised it caught a careless edit.
 *
 * Held to a STRICTER bar than `voiceHardZeroReason`, which is tuned for model prose. A
 * carrier is a fixed string we author, so no digit in any script, no spelled number, no
 * currency and no link may appear in one — and then it must pass the product's own gate on
 * its own merits as well.
 */
export function carrierIsSafeToSpeak(carrier: string): boolean {
  const t = String(carrier ?? "");
  if (!t.trim()) return false;
  if (ANY_DIGIT.test(t) || NUMBER_WORD.test(t) || CURRENCY.test(t) || LINKISH.test(t)) return false;
  return voiceHardZeroReason(t, { safetyHold: false, isReceipt: false }) === null;
}

/**
 * The line a caller hears for a turn whose real reply may not be spoken — or null.
 *
 * Null means "stay silent", and that is the correct answer for a safety hold, for an
 * unrecognised reason, and for any carrier that fails its own checks. Fail-closed: an
 * unknown reason is silence, never an invented sentence.
 */
export function callCarrierFor(reason: VoiceZeroReason | null | undefined): string | null {
  if (!reason) return null;
  // The safety hold is deliberately absent from CARRIERS; this is the line that keeps it
  // that way if someone adds a key without reading the header.
  if (reason === "safety_hold") return null;
  const carrier = CARRIERS[reason as CarrierReason];
  if (!carrier) return null;

  // THE CARRIER IS HELD TO ITS OWN RULE. A future edit that put a price, a number word, a
  // currency or a link into one of these strings would defeat the entire point, and the
  // failure would be silent and audible to a customer. Verified on every call rather than
  // trusted at authoring time.
  return carrierIsSafeToSpeak(carrier) ? carrier : null;
}

/** Every carrier, for a proof that wants to check them all without knowing the keys. */
export const ALL_CARRIER_REASONS: readonly CarrierReason[] = Object.keys(CARRIERS) as CarrierReason[];
