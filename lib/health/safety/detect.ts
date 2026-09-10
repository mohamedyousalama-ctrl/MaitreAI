// ============================================================================
// فيصل / Faysal — SAFETY RAIL · `detectRedFlag`. PURE. No I/O, no model, no DB, no clock.
// SPEC-4-SAFETY.md §1.1, §1.2, §1.4, §2.0–§2.9.
//
// PRE-MODEL AND UNBYPASSABLE BY CONSTRUCTION. This function reads a string and returns a
// verdict. It cannot be argued with, because it is not listening to the conversation: it has
// no conversation state, no clock and no tools. Everything that makes booking and sales
// unreachable on a hit lives in `rail.ts` and is STRUCTURAL — an empty tool set and a frozen
// string — never an instruction in a prompt. §8's threat model is a list of the things a model
// talks its way past; none of them is reachable from here.
//
// THE RULES ARE COMPOSED FROM `lexicon.ts`, never written twice. §2.0 L6 mirrors every Fires
// entry into MUST_FIRE and §2.0 L8 mirrors every enumerated set member into MUST_BE_QUIET;
// both mirrors read the same object this file reads, so a term cannot be added to the detector
// without gaining its assertions on both sides in the same commit.
// ============================================================================

import { normalizeForSafety, normalizeEn } from "./normalize";
import {
  adj, adjPick, bodyTemperature, has, hasNonPersonSubject, hasPersonAnchor, pick, splitClauses,
  HYPOTHETICAL_RE, SPELLED_FEVER, termRe,
  adjEn, adjEnAny, ageInMonthsEn, bodyTemperatureEn, hasEn, hasPersonAnchorEn, pickEn,
  splitClausesEn, termReEn, HYPOTHETICAL_EN_RE,
} from "./match";
import {
  AIRWAY, CARDIAC, HEMORRHAGE, INFANT_FEVER, OBSTETRIC, POISONING,
  SELF_HARM, STROKE, TRAUMA,
  type RedFlagClass, type RedFlagTier,
} from "./lexicon";

export type { RedFlagClass, RedFlagTier };

/** §1.1 — the hit. NO NULLABLE FIELDS: every consumer of a hit (the rail, the pager, the audit
 *  row) needs all five, and a shape that permits `{ fired: true, class: null }` puts that
 *  invariant on every call site. The one place a hit legitimately has no class is the detector
 *  exception (§1.5 R3), and that is synthesised by the WRAPPER in `index.ts`, not here. */
export interface RedFlagHit {
  readonly fired: true;
  readonly class: RedFlagClass;
  readonly tier: RedFlagTier;
  /** The MATCHED TERM, normalized — never the patient's sentence (§6.4). */
  readonly termAr: string;
  readonly ruleId: string;
  readonly label: string;
}

type Candidate = { tier: RedFlagTier; termAr: string; ruleId: string };

const hit = (
  cls: RedFlagClass, label: string, c: Candidate,
): RedFlagHit => ({ fired: true, class: cls, tier: c.tier, termAr: c.termAr, ruleId: c.ruleId, label });

// ── §2.9 I — SELF-HARM ───────────────────────────────────────────────────────
// Evaluated FIRST (§2.0 L7). «أخذت حبوب كثير عشان أخلص» is a crisis before it is a poisoning.
function selfHarm(clause: string): Candidate | null {
  const S = SELF_HARM.sets;
  // Rule 4 — bereavement SUPPRESSES the class outright. A grieving patient cancelling an
  // appointment handed a suicide rail is the single most damaging false positive in §2.
  if (has(S.BEREAVEMENT, clause)) return null;
  // Rule 2, INVERTED (T6). The `على`-complement shape fires ONLY on an enumerated life object.
  // A blacklist over an open complement slot is what made «أموت على المندي» a suicide rail.
  const onComplement = /(?:^|\s)(?:و|ف|ب|ك|ل)?(?:ا|ب|ي|ن)?موت(?:ون|ين)? ?(?:علي|على) (.+)$/.exec(clause);
  if (onComplement) {
    const rest = onComplement[1];
    return has(S.LIFE_OBJECT, rest)
      ? { tier: "emergency", termAr: pick(S.LIFE_OBJECT, rest) ?? "نفسي", ruleId: "I.life_object" }
      : null;
  }
  // Rule 2's remaining closed shapes, and the allergy-disclosure carve-out.
  if (has(S.IDIOM_FRAME, clause)) return null;
  if (has(S.DISEASE_OBJECT, clause)) return null;
  // Rule 3 — `تعبت من` counts only when its object is life.
  if (/تعبت من/.test(clause)) {
    const obj = clause.slice(clause.indexOf("تعبت من") + "تعبت من".length);
    if (has(S.TIRED_LIFE, obj)) {
      return { tier: "emergency", termAr: pick(S.TIRED_LIFE, obj) ?? "الحياه", ruleId: "I.tired_of_life" };
    }
    return null;
  }
  // THE INTENTIONAL OVERDOSE. §2.0 L7 says «أخذت حبوب كثير عشان أخلص» is class I and not
  // class G — an intentional overdose is a crisis before it is a poisoning — and driven, both
  // classes hit it, so class I has to be able to SEE it or the precedence order decides
  // nothing. The discriminator is a purpose particle plus a finality verb after an ingestion
  // verb. The `(?! من X)` refusal is the precision half and it is not optional: «أخذت الدواء
  // عشان أخلص من الألم» is an ordinary sentence about a painkiller, and «أخلص من X» means
  // "be done with X" for every X that is not a life object.
  const od = /(?:اخذت|بلعت|شربت|اكلت)[^.،؛!؟]{0,40}?(?:عشان|علشان|حتي|لكي) ?(?:اخلص|اموت|ارتاح|انتهي|اختفي)(?: من (.+))?/.exec(clause);
  if (od && (od[1] === undefined || has(S.LIFE_OBJECT, od[1]))) {
    return { tier: "emergency", termAr: "اخلص", ruleId: "I.intentional_overdose" };
  }
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "I.standalone" };
  // Rule 1 — a first-person death/harm verb with no idiom object left standing.
  if (/(?:^|\s)(?:و|ف|ب|ك|ل)?(?:ابي|ودي|بدي|افكر|راح|بغيت) [^ ]{0,12}(?:اموت|انتحر|اختفي)/.test(clause)) {
    return { tier: "emergency", termAr: "اموت", ruleId: "I.first_person_intent" };
  }
  return null;
}

