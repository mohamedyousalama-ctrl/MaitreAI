// ============================================================================
// MaitreAI — WO-VOICE-QUALITY (PURE, no I/O). Two deterministic helpers used by the
// STT + customer-turn paths, plus the garbled-transcript classifier:
//
//   • buildSttPromptVocab — domain prompt-biasing (part b). A short, tenant-aware
//     comma list (menu item names + common ordering words) seeded into Whisper's
//     `prompt` parameter to bias recognition toward the restaurant's vocabulary.
//     Ships UNFLAGGED (pure quality; no customer-facing behavior).
//
//   • classifyVoiceTranscript / garbledVoiceReply (part d) — the deterministic
//     garbled-transcript guard. A voice turn whose transcript is LOW-CONFIDENCE
//     (below VOICE_QUALITY_FLOOR — a QUALITY floor, distinct from the safety net's
//     more aggressive 0.66) OR shares ZERO tokens with the tenant menu / intent
//     vocabulary is unintelligible → Karim sends an honest "audio unclear, please
//     retype" line instead of engaging the gibberish. Ships FLAGGED
//     (voice_garble_guard, default OFF).
//
// SAFETY-FIRST (binding): the caller evaluates the phonetic/allergen net FIRST and
// only consults this guard when NO safety signal fired — a garbled allergy
// disclosure escalates (fail-closed), it is never dismissed as "unclear".
// ============================================================================

import { normalizeAr } from "./allergen-gate";

/** QUALITY floor for the garble-reply guard — deliberately LOWER than the safety
 *  net's aggressive fail-closed floor (0.66) so borderline-but-usable audio is still
 *  served rather than bounced. Named tunable (founder ruling). */
export const VOICE_QUALITY_FLOOR = 0.55;

// Common ordering / conversational INTENT words — a legit ordering turn overlaps at
// least one of these (or a menu item), so zero overlap is a strong gibberish signal.
// Normalized forms.
const INTENT_VOCAB: string[] = [
  "منيو", "قائمه", "اطلب", "طلب", "ابغي", "ابي", "عايز", "عاوز", "ودي", "بدي",
  "توصيل", "دليفري", "استلام", "فرع", "كاش", "مدي", "فيزا", "شبكه", "سعر", "كم",
  "وحده", "حبه", "كيلو", "نص", "زياده", "بدون", "مع", "حجز", "طاوله", "كوب",
  "اهلا", "مرحبا", "سلام", "هلا", "مساء", "صباح", "شكرا", "لو سمحت", "من فضلك",
].map(normalizeAr);

/** Tokenize a normalized string into content tokens (≥2 chars), dropping the «ال»
 *  article so «المنيو» and «منيو» compare equal. */
function contentTokens(normalized: string): string[] {
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => (t.length > 3 && t.startsWith("ال") ? t.slice(2) : t))
    .filter((t) => t.length >= 2);
}

/**
 * Part (b) — build the Whisper `prompt` bias string from the tenant's menu. Item
 * names first (the words most likely to be garbled), then the generic ordering
 * words. Deduped, comma-joined, and LENGTH-CAPPED (~200 chars) — the prompt is a
 * soft recognition bias, not a transcript. Pure; empty menu → the intent words alone.
 */
export function buildSttPromptVocab(itemNames: Array<string | null | undefined>, maxLen = 200): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const s = String(raw ?? "").trim();
    if (!s) return;
    const key = normalizeAr(s);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const n of itemNames) push(n);
  // A few human-readable ordering words (raw, not normalized — the prompt biases the
  // model's own orthography).
  for (const w of ["منيو", "قائمة", "أطلب", "توصيل", "استلام", "كاش", "شبكة"]) push(w);
  let s = "";
  for (const term of out) {
    const next = s ? `${s}، ${term}` : term;
    if (next.length > maxLen) break;
    s = next;
  }
  return s;
}

export interface VoiceTranscriptClassification {
  garbled: boolean;
  reason: "empty" | "low_confidence" | "no_vocab_overlap" | null;
}

/**
 * Part (d) — deterministic garbled-transcript classifier. Pure. `garbled` when the
 * transcript is empty, LOW-CONFIDENCE (< VOICE_QUALITY_FLOOR, only when a confidence
 * number is present), OR shares zero content tokens with the tenant menu ∪ intent
 * vocabulary. The caller is responsible for the SAFETY-FIRST gate (only consult this
 * when no allergen/phonetic/emergency signal fired).
 */
export function classifyVoiceTranscript(args: {
  text: string;
  confidence?: number | null;
  menuVocab?: Array<string | null | undefined>;
}): VoiceTranscriptClassification {
  const text = String(args.text ?? "");
  if (!text.trim()) return { garbled: true, reason: "empty" };

  const conf = args.confidence;
  if (typeof conf === "number" && Number.isFinite(conf) && conf < VOICE_QUALITY_FLOOR) {
    return { garbled: true, reason: "low_confidence" };
  }

  const tokens = contentTokens(normalizeAr(text));
  const vocab = new Set<string>(INTENT_VOCAB);
  for (const name of args.menuVocab ?? []) {
    for (const t of contentTokens(normalizeAr(String(name ?? "")))) vocab.add(t);
  }
  const overlaps = tokens.some((t) => vocab.has(t));
  if (!overlaps) return { garbled: true, reason: "no_vocab_overlap" };

  return { garbled: false, reason: null };
}

/** The ratified warm "audio unclear, please retype" reply (founder ruling, verbatim),
 *  dialect-adapted for Khalid/KSA. Never engages the gibberish; invites text/resend. */
export function garbledVoiceReply(dialect: string): string {
  return dialect === "egyptian"
    ? "معلش، الصوت مش واضح 🙏 ممكن تكتبلي طلبك أو تبعت الرسالة تاني؟"
    : "معليش، الصوت مو واضح 🙏 تقدر تكتب لي طلبك أو تعيد إرسال الرسالة؟";
}
