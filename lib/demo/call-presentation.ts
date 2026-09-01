// ============================================================================
// MaitreAI — what a CALLER may be sent to look at.
//
// THE BUG THIS EXISTS FOR, in the Founder's words: "when I asked for the menu, he SENT me
// the menu in the chat, and this is not logical — if I am talking on the phone, why would I
// look at the chat window?"
//
// He is right, and the mechanism was worse than it sounds. The call screen is a full-screen
// overlay; the tappable list was pushed into the thread UNDERNEATH it, where the caller
// could not see it even if they wanted to. So the audible half of the turn was «تفضّل، هذي
// قائمتنا 👇» — "here you go, [pointing down]" — and the half that carried the actual
// content went somewhere invisible. The caller heard a pointer to nothing.
//
// THE RULE. On a call, a visual payload is sent ONLY when the caller asked for something
// they must SEE. Everything else is spoken. That is what a person does: a waiter on the
// phone tells you what he has; he sends you the menu only if you ask him to.
//
// WHY A DETECTOR AND NOT A MODEL DECISION. The model already has the call instructions and
// will usually behave — but "usually" on the one screen a prospect is watching is not a
// guarantee, and a presentation costs nothing to withhold and everything to send wrongly.
// This is the deterministic backstop, applied after the turn, on the caller's own words.
// ============================================================================

/** Words that mean "let me SEE it" rather than "tell me about it".
 *
 *  Deliberately narrow. A false NEGATIVE costs a caller one extra sentence («تحب أرسله لك
 *  مكتوب؟»); a false POSITIVE silently pushes a tappable list at someone holding a phone to
 *  their ear, which is the defect this file exists to remove. When unsure, speak. */
const VISUAL_INTENT_RE =
  /صور[ةه]?|بالصور|شكل(ها|ه)?|أشكال|اشكال|ورّ?يني|ورني|أشوف|اشوف|أبي أشوف|ارسل|أرسل|ابعث|أبعث|تبعث|ترسل|مكتوب[ةه]?|بالكتابة|اكتبها|القائمة مكتوبة|المنيو مكتوب|لست[ةه]?|list|menu|send/i;

/** Did the caller ask to be shown something? */
export function callerAskedToSee(userMessage: string): boolean {
  return VISUAL_INTENT_RE.test(String(userMessage ?? ""));
}

/**
 * The presentation a CALL turn may carry.
 *
 * Returns the presentation unchanged when the caller asked to see something, and `null`
 * otherwise. Null is not a degradation: the reply text is still delivered and still spoken,
 * and on this surface a payload nobody can look at is worse than no payload — it splits the
 * answer in half and speaks only the pointer.
 *
 * Pure, and takes the caller's words rather than reading a request, so a proof can drive
 * every branch without a network.
 */
export function presentationForCall<T>(
  presentation: T | null | undefined,
  userMessage: string
): T | null {
  if (!presentation) return null;
  return callerAskedToSee(userMessage) ? presentation : null;
}