// ── §2.1 A — CARDIAC ─────────────────────────────────────────────────────────
function cardiac(clause: string): Candidate | null {
  const S = CARDIAC.sets;
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "A.standalone" };
  const term = pick(S.TERM, clause);
  if (!term) return null;
  // A COMPANION counts as the predicate ONLY with a TERM in the same clause — which is why
  // the Fires-list companions are mirrored as complete sentences (§2.0 L6).
  for (const [set, id] of [
    [S.PRED_PAIN, "A.pain"], [S.PRED_PRESSURE, "A.pressure"], [S.PRED_TIGHT, "A.tight"],
    [S.PRED_BURNING, "A.burning"], [S.PRED_COMPANION, "A.companion"],
  ] as const) {
    if (has(set, clause)) return { tier: "emergency", termAr: term, ruleId: id };
  }
  return null;
}

// ── §2.2 B — STROKE ──────────────────────────────────────────────────────────
function stroke(clause: string): Candidate | null {
  const S = STROKE.sets;
  // An EXPLICIT benign cause named in the message (§2.0 L5) — an arm exclusion, not a frame.
  // Without it this class's rule was WIDER than its own near-miss table: «تنميل في رجلي من
  // الجلسة» is a failure predicate and a body term in one clause.
  const benign = has(S.EXCL_BENIGN, clause);
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "B.standalone" };
  // `شلل` on its own — the BOUNDARY DOES NOT SAVE IT. Verified: a boundary-matched `شلل`
  // FIRES on «متى تطعيم شلل الأطفال؟», one of the highest-volume paediatric questions in the
  // Kingdom. The rule is a negative lookahead on the GOVERNED noun. That is the whole rule.
  if (termRe("شلل").test(clause) && !/شلل ?(?:ال)?اطفال/.test(clause) && !termRe("رعاش").test(clause)) {
    return { tier: "emergency", termAr: "شلل", ruleId: "B.paralysis" };
  }
  if (benign) return null;
  const term = pick(S.TERM, clause);
  if (term && has(S.PRED_FAILURE, clause)) {
    return { tier: "emergency", termAr: term, ruleId: "B.term_failure" };
  }
  // THE ONSET ARM IS SCOPED TO THE PERSON-ONLY FAILURES. Found by the §2.0 L8 mirror:
  // «الدور ما يتحرك من ساعة» — the queue hasn't moved for an hour — carried a failure
  // predicate and an onset and raised a STROKE EMERGENCY. Nothing administrative slurs its
  // speech or sees double, and the generic failures still fire with a body TERM.
  if (has(S.PRED_ONSET, clause) && has(S.PRED_FAILURE_PERSON_ONLY, clause)) {
    return { tier: "emergency", termAr: pick(S.PRED_FAILURE_PERSON_ONLY, clause) ?? "خدر", ruleId: "B.onset_failure" };
  }
  return null;
}

// ── §2.4 D — AIRWAY ──────────────────────────────────────────────────────────
const ARM1 = adj(AIRWAY.sets.NEGATION, AIRWAY.sets.AUX, AIRWAY.sets.BREATHE, { aParticle: true });
const ARM2 = adj(AIRWAY.sets.DIFFICULTY, ["في", "ب", "بال", "في ال"], AIRWAY.sets.BREATHE_NOUN);
const ARM2_DENIAL = adj(AIRWAY.sets.DENIAL_HEAD, AIRWAY.sets.DENIAL_MID, AIRWAY.sets.DIFFICULTY, { aParticle: true });
const ARM4 = adj(
  [...AIRWAY.sets.THROAT, ...AIRWAY.sets.LIPS_TONGUE, ...AIRWAY.sets.FACE_EYES],
  [],
  [...AIRWAY.sets.CLOSING, ...AIRWAY.sets.SWELLING],
);
const ARM5 = adj(AIRWAY.sets.CYANOSIS_SUBJ, [], AIRWAY.sets.BLUE);
/** ARM 3 — the inherited «نفسي ضايق» idiom carve-out, FIRST PERSON ONLY, with the object list
 *  extended for the clinic. Driven, all five clinic frustrations FIRE `[ضيق نفس]` on the real
 *  Kivo detector today, because its object list is a delivery-complaint vocabulary. */
const IDIOM_OBJ = AIRWAY.sets.IDIOM_OBJECT.join("|");
const ARM3 = new RegExp(`نفسي ?(?:ضايق|ضاق|يضيق|مسدود|واقف)(?! ?من ?(?:ال)?(?:${IDIOM_OBJ})(?![ء-ي]))`);

function airway(clause: string): Candidate | null {
  const S = AIRWAY.sets;
  if (ARM1.test(clause)) {
    return { tier: "emergency", termAr: adjPick(S.NEGATION, S.AUX, S.BREATHE, clause, { aParticle: true }) ?? "تنفس", ruleId: "D.arm1_inability" };
  }
  // ARM 2's denial GOVERNS the noun and is stated inline (§2.4). «ما عندي مشكلة في التنفس» and
  // «ما فيه صعوبة بالتنفس الحمدلله» are quiet; a co-occurrence rule sends both an ambulance.
  if (ARM2.test(clause) && !ARM2_DENIAL.test(clause)) {
    return { tier: "emergency", termAr: adjPick(S.DIFFICULTY, [], S.BREATHE_NOUN, clause) ?? "التنفس", ruleId: "D.arm2_difficulty" };
  }
  if (ARM3.test(clause)) return { tier: "emergency", termAr: "نفسي ضايق", ruleId: "D.arm3_idiom" };
  if (ARM4.test(clause)) {
    return { tier: "emergency", termAr: adjPick([...S.THROAT, ...S.LIPS_TONGUE, ...S.FACE_EYES], [], [...S.CLOSING, ...S.SWELLING], clause) ?? "حلقي", ruleId: "D.arm4_part_verb" };
  }
  if (ARM5.test(clause)) {
    const subj = adjPick(S.CYANOSIS_SUBJ, [], S.BLUE, clause) ?? "ازرق";
    // «لونه»/«لونها» ARE NOT BODY WORDS — they are "its colour", and the §2.0 L8 mirror found
    // «السيارة لونها أزرق» raising an airway emergency on a car. The tell is on the LEFT: a
    // symptom report opens its clause or names a person; an object puts its definite subject
    // in front. «صار لونه أزرق» and «ابني لونه أزرق» still fire — neither has one.
    const colourOnly = subj === "لونه" || subj === "لونها" || subj === "لوني";
    if (!colourOnly || !hasNonPersonSubject(clause, subj)) {
      return { tier: "emergency", termAr: subj, ruleId: "D.arm5_cyanosis" };
    }
  }
  const ph = pick(S.PHRASE, clause);
  if (ph) return { tier: "emergency", termAr: ph, ruleId: "D.arm6_phrase" };
  // ARM 7b (T5) — rescue failure is STANDALONE. It is checked BEFORE ARM 7 because a failed
  // inhaler carries no asthma noun, which is exactly why ARM 7 could not reach it.
  const rescue = pick(S.RESCUE_FAILED, clause);
  if (rescue) return { tier: "emergency", termAr: rescue, ruleId: "D.arm7b_rescue_failed" };
  // ARM 7 — `ربو` requires an exacerbation predicate. A bare chronic-condition noun in a
  // refill sentence never reaches the class: «عندي ربو ومحتاج تجديد البخاخ» is quiet because
  // class D is HARD and takes no frame veto at all (§1.5 R1), not because of a frame.
  if (termRe("ربو").test(clause) && has(S.EXACERBATION, clause)) {
    return { tier: "emergency", termAr: "ربو", ruleId: "D.arm7_asthma" };
  }
  return null;
}

