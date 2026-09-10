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

// ════════════════════════════════════════════════════════════════════════════════════════════
// THE ENGLISH ARM'S MATCHER, SPLITTER AND COMPOSER — the same three tools, over `normalizeEn`.
//
// §2.0 L7 says ONE MATCHER, ONE SPLITTER, ONE ORDER. It says that about Arabic, and everything
// above this line is Arabic: `(?<![ء-ي])` and `(?![ء-ي])` are the Arabic-letter boundary, and
// against a Latin string they are satisfied by every character — so an Arabic-matched English
// term degrades to a bare `includes`, which is what `raw.toLowerCase().includes(p)` already was.
//
// SO ENGLISH GETS ITS OWN BOUNDARY, AND THE REASON IS THE ONE §1.2 GIVES FOR ARABIC'S: JS `\b`
// IS ASCII-ONLY. That makes it exactly right here and wrong one line up. `\b` after an Arabic
// letter is a boundary between two letters, which is why Arabic must carry `(?<![ء-ي])` — and
// why a single regex written across both scripts is a rule that is loose in one of them. The
// two matchers below never see each other's script: `normalizeEn` turns every non-Latin run
// into a clause terminator, so by the time these run the string is `[a-z0-9., ]` and nothing else.
//
// WHAT ENGLISH DOES NOT NEED: the proclitic group. `و|ف|ب|ك|ل` attach to an Arabic noun; English
// writes them as separate words («in my chest», «for the report»), so the prefix group has no
// English analogue and adding one would only widen the match. What it DOES need is the same
// two-sided boundary, for the same reason: «fell» inside «fell behind», «heart» inside
// «heartburn», «ache» inside «headache», «kid» inside «kidney».
// ════════════════════════════════════════════════════════════════════════════════════════════

/** §1.2's boundary, in Latin. Written as explicit lookarounds rather than `\b` so a term that
 *  begins or ends with a digit («102 f») is bounded the same way a word is. */
