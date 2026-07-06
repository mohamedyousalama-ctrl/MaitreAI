// ============================================================================
// MaitreAI — WO-VOICE-2: outbound voice-reply TRIGGER (PURE, no I/O).
// Khalid speaks back ONLY when the customer opened the door: they either sent a
// voice note this turn (mirror the medium) OR explicitly asked for a voice reply.
// A typed-only customer who never asked never receives voice — voice is opt-in by
// the customer's own behavior, not pushed.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// "send me a voice / voice note / reply by voice" — Gulf + Egyptian + English.
// Requires a voice noun (صوت/صوتي/فويس/voice) with a request/reply verb nearby.
const VOICE_REQUEST_RE =
  /((?:رد|ردي|ردّ|كلمني|اسمعني|ابغى|ابي|اريد|عايز|ممكن|تقدر)[\s\S]{0,16}(?:صوت|صوتي|فويس|فويسات))|(?:رساله|رسايل)\s*صوتي|voice\s*(?:note|message|reply|back)|reply\s*(?:with|by|in)\s*voice/i;

/**
 * Should Khalid offer a voice reply this turn? True when the customer's inbound was
 * a voice note, or the (normalized) text explicitly asks for voice.
 */
export function shouldOfferVoiceReply(input: { inboundWasVoice: boolean; userText: string }): boolean {
  if (input.inboundWasVoice) return true;
  const raw = String(input.userText ?? "");
  // Test raw (for the English/Franco forms) and normalized (for Arabic variants).
  return VOICE_REQUEST_RE.test(raw) || VOICE_REQUEST_RE.test(normalizeAr(raw));
}