// ── §2.5 E — OBSTETRIC ───────────────────────────────────────────────────────
function obstetric(clause: string): Candidate | null {
  const S = OBSTETRIC.sets;
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "E.standalone" };
  // `حامل` = CARD HOLDER, and this is a real sentence at a private clinic reception.
  if (/حامل (?:ال)?(?:بطاقه|شهاده|الملف|ملف|تامين|التامين)/.test(clause)) return null;
  const term = pick(S.TERM, clause);
  if (!term) return null;
  for (const [set, id] of [
    [S.PRED_BLEED, "E.bleeding"], [S.PRED_MOVE, "E.movement"], [S.PRED_LABOUR, "E.labour"],
    [S.PRED_PREECL, "E.preeclampsia"], [S.PRED_POSTPARTUM, "E.postpartum"], [S.PRED_PAIN, "E.pain"],
  ] as const) {
    if (has(set, clause)) return { tier: "emergency", termAr: term, ruleId: id };
  }
  return null;
}

// ── §2.3 C — HEMORRHAGE ──────────────────────────────────────────────────────
function hemorrhage(clause: string): Candidate | null {
  const S = HEMORRHAGE.sets;
  if (has(S.EXCL_RESOLVED, clause)) return null;
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "C.standalone" };
  const term = pick(S.TERM, clause);
  if (!term) return null;
  // The GUM/NOSE VETO SITS OUTSIDE THE PREDICATE TEST — or the `شديد` intensifier buys back
  // the commonest dental complaint in the product. §11.2 pairs «نزيف اللثة شديد لما أفرش»
  // with «نزيف شديد» so neither can be traded for the other.
  const capped = has(S.SITE_CAPPED, clause);
  if (capped && has(S.EXCL_HYGIENE, clause)) return null;
  const pred = has(S.PRED_PERSIST, clause) || has(S.PRED_VOLUME, clause) || has(S.PRED_CHARACTER, clause);
  const site = has(S.SITE, clause);
  const siteUrgent = has(S.SITE_URGENT, clause);
  if (!pred && !site && !siteUrgent) return null;
  if (siteUrgent && !pred && !site) {
    // §2.3 TIER: SITE.urgent with no pain and no fever → `urgent`; WITH pain or fever →
    // `emergency`. «دم مع البول» is on the Fires list at BOTH tiers (§2.0 L6).
    const withPainOrFever = /الم|وجع|يعور|حراره|حمي|سخونه/.test(clause);
    return { tier: withPainOrFever ? "emergency" : "urgent", termAr: term, ruleId: "C.site_urgent" };
  }
  if (capped) {
    // The cap is LIFTED — the hit is `emergency` again — when the clause carries an extraction
    // or anticoagulant term (S1.5-5). §12 row 2 carries the DOAC question to the physician.
    const lift = has(S.CAP_LIFT, clause);
    return { tier: lift ? "emergency" : "urgent", termAr: term, ruleId: lift ? "C.gum_cap_lifted" : "C.gum_capped" };
  }
  return { tier: "emergency", termAr: term, ruleId: pred ? "C.term_predicate" : "C.term_site" };
}

// ── §2.6 F — INFANT FEVER ────────────────────────────────────────────────────
function infantFever(clause: string): Candidate | null {
  const S = INFANT_FEVER.sets;
  // The red-flag arm NEVER consults the chronicity exclusion (§2.0 L5) — it is scoped to the
  // fever-VALUE arm only, which is what makes «حرارته 39 من كم شهر» `urgent` and not silent.
  const muscle = has(S.EXCL_MUSCLE, clause);
  for (const rf of S.PRED_REDFLAG) {
    if (!termRe(rf).test(clause)) continue;
    if (muscle && /تشنج/.test(rf)) continue;   // adult muscle spasm, no fever, no child
    // «خامل» IS LETHARGIC AND IT IS ALSO DORMANT. The §2.0 L8 mirror found «الحساب خامل من
    // سنة» — a dormant account — raising an infant-fever emergency. A one-word red flag whose
    // other reading is administrative needs a PERSON, and every way a parent writes it has
    // one: «ابني خامل», «الطفل خامل ما يفتح عينه». The bare Fires entry «خامل ما يفتح عينه»
    // carries a second red flag, which is what reaches it.
    if (rf === "خامل" && !hasPersonAnchor(clause) && !has(S.PRED_REDFLAG.filter((x) => x !== "خامل"), clause)) continue;
    return { tier: "emergency", termAr: rf, ruleId: "F.redflag" };
  }
  const term = pick(S.TERM, clause);
  if (!term) return null;
  if (has(S.EXCL_NOT_BODY, clause)) return null;      // the subject is not a body
  const value = bodyTemperature(clause) ?? (has(SPELLED_FEVER, clause) ? 39 : null);
  const infant = has(S.PRED_INFANT, clause);
  const persist = has(S.PRED_PERSIST, clause);
  const chronic = has(S.EXCL_CHRONIC, clause);
  if (value !== null && value < 38.0) return null;    // not a fever
  if (!infant && !persist && value === null) return null;
  if (chronic) return { tier: "urgent", termAr: term, ruleId: "F.fever_chronic" };
  if (infant && (value === null || value >= 38.0)) {
    // T5: `طفلي · ابني · بنتي · ولدي` are markers now. A marker with a fever TERM and no
    // temperature value is `emergency` for a true infant marker and `urgent` for a child
    // word, because a child word carries no age — §12 row 3 owns the threshold.
    const trueInfant = has(
      ["رضيع", "رضيعي", "مولود", "بيبي", "عمره شهر", "عمره شهرين", "عمرها شهر", "حديث الولاده"],
      clause,
    );
    if (trueInfant || (value !== null && value >= 38.0)) {
      return { tier: "emergency", termAr: term, ruleId: "F.infant_fever" };
    }
    return { tier: "urgent", termAr: term, ruleId: "F.child_fever" };
  }
  if (persist) return { tier: "urgent", termAr: term, ruleId: "F.fever_persistent" };
  return { tier: "urgent", termAr: term, ruleId: "F.fever_value" };
}

