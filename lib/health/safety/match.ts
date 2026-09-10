// ============================================================================
// فيصل / Faysal — SAFETY RAIL · the matcher, the splitter, the composer.
// PURE. SPEC-4-SAFETY.md §1.2, §2.0 L2, L4, L7.
//
// ONE MATCHER, ONE SPLITTER (§2.0 L7). Every term, every phrase and every operand of every
// ADJ() in every class goes through the functions in this file. A class that builds its own
// regex is a class that can disagree with the boundary discipline, and every row in §1.2 is
// a bug this repo has already paid for.
// ============================================================================

import { PERSON_WORDS, NOT_A_PERSON } from "../../ai/symptom-frames";

/** Escape a normalized literal for embedding in a RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * §1.2's matcher, and §2.0 L7's ruling that it applies to MULTI-WORD PHRASES TOO.
 *
 *     (?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?TERM(?![ء-ي])
 *
 * The prefix group guards the FIRST token and the lookahead the LAST; interior tokens get an
 * optional article, the way `allergen-gate.ts`'s own `termRegex()` does it.
 *
 * WHY THE PREFIX GROUP IS NOT OPTIONAL POLISH. Driven, a phrase matched with a bare
 * `(?<![ء-ي])…` lookbehind is silent on «حاس بثقل على صدري» (`بثقل`), on «الرضيع حرارته
 * عاليه ومو راضع» (`ومو راضع`) and on «الدنيا ما فيها فايده وأبي أرتاح للأبد» (`وأبي`) — the
 * conjunction and the preposition are the ordinary way those sentences are written.
 *
 * WHY THE LOOKAHEAD IS NOT SUFFICIENT, IN THE OTHER DIRECTION. §1.2 says the boundary is
 * necessary and NOT sufficient. It saves you from a term inside a longer word («ربو» in
 * «كربوهيدرات»); it saves you from nothing when the term IS a word — «الشفا», «صدر التقرير»,
 * «صدر الدجاج», «البلع», «الكسر العشري» are five instances, and this repo mis-explained three
 * of them. Those are handled by NOT PUTTING THE BARE STEM IN A SET, never by a looser matcher.
 */
