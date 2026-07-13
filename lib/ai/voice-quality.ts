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
import { scanBannedAllergyPhrases } from "./allergen-companion";
import { parseCanonicalQuantity } from "./stt/slots";

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
  // WO-VOICE-QUALITY-2 — NUMBER words (a quantity correction like «التسعة مش التماني»
  // shares no menu word yet is a perfectly valid ordering turn). Standard + dialectal.
  "واحد", "اثنين", "ثنين", "ثلاثه", "ثلاث", "اربعه", "اربع", "خمسه", "خمس",
  "سته", "ست", "سبعه", "سبع", "ثمانيه", "ثمان", "تماني", "تسعه", "تسع", "عشره", "عشر",
  // WO-VOICE-PRECISION (finding 3) — Egyptian number forms + tens/hundreds. A quantity
  // correction like «مية وخمسين مش ميتين» shares no menu word yet is a valid ordering
  // turn — these keep it from bouncing as zero-overlap gibberish (live msg 1224f0c0).
  "اتنين", "تلاته", "تمنيه", "عشرين", "خمسين", "ميه", "مية", "ميتين",
  // QUANTITY / CORRECTION terms (the «not eight, nine» frame).
  "مش", "غير", "بدل", "قصدي", "يعني", "لا", "كمان", "بس",
  // CONFIRMATION words.
  "تمام", "ماشي", "اه", "ايوه",
].map(normalizeAr);

// WO-VOICE-QUALITY-2 — above this confidence a CORRECTLY-transcribed turn is trusted
// regardless of menu/intent overlap; the weak zero-overlap trigger is scoped to
// uncertain audio only. (Low confidence < VOICE_QUALITY_FLOOR still bounces as before.)
export const OVERLAP_CONF_CEILING = 0.70;
// Arabic-Indic (٠-٩) or ASCII digits count as ordering-relevant vocabulary (a spoken
// «٩ مش ٨») — matched on the whole normalized text since a bare digit is a 1-char token.
const DIGIT_RE = /[٠-٩0-9]/;

/** Tokenize a normalized string into content tokens (≥2 chars), dropping the «ال»
 *  article so «المنيو» and «منيو» compare equal. */
function contentTokens(normalized: string): string[] {
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => (t.length > 3 && t.startsWith("ال") ? t.slice(2) : t))
    .filter((t) => t.length >= 2);
}

/**
 * Part (b) — build the Whisper `prompt` bias string from the tenant's menu. Item names
 * first (the words most likely to be garbled), then the generic ordering words. Deduped,
 * comma-joined, and LENGTH-CAPPED (~200 chars) — the prompt is a soft recognition bias,
 * not a transcript. Pure; empty menu → the intent words alone. WO-VOICE-ALIASES: optional
 * `priorityTerms` (the expected answer-class words when the last AI turn asked for a
 * quantity/size/sauce) are front-loaded so the bias survives the length cap.
 */
export function buildSttPromptVocab(
  itemNames: Array<string | null | undefined>,
  maxLen = 200,
  priorityTerms?: Array<string | null | undefined>
): string {
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
  // State-aware priority terms first (survive the cap), then item names, then ordering words.
  for (const p of priorityTerms ?? []) push(p);
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
 * transcript is empty, LOW-CONFIDENCE (< VOICE_QUALITY_FLOOR), or — for UNCERTAIN audio
 * only (confidence < OVERLAP_CONF_CEILING, incl. no confidence) — shares zero tokens
 * with the tenant menu ∪ intent vocabulary (+ any digit). WO-VOICE-QUALITY-2: a turn at
 * conf ≥ OVERLAP_CONF_CEILING is trusted regardless of overlap, so a correctly-heard
 * number correction like «التسعة مش التماني» @0.725 is never bounced. The caller owns the
 * SAFETY-FIRST gate (only consult this when no allergen/phonetic/emergency signal fired).
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

  // The zero-overlap trigger is a WEAK signal — only trust it to bounce UNCERTAIN audio.
  // At conf ≥ OVERLAP_CONF_CEILING the transcript is trusted regardless of overlap.
  const highConfidence = typeof conf === "number" && Number.isFinite(conf) && conf >= OVERLAP_CONF_CEILING;
  if (!highConfidence) {
    const normalized = normalizeAr(text);
    const tokens = contentTokens(normalized);
    const vocab = new Set<string>(INTENT_VOCAB);
    for (const name of args.menuVocab ?? []) {
      for (const t of contentTokens(normalizeAr(String(name ?? "")))) vocab.add(t);
    }
    const overlaps = DIGIT_RE.test(normalized) || tokens.some((t) => vocab.has(t));
    if (!overlaps) return { garbled: true, reason: "no_vocab_overlap" };
  }

  return { garbled: false, reason: null };
}

/** The ratified warm "audio unclear, please retype" reply (founder ruling, verbatim),
 *  dialect-adapted for Khalid/KSA. Never engages the gibberish; invites text/resend. */