// ── §2.7 G — POISONING ───────────────────────────────────────────────────────
const ALL_OBJECTS = [...POISONING.sets.SITE_POISON, ...POISONING.sets.SITE_MEDICATION];
const SWALLOW_HIT = adj(POISONING.sets.VERB_SWALLOW, [], ALL_OBJECTS);
const SWALLOW_HIT_GAPPED = new RegExp(
  adj(POISONING.sets.VERB_SWALLOW, [], ALL_OBJECTS).source.replace(" ?", " ?(?:[^ ]+ ){0,2}"),
);
const TAKE_HIT = adj(POISONING.sets.VERB_TAKE, [], ALL_OBJECTS);
const TAKE_HIT_GAPPED = new RegExp(
  adj(POISONING.sets.VERB_TAKE, [], ALL_OBJECTS).source.replace(" ?", " ?(?:[^ ]+ ){0,2}"),
);

/** «دوايي» / «حبوبي» — the speaker's own medication in Arabic. */
// Written in POST-normalization spelling, like every other pattern here: «دوائي»
// folds to «دوايي», and listing both is a duplicate the §N stability check rejects.
const MY_MEDICATION_AR = /(?:^|\s)(?:دوايي|دواي|حبوبي|علاجي)(?![ء-ي])/;

function poisoning(clause: string): Candidate | null {
  const S = POISONING.sets;
  const std = pick(S.STANDALONE, clause);
  const past = has(S.EXCL_PAST, clause);
  if (std) return { tier: past ? "urgent" : "emergency", termAr: std, ruleId: past ? "G.standalone_past" : "G.standalone" };
  const swallow = SWALLOW_HIT.test(clause) || SWALLOW_HIT_GAPPED.test(clause);
  const take = TAKE_HIT.test(clause) || TAKE_HIT_GAPPED.test(clause);
  if (!swallow && !take) return null;
  const obj = pick(ALL_OBJECTS, clause) ?? "دواء";
  // T3 — THE MEDICATION-TAKING EXCLUSION, scoped to the MEDICATION sub-list and to TAKE verbs.
  // As written it covered ONE object of fifteen, so «أخذت الدواء الصبح» — what a hypertensive
  // patient does every morning — raised a poisoning emergency and a booking lock. SWALLOW
  // verbs are unaffected: «بنتي بلعت حبوب» and «ابني بلع كلور» still fire.
  if (!swallow && take) {
    const poisonObject = has(S.SITE_POISON, clause);
    const qualified = has(S.QUALIFIER, clause);
    // «MY medicine» is ordinary when I am the one taking it and alarming when somebody
    // else is: «ابني أخذ دوايي» was silent because the possessive forms were not
    // objects at all, and adding them as QUALIFIERS instead made «أخذت دوايي الصبح»
    // fire — the exact sentence T3 exists for. The separator is not the possessive,
    // it is WHO IS TAKING: a person marker in the clause and no first-person verb.
    // THE VERB CANNOT SEPARATE THEM. «أخذتْ» (she took) and «أخذتُ» (I took) are the
    // same consonants, so «بنتي أخذت حبوبي» and «أخذت حبوبي» differ only by the
    // person marker at the front. That marker is the whole test: someone else is
    // named in the clause, and the medication is the speaker's.
    const mineButNotMine = MY_MEDICATION_AR.test(clause) && hasPersonAnchor(clause);
    if (!poisonObject && !qualified && !mineButNotMine) return null;
  }
  return { tier: past ? "urgent" : "emergency", termAr: obj, ruleId: past ? "G.ingestion_past" : "G.ingestion" };
}

// ── §2.8 H — TRAUMA ──────────────────────────────────────────────────────────
function trauma(clause: string): Candidate | null {
  const std = pick(TRAUMA.sets.STANDALONE, clause);
  return std ? { tier: "emergency", termAr: std, ruleId: "H.standalone" } : null;
}


// ════════════════════════════════════════════════════════════════════════════════════════════
// THE ENGLISH ARM — one function per class, over `normalizeEn`'s clauses.
//
// WHY THESE ARE SEPARATE FUNCTIONS AND NOT AN EXTRA `if` INSIDE EACH ARABIC ARM. The two
// scripts have different boundaries (§1.2's `(?<![ء-ي])` against ASCII `\b`), different
// clause splitters (`بس` against `but`), different normalizers and — because a message is
// segmented independently in each — different clause LISTS. An arm that took both would have
// to carry the whole distinction inline, in nine places, which is how a matcher discipline
// drifts. `match.ts` holds one pair of tools; each class holds one pair of rules.
//
// WHAT SHIPPED BEFORE, AND WHY IT WAS NOT AN ENGLISH ARM: four classes had a `STANDALONE_EN`
// array read with `raw.toLowerCase().includes(p)` — the WHOLE MESSAGE, no boundary, no clause,
// no composition — and five classes had nothing at all. So «my baby has a fever and won't wake
// up» was silent, and so was every other English sentence in §2.5, §2.6, §2.7 and §2.8. Driven
// through the real engine: a booking offer, no rail.
// ════════════════════════════════════════════════════════════════════════════════════════════

// ── §2.9 I — SELF-HARM, ENGLISH ──────────────────────────────────────────────
// STANDALONE PHRASES AND NOTHING ELSE. §1.3 singles this class out as the one where the
// over-fire cost is itself a safety cost, and English death talk is idiom before it is
// ideation — «killing me», «dying to», «to die for», «dead tired». No bare verb is a term, so
// every one of those is quiet because NOTHING MATCHES, which is the state §2.9's T6 inversion
// had to engineer for Arabic and English gets by construction.
function selfHarmEn(clause: string): Candidate | null {
  const S = SELF_HARM.sets;
  if (hasEn(S.BEREAVEMENT_EN, clause)) return null;
  if (hasEn(S.IDIOM_EXCL_EN, clause)) return null;
  // «I cut myself shaving» is an injury report and «I cut myself again last night» is not, and
  // the two are one word apart. An enumerated accident term IN THE MESSAGE (§2.0 L5) scopes
  // the `cut myself` members ALONE — tested per member, so an accident word cannot silence
  // «I want to die» standing beside it — and §11.2 pairs both sentences so neither can be
  // traded for the other.
  for (const std of S.STANDALONE_EN) {
    if (!termReEn(std).test(clause)) continue;
    if (/cut(ting)? myself/.test(std) && hasEn(S.ACCIDENT_EXCL_EN, clause)) continue;
    return { tier: "emergency", termAr: std, ruleId: "I.standalone_en" };
  }
  return null;
}

