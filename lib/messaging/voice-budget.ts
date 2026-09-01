// ============================================================================
// MaitreAI — WO-VOICE-2: outbound voice-note budget + suppression (PURE, no I/O).
// Mirrors the media-guard discipline: "layer proposes, deterministic gate decides."
// Khalid's reply is ALWAYS composed as text and the text is ALWAYS sent; this gate
// decides only whether an ADDITIONAL voice note accompanies it.
//
// HARD-ZERO categories → TEXT-ONLY, no voice at all (ruling A, PILOT-CONSERVATIVE):
//   • safety_hold   — a TTS render of a safety message is a new mis-hearing surface
//   • money_figure  — a spoken amount can be misheard (wrong number = wrong charge)
//   • payment_link  — a link must be tappable text, never audio
//   • receipt       — the record of truth is the text/document
// A voice render of any of these has ZERO pilot evidence of safety, so it is
// suppressed. Revisitable via the ratified path once we have real evidence.
//
// BUDGET: max notes/day PER CONVERSATION (default 10, config-overridable — never
// hardcode-forever), reset by a date column the caller resolves (notesSentToday is
// 0 when the stored day != today). A spend-ceiling guard is a fast-follow.
// ============================================================================

/** Default per-conversation daily voice-note cap. Overridable via VOICE_NOTES_PER_DAY. */
export const VOICE_NOTES_PER_DAY_DEFAULT = 10;