export function garbledVoiceReply(dialect: string): string {
  return dialect === "egyptian"
    ? "معلش، الصوت مش واضح 🙏 ممكن تكتبلي طلبك أو تبعت الرسالة تاني؟"
    : "معليش، الصوت مو واضح 🙏 تقدر تكتب لي طلبك أو تعيد إرسال الرسالة؟";
}

// ---------------------------------------------------------------------------
// WO-VOICE-LADDER — replace the binary garble guard with a confidence→behavior
// ladder. Same voice_garble_guard flag governs the whole ladder; the SAFETY-FIRST
// ordering from WO-VOICE-QUALITY stays binding (the caller only consults this when no
// allergen/emergency signal fired). Bands:
//   • conf ≥ OVERLAP_CONF_CEILING (0.70)  → ACT (today's behavior — proceed to the Brain)
//   • MEDIUM 0.55–0.70 (with overlap)     → CONFIRM (warm "did I get this right?", proceed on yes)
//   • < 0.55, or zero-overlap-under-ceiling → RETYPE (the existing warm retype line)
// ---------------------------------------------------------------------------
export type VoiceLadderAction = "act" | "confirm" | "retype";
export interface VoiceLadderDecision {
  action: VoiceLadderAction;
  reason: string | null;
}

/**
 * Decide the ladder action for a voice turn. Pure. Builds on classifyVoiceTranscript:
 * a garbled classification → RETYPE; otherwise a MEDIUM-confidence turn (0.55 ≤ conf <
 * 0.70) → CONFIRM, and anything else (high confidence, or no-confidence-with-overlap) →
 * ACT. A confirm whose transcript would ECHO a §0 banned safety phrase is DOWNGRADED to
 * RETYPE — Karim must never voice a safety assurance, even quoting the customer.
 */
export function decideVoiceLadder(args: {
  text: string;
  confidence?: number | null;
  menuVocab?: Array<string | null | undefined>;
}): VoiceLadderDecision {
  const c = classifyVoiceTranscript(args);
  if (c.garbled) return { action: "retype", reason: c.reason };

  const conf = args.confidence;
  const medium =
    typeof conf === "number" && Number.isFinite(conf) &&
    conf >= VOICE_QUALITY_FLOOR && conf < OVERLAP_CONF_CEILING;
  // WO-VOICE-HCW — an ACT-band turn (would proceed to the Brain) with an order-frame verb
  // but no resolved target is demoted to CONFIRM, never blind-acted.
  const vetoed = !medium && actBandCoherenceVeto(args.text, args.menuVocab ?? []);
  if (!medium && !vetoed) return { action: "act", reason: null };

  // CONFIRM band (medium confidence OR the coherence veto) — but never echo a §0 banned
  // safety assurance back to the customer.
  if (scanBannedAllergyPhrases(String(args.text ?? "")).length > 0) {
    return { action: "retype", reason: "banned_echo" };
  }
  return { action: "confirm", reason: vetoed ? "coherence_veto" : "medium_confidence" };
}

/** WO-VOICE-LADDER — the warm CONFIRM reply for a medium-confidence voice turn: confirm
 *  the uncertain understanding and proceed on the customer's yes. Dialect-adapted for
 *  Khalid/KSA. NEVER asserts allergen safety (fixed template; the echoed text is gated
 *  banned-clean by decideVoiceLadder's downgrade). WO-VOICE-ALIASES: when a top menu
 *  CANDIDATE is resolved, confirm THAT («قصدك «ستربس دجاج»، صح؟») rather than echoing the
 *  raw transcript — a cleaner, more natural confirmation. */
export function confirmVoiceReply(dialect: string, heard: string, candidate?: string | null): string {
  const cand = String(candidate ?? "").trim();
  if (cand) {
    return dialect === "egyptian"
      ? `قصدك «${cand}»، صح؟ لو تمام أكمّل، ولو لأ اكتبهالي 🙏`
      : `قصدك «${cand}»، صح؟ لو تمام أكمّل، ولو لا اكتبها لي 🙏`;
  }
  const h = String(heard ?? "").trim();
  return dialect === "egyptian"
    ? `سمعت منك: «${h}» — كده صح؟ لو تمام أكمّل، ولو لأ اكتبهالي 🙏`
    : `سمعت منك: «${h}» — كذا صحيح؟ لو تمام أكمّل، ولو لا اكتبها لي 🙏`;
}

// ---------------------------------------------------------------------------
// WO-VOICE-PRECISION (finding 4) — ASSENT-EXIT. A pure assent token arriving the turn
// right after a ladder CONFIRM must EXIT the ladder and let the Brain act on the confirmed
// content — never re-confirm. Without this a second voice note «أيوه» re-enters the ladder
// and re-confirms forever (live confirm-loop, msg b68666f5). Both detectors are pure.
// ---------------------------------------------------------------------------