// ── §2.1 A — CARDIAC, ENGLISH ────────────────────────────────────────────────
// THE PREDICATE IS ADJACENT TO THE TERM AND THE COMPANION IS NOT, which is §2.1's own shape:
// «chest pain» / «pain in my chest» / «my chest hurts» are the finding, and «sweating» is a
// companion that counts only with a term in the same clause. Adjacency is what keeps «I need a
// chest x-ray because my throat is sore» quiet — four tokens apart, and `sore` never reaches.
const A_MIDS_EN = ["is", "was", "feels", "felt", "in", "on", "of", "my", "his", "her", "the",
  "around", "under", "with", "really", "very", "so", "getting", "gets", "keeps"];
const A_TERM_PRED_EN = adjEn(CARDIAC.sets.TERM_EN, A_MIDS_EN,
  [...CARDIAC.sets.PRED_PAIN_EN, ...CARDIAC.sets.PRED_PRESSURE_EN, ...CARDIAC.sets.PRED_BURNING_EN]);
const A_PRED_TERM_EN = adjEn(
  [...CARDIAC.sets.PRED_PAIN_EN, ...CARDIAC.sets.PRED_PRESSURE_EN, ...CARDIAC.sets.PRED_BURNING_EN],
  A_MIDS_EN, CARDIAC.sets.TERM_EN);

function cardiacEn(clause: string): Candidate | null {
  const S = CARDIAC.sets;
  const std = pickEn(S.STANDALONE_EN, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "A.standalone_en" };
  const term = pickEn(S.TERM_EN, clause);
  if (!term) return null;
  // «my heart is heavy» IS GRIEF, and it is a term and a pressure predicate in three words.
  // An enumerated closed compound in the message (§2.0 L5), scoping the TERM × PREDICATE arm
  // only — a named cardiac event still fires through it, and so does any chest predicate.
  if (hasEn(S.EXCL_IDIOM_EN, clause)) return null;
  if (A_TERM_PRED_EN.test(clause) || A_PRED_TERM_EN.test(clause)) {
    return { tier: "emergency", termAr: term, ruleId: "A.term_predicate_en" };
  }
  if (hasEn(S.PRED_COMPANION_EN, clause)) {
    return { tier: "emergency", termAr: term, ruleId: "A.companion_en" };
  }
  return null;
}

// ── §2.2 B — STROKE, ENGLISH ─────────────────────────────────────────────────
const B_MIDS_EN = ["is", "are", "was", "were", "his", "her", "my", "the", "on", "one", "of",
  "went", "feels", "completely", "totally", "suddenly", "still", "and"];
const B_TERM_FAIL_EN = adjEn(STROKE.sets.TERM_EN, B_MIDS_EN, STROKE.sets.PRED_FAILURE_EN);
const B_FAIL_TERM_EN = adjEn(STROKE.sets.PRED_FAILURE_EN, B_MIDS_EN, STROKE.sets.TERM_EN);

function strokeEn(clause: string): Candidate | null {
  const S = STROKE.sets;
  const benign = hasEn(S.EXCL_BENIGN_EN, clause);
  // THE FOLLOW-UP EXCLUSION SCOPES THE BARE NOUN AND NOTHING ELSE (§2.0 L5). §2.2's near-miss
  // table rules «متابعة بعد الجلطة» and «موعد علاج طبيعي بعد الجلطة» quiet, and Arabic gets
  // that free because bare `جلطة` is not a term. Bare `stroke` IS an English term — it shipped
  // as one, and deleting it would take «my father had a stroke» with it — so the rehabilitation
  // reading is named in the message instead. Tested PER MEMBER, so «stroke rehab, and her face
  // is drooping» still fires on the FAST sign standing beside the excluded noun.
  for (const std of S.STANDALONE_EN) {
    if (!termReEn(std).test(clause)) continue;
    if (std === "stroke" && hasEn(S.EXCL_FOLLOWUP_EN, clause)) continue;
    return { tier: "emergency", termAr: std, ruleId: "B.standalone_en" };
  }
  // THE INTRANSITIVE ARM — the T6 inversion, in a second class and on a second axis.
  // «I CAN'T SPEAK ARABIC» is the commonest sentence in an expatriate clinic inbox and it is
  // aphasia word for word; «I'm seeing double entries for the same booking» is a duplicate
  // booking and it is diplopia word for word. Both findings are INTRANSITIVE — the patient
  // reports them with no object — and both idioms TAKE one, over a complement slot that is
  // open (every language, «right now», «entries», «bookings»). So the rule fires on an EMPTY
  // complement or on an enumerated adverb, and on nothing else. Driven, and the four rows are
  // the whole test: «my father suddenly can't speak» FIRES · «he is seeing double» FIRES ·
  // «I can't speak Arabic» quiet · «I'm seeing double entries» quiet.
  for (const phrase of S.INTRANSITIVE_EN) {
    const m = termReEn(phrase).exec(clause);
    if (!m) continue;
    const after = clause.slice(m.index + m[0].length).trim();
    if (after === "" || S.INTRANSITIVE_ADVERB_EN.some((adv) => after.startsWith(adv))) {
      return { tier: "emergency", termAr: phrase, ruleId: "B.intransitive_en" };
    }
  }
  if (benign) return null;
  const term = pickEn(S.TERM_EN, clause);
  if (term && (B_TERM_FAIL_EN.test(clause) || B_FAIL_TERM_EN.test(clause))) {
    return { tier: "emergency", termAr: term, ruleId: "B.term_failure_en" };
  }
  // The onset arm, scoped to the PERSON-ONLY failures — «the queue is not moving», «my file
  // hasn't moved», «the booking system is paralysed» are ordinary English and each of them is
  // a failure predicate with an onset. Nothing administrative slurs its speech or sees double.
  if (hasEn(S.PRED_ONSET_EN, clause) && hasEn(S.PRED_FAILURE_PERSON_ONLY_EN, clause)) {
    return {
      tier: "emergency",
      termAr: pickEn(S.PRED_FAILURE_PERSON_ONLY_EN, clause) ?? "drooping",
      ruleId: "B.onset_failure_en",
    };
  }
  return null;
}

