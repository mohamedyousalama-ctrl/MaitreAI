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

import { normalizeForSafety } from "./normalize";
import {
  adj, adjPick, bodyTemperature, has, hasNonPersonSubject, hasPersonAnchor, pick, splitClauses,
  HYPOTHETICAL_RE, SPELLED_FEVER, termRe,
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
function selfHarm(clause: string, raw: string): Candidate | null {
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
  // The English/franco arm runs on the RAW text, lowercased — `normalizeAr` lowercases too,
  // but the Arabic folds must not reach a Latin string.
  const en = S.STANDALONE_EN.find((p) => raw.toLowerCase().includes(p));
  if (en) return { tier: "emergency", termAr: en, ruleId: "I.standalone_en" };
  // Rule 1 — a first-person death/harm verb with no idiom object left standing.
  if (/(?:^|\s)(?:و|ف|ب|ك|ل)?(?:ابي|ودي|بدي|افكر|راح|بغيت) [^ ]{0,12}(?:اموت|انتحر|اختفي)/.test(clause)) {
    return { tier: "emergency", termAr: "اموت", ruleId: "I.first_person_intent" };
  }
  return null;
}

// ── §2.1 A — CARDIAC ─────────────────────────────────────────────────────────
function cardiac(clause: string, raw: string): Candidate | null {
  const S = CARDIAC.sets;
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "A.standalone" };
  const en = S.STANDALONE_EN.find((p) => raw.toLowerCase().includes(p));
  if (en) return { tier: "emergency", termAr: en, ruleId: "A.standalone_en" };
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
function stroke(clause: string, raw: string): Candidate | null {
  const S = STROKE.sets;
  // An EXPLICIT benign cause named in the message (§2.0 L5) — an arm exclusion, not a frame.
  // Without it this class's rule was WIDER than its own near-miss table: «تنميل في رجلي من
  // الجلسة» is a failure predicate and a body term in one clause.
  const benign = has(S.EXCL_BENIGN, clause);
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "B.standalone" };
  const en = S.STANDALONE_EN.find((p) => raw.toLowerCase().includes(p));
  if (en) return { tier: "emergency", termAr: en, ruleId: "B.standalone_en" };
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

function airway(clause: string, raw: string): Candidate | null {
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
  const en = S.STANDALONE_EN.find((p) => raw.toLowerCase().includes(p));
  if (en) return { tier: "emergency", termAr: en, ruleId: "D.arm8_english" };
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
function hemorrhage(clause: string, raw: string): Candidate | null {
  const S = HEMORRHAGE.sets;
  if (has(S.EXCL_RESOLVED, clause)) return null;
  const std = pick(S.STANDALONE, clause);
  if (std) return { tier: "emergency", termAr: std, ruleId: "C.standalone" };
  const en = S.STANDALONE_EN.find((p) => raw.toLowerCase().includes(p));
  if (en) return { tier: "emergency", termAr: en, ruleId: "C.standalone_en" };
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
    if (!poisonObject && !qualified) return null;
  }
  return { tier: past ? "urgent" : "emergency", termAr: obj, ruleId: past ? "G.ingestion_past" : "G.ingestion" };
}

// ── §2.8 H — TRAUMA ──────────────────────────────────────────────────────────
function trauma(clause: string): Candidate | null {
  const std = pick(TRAUMA.sets.STANDALONE, clause);
  return std ? { tier: "emergency", termAr: std, ruleId: "H.standalone" } : null;
}

// ── THE UNION ────────────────────────────────────────────────────────────────
const ARMS: ReadonlyArray<{
  cls: RedFlagClass; label: string; run: (clause: string, raw: string) => Candidate | null;
}> = [
  { cls: "self_harm", label: SELF_HARM.label, run: selfHarm },
  { cls: "cardiac", label: CARDIAC.label, run: cardiac },
  { cls: "stroke", label: STROKE.label, run: stroke },
  { cls: "airway", label: AIRWAY.label, run: airway },
  { cls: "obstetric", label: OBSTETRIC.label, run: obstetric },
  { cls: "hemorrhage", label: HEMORRHAGE.label, run: hemorrhage },
  { cls: "infant_fever", label: INFANT_FEVER.label, run: infantFever },
  { cls: "poisoning", label: POISONING.label, run: poisoning },
  { cls: "trauma", label: TRAUMA.label, run: trauma },
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
  const clauses = splitClauses(n);
  for (const { cls, label, run } of ARMS) {
    for (const clause of clauses) {
      if (HYPOTHETICAL_RE.test(clause)) continue;
      const c = run(clause, raw);
      if (c) return hit(cls, label, c);
    }
  }
  return null;
}
