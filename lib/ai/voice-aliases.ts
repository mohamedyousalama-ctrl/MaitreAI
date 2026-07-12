// ============================================================================
// MaitreAI — WO-VOICE-ALIASES (PURE, no I/O). Deterministic menu CANDIDATE matching
// from a voice transcript, run BEFORE the Brain. Aliases + edit-distance against the
// tenant's menu item names, output as provenance-marked candidates («قراءة» class — a
// READ, never silent truth). The voice ladder's CONFIRM line uses the top candidate.
//
// HARD LAW (binding): allergen-class words are EXCLUDED from alias/auto-correction
// entirely — a near-allergen token routes to the safety net, never to a menu candidate.
//
// State-aware bias: when the last AI question expects a quantity / size / sauce, the
// candidate set (and the STT prompt vocab, see voice-quality.buildSttPromptVocab) is
// prioritized toward that class.
// ============================================================================

import { normalizeAr } from "./allergen-gate";
import { levenshtein, stripAffix, nearestSafetyTerm } from "./phonetic-safety-net";

// Per-tenant alias SEED (garbled/heard → canonical menu-ish token). Auto-variants come
// from normalizeAr at match time. In V1 this ships as a shared seed; a per-tenant table
// can override it later without touching the matcher (resolveVoiceCandidates takes it as
// a param).
export const SEED_VOICE_ALIASES: Record<string, string> = {
  "ستريبسي": "ستربس", "استربس": "ستربس", "ستريبس": "ستربس",
  "رنش": "رانش", "رانتش": "رانش",
  "كرسبي": "كريسبي",
  "بطاطه": "بطاطس",
};

export type AnswerClass = "quantity" | "size" | "sauce" | null;

export interface VoiceCandidate {
  /** The menu item name matched (raw, as displayed). */
  item: string;
  /** The transcript token (normalized) that matched. */
  token: string;
  /** [0,1] match confidence (alias/exact = high; edit-distance-scaled otherwise). */
  confidence: number;
  /** Provenance («قراءة» class — a READ): how it matched. */
  source: "alias" | "menu_exact" | "menu_near";
}

/** Class-priority vocabulary — the words that belong to each expected answer class.
 *  Used BOTH to bias candidates and to front-load the STT prompt (via voice-quality). */
export const CLASS_PRIORITY_TERMS: Record<Exclude<AnswerClass, null>, string[]> = {
  quantity: ["واحد", "اثنين", "ثلاثة", "اربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "قطعة", "قطع", "حبة"],
  size: ["صغير", "وسط", "كبير", "عادي", "دوبل", "حجم"],
  sauce: ["رانش", "كاتشب", "حار", "باربكيو", "صوص", "صلصة", "نكهة"],
};

/** Detect the answer class the last AI question expects — pure heuristic on the last
 *  assistant text (normalized). Null when it isn't clearly asking for one of the three. */
export function expectedAnswerClass(lastAssistant: string | null | undefined): AnswerClass {
  const s = normalizeAr(String(lastAssistant ?? ""));
  if (!s) return null;
  if (/(?<![ء-ي])كم(?![ء-ي])|عدد|كام|قطعه|قطع|حبه|حبات/.test(s)) return "quantity";
  if (/حجم|كبير|وسط|صغير|دوبل|(?<![ء-ي])عادي(?![ء-ي])/.test(s)) return "size";
  if (/صوص|صلصه|رانش|كاتشب|باربكيو|نكهه|حار ?ولا/.test(s)) return "sauce";
  return null;
}

const MIN_TOK = 3;

/**
 * Resolve deterministic menu candidates from a voice transcript. Pure. HARD LAW:
 * allergen-class tokens (exact or near) are excluded — they route to the safety net,
 * never a menu candidate. Order: alias canonicalization → menu token-exact / edit-distance
 * near. Candidates are sorted by (class-match, confidence) descending — state-aware bias.
 */
export function resolveVoiceCandidates(
  transcript: string,
  opts: {
    menuItemNames: Array<string | null | undefined>;
    aliases?: Record<string, string>;
    expectedClass?: AnswerClass;
  }
): VoiceCandidate[] {
  const aliasesNorm: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.aliases ?? SEED_VOICE_ALIASES)) {
    aliasesNorm[normalizeAr(k)] = normalizeAr(v);
  }
  const menuNorm = (opts.menuItemNames ?? [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean)
    .map((raw) => ({ raw, toks: normalizeAr(raw).split(/\s+/).filter(Boolean) }));

  const tokens = normalizeAr(transcript)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= MIN_TOK);

  const out: VoiceCandidate[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    // HARD LAW — an allergen-class token is NEVER a menu candidate (nearestSafetyTerm
    // handles affixes internally). Route it to the safety net, never a menu candidate.
    if (nearestSafetyTerm(tok)) continue;
    // Alias lookup on the RAW token (stripping a legit leading ب/ك/و/ف/ل — «بطاطه»,
    // «كرسبي» — would break the alias); edit-distance also tries the affix-stripped form.
    const canonical = aliasesNorm[tok] ?? tok;
    const viaAlias = aliasesNorm[tok] !== undefined;
    const forms = viaAlias ? [canonical] : Array.from(new Set([tok, stripAffix(tok)]));
    for (const m of menuNorm) {
      let exact = false;
      let bestDist = Infinity;
      let bestBudget = 0;
      for (const form of forms) {
        if (m.toks.includes(form)) exact = true;
        const budget = form.length <= 4 ? 1 : 2;
        for (const nt of m.toks) {
          const d = levenshtein(form, nt);
          if (d - budget < bestDist - bestBudget) { bestDist = d; bestBudget = budget; }
        }
      }
      const near = bestDist <= bestBudget;
      if (!exact && !near) continue;
      if (seen.has(m.raw)) continue;
      seen.add(m.raw);
      const confidence = viaAlias ? 1 : exact ? 0.9 : Math.max(0.5, 0.85 - 0.1 * bestDist);
      out.push({ item: m.raw, token: tok, confidence, source: viaAlias ? "alias" : exact ? "menu_exact" : "menu_near" });
    }
  }

  // State-aware bias: an item whose name carries a term of the expected class sorts first.
  const classTerms = opts.expectedClass ? new Set(CLASS_PRIORITY_TERMS[opts.expectedClass].map(normalizeAr)) : null;
  const classMatch = (c: VoiceCandidate) =>
    classTerms ? (normalizeAr(c.item).split(/\s+/).some((t) => classTerms.has(t)) ? 1 : 0) : 0;
  out.sort((a, b) => classMatch(b) - classMatch(a) || b.confidence - a.confidence);
  return out;
}