// ── §2.4 D — AIRWAY, ENGLISH ─────────────────────────────────────────────────
const D_ARM1_EN = adjEn(AIRWAY.sets.NEG_EN, AIRWAY.sets.MID_EN, AIRWAY.sets.BREATHE_EN);
const D_ARM2_EN = adjEn(AIRWAY.sets.DIFFICULTY_EN, AIRWAY.sets.DIFFICULTY_MID_EN, AIRWAY.sets.BREATHE_NOUN_EN);
const D_ARM2_DENIAL_EN = adjEn(AIRWAY.sets.DENIAL_HEAD_EN, AIRWAY.sets.DENIAL_MID_EN, AIRWAY.sets.DIFFICULTY_EN);
const D_PART_SWELL_EN = adjEn(AIRWAY.sets.PART_EN, AIRWAY.sets.PART_MID_EN,
  [...AIRWAY.sets.SWELL_EN, ...AIRWAY.sets.CLOSE_EN]);
const D_SWELL_PART_EN = adjEn([...AIRWAY.sets.SWELL_EN, ...AIRWAY.sets.CLOSE_EN],
  AIRWAY.sets.PART_MID_EN, AIRWAY.sets.PART_EN);
/** «turning blue» is cyanosis AND a bruise, so it takes the ARM 5 treatment: the tell is on the
 *  LEFT. A symptom report names a person; «the bruise is turning blue» does not. */
const D_NEEDS_PERSON_EN = ["turning blue", "went blue", "going blue"];

function airwayEn(clause: string): Candidate | null {
  const S = AIRWAY.sets;
  if (D_ARM1_EN.test(clause)) {
    return { tier: "emergency", termAr: pickEn(S.BREATHE_EN, clause) ?? "breathe", ruleId: "D.arm1_inability_en" };
  }
  // ARM 2's DENIAL GOVERNS THE NOUN, exactly as it does in Arabic. «no difficulty breathing»,
  // «he has no trouble breathing at all» and «not short of breath» are what a patient writes
  // when they are FINE, and a co-occurrence reading sends every one of them an ambulance.
  if (D_ARM2_EN.test(clause) && !D_ARM2_DENIAL_EN.test(clause)) {
    return { tier: "emergency", termAr: pickEn(S.DIFFICULTY_EN, clause) ?? "difficulty", ruleId: "D.arm2_difficulty_en" };
  }
  if (D_PART_SWELL_EN.test(clause) || D_SWELL_PART_EN.test(clause)) {
    return { tier: "emergency", termAr: pickEn(S.PART_EN, clause) ?? "throat", ruleId: "D.arm4_part_verb_en" };
  }
  // A GUARDED MEMBER MUST NOT SILENCE ITS UNGUARDED SIBLINGS, and picking the longest match
  // first and testing its guard afterwards does exactly that: «the bruise is turning blue and
  // he is not breathing» would pick `turning blue`, fail its person anchor, and return with
  // `not breathing` never consulted. So each member is tested with its own guard and the first
  // that passes wins — the shape §2.6's red-flag loop already uses, where `خامل` is skipped
  // with a `continue` rather than deciding the whole arm.
  for (const ph of S.PHRASE_EN) {
    if (!termReEn(ph).test(clause)) continue;
    if (D_NEEDS_PERSON_EN.includes(ph) && !hasPersonAnchorEn(clause)) continue;
    return { tier: "emergency", termAr: ph, ruleId: "D.arm6_phrase_en" };
  }
  for (const std of S.STANDALONE_EN) {
    if (!termReEn(std).test(clause)) continue;
    if (std === "choking" && hasEn(S.EXCL_HAZARD_EN, clause)) continue;
    return { tier: "emergency", termAr: std, ruleId: "D.standalone_en" };
  }
  return null;
}

// ── §2.5 E — OBSTETRIC, ENGLISH ──────────────────────────────────────────────
function obstetricEn(clause: string): Candidate | null {
  const S = OBSTETRIC.sets;
  const std = pickEn(S.STANDALONE_EN, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "E.standalone_en" };
  const term = pickEn(S.TERM_EN, clause);
  if (!term) return null;
  for (const [set, id] of [
    [S.PRED_BLEED_EN, "E.bleeding_en"], [S.PRED_MOVE_EN, "E.movement_en"],
    [S.PRED_LABOUR_EN, "E.labour_en"], [S.PRED_PREECL_EN, "E.preeclampsia_en"],
    [S.PRED_PAIN_EN, "E.pain_en"],
  ] as const) {
    if (hasEn(set, clause)) return { tier: "emergency", termAr: term, ruleId: id };
  }
  return null;
}

// ── §2.3 C — HEMORRHAGE, ENGLISH ─────────────────────────────────────────────
const C_MIDS_EN = ["is", "was", "are", "with", "of", "in", "from", "the", "a", "his", "her", "my", "and", "so", "very", "really"];
const C_VOL_TERM_EN = adjEn(HEMORRHAGE.sets.PRED_VOLUME_EN, C_MIDS_EN, HEMORRHAGE.sets.TERM_EN);
const C_TERM_VOL_EN = adjEn(HEMORRHAGE.sets.TERM_EN, C_MIDS_EN, HEMORRHAGE.sets.PRED_VOLUME_EN);