export function termRe(term: string): RegExp {
  const parts = term.trim().split(/\s+/).map(esc);
  const body = parts.join(" (?:ال)?");
  return new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${body}(?![ء-ي])`);
}

/** The matcher's SOURCE, for composing into a larger pattern (ADJ). */
export function termSrc(term: string): string {
  const parts = term.trim().split(/\s+/).map(esc);
  return `(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?${parts.join(" (?:ال)?")}(?![ء-ي])`;
}

/**
 * THE PROCLITIC GROUP IS NOT THE SAME FOR A PARTICLE AS FOR A NOUN, AND THE QUIET CORPUS IS
 * WHAT FOUND IT — 96 ordinary clinic sentences, on the first run.
 *
 * §1.2's matcher carries `(?:و|ف|ب|ك|ل)?` because a NOUN takes all five proclitics: «بالصدر»,
 * «للفرع», «كالعادة». A PARTICLE takes only the two conjunctions. Applied to the negation set,
 * the nominal group makes `ل` and `ك` part of the match, so:
 *
 *     «لما ياخذ نفس الموعد»   when he takes the same appointment   → AIRWAY EMERGENCY
 *     «كما ياخذ نفس التقرير»  as he takes the same report          → AIRWAY EMERGENCY
 *     «بما أن الموعد اتغير»   given that the appointment changed   → the same shape
 *
 * — `لما` is `ل` + `ما` at a word boundary, so the lookbehind is satisfied and the prefix
 * group eats the `ل`. This is the SAME BUG the sibling module records in a long comment, one
 * layer up: there «ما» matched inside «دايما» for want of a left boundary, and the fix put the
 * proclitic INSIDE the boundary — with `[وف]` only, which is why it never had this failure.
 *
 * So the negation particle uses the shipped shape verbatim: `(?<![ء-ي])[وف]?`. «تعبان وما أقدر
 * أتنفس» and «فما أقدر أتنفس» still match, because the conjunction is part of the match and
 * the boundary is checked BEFORE it; «عموما», «لما», «كما», «بما» do not, because their first
 * letter has an Arabic letter in front of it or is not a conjunction at all.
 *
 * GENERAL RULE, and it is the one §2.0 L7 was missing: ONE MATCHER, TWO PROCLITIC GROUPS —
 * nominal for terms, conjunction-only for particles. A rule that puts a particle through the
 * nominal matcher is deaf to nothing and LOUD ON ORDINARY ARABIC, which is the direction that
 * costs a patient a booking lock.
 */
export function particleSrc(term: string): string {
  return `(?<![ء-ي])[وف]?${esc(term.trim())}(?![ء-ي])`;
}

/** Is any member of `set` present in this clause, boundary-aware? Returns the member, or null.
 *  LONGEST FIRST, so «فول سوداني» wins over «سوداني» and «دواء الكبار» over «الكبار» — the
 *  same "most specific term actually named" rule `pickAllergenTerm` uses, and the reason the
 *  audit row can name a term rather than a category. */
export function pick(set: readonly string[], clause: string): string | null {
  let best: string | null = null;
  for (const t of set) {
    if (!termRe(t).test(clause)) continue;
    if (best === null || t.length > best.length) best = t;
  }
  return best;
}

export function has(set: readonly string[], clause: string): boolean {
  return pick(set, clause) !== null;
}

/**
 * §2.0 L2 — ADJACENCY, NOT CO-OCCURRENCE, with §2.0 L2's Wave-1.7 clause: **the operands are
 * §1.2-matched terms (L7), not bare literals.**
 *
 *     ADJ(A, B)       →  M(A) ?M(B)                 — at most one space
 *     ADJ(A, [m], B)  →  M(A) ?(?:(m) ){0,2}M(B)    — up to two optional middle slots
 *
 * The middle slots are BARE, because a particle is not a term.
 *
 * The two middle slots are not decoration: «ما عاد يقدر يتنفس» is negation + «عاد» + «يقدر» +
 * breathe, and one slot loses it — a live defect in the shipped Kivo detector, which has
 * «عاد» in no auxiliary slot at all.
 *
 * And co-occurrence is not an option. Driven, both directions:
 *   «الطفل ما يتنفس»              adjacency FIRES · co-occurrence FIRES
 *   «ما عندي مشكلة في التنفس»     adjacency quiet · co-occurrence FIRES → ambulance + P0
 *   «ما فيه صعوبة بالتنفس الحمدلله» adjacency quiet · co-occurrence FIRES → ambulance + P0
 */
export interface AdjOptions {
  /** Match the FIRST operand with the particle proclitic group (`[وف]`) instead of the
   *  nominal one. Set for NEGATION and for the denial head — see `particleSrc`. */
  readonly aParticle?: boolean;
}

export function adj(
  a: readonly string[],
  mids: readonly string[],
  b: readonly string[],
  opts: AdjOptions = {},
): RegExp {
  const srcA = opts.aParticle ? particleSrc : termSrc;
  const A = a.map(srcA).join("|");
  const B = b.map(termSrc).join("|");
  const M = mids.length ? `(?:(?:${mids.map(esc).join("|")}) ){0,2}` : "";
  return new RegExp(`(?:${A}) ?${M}(?:${B})`);
}

/** Which member of `a` an `adj` match landed on — for `termAr` on the hit. Cheap and exact:
 *  re-run the composed pattern, then pick the longest member of `a` present in the match. */
export function adjPick(
  a: readonly string[],
  mids: readonly string[],
  b: readonly string[],
  clause: string,
  opts: AdjOptions = {},
): string | null {
  const re = adj(a, mids, b, opts);
  const m = re.exec(clause);
  if (!m) return null;
  return pick(a, m[0]) ?? pick(b, m[0]) ?? m[0];
}

/**
 * §1.2 / §2.0 L4 — THE CLAUSE SPLITTER. One splitter, used by exclusions and by adjacency
 * alike. It is `allergen-emergency.ts` L804's splitter with `مع ان` added, which §1.2 names.
 *
 * WHY EXCLUSIONS ARE CLAUSE-SCOPED AND NEVER MESSAGE-SCOPED. «زمان، مو قادر أتنفس» is a past
 * word and a present airway in two clauses, and a message-scoped `PAST_RE` threw away the
 * airway. Driven, under the message-scoped reading, four bleeding emergencies that merely
 * OPEN with «الحمدلله» went silent.
 */
export function splitClauses(normalized: string): string[] {
  return normalized
    .split(/[.،,؛!؟\n]|\s+بس\s+|\s+لكن\s+|\s+مع ان\s+/)
    .map((c) => c.trim())
    .filter((c) => c !== "");
}

/**
 * WHO A MESSAGE IS ABOUT. Imported from `lib/ai/symptom-frames.ts` — the shared file — and
 * NOT copied, because a copied list is how that file's two ancestors drifted apart and became
 * a deaf spot. SPEC-3 §10.2 marks it SHARE*.
 *
 * THE FOUR ADDITIONS ARE LOCAL AND THEY ARE A DEBT, NOT A DESIGN. SPEC-4 §2.4 (amended
 * Wave 1.7, audit S3) prescribes adding `طفلي · رضيعي · جدي · جدتي` to the SHARED
 * `PERSON_WORDS`; that edit lands in Kivo's file and is §12 row 15, which is unsigned. Until
 * it lands they are appended here so §2.6's T5 fix and §11.1's third-person assertions work,
 * and the appended list is the ONE place to delete when row 15 is signed.
 *
 * The `NOT_A_PERSON` half of row 15 is the same debt in the other direction: that constant is
 * a RESTAURANT place list (`المطعم`, `المحل`, `الفرن`), so five ordinary clinic sentences read
 * as a person reporting a symptom to any caller that uses `FRAME_WORDS`. Faysal's clinic
 * places are named here for the same reason and with the same expiry.
 */
export const FAYSAL_PERSON_ANCHOR =
  PERSON_WORDS + "|طفلي|طفلتي|رضيعي|رضيعتي|جدي|جدتي|المريض|المريضه|الرضيع|المولود";

export const FAYSAL_NOT_A_PERSON =
  NOT_A_PERSON + "|العياده|المستشفي|المجمع|الفرع|الاستقبال|صاله الانتظار|الممر|العنبر|" +
  "المختبر|الصيدليه|الحساب|الملف|التقرير|الموعد|الحجز|الجهاز|السياره|الطلب|الفاتوره|الدور";

const PERSON_RE = new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:${FAYSAL_PERSON_ANCHOR})(?![ء-ي])`);
const NOT_PERSON_RE = new RegExp(`(?<![ء-ي])(?:و|ف|ب|ك|ل)?(?:ال)?(?:${FAYSAL_NOT_A_PERSON})(?![ء-ي])`);

/** Is a PERSON — not a place, a file or an appointment — the subject of this clause? */
export function hasPersonAnchor(clause: string): boolean {
  return PERSON_RE.test(clause);
}

/** Does a NON-PERSON definite noun sit immediately in front of `term` in this clause?
 *
 *  THE TELL IS ON THE LEFT, NOT THE RIGHT, and this is the technique `allergen-emergency.ts`
 *  uses for `ضيق نفس` («المحل ضيق نفس الفرع الثاني» is a shop, «ضيق نفس الحين» is dyspnoea).
 *  A symptom report opens its clause or sits in a personal frame; an administrative sentence
 *  puts its definite subject in front. «السيارة لونها أزرق» is a car. «صار لونه أزرق» is
 *  cyanosis, and so is «ابني لونه أزرق», because `ابني` is not `ال`-definite and is a person
 *  either way. */
export function hasNonPersonSubject(clause: string, term: string): boolean {
  const m = new RegExp(`(^|[\\s،,.؛!؟])(ال[^\\s]{2,14}) ${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(clause);
  if (!m) return false;
  const subject = m[2];
  if (PERSON_RE.test(subject)) return false;
  return NOT_PERSON_RE.test(subject) || !PERSON_RE.test(subject);
}

/** §1.4's frames, written NORMALIZED — every alternative below is `normalizeAr`-stable, and
 *  §11.1 asserts it. The un-normalized alternatives the audit found (`إذا`, `إن`,
 *  `نتيجة (?:ال)?تحليل`) are gone; each was shadowed by a live one, so nothing changes
 *  behaviourally and the assertion can now be written. */
export const HYPOTHETICAL_RE =
  /(?:لو|اذا|ان|لما|في حال|يعني لو|افتراض)\s+(?:صار|جا|جاني|حسيت|حصل|تعبت|طاح|اكلت|اكل)/;

export const PAST_CLAUSE_RE =
  /قبل (?:سنه|سنوات|كم سنه|فتره|مده|شهر|شهور|اسبوع|يومين|يوم)|من زمان|السنه اللي راحت|سابقا|قديم|كان عندي/;

export const BOOKING_FRAME_RE =
  /(?:ابغي|ابي|اريد|ودي)\s*(?:موعد|حجز|كشف|استشاره|متابعه)|احجز|حجز|تجديد وصفه|تحليل|فحص|اشعه|تقرير طبي|تطعيم|لقاح|متابعه بعد|مراجعه/;

/** §1.5 R1's SOFT-side prescription veto. Named here so the file that USES it is the file
 *  that shows it is never consulted by a HARD class — every class in §1.3 is HARD today, so
 *  this constant has no live call site and that is the point: it exists so the next reader
 *  does not re-derive it as a HARD-class exclusion, which is the mistake §1.5 R1 closed. */
export const REFILL_CLAUSE_RE =
  /تجديد ?(?:ال)?(?:وصفه|بخاخ|علاج|دوا|روشته)|صرف ?(?:ال)?دوا|نفس ?(?:ال)?علاج/;

/** Temperature in a body range, §2.6. Digits are already ASCII (see `normalize.ts`). */
/**
 * AN AGE IS NOT A TEMPERATURE, AND READING ONE AS THE OTHER SILENCES THE RAIL.
 *
 * «رضيعي عمره ٣٦ يوم وعنده حرارة» — a thirty-six-day-old with a fever, which is the
 * exact population §2.6 exists for — was SILENT. The scan took the first two-digit
 * number in [35,43] anywhere in the clause, found the 36 that belongs to «يوم», and
 * `infantFever` then applied its own `value < 38.0 → return null`. Driven: fired
 * false, ruleId none. The same clause without the age fires `emergency`.
 *
 * So a number that is bound to an AGE UNIT — «٣٦ يوم», «٣٨ يوم», «40 اسبوع» — or
 * that sits directly after an age lead is skipped, and the scan continues to the
 * next candidate. Skipping it fails TOWARD firing: with no temperature value an
 * infant marker plus a fever term is still an emergency (§2.6's own tier table),
 * which is the direction §13 requires while row 3 is unsigned.
 *
 * Nothing else changes. A bare «حرارته 39» is still 39, «٣٩ درجه» is still 39, and
 * a number outside [35,43] was never a body temperature to begin with.
 */
const AGE_UNIT_AFTER = /^\s*(?:يوم|ايام|يوما|اسبوع|اسابيع|شهر|شهور|اشهر|سنه|سنوات|سنين|سنة|day|days|week|weeks|month|months|year|years)(?![ء-يa-z])/;
const AGE_LEAD_BEFORE = /(?:عمره|عمرها|عمرهم|بعمر|عمر|عنده|عندها)\s*$/;
export function bodyTemperature(clause: string): number | null {
  const re = /\b(\d{2}(?:\.\d)?)\b/g;
  for (let m = re.exec(clause); m; m = re.exec(clause)) {
    const v = Number(m[1]);
    if (v < 35 || v > 43) continue;
    const after = clause.slice(m.index + m[0].length);
    if (AGE_UNIT_AFTER.test(after)) continue; // «٣٦ يوم» — an age, not a fever
    // «عمره 40» with no unit: an age lead immediately before it, and no «درجة» after.
    if (AGE_LEAD_BEFORE.test(clause.slice(0, m.index)) && !/^\s*(?:درجه|درجة|c\b|°)/.test(after)) {
      const lead = clause.slice(0, m.index);
      if (/(?:عمره|عمرها|عمرهم|بعمر|عمر)\s*$/.test(lead)) continue;
    }
    return v;
  }
  return null;
}

/** The spelled-out temperatures §2.6 requires. Written normalized. */
export const SPELLED_FEVER: readonly string[] = [
  "تسعه وثلاثين", "ثمانيه وثلاثين", "اربعين", "تسعه وثلاثون", "ثمانيه وثلاثون",
];