/** The active daily cap: env override (VOICE_NOTES_PER_DAY) or the default. */
export function voiceNotesPerDay(): number {
  const raw = Number(process.env.VOICE_NOTES_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : VOICE_NOTES_PER_DAY_DEFAULT;
}

export type VoiceZeroReason = "safety_hold" | "money_figure" | "payment_link" | "receipt";

export interface VoiceBudgetInput {
  /** The voice_notes feature flag (explicit-only). OFF → never any voice. */
  enabled: boolean;
  /** Trigger: the customer used voice this turn OR asked for a voice reply. */
  triggered: boolean;
  /** A hard-zero suppression category fired (safety/money/link/receipt), else null. */
  hardZeroReason: VoiceZeroReason | null;
  /** Voice notes already sent in THIS conversation TODAY (0 when the day rolled over). */
  notesSentToday: number;
  /** The active per-day cap (pass voiceNotesPerDay()). */
  cap: number;
}

export type VoiceBudgetDecision =
  | { send: true; reason: "ok" }
  | { send: false; reason: "disabled" | "not_triggered" | "budget_exhausted" | VoiceZeroReason };

/** Clamp to a non-negative integer. */
function nonNegInt(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Decide whether to send an accompanying voice note. Pure + deterministic. Order:
 * flag → trigger → hard-zero suppression (fail-closed, BEFORE budget) → daily budget.
 */
export function decideVoiceSend(input: VoiceBudgetInput): VoiceBudgetDecision {
  if (!input.enabled) return { send: false, reason: "disabled" };
  if (!input.triggered) return { send: false, reason: "not_triggered" };
  // Hard-zero suppression short-circuits BEFORE any budget math (fail-closed): a
  // safety/money/link/receipt turn is text-only regardless of remaining budget.
  if (input.hardZeroReason) return { send: false, reason: input.hardZeroReason };
  const cap = nonNegInt(input.cap) || VOICE_NOTES_PER_DAY_DEFAULT;
  if (nonNegInt(input.notesSentToday) >= cap) return { send: false, reason: "budget_exhausted" };
  return { send: true, reason: "ok" };
}

// --- reply-content suppression detectors (money / payment link) --------------
// Money figure: a number adjacent to a currency token, EITHER ORDER — plus the shapes a
// real reply actually uses. The previous version required an ASCII digit beside a currency
// word, and was verified to MISS every one of these, all of which were then spoken aloud:
//
//   «الإجمالي: ٧٠.١٥ ر.س»          Arabic-Indic digits — `\d` never matches ٠-٩ at all.
//                                   On a western-digit tenant the outbound formatter
//                                   happened to rewrite these to ASCII first, so the gate
//                                   only ever worked BY ACCIDENT of the tenant profile —
//                                   and on an Arabic-Indic tenant the same formatter
//                                   rewrites a caught price INTO a miss.
//   «قصدك ٧٠ ريال؟»                a quoted read-back: the formatter deliberately exempts
//                                   quoted runs (they are the customer's own words), so
//                                   the digits survive un-normalised.
//   «الكبسة بـ70 والمندي بـ65»      a price with NO currency token — the shape the prompt's
//                                   own few-shot examples use.
//   «الإجمالي 70.15 ﷼»             U+FDFC RIAL SIGN.
//   «بسعر 45 ريـال»                 tatweel inside the currency word.
//
// So: normalise digits and strip tatweel FIRST (see moneyScanText), and treat the bare
// price shapes as money too. A false positive costs one text-only reply, which is free.
const MONEY_RE =
  /(\d[\d.,]*\s*(?:ريال|ر\.?\s?س|sar|s\.?r|جنيه|ج\.?\s?م|درهم|aed|egp|﷼))|((?:ريال|ر\.?\s?س|sar|جنيه|درهم|﷼)\s*\d)/i;
// Bare price shapes, no currency token: «بـ45», «= 75», «45 + 20», «السعر 45».
// The «بـ» prefix is matched as a bare «ب» because moneyScanText strips the tatweel first.
// «ب» needs a WORD BOUNDARY and a unit exclusion. Without them it matched the last letter
// of any Arabic word before a number, and — worse — read «بـ١٥ دقيقة» ("in 15 minutes") as
// a price, silencing one of the most common things a restaurant says. Note `\d` and not
// `\d+` before the lookahead: `\d+` backtracks and the unit exclusion silently never fires.
const PRICE_UNIT_EXCLUDE =
  "دقيقة|دقائق|دقايق|ساعة|ساعات|يوم|أيام|ايام|أسبوع|اسبوع|شهر|أشخاص|اشخاص|شخص|كيلو|جرام|قطعة|قطع|حبة|حبات";
const BARE_PRICE_RE = new RegExp(
  `(?:^|[^\\p{L}\\p{M}])ب\\s*\\d(?![\\d.,\\s]*(?:${PRICE_UNIT_EXCLUDE}))` +
  `|=\\s*\\d|\\d\\s*\\+\\s*\\d` +
  `|(?:السعر|سعر|الإجمالي|المجموع|الاجمالي|بسعر)\\s*:?\\s*\\d`,
  "iu"
);

/** Arabic-Indic and Eastern-Arabic digits -> ASCII, and drop tatweel. The money scan must
 *  not depend on the tenant's digit style: the SAME shared gate serves a western-digit
 *  Saudi tenant and an Arabic-Indic Egyptian one, and a rule that only sees ASCII protects
 *  exactly one of them. */
function moneyScanText(t: string): string {
  return t
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u0640/g, "");
}
// Payment link/intent: an explicit pay marker or a known checkout URL.
const PAY_LINK_RE = /(رابط\s*الدفع|ادفع|الدفع\s*الآن|checkout|moyasar|payment|pay(?:link)?\b|https?:\/\/\S*(?:pay|checkout|moyasar)\S*)/i;

/**
 * Resolve the hard-zero suppression category for a turn, or null if voice is
 * allowed. The caller passes structured signals it already knows (safety hold,
 * receipt) plus the reply text (scanned for money/pay-link). Safety first.
 */
export function voiceHardZeroReason(
  replyText: string,
  signals: {
    safetyHold: boolean;
    isReceipt: boolean;
    /** A LIVE PHONE CALL, where the same screen also shows this reply as text.
     *
     *  The money rule exists because a spoken figure can be MIS-HEARD — "thirty" for
     *  "thirteen" — and a wrong number a customer acted on is a real dispute. On WhatsApp
     *  the voice note sits in its own bubble and there is no reason to take that risk: the
     *  text is already in their hand and suppressing the audio costs nothing.
     *
     *  A CALL IS NOT THAT SHAPE. The call screen displays the reply text at the same moment
     *  the audio plays, so the authoritative figure is on screen and readable while it is
     *  spoken — the compensating control WhatsApp's voice notes never had. Suppressing it
     *  there does not remove the risk; it just makes Khalid answer «كم سعر المندي؟» with
     *  something other than the price while the price sits visible beside him. The Founder
     *  reported exactly that: "what Khalid said is not what is written."
     *
     *  NARROW ON PURPOSE. This waives the MONEY FIGURE only. A payment LINK is still never
     *  spoken (a URL cannot be said usefully and a mis-heard one goes somewhere else), a
     *  receipt/order number is still never spoken (a mis-heard order number is an
     *  operational problem, not a cosmetic one). */
    spokenPricesAllowed?: boolean;
    /** A LIVE PHONE CALL, and the reply is a SAFETY NOTICE.
     *
     *  WHAT SILENCE ACTUALLY DID. Every reply from the allergen gate is marked a safety
     *  turn, and a safety turn was never spoken. On WhatsApp that is right: the sentence is
     *  already in the customer's hand, and a mis-heard safety message is a new hazard for no
     *  gain. On a CALL it produced the opposite of care — the caller mentions an allergy,
     *  Khalid composes an honest, careful sentence («خذت بالي إنك ذكرت المكسرات… ما أقدر
     *  أأكد من عندي إن الصنف يناسبك…») and then says NOTHING AT ALL. Dead air, at the exact
     *  moment someone disclosed something that matters to them. It read to the Founder as a
     *  broken product and would read to a caller as being ignored.
     *
     *  THE SAME COMPENSATING CONTROL AS THE MONEY WAIVER, and that is the whole
     *  justification: the call screen displays the reply while the audio plays, so the
     *  sentence is readable at the moment it is spoken. Mis-hearing is bounded by the text
     *  being right there. Silence is bounded by nothing.
     *
     *  NARROW, AND THE NARROWNESS IS ENFORCED BY `stopReason`, NOT BY THIS FLAG.
     *
     *  Saying "this waives the safety notice only" was not enough, and an audit proved it:
     *  the flag alone waived `safetyHold`, which is ALSO set for active anaphylaxis, for a
     *  calm hold, for an escalation, and for any unlisted stop reason. Driven, the demo call
     *  channel synthesized «🚨 اتصل بالإسعاف 997 الحين…». A comment claiming a scope the code
     *  does not enforce is the defect, not the mitigation. Both are now required: the channel
     *  must allow it AND the branch must be on the list. */
    spokenSafetyAllowed?: boolean;
    /** Which branch produced this reply. Required to speak a safety turn at all — see
     *  `CALL_SPEAKABLE_SAFETY_STOPS`. Absent or unrecognised means silent. */
    stopReason?: string | null;
  }
): VoiceZeroReason | null {
  // FIRST. On every surface but a live call, a safety turn is text-only and that is not
  // negotiable. On a call, ONE named branch may be spoken — the honest notice that continues
  // the conversation — because silence there is not the safe answer either. Everything else,
  // including a branch invented after this line was written, stays text-only.
  if (signals.safetyHold) {
    const speakable =
      signals.spokenSafetyAllowed === true &&
      CALL_SPEAKABLE_SAFETY_STOPS.has(String(signals.stopReason ?? ""));
    if (!speakable) return "safety_hold";
  }
  if (signals.isReceipt) return "receipt";
  const t = moneyScanText(String(replyText ?? ""));
  if (PAY_LINK_RE.test(t)) return "payment_link";
  if (MONEY_RE.test(t) || BARE_PRICE_RE.test(t)) {
    return signals.spokenPricesAllowed ? null : "money_figure";
  }
  return null;
}

// ── WHICH TURNS ARE SAFETY TURNS — decided from the turn, not from proxies ──────────
//
// This exists because a public demo derived "is this a safety turn?" from `escalate ===
// true` and one model string, and the ACTIVE ANAPHYLAXIS branch sets neither: it returns
// escalate:false with model "deterministic_allergen_companion". The reply that was
// therefore synthesized and played to a visitor contained the ambulance number 997 — the
// one sentence in the product where a mis-heard digit has a physical consequence, and the
// exact category the top of this file rules text-only.
//
// The signal is `stopReason`, which every deterministic branch already sets truthfully.

/** Stop reasons whose reply may be spoken. An ALLOWLIST, deliberately: a deterministic
 *  branch added later is SILENT until someone lists it here on purpose. Text-only costs
 *  nothing; a spoken safety message is a new mis-hearing surface. */
export const VOICE_SPEAKABLE_STOP_REASONS: ReadonlySet<string> = new Set([
  "end_turn", "tool_finalized", "goal_clarify", "needs_fulfillment",
  "voice_garble_guard", "voice_ladder_confirm",
  // provider-side stop reasons for an ordinary model turn
  "max_tokens", "stop_sequence", "tool_use", "pause_turn", "refusal",
]);

/** Named for the record; the fail-closed default below already covers them. */
const SAFETY_STOP_REASONS: ReadonlySet<string> = new Set([
  "allergen_companion_emergency", "allergen_gate_notify", "allergy_checkpoint",
  "allergy_simple_deflection", "allergy_calm_hold", "allergy_calm_hold_emergency",
  "bulk_handoff",
]);

/** Turns that read an order back to the customer — a receipt by any other name. */
const RECEIPT_STOP_REASONS: ReadonlySet<string> = new Set([
  "dup_order_reference", "old_draft_restatement",
]);

/** The ONLY safety branches a live call may say out loud.
 *
 *  AN ALLOW LIST, AND IT HAS TO BE. A first version waived `safetyHold` wholesale on a call,
 *  which was described as narrow and was not: `safetyHold` is ALSO true for the active
 *  anaphylaxis branch, for a calm hold, for an escalation, and — by the fail-closed default
 *  below — for any stop reason nobody has listed. An audit drove it and found the demo call
 *  channel synthesizing «🚨 اتصل بالإسعاف 997 الحين…»: the one sentence in this product where
 *  a mis-heard digit has a physical consequence, and the exact category two files forbid by
 *  name. It also re-opened a hold from an earlier turn, including the case where the hold
 *  flag could not be READ and fails closed on purpose.
 *
 *  So the question is not "is this a call" but "is this the reply we actually meant". Only
 *  the notify-without-hold branch is here — the honest «خذت بالي إنك ذكرت…» that continues
 *  the conversation. A branch added later is SILENT until someone lists it, which is the
 *  same discipline as the speakable-stop-reason table above and for the same reason. */
const CALL_SPEAKABLE_SAFETY_STOPS: ReadonlySet<string> = new Set([
  "allergen_gate_notify",
]);

export interface VoiceTurnSignals { safetyHold: boolean; isReceipt: boolean; stopReason: string }

/** Derive the hard-zero signals from a completed turn. Pure. */
export function voiceSignalsForTurn(turn: {
  stopReason?: string | null;
  escalate?: boolean | null;
  model?: string | null;
  orderNumber?: string | null;
}): VoiceTurnSignals {
  const stop = String(turn.stopReason ?? "").trim();
  const model = String(turn.model ?? "");
  const isReceipt = RECEIPT_STOP_REASONS.has(stop) || !!turn.orderNumber;
  const namedSafety =
    turn.escalate === true ||
    SAFETY_STOP_REASONS.has(stop) ||
    // Any allergen branch, including one named after this was written.
    /^deterministic_allerg/.test(model);
  // FAIL CLOSED: a stop reason nobody listed is treated as a safety turn.
  const unknown = !VOICE_SPEAKABLE_STOP_REASONS.has(stop) && !isReceipt;
  return { safetyHold: namedSafety || unknown, isReceipt, stopReason: stop };
}