export function termReEn(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${esc(term.trim())}(?![a-z0-9])`);
}

function termSrcEn(term: string): string {
  return `(?<![a-z0-9])${esc(term.trim())}(?![a-z0-9])`;
}

/** Which member of `set` this clause carries, longest first — `pick`'s English twin, and the
 *  longest-first rule is the same one: «blood in my urine» must win over «blood» so the audit
 *  row names the finding a person can read. */
export function pickEn(set: readonly string[], clause: string): string | null {
  let best: string | null = null;
  for (const t of set) {
    if (!termReEn(t).test(clause)) continue;
    if (best === null || t.length > best.length) best = t;
  }
  return best;
}

export function hasEn(set: readonly string[], clause: string): boolean {
  return pickEn(set, clause) !== null;
}

/**
 * §2.0 L2 — ADJACENCY, NOT CO-OCCURRENCE, in English.
 *
 *     ADJ_EN(A, [m], B)  →  M(A) (?:(m) ){0,2} M(B)
 *
 * The Arabic `ADJ` writes ` ?` between the operands because an Arabic clitic may attach with no
 * space at all. English words are space-separated, so the join is one MANDATORY space and the
 * middle slots carry the optional material: «cant breathe» · «cant even breathe» ·
 * «cant catch my breath» is A + {0,1,2} + B.
 *
 * THE MIDDLE SLOTS ARE ENUMERATED AND THAT IS THE WHOLE PRECISION STORY. A rule written as
 * "a negation and a breathe word somewhere in the clause" fires on «does not include breathing
 * exercises» and on «no charge for the breathing test» — the co-occurrence reading §2.0 L2
 * measured and refused in Arabic, which behaves identically in English. Driven, on this file's
 * own English quiet corpus: the co-occurrence reading of ARM 2 fires on the denials
 * «no difficulty breathing» and «he has no trouble breathing at all», which is an ambulance
 * instruction and a P0 page sent to a patient SAYING THEY ARE FINE.
 */
export function adjEn(
  a: readonly string[],
  mids: readonly string[],
  b: readonly string[],
): RegExp {
  const A = a.map(termSrcEn).join("|");
  const B = b.map(termSrcEn).join("|");
  const M = mids.length ? `(?:(?:${mids.map(esc).join("|")}) ){0,2}` : "";
  return new RegExp(`(?:${A}) ${M}(?:${B})`);
}

/** Which member the `adjEn` match landed on — `adjPick`'s English twin, same technique. */
export function adjPickEn(
  a: readonly string[],
  mids: readonly string[],
  b: readonly string[],
  clause: string,
): string | null {
  const m = adjEn(a, mids, b).exec(clause);
  if (!m) return null;
  return pickEn(a, m[0]) ?? pickEn(b, m[0]) ?? m[0];
}

/**
 * THE ENGLISH CLAUSE SPLITTER (§1.2, §2.0 L4). Same law, English punctuation and English
 * connectives: `but` · `although` · `however` are what `بس` · `لكن` · `مع إن` are in the Arabic
 * splitter, and they are here for the same sentence — «I want to book, but I cant breathe».
 *
 * IT DOES NOT SPLIT BETWEEN TWO DIGITS. «38.5» and «102.5 f» are one number and the temperature
 * reader below is the only thing that reads them; the Arabic splitter breaks there and that is
 * left alone (see `normalize.ts`). `\b` is not used at all: the connectives carry their own
 * spaces, so a `but` inside «butter» or «rebuttal» cannot be reached.
 */
export function splitClausesEn(normalized: string): string[] {
  return normalized
    .split(/(?<!\d)\.(?!\d)|,|\s+but\s+|\s+although\s+|\s+however\s+|\s+though\s+/)
    .map((c) => c.trim())
    .filter((c) => c !== "");
}

/**
 * §1.4's hypothetical veto, in English — THE ONLY VETO THAT REACHES A HARD CLASS (§1.5 R1), and
 * it reaches the English arms for exactly the reason it reaches the Arabic ones: «if he stops
 * breathing should I come in?» is a question about a future, and «what if my baby gets a fever
 * after the vaccine?» is the single most common question a paediatric clinic is asked.
 *
 * Shaped like `HYPOTHETICAL_RE`: a conditional head, then a bounded gap, then an event verb.
 * The gap is bounded at three words because an unbounded one turns «if you have a slot tomorrow
 * my son had a seizure last night» into a hypothetical, and a veto that reaches across a whole
 * message is the message-scoped `PAST_RE` defect §1.2 records.
 */
export const HYPOTHETICAL_EN_RE =
  /(?:^|\s)(?:if|what if|in case|suppose|supposing|whenever)\s+(?:[a-z0-9]+\s+){0,3}?(?:has|had|have|gets|got|get|happens|happened|starts|started|stops|stopped|feels|felt|is|was|becomes|turns|swallows|swallowed|eats|ate|falls|fell)(?![a-z])/;

/**
 * §2.6's temperature, read the way an English speaker writes it — AND FAHRENHEIT IS THE POINT.
 *
 * `bodyTemperature` above accepts a bare number in [35, 43] because that is Celsius, which is
 * what a Riyadh patient writing Arabic types. A patient writing English types «102», «102.5F»
 * or «103 degrees», and every one of those is OUTSIDE [35, 43] — so the Arabic reader returns
 * `null` on all three and §2.6's fever-value arm is deaf to the commonest English fever report
 * there is. Driven: `bodyTemperature("his temperature is 102")` → null.
 *
 * THE RESOLUTION ORDER, AND WHY IT IS NOT AMBIGUOUS. 35–43 °C and 95–110 °F do not overlap, so
 * a number that is a plausible body temperature is a plausible body temperature in exactly one
 * scale. An explicit `f` / `c` is honoured first anyway; a bare number is read as Celsius if it
 * lands in the Celsius window and as Fahrenheit if it lands in the Fahrenheit one; and a number
 * in neither — a file number, a price, a phone number, a room — IS NOT A TEMPERATURE and the
 * scan continues, which is the same "a value outside human range is not a temperature" rule the
 * Arabic reader has always had.
 *
 * AN AGE IS NOT A TEMPERATURE — THE SAME BUG, IN ENGLISH, AND IT IS WORSE HERE. The comment on
 * `bodyTemperature` records «رضيعي عمره ٣٦ يوم وعنده حرارة» reading 36 as the fever and going
 * silent. In English the collision is wider, because «38 days old» and «40 weeks» are the
 * ordinary way a parent of a newborn writes an age and 38 and 40 are both fevers. So a number
 * bound to an age UNIT is skipped and the scan continues to the next candidate — skipping fails
 * TOWARD firing, because an infant marker plus a fever term with no value is still an emergency
 * (§2.6's tier table), which is the direction §13 requires while row 3 is unsigned.
 *
 * WHAT IS DELIBERATELY NOT GUARDED, AND THIS IS THE HALF THAT COULD GO WRONG THE OTHER WAY: a
 * BARE «is NN» with no unit. «my daughter is 39» is an age; «his temperature is 39» is a fever;
 * they are the same five characters, and the second is the commonest way an English speaker
 * reports a fever there is. Guarding the age would take the fever with it, so the number is read
 * as a temperature and the age reader below refuses bare numbers ≥ 18 for the mirror-image
 * reason. The cost is an adult's age read as a fever, which fires at `urgent` with no infant
 * marker; the alternative cost is a silent infant fever, and §1.3 says which way this class fails.
 */
const EN_AGE_UNIT_AFTER =
  /^\s*(?:day|days|week|weeks|month|months|year|years|yr|yrs|wk|wks|mo|mos|yo)(?![a-z])/;

export function bodyTemperatureEn(clause: string): number | null {
  const re = /(?<![\d.])(\d{2,3}(?:\.\d)?)(?![\d])/g;
  for (let m = re.exec(clause); m; m = re.exec(clause)) {
    const v = Number(m[1]);
    const after = clause.slice(m.index + m[0].length);
    if (EN_AGE_UNIT_AFTER.test(after)) continue;              // «38 days old» is an AGE
    const scale = /^\s*(?:degrees?\s*)?(f|fahrenheit|c|celsius|centigrade)(?![a-z])/.exec(after);
    const named = scale ? scale[1][0] : null;
    if (named === "c") return v >= 35 && v <= 43 ? v : null;
    if (named === "f") { const c = fromF(v); if (c !== null) return c; continue; }
    if (v >= 35 && v <= 43) return v;                          // Celsius, the Arabic window
    const c = fromF(v);                                        // «103 degrees» · «102.5» · «101»
    if (c !== null) return c;
  }
  return null;
}

/** °F → °C, rejecting anything outside the same [35, 43] body window the Celsius arm uses. */
function fromF(f: number): number | null {
  const c = Math.round(((f - 32) * 5 / 9) * 10) / 10;
  return c >= 35 && c <= 43 ? c : null;
}

/**
 * §2.6's AGE, in months, read from English — the reading the `< 3 months` threshold is made of.
 *
 * §2.6 puts an age threshold at the centre of this class («age < 3 months + any temperature
 * ≥ 38.0 → emergency, with no further question asked») and the Arabic detector has no age reader
 * at all: it substitutes a WORD LIST — `رضيع`, `مولود`, `عمره شهرين` — and treats every child
 * word as "not an infant". That is why «ابني عمره شهرين» is enumerated as a marker and
 * «my son is 6 weeks old» has nothing to key on. An English parent writes the age itself far
 * more often than the word «newborn», so the English arm reads it.
 *
 * A UNIT-BOUND NUMBER IS AN AGE WHATEVER ITS VALUE — «36 days», «6 weeks», «3 months» — and this
 * is the same test that keeps it out of the temperature reader, written once and used from both
 * sides so the two cannot disagree about which number is which.
 *
 * A BARE NUMBER IS AN AGE ONLY UNDER 18, and that bound is what makes the two readings disjoint
 * rather than merely ordered: a child's age in years is < 18 and a body temperature in either
 * scale is ≥ 35, so no number can be claimed by both. «my daughter is 9» is nine years old;
 * «his temperature is 39» is not a thirty-nine-year-old. Driven, that pair is the whole test.
 */
const EN_AGE_UNITS: Readonly<Record<string, number>> = {
  day: 1 / 30.44, days: 1 / 30.44, week: 7 / 30.44, weeks: 7 / 30.44, wk: 7 / 30.44, wks: 7 / 30.44,
  month: 1, months: 1, mo: 1, mos: 1, year: 12, years: 12, yr: 12, yrs: 12, yo: 12,
};

export function ageInMonthsEn(clause: string): number | null {
  const unit = /(?<![\d.])(\d{1,3})\s*(day|days|week|weeks|month|months|year|years|yr|yrs|wk|wks|mo|mos|yo)(?![a-z])/.exec(clause);
  if (unit) return Number(unit[1]) * EN_AGE_UNITS[unit[2]]!;
  const bare = /(?:^|\s)(?:is|are|hes|shes|im|i am|aged|age|turned|turns)\s+(\d{1,2})(?![\d.])/.exec(clause);
  if (bare) {
    const years = Number(bare[1]);
    if (years < 18) return years * 12;
  }
  return null;
}

/**
 * WHO AN ENGLISH MESSAGE IS ABOUT — `hasPersonAnchor`'s twin, and it exists for exactly the two
 * findings §2.6 and §2.4 had to guard in Arabic with the same technique.
 *
 * `خامل` is «lethargic» and «dormant», and the §2.0 L8 mirror caught «الحساب خامل من سنة» — a
 * dormant ACCOUNT — raising an infant-fever emergency. English has the same word twice over:
 * `unresponsive` is a lethargic child AND a clinic that will not answer the phone, and
 * `turning blue` is cyanosis AND a bruise. A one-word red flag whose other reading is
 * administrative fires only with a person in the clause, and every way a parent actually
 * writes it has one.
 *
 * It is a LOCAL list rather than an import because `lib/ai/symptom-frames.ts` is Arabic — its
 * `PERSON_WORDS` are `ابني`, `امي`, `زوجتي` — and §12 row 15, which is unsigned, is the row that
 * would give it a second script. The debt is recorded in the same place as the Arabic one.
 */
const PERSON_EN =
  "baby|babies|newborn|infant|neonate|toddler|son|sons|daughter|daughters|child|children|kid|kids" +
  "|boy|girl|he|she|him|her|his|hers|my wife|my husband|wife|husband|mother|father|mum|mom|dad" +
  "|grandmother|grandfather|granddad|grandma|grandpa|brother|sister|patient|parent";

const PERSON_EN_RE = new RegExp(`(?<![a-z0-9])(?:${PERSON_EN})(?![a-z0-9])`);

export function hasPersonAnchorEn(clause: string): boolean {
  return PERSON_EN_RE.test(clause);
}

/**
 * ADJACENCY WITH AN UNENUMERATED GAP — the shape §2.7 already uses («the verb and the object
 * must be within two tokens of each other») and the ONLY place this file allows one, because an
 * ingestion object is separated from its verb by an open run of quantifiers: «swallowed a whole
 * bottle of pills», «took two of his mother's tablets». Enumerating that run is the "closed list
 * of the complements somebody thought of" §2.0 L8 detail 3 forbids, and the gap is bounded at
 * four tokens so it cannot reach across a clause it never crossed.
 */
export function adjEnAny(a: readonly string[], b: readonly string[], gap: number): RegExp {
  const A = a.map((t) => `(?<![a-z0-9])${esc(t.trim())}(?![a-z0-9])`).join("|");
  const B = b.map((t) => `(?<![a-z0-9])${esc(t.trim())}(?![a-z0-9])`).join("|");
  return new RegExp(`(?:${A}) (?:[a-z0-9.]+ ){0,${gap}}(?:${B})`);
}