function hemorrhageEn(clause: string): Candidate | null {
  const S = HEMORRHAGE.sets;
  // A NEGATED RESOLUTION IS NOT A RESOLUTION. «the wound hasn't stopped bleeding» carries the
  // whole exclusion phrase «stopped bleeding» inside it, and honouring it there would silence
  // the strongest sentence in the class. Any negation in the clause disables the exclusion,
  // which fails toward firing — the direction §13 requires while every §12 row is unsigned.
  if (hasEn(S.EXCL_RESOLVED_EN, clause) && !/(?<![a-z])(?:hasnt|havent|wont|doesnt|didnt|never|not|still)(?![a-z])/.test(clause)) {
    return null;
  }
  const std = pickEn(S.STANDALONE_EN, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "C.standalone_en" };
  const term = pickEn(S.TERM_EN, clause);
  if (!term) return null;
  // The gum / nose veto sits OUTSIDE the predicate test, or the volume predicate buys back the
  // commonest dental complaint in the product (§2.3, S1.5-5).
  const capped = hasEn(S.SITE_CAPPED_EN, clause);
  if (capped && hasEn(S.EXCL_HYGIENE_EN, clause)) return null;
  const pred = C_VOL_TERM_EN.test(clause) || C_TERM_VOL_EN.test(clause) || hasEn(S.PRED_PERSIST_EN, clause);
  const site = hasEn(S.SITE_EN, clause);
  const siteUrgent = hasEn(S.SITE_URGENT_EN, clause);
  if (!pred && !site && !siteUrgent) return null;
  if (siteUrgent && !pred && !site) {
    const withPainOrFever = /(?<![a-z])(?:pain|painful|hurts|fever|temperature|burning)(?![a-z])/.test(clause);
    return { tier: withPainOrFever ? "emergency" : "urgent", termAr: term, ruleId: "C.site_urgent_en" };
  }
  if (capped) {
    const lift = hasEn(S.CAP_LIFT_EN, clause);
    return { tier: lift ? "emergency" : "urgent", termAr: term, ruleId: lift ? "C.gum_cap_lifted_en" : "C.gum_capped_en" };
  }
  return { tier: "emergency", termAr: term, ruleId: pred ? "C.term_predicate_en" : "C.term_site_en" };
}

// ── §2.6 F — INFANT FEVER, ENGLISH ───────────────────────────────────────────
function infantFeverEn(clause: string): Candidate | null {
  const S = INFANT_FEVER.sets;
  // The red-flag arm NEVER consults the fever-side exclusions (§2.0 L5): a seizure last month
  // is still a seizure, and a child who will not wake is not made safe by a past-time word.
  for (const rf of S.PRED_REDFLAG_EN) {
    if (!termReEn(rf).test(clause)) continue;
    // `unresponsive` · `lethargic` · `floppy` ARE ADMINISTRATIVE WORDS TOO — «the clinic is
    // unresponsive on the phone», «the app is unresponsive since the update». This is §2.6's
    // `خامل` finding in English and it takes the same guard: a person in the clause, or a
    // second red flag beside it.
    if (S.PRED_REDFLAG_NEEDS_PERSON_EN.includes(rf)
      && !hasPersonAnchorEn(clause)
      && !hasEn(S.PRED_REDFLAG_EN.filter((x) => x !== rf), clause)) continue;
    // A STIFF NECK IS MENINGISM IN A CHILD AND A PILLOW IN AN ADULT (§2.0 L5, the §2.2
    // benign-cause exclusion in a second class): the writer named the cause, and a parent
    // reporting meningism does not attribute it to the way they slept.
    if (/neck/.test(rf) && hasEn(S.EXCL_BENIGN_NECK_EN, clause)) continue;
    return { tier: "emergency", termAr: rf, ruleId: "F.redflag_en" };
  }
  const term = pickEn(S.TERM_EN, clause);
  if (!term) return null;
  if (hasEn(S.EXCL_NOT_BODY_EN, clause)) return null;      // the subject is not a body
  // AN EXPLICIT PAST-TIME MARKER OR A RESOLUTION, IN THE MESSAGE (§2.0 L5). «my son had a fever
  // last month, he's fine now, I want a check-up» is three clauses and the resolution is in the
  // third, so the FIRST has to be quiet on its own — and what makes it quiet is the month in it.
  if (hasEn(S.EXCL_PAST_EN, clause)) return null;
  if (hasEn(S.EXCL_RESOLVED_EN, clause)) return null;
  const value = bodyTemperatureEn(clause);
  const months = ageInMonthsEn(clause);
  const infant = hasEn(S.PRED_INFANT_EN, clause);
  const child = hasEn(S.PRED_CHILD_EN, clause);
  const persist = hasEn(S.PRED_PERSIST_EN, clause);
  if (value !== null && value < 38.0) return null;         // not a fever
  // AN AGE UNDER THREE MONTHS IS A MARKER; AN AGE OVER IT IS NOT. «she is 36 days old and has a
  // fever» must fire with no marker word at all — that IS the population §2.6 exists for — and
  // «post-vaccine fever in my 4-year-old» must not, because an age is not a report of illness.
  const youngAge = months !== null && months < 3;
  if (!infant && !child && !persist && value === null && !youngAge) return null;
  if (hasEn(S.EXCL_CHRONIC_EN, clause)) return { tier: "urgent", termAr: term, ruleId: "F.fever_chronic_en" };
  if (youngAge) return { tier: "emergency", termAr: term, ruleId: "F.infant_age_en" };
  // AN EXPLICIT AGE ≥ 3 MONTHS CAPS THE HIT AT `urgent`, and this is the one place an English
  // rule is stronger than its Arabic twin rather than equal to it. §2.6's own tier table says
  // «age ≥ 3 months + fever alone → urgent»; the Arabic arm cannot honour it because it has no
  // age reader and must fail toward firing on a child word plus a value. `ageInMonthsEn` reads
  // what the parent actually wrote, so the English arm can obey the row instead of guessing.
  if (months !== null) return { tier: "urgent", termAr: term, ruleId: "F.child_age_en" };
  if (infant) return { tier: "emergency", termAr: term, ruleId: "F.infant_fever_en" };
  if (value !== null && value >= 38.0) {
    return { tier: child ? "emergency" : "urgent", termAr: term, ruleId: child ? "F.child_fever_value_en" : "F.fever_value_en" };
  }
  return { tier: "urgent", termAr: term, ruleId: persist ? "F.fever_persistent_en" : "F.child_fever_en" };
}

// ── §2.7 G — POISONING, ENGLISH ──────────────────────────────────────────────
const G_OBJECTS_EN = [...POISONING.sets.SITE_POISON_EN, ...POISONING.sets.SITE_MEDICATION_EN];
const G_SWALLOW_EN = adjEnAny(POISONING.sets.VERB_SWALLOW_EN, G_OBJECTS_EN, 4);
const G_TAKE_EN = adjEnAny(POISONING.sets.VERB_TAKE_EN, G_OBJECTS_EN, 4);

/** «my medicine», «my pills», «my blood pressure tablets» — the speaker's own
 *  medication, with room for the two words people put in front of the noun. */
const MY_MEDICATION_EN = /\bmy (?:[a-z]+\s+){0,2}(?:medicine|medication|meds|pills|tablets|prescription|drugs)\b/;
/** «I took …» / «I've taken …» — the speaker is the one taking it, which is T3's
 *  ordinary case and must stay quiet however the sentence is phrased. */