/** Pure assent tokens (normalized) — «أيوه/ايوة/صح/تمام/ماشي» and close variants. */
const ASSENT_TERMS: ReadonlySet<string> = new Set(
  ["ايوه", "ايوا", "ايو", "اه", "صح", "صحيح", "تمام", "تمم", "ماشي", "اوك", "اوكي", "زين", "طيب"].map(normalizeAr)
);

/** True when the WHOLE message is assent (every content token is an assent word) — so
 *  «أيوه» / «تمام صح» qualify but «أيوه عايز حاجة تانية» (carries real intent) does not. */
export function isVoiceAssent(message: string): boolean {
  const toks = normalizeAr(String(message ?? "")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return toks.length > 0 && toks.every((t) => ASSENT_TERMS.has(t));
}

/** True when the last assistant turn was a ladder CONFIRM. Keys on the confirm template's
 *  stable signature «لو تمام أكمّل» (normalized «لو تمام اكمل»), present in every dialect/
 *  candidate/echo variant of confirmVoiceReply and nowhere else. */
export function wasVoiceLadderConfirm(lastAssistant: string | null | undefined): boolean {
  return /لو تمام اكمل/.test(normalizeAr(String(lastAssistant ?? "")));
}

// ---------------------------------------------------------------------------
// WO-VOICE-HCW (HCW-LITE) — ACT-band COHERENCE veto. Deepgram's hotter confidence pushed
// a garbled-but-order-shaped transcript into the ACT band (live specimen: deepgram
// «كريم وجبة عايز عرض الأوسايط ساقطة» @0.94, clip 2f18834d). The literal zero-overlap veto
// can't catch it — the garble still carries an intent word («عايز») so it "overlaps". The
// real coherence signal is: an ORDER-FRAME verb («عايز/عاوز/محتاج/اطلب…») with NO resolved
// TARGET (no number, no assent, no DISTINCTIVE menu item — a bare category token «عرض»/«وجبة»
// doesn't count). That turn is demoted ACT → CONFIRM, never blind-acted. Verified to demote
// EXACTLY the specimen and leave all 10 correct Deepgram clips on ACT (zero friction).
// ---------------------------------------------------------------------------

/** True order-DESIRE verbs (normalized) — narrower than ORDER_FRAME_TERMS: «ممكن»/«عرض»/
 *  «اوردر» are NOT desire verbs, so a coherent logistics turn «ممكن أرسلكم اللوكيشن» is
 *  never subject to the veto. */
const FRAME_VERBS: ReadonlySet<string> = new Set(
  ["عايز", "عاوز", "عايزه", "عايزين", "محتاج", "محتاجه", "محتاجين", "ابغي", "ابغى", "ابي", "ابا",
   "اريد", "اطلب", "اطلبي", "ودي", "بدي", "حابب", "حابه"].map(normalizeAr)
);

/** Bare menu CATEGORY tokens that match many items — not a distinctive content anchor. */
const GENERIC_MENU_TOKENS: ReadonlySet<string> = new Set(
  ["عرض", "عروض", "وجبه", "وجبات", "بيتزا", "قطع", "قطعه", "كومبو", "صحن", "علبه", "طبق"].map(normalizeAr)
);

/** A RESOLVED content anchor: a number, an assent, or a DISTINCTIVE menu-item token — a
 *  transcript token that exactly matches a ≥3-char NON-category menu token («كاديا» yes,
 *  a bare «عرض»/«وجبة» no). Pure. (Exact match, not the fuzzy resolver, so a generic
 *  category token can't win the dedup race and mask the distinctive one.) */
export function hasContentAnchor(transcript: string, menuItemNames: Array<string | null | undefined>): boolean {
  const toks = normalizeAr(String(transcript ?? "")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parseCanonicalQuantity(transcript) !== null) return true;              // number
  if (toks.some((t) => ASSENT_TERMS.has(t))) return true;                    // assent
  const distinctive = new Set<string>();
  for (const name of menuItemNames ?? []) {
    for (const tk of normalizeAr(String(name ?? "")).split(/\s+/).filter(Boolean)) {
      if (tk.length >= 3 && !GENERIC_MENU_TOKENS.has(tk)) distinctive.add(tk);
    }
  }
  return toks.some((t) => distinctive.has(t));                              // distinctive menu token
}

/** HCW-LITE veto predicate: a multi-word (≥3-token) transcript carrying an order-frame verb
 *  but NO resolved content anchor is incoherent-at-confidence → the caller demotes ACT to
 *  CONFIRM. Pure. Single/two-word turns (greetings, «تمام صح») are never vetoed. */
export function actBandCoherenceVeto(transcript: string, menuItemNames: Array<string | null | undefined>): boolean {
  const toks = normalizeAr(String(transcript ?? "")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (toks.length < 3) return false;
  const hasFrame = toks.some((t) => FRAME_VERBS.has(t) || FRAME_VERBS.has(t.replace(/^و/, "")));
  if (!hasFrame) return false;
  return !hasContentAnchor(transcript, menuItemNames);
}