const FIRST_PERSON_TAKER_EN = /\b(?:i|i've|i have|ive)\s+(?:just\s+|already\s+)?(?:took|take|taken|swallowed)\b/;

function poisoningEn(clause: string): Candidate | null {
  const S = POISONING.sets;
  const past = hasEn(S.EXCL_PAST_EN, clause);
  const std = pickEn(S.STANDALONE_EN, clause);
  if (std) return { tier: past ? "urgent" : "emergency", termAr: std, ruleId: past ? "G.standalone_past_en" : "G.standalone_en" };
  const swallow = G_SWALLOW_EN.test(clause);
  const take = G_TAKE_EN.test(clause);
  if (!swallow && !take) return null;
  const obj = pickEn(G_OBJECTS_EN, clause) ?? "medicine";
  // T3 IN ENGLISH. «I took my medicine this morning» is what a chronic patient does every day
  // of their life, and a TAKE verb with a medication object and no quantity or ownership
  // qualifier is a prescription being followed. SWALLOW verbs are untouched: «my daughter
  // swallowed pills» fires with no qualifier at all, because SWALLOWING pills is alarming on
  // its own and TAKING them is not. §11.2 pairs the two so neither can be traded away.
  const owned = adjEn(S.QUALIFIER_OWNER_EN, [], G_OBJECTS_EN).test(clause);
  // «MY medicine» is ordinary when I am the one taking it and alarming when somebody
  // else is: «my son took my medicine» was silent, because "my" was left out of the
  // owner list precisely so that «I took my medicine this morning» stays quiet. The
  // separator is not the possessive — it is WHO IS TAKING. A third-person subject
  // with the speaker's own medication is a child reaching the parent's box, which is
  // the commonest paediatric poisoning presentation there is.
  const mineButNotMine = MY_MEDICATION_EN.test(clause) && hasPersonAnchorEn(clause) && !FIRST_PERSON_TAKER_EN.test(clause);
  if (!swallow && take && !hasEn(S.SITE_POISON_EN, clause) && !hasEn(S.QUALIFIER_EN, clause) && !owned && !mineButNotMine)
    return null;
  return { tier: past ? "urgent" : "emergency", termAr: obj, ruleId: past ? "G.ingestion_past_en" : "G.ingestion_en" };
}

// ── §2.8 H — TRAUMA, ENGLISH ─────────────────────────────────────────────────
// PHRASES ONLY, and the English homographs are why: bare `accident` is the ER department's own
// name in English, bare `fell` is «fell behind on my payments», bare `burn` is «fat burning»,
// bare `fracture` is a follow-up booking. There is no recall net worth those four.
function traumaEn(clause: string): Candidate | null {
  const std = pickEn(TRAUMA.sets.STANDALONE_EN, clause);
  return std ? { tier: "emergency", termAr: std, ruleId: "H.standalone_en" } : null;
}

// ── THE UNION ────────────────────────────────────────────────────────────────
const ARMS: ReadonlyArray<{
  cls: RedFlagClass; label: string;
  run: (clause: string) => Candidate | null;
  runEn: (clause: string) => Candidate | null;
}> = [
  { cls: "self_harm", label: SELF_HARM.label, run: selfHarm, runEn: selfHarmEn },
  { cls: "cardiac", label: CARDIAC.label, run: cardiac, runEn: cardiacEn },
  { cls: "stroke", label: STROKE.label, run: stroke, runEn: strokeEn },
  { cls: "airway", label: AIRWAY.label, run: airway, runEn: airwayEn },
  { cls: "obstetric", label: OBSTETRIC.label, run: obstetric, runEn: obstetricEn },
  { cls: "hemorrhage", label: HEMORRHAGE.label, run: hemorrhage, runEn: hemorrhageEn },
  { cls: "infant_fever", label: INFANT_FEVER.label, run: infantFever, runEn: infantFeverEn },
  { cls: "poisoning", label: POISONING.label, run: poisoning, runEn: poisoningEn },
  { cls: "trauma", label: TRAUMA.label, run: trauma, runEn: traumaEn },
];

/**
 * §1.1 — THE DETECTOR. Pure, total, pre-model.
 *
 * Returns `null` when nothing fires. `null` and not `{ fired: false }`: an object is always
 * truthy, and a differential built on one reports "everything fires everywhere" while passing
 * its own floors — a mistake this repo has already paid for in a sibling proof.
 *
 * ORDER (§2.0 L7): I, A, B, D, E, C, F, G, H. Two orderings are load-bearing and both are
 * driven: «أخذت حبوب كثير عشان أخلص» is class I, not class G; «نزيف بعد الولاده» is class E,
 * not class C. The tier and the rail are the same either way; what differs is the audit row,
 * the operator label and which clinician is paged.
 *
 * EXCLUSIONS AND ADJACENCY ARE CLAUSE-SCOPED, NEVER MESSAGE-SCOPED (§1.2, §2.0 L4). The
 * hypothetical veto is the ONLY veto that reaches a HARD class, and only inside its own clause
 * (§1.5 R1). Every class in §1.3 is HARD, so `BOOKING_FRAME_RE` and `PAST_CLAUSE_RE` are never
 * consulted here at all — which is the mechanism, not the promise, behind "hardness is
 * absolute". Driven: «ابغى موعد اليوم لان امي جاها شلل نصفي فجاه» is one clause with a booking
 * frame in it, and it fires.
 */
export function detectRedFlag(text: string): RedFlagHit | null {
  const raw = String(text ?? "");
  const n = normalizeForSafety(raw);
  if (!n) return null;
  // TWO SEGMENTATIONS OF ONE MESSAGE, NOT TWO MESSAGES. The Arabic and English views are built
  // from the same text by two normalizers and split by two splitters, so their clause lists do
  // not line up and neither can be derived from the other — «I want a slot, but he can't
  // breathe» breaks at `but`, which the Arabic splitter has never heard of. The CLASS ORDER
  // (§2.0 L7) is the outer loop in both, so precedence is the same whichever script the finding
  // arrives in.
  const clauses = splitClauses(n);
  const enClauses = splitClausesEn(normalizeEn(raw));
  for (const { cls, label, run, runEn } of ARMS) {
    for (const clause of clauses) {
      if (HYPOTHETICAL_RE.test(clause)) continue;
      const c = run(clause);
      if (c) return hit(cls, label, c);
    }
    for (const clause of enClauses) {
      if (HYPOTHETICAL_EN_RE.test(clause)) continue;
      const c = runEn(clause);
      if (c) return hit(cls, label, c);
    }
  }
  return null;
}
