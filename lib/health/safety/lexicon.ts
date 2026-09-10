// ============================================================================
// فيصل / Faysal — SAFETY RAIL · THE §2 LEXICON, AS DATA.
// PURE. Transcribed from SPEC-4-SAFETY.md §2.1–§2.9, written NORMALIZED (§2.0 L6).
//
// WHY THIS IS A DATA MODULE AND NOT NINE HAND-WRITTEN REGEXES.
//
// §2.0 L6 mirrors every Fires-list entry into MUST_FIRE; §2.0 L8 mirrors every enumerated
// set member into MUST_BE_QUIET. Both mirrors are MECHANICAL — the proof reads this file and
// fails when an entry has no assertion — and a mirror cannot be mechanical over a regex
// somebody wrote by hand. So the sets, the Fires lists, the near-miss rows AND the L8
// pairings all live here, in one object per class, and `detect.ts` composes the rules from
// them. A term added to a set gains its assertions on both sides in the same commit, which
// is the property the last three audits kept asking for and no wave had.
//
// THE NORMALIZATION DISCIPLINE, SETTLED (§2.0 L6, Wave 1.7). Operative sets are written in
// their NORMALIZED spelling and `proof-faysal-safety.test.ts` asserts
// `list === list.map(normalizeAr)` on every one of them. Fires lists and near-miss rows are
// written in THE SPELLING A PATIENT TYPES — «ألم في الصدر», «طاح على راسه» — because that is
// the input the detector normalizes, and driving the typed spelling is the only way to prove
// the normalizer and the pattern agree. 58 entries were dead for want of this discipline,
// including the one §2.8's own correction note said it had fixed.
// ============================================================================

import {
  CARDIAC_EN, STROKE_EN, HEMORRHAGE_EN, AIRWAY_EN, OBSTETRIC_EN,
  INFANT_FEVER_EN, POISONING_EN, TRAUMA_EN, SELF_HARM_EN,
} from "./lexicon-en";

export type RedFlagClass =
  | "cardiac" | "stroke" | "hemorrhage" | "airway"
  | "obstetric" | "infant_fever" | "poisoning" | "trauma" | "self_harm";

export type RedFlagTier = "emergency" | "urgent";

/** One Fires-list entry, mirrored into MUST_FIRE per §2.0 L6. A CONDITIONAL entry is written
 *  as a COMPLETE SENTENCE satisfying its stated condition — §2.1's radiation companions fire
 *  only with a chest term in the same clause, so the corpus carries «صدري يعورني والوجع ينزل
 *  لدراعي», never the bare companion. */
export interface FiresEntry {
  readonly text: string;
  readonly tier: RedFlagTier;
  /** Set when the string is expected to land on a DIFFERENT class than its own section —
   *  §2.0 L7's precedence order. «نزيف بعد الولاده» is class E, not C. */
  readonly cls?: RedFlagClass;
  /** An ACCEPTED OVER-FIRE, per §11.1: a MUST_FIRE row with an annotation, never a near-miss.
   *  Putting an accepted over-fire in the quiet corpus is how a rule gets narrowed to make a
   *  proof green. */
  readonly acceptedOverFire?: string;
}

/** One near-miss row. `tier` set ⇒ assert THAT TIER (T4); absent ⇒ assert no hit at all. */
export interface NearMiss {
  readonly text: string;
  readonly tier?: RedFlagTier;
  readonly cls?: RedFlagClass;
  /** The true positive this narrowing must not cost (§11.2's pairing discipline). */
  readonly paired?: string;
}

/** §2.0 L8 — how a set's members are mirrored into MUST_BE_QUIET.
 *  `frames` carry a `{}` placeholder and are applied to EVERY member of the set.
 *  `per` pairs named members individually.
 *  `onlyFinding` is the one-line annotation L8 detail 2 permits: the member has no ordinary
 *  clinic reading, and saying so IS the mirror. What L8 forbids is a member with no entry. */
export interface Mirror {
  readonly frames?: readonly string[];
  readonly per?: Readonly<Record<string, readonly string[]>>;
  readonly onlyFinding?: string;
  /** The same one-line annotation, for INDIVIDUAL members of a set whose other members do
   *  have ordinary readings. `EXACERBATION` is the case: «اشتد» and «ازمه» are ordinary
   *  words about a queue, and «البخاخ ما نفع» is not a sentence about anything else. */
  readonly onlyFindingMembers?: readonly string[];
}

export interface ClassSpec {
  readonly cls: RedFlagClass;
  readonly label: string;
  readonly sets: Readonly<Record<string, readonly string[]>>;
  readonly fires: readonly FiresEntry[];
  readonly nearMiss: readonly NearMiss[];
  readonly mirror: Readonly<Record<string, Mirror>>;
}

/** A class's ENGLISH arm — the same four things, in `normalizeEn`'s spelling. It is a separate
 *  shape and a separate file only so the diff that adds a second script does not run through
 *  1,400 lines of Arabic; it is MERGED into the ClassSpec below, so `everyEnumeratedMember`,
 *  the L6 mirror, the L8 mirror and §N all reach it with no change of their own. A set that
 *  lives outside the merged object is a set no mirror can see, which is the failure the whole
 *  file is built to prevent. */
export type EnglishArm = Pick<ClassSpec, "sets" | "fires" | "nearMiss" | "mirror">;

/** Merge the English arm into the class. THROWS ON A KEY COLLISION, and that is not defensive
 *  programming — a silently replaced set is a rule that disappears with every proof still
 *  green, which is the exact failure mode §2.0 L6 and L8 exist to make impossible. It is a
 *  module-load invariant over two literals in this repository, so it can only fire for a
 *  developer, never for a patient. */
export function withEn(ar: ClassSpec, en: EnglishArm): ClassSpec {
  for (const k of Object.keys(en.sets)) {
    if (k in ar.sets) throw new Error(`lexicon: ${ar.cls} English set «${k}» collides with an Arabic one`);
  }
  for (const k of Object.keys(en.mirror)) {
    if (k in ar.mirror) throw new Error(`lexicon: ${ar.cls} English mirror «${k}» collides with an Arabic one`);
  }
  return {
    ...ar,
    sets: { ...ar.sets, ...en.sets },
    fires: [...ar.fires, ...en.fires],
    nearMiss: [...ar.nearMiss, ...en.nearMiss],
    mirror: { ...ar.mirror, ...en.mirror },
  };
}

// ── §2.0 L7 — PRECEDENCE. When more than one class hits, the FIRST in this order wins. ────
// Two orderings are load-bearing and both are driven: «أخذت حبوب كثير عشان أخلص» is class I,
// not class G (an intentional overdose is a crisis before it is a poisoning); «نزيف بعد
// الولاده» is class E, not class C. The tier and the rail are the same either way; what
// differs is the audit row, the operator label and which clinician is paged.
export const CLASS_ORDER: readonly RedFlagClass[] = [
  "self_harm", "cardiac", "stroke", "airway", "obstetric",
  "hemorrhage", "infant_fever", "poisoning", "trauma",
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.1 A — CARDIAC (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const CARDIAC: ClassSpec = withEn({
  cls: "cardiac",
  label: "ألم صدر",
  sets: {
    // BARE `صدر` AND BARE `قلب` ARE NEVER TERMS. Driven twice over: a boundary-matched bare
    // `صدر` is QUIET on «صدري يعورني» (the trailing ي fails the lookahead) and FIRES on
    // «صدر التقرير أمس؟» and «صدر الدجاج مسموح في الرجيم؟» (there it is a whole word). The
    // boundary costs the true positive and does not buy the false one — so the surface forms
    // are enumerated, definite article included.
    TERM: [
      "صدري", "صدره", "صدرها", "بصدري", "بصدره", "بصدرها", "فصدري",
      "الصدر", "بالصدر", "في الصدر", "علي الصدر", "قلبي", "قلبه", "قلبها",
    ],
    PRED_PAIN: [
      "يعورني", "يعوره", "يعورها", "يعور", "تعورني", "يوجعني", "يوجعه", "يوجعها",
      "يوجع", "توجعني", "يالمني", "وجع", "الم", "وجعان", "موجع",
    ],
    PRED_PRESSURE: ["ضغط", "ثقل", "شي قاعد", "ضاغط"],
    PRED_TIGHT: ["ضيق", "ضايق"],
    PRED_BURNING: ["حرقه", "حرقان", "حارق", "نار"],
    // A COMPANION COUNTS ONLY WITH A TERM IN THE SAME CLAUSE. «يضرب لذراعي» alone is not a hit.
    PRED_COMPANION: [
      "عرق بارد", "تعرق بارد", "اتعرق", "دايخ", "غثيان", "ينزل لدراعي",
      "يضرب لذراعي", "يشد علي فكي", "بين كتافي",
    ],
    STANDALONE: [
      "جلطه قلب", "جلطه بالقلب", "جلطه في القلب", "ذبحه صدريه", "احتشاء",
      "ازمه قلبيه", "سكته قلبيه",
    ],
  },
  fires: [
    { text: "صدري يعورني", tier: "emergency" },
    { text: "صدري يوجعني", tier: "emergency" },
    { text: "وجع في صدري", tier: "emergency" },
    { text: "الم بصدري", tier: "emergency" },
    { text: "ألم في صدري", tier: "emergency" },
    { text: "صدري يألمني", tier: "emergency" },
    { text: "حاس بثقل على صدري", tier: "emergency" },
    { text: "ضغط على صدري", tier: "emergency" },
    { text: "حرقة بصدري", tier: "emergency" },
    { text: "شي قاعد على صدري", tier: "emergency" },
    { text: "صدري ضايق ويعورني", tier: "emergency" },
    // The definite-article forms — the commonest written spelling, and the class was deaf to
    // all of it until B4. Under the LITERAL reading of the old un-normalized `ألم`, four of
    // these went silent again (T1); they are the reason the normalization discipline is a
    // blocking assertion and not a note.
    { text: "ألم في الصدر", tier: "emergency" },
    { text: "ألم بالصدر", tier: "emergency" },
    { text: "وجع بالصدر", tier: "emergency" },
    { text: "الصدر يعورني", tier: "emergency" },
    { text: "ضغط على الصدر", tier: "emergency" },
    { text: "ثقل على الصدر", tier: "emergency" },
    { text: "ضيق في الصدر", tier: "emergency" },
    { text: "حرقة في الصدر", tier: "emergency" },
    // Conditional entries, mirrored as COMPLETE SENTENCES per §2.0 L6.
    { text: "صدري يعورني والوجع ينزل لدراعي", tier: "emergency" },
    { text: "صدري يعورني ويضرب لذراعي اليسار", tier: "emergency" },
    { text: "الصدر يعورني ويشد على فكي", tier: "emergency" },
    { text: "وجع بالصدر بين كتافي", tier: "emergency" },
    { text: "صدري يعورني وطالع عرق بارد", tier: "emergency" },
    { text: "وجع في صدري وتعرق بارد", tier: "emergency" },
    { text: "صدري يعورني وأنا دايخ وأتعرق", tier: "emergency" },
    { text: "غثيان مع وجع الصدر", tier: "emergency" },
    // Named events fire alone.
    { text: "جلطة قلب", tier: "emergency" },
    { text: "جلطه بالقلب", tier: "emergency" },
    { text: "ذبحة صدرية", tier: "emergency" },
    { text: "احتشاء", tier: "emergency" },
    { text: "ازمه قلبيه", tier: "emergency" },
    { text: "أزمة قلبية", tier: "emergency" },
    { text: "chest pain", tier: "emergency" },
    { text: "heart attack", tier: "emergency" },
    { text: "pressure in my chest", tier: "emergency" },
    { text: "sadri ye3awerni", tier: "emergency" },
    // §11.1's third-person assertion, and B4's ACS-with-diaphoresis failure case.
    { text: "زوجي يشتكي من ألم في الصدر", tier: "emergency" },
    { text: "عندي ألم شديد بالصدر وأتعرق", tier: "emergency" },
    // §1.5 R1: a booking frame and the symptom in ONE clause, no punctuation. HARD means the
    // frame is never consulted; driven, the struck clause silenced this.
    { text: "احجز لي كشف بس صدري يعورني وأتعرق", tier: "emergency" },
    // §11.1: a HARD class fires with a past clause in ANOTHER clause, and with a denial opener.
    { text: "قبل سنة صار لي، الحين صدري يعورني", tier: "emergency" },
    { text: "ما عندي شي بس صدري يعورني وأتعرق", tier: "emergency" },
  ],
  nearMiss: [
    { text: "أبغى موعد عند دكتور قلب" },
    { text: "متابعة بعد جلطة أبوي" },
    { text: "أبي أسوي رسم قلب" },
    { text: "تخطيط قلب" },
    { text: "عندي ضغط وآخذ حبوب" },
    { text: "ضغط الشغل قاتلني" },
    { text: "من القلب أشكركم" },
    { text: "قلبي معكم" },
    { text: "ما وصلني التقرير من المصدر" },
    { text: "صدر التقرير أمس؟" },
    { text: "صدر الدجاج مسموح في الرجيم؟" },
    { text: "الدكتور قال عندي كوليسترول" },
    { text: "عندي موعد قسطرة الأسبوع الجاي" },
    // The four chest-X-ray sentences carry the TERM and are saved ONLY by the predicate
    // requirement. §11.2 pairs all four with «ألم بالصدر» so a future narrowing of the
    // predicate list cannot quietly buy them back at the cost of the true positive.
    { text: "أبغى أشعة على الصدر", paired: "ألم بالصدر" },
    { text: "موعد أشعة الصدر", paired: "ألم بالصدر" },
    { text: "كم سعر أشعة الصدر؟", paired: "ألم بالصدر" },
    { text: "الأشعة طلعت على الصدر سليمة", paired: "ألم بالصدر" },
    { text: "أبغى موعد صدرية" },
  ],
  mirror: {
    // §2.0 L8 — ordinary CLINIC sentences carrying the term without the finding. Generated
    // from booking / imaging / insurance vocabulary, never from this class's own axes.
    TERM: {
      frames: [
        "ابغى اشعة على {}", "كم سعر اشعة {}؟", "الاشعة طلعت على {} سليمة",
        "موعد متابعة {} مع دكتور الباطنة", "التقرير يقول {} سليم",
        "التامين يغطي فحص {}؟", "وين قسم {} عندكم؟",
      ],
    },
    PRED_PAIN: {
      frames: [
        "عندي {} في رجلي من المشي", "{} في ضرسي من امس", "الطفل عنده {} في اذنه",
        "{} بسيط في ظهري بعد الشغل",
      ],
    },
    PRED_PRESSURE: {
      frames: ["{} الشغل قاتلني", "فيه {} على المواعيد اليوم", "الزحمة و{} في الاستقبال"],
      per: { "شي قاعد": ["فيه شي قاعد في الملف ما انحل"] },
    },
    PRED_TIGHT: { frames: ["الموعد {} شوي", "الوقت {} علي اليوم", "المواقف {} عندكم"] },
    PRED_BURNING: { frames: ["{} في معدتي من القهوة", "الجو {} اليوم", "الشمس {}"] },
    PRED_COMPANION: {
      frames: ["{} من الزحمة", "{} من الوقوف الطويل"],
      per: {
        "ينزل لدراعي": ["الملف ينزل لدراعي وانا امشي"],
        "يضرب لذراعي": ["الجهاز يضرب لذراعي وقت القياس"],
        "يشد علي فكي": ["التقويم يشد على فكي شوي"],
        "بين كتافي": ["حطيت الشنطة بين كتافي"],
        "عرق بارد": ["الجو فيه عرق بارد بالليل"],
        "تعرق بارد": ["التكييف يسوي تعرق بارد"],
      },
    },
    STANDALONE: { onlyFinding: "named cardiac events — a phrase term with no benign clinic reading" },
  },
}, CARDIAC_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.2 B — STROKE (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const STROKE: ClassSpec = withEn({
  cls: "stroke",
  label: "أعراض جلطة دماغية",
  sets: {
    TERM: [
      "يدي", "يده", "يدها", "رجلي", "رجله", "رجلها", "وجهي", "وجهه", "وجهها",
      "فمي", "فمه", "فمها", "لساني", "لسانه", "لسانها", "عيني", "عينه", "عينها",
      "نصي", "نصه", "نص جسمي", "نص جسمه", "نص وجهي", "نص وجهه",
      "كلامي", "كلامه", "كلامها",
    ],
    PRED_FAILURE: [
      "ما يتحرك", "ما تتحرك", "ما اقدر احرك", "مو قادر احرك",
      "ما تستجيب", "ما يستجيب", "مشلول", "مشلوله", "مايل", "معوج",
      "نازله", "ثقيل", "ما ينفهم", "متلعثم", "يهذي", "خدر", "تنميل",
      "فقد النظر", "شايف دبل",
    ],
    PRED_ONSET: ["فجاه", "الحين", "توه", "من شوي", "من ساعه"],
    // §2.2's HIT formula carries `(PREDICATE.onset ∧ PREDICATE.failure)` for the entries that
    // name NO body part — «صار يهذي فجأة», «فقد النظر بعين وحده فجأة», «شايف دبل فجأة». As
    // written, that arm has NO SUBJECT ANCHOR, and the §2.0 L8 mirror found what that costs:
    //     «الدور ما يتحرك من ساعة»   the queue hasn't moved for an hour  → STROKE EMERGENCY
    // `ما يتحرك` is a failure predicate and `من ساعه` is an onset. So the onset arm is scoped
    // to the failures that are PERSON-ONLY: a queue can fail to move and a file can be heavy,
    // but nothing administrative slurs its speech or sees double. The generic failures still
    // fire — with a body TERM, which is the other half of the same formula.
    PRED_FAILURE_PERSON_ONLY: [
      "مشلول", "مشلوله", "ما ينفهم", "متلعثم", "يهذي", "فقد النظر", "شايف دبل",
      "ما اقدر احرك", "مو قادر احرك", "معوج",
    ],
    STANDALONE: [
      "شلل نصفي", "نصي مشلول", "سكته دماغيه", "جلطه بالمخ", "جلطه دماغيه",
      "جلطه في المخ", "ما يقدر يتكلم", "ما تقدر تتكلم", "ما يقدر يوقف",
    ],
    /** `شلل` on its own, subject to the EXCLUSIONs below. */
    PARALYSIS: ["شلل"],
    EXCL_BENIGN: ["من الجلسه", "من النوم", "من القعده", "من الوقفه", "من المخده"],
  },
  fires: [
    { text: "وجهي مايل", tier: "emergency" },
    { text: "فمه معوج", tier: "emergency" },
    { text: "صار فمها معوج", tier: "emergency" },
    { text: "نص وجهي ما يتحرك", tier: "emergency" },
    { text: "عينه نازله", tier: "emergency" },
    { text: "ما أقدر أحرك يدي", tier: "emergency" },
    { text: "مو قادر أحرك رجلي", tier: "emergency" },
    { text: "يدي اليمين ما تستجيب", tier: "emergency" },
    { text: "خدر مفاجئ في نص جسمي", tier: "emergency" },
    { text: "تنميل في يدي ووجهي فجأة", tier: "emergency" },
    { text: "شلل نصفي", tier: "emergency" },
    { text: "نصي مشلول", tier: "emergency" },
    { text: "لسانه ثقيل", tier: "emergency" },
    { text: "كلامه ما ينفهم", tier: "emergency" },
    { text: "صار يهذي فجأة", tier: "emergency" },
    { text: "ما يقدر يتكلم", tier: "emergency" },
    { text: "كلامه متلعثم فجأة", tier: "emergency" },
    { text: "فقد النظر بعين وحده فجأة", tier: "emergency" },
    { text: "شايف دبل فجأة", tier: "emergency" },
    { text: "ما يقدر يوقف، مايل", tier: "emergency" },
    { text: "سكته دماغيه", tier: "emergency" },
    { text: "جلطه بالمخ", tier: "emergency" },
    { text: "جلطه دماغيه", tier: "emergency" },
    { text: "stroke", tier: "emergency" },
    // §1.5 R1 — the string the struck booking-frame clause silenced, in ONE clause with no
    // punctuation to split on. Hemiplegia of sudden onset in a first-degree relative.
    { text: "ابغى موعد اليوم لان امي جاها شلل نصفي فجاه", tier: "emergency" },
    { text: "احجز لي بكرة، ابوي جاه شلل بنص جسمه فجأة", tier: "emergency" },
    { text: "امي جاها شلل نصفي فجاه", tier: "emergency" },
  ],
  nearMiss: [
    { text: "متى تطعيم شلل الأطفال؟", paired: "شلل نصفي" },
    { text: "الشلل الرعاش" },
    { text: "تنميل في رجلي من الجلسة", paired: "تنميل في يدي ووجهي فجأة" },
    { text: "متابعة بعد الجلطة" },
    { text: "موعد علاج طبيعي بعد الجلطة" },
    { text: "لساني محروق من الشاي" },
    { text: "ما أقدر أحرك موعدي" },
    { text: "وجهي فيه حبوب" },
  ],
  mirror: {
    TERM: {
      frames: [
        "{} فيها حساسية بسيطة", "ابغى موعد جلدية عشان {}", "التقرير يقول {} سليمة",
        "{} تعبانة من الشغل شوي", "كم سعر فحص {}؟",
      ],
    },
    PRED_FAILURE: {
      frames: ["الموعد {} من النظام", "الجهاز {} من الصيانة"],
      per: {
        "ما يتحرك": ["الدور ما يتحرك من ساعة"],
        "ما تتحرك": ["قائمة الانتظار ما تتحرك"],
        "ما اقدر احرك": ["ما أقدر أحرك موعدي للأسبوع الجاي"],
        "مو قادر احرك": ["مو قادر أحرك الحجز لبكرة"],
        "ما تستجيب": ["الصفحة ما تستجيب عندي"],
        "ما يستجيب": ["الرقم ما يستجيب من الصباح"],
        "مشلول": ["النظام مشلول من الصيانة"],
        "مشلوله": ["الخدمة مشلوله اليوم"],
        "مايل": ["الكرسي مايل شوي"],
        "معوج": ["الصف معوج في الاستقبال"],
        "نازله": ["الاسعار نازله هالشهر؟"],
        "ثقيل": ["الموقع ثقيل عندكم"],
        "ما ينفهم": ["التقرير ما ينفهم، ابغى نسخة اوضح"],
        "متلعثم": ["الرد الآلي متلعثم"],
        "يهذي": ["البرنامج يهذي ويعلق"],
        "خدر": ["الدكتور حط خدر موضعي وقت الخلع"],
        "تنميل": ["تنميل في رجلي من الجلسة الطويلة"],
        "فقد النظر": ["عندنا قسم لفحص فقد النظر التدريجي؟"],
        "شايف دبل": ["شايف دبل في الحجز، مرتين نفس الموعد"],
      },
    },
    PRED_ONSET: {
      frames: ["ابغى موعد {}", "الفرع مفتوح {}؟", "وصلت {}", "المواقف مليانة {}"],
    },
    PRED_FAILURE_PERSON_ONLY: {
      per: {
        "مشلول": ["النظام مشلول من الصيانة"], "مشلوله": ["الخدمة مشلوله اليوم"],
        "ما ينفهم": ["التقرير ما ينفهم، ابغى نسخة اوضح"],
        "متلعثم": ["الرد الآلي متلعثم"], "يهذي": ["البرنامج يهذي ويعلق"],
        "فقد النظر": ["عندنا قسم لفحص فقد النظر التدريجي؟"],
        "شايف دبل": ["شايف دبل في الحجز، مرتين نفس الموعد"],
        "ما اقدر احرك": ["ما أقدر أحرك موعدي للأسبوع الجاي"],
        "مو قادر احرك": ["مو قادر أحرك الحجز لبكرة"],
        "معوج": ["الصف معوج في الاستقبال"],
      },
    },
    STANDALONE: { onlyFinding: "named stroke events / hemiplegia phrases — no benign clinic reading" },
    PARALYSIS: {
      // THE BOUNDARY DOES NOT SAVE `شلل`. Verified: a boundary-matched `شلل` FIRES on
      // «متى تطعيم شلل الأطفال؟» — it is a whole word there, followed by a space. The rule
      // is a negative lookahead on the GOVERNED NOUN, not a boundary. Polio is one of the
      // highest-volume paediatric questions in the Kingdom.
      per: { "شلل": ["متى تطعيم شلل الأطفال؟", "جدول تطعيم شلل الاطفال", "الشلل الرعاش عندكم له عيادة؟"] },
    },
    EXCL_BENIGN: { frames: ["تنميل في رجلي {}", "ظهري تعبان {}"] },
  },
}, STROKE_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.3 C — HEMORRHAGE (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const HEMORRHAGE: ClassSpec = withEn({
  cls: "hemorrhage",
  label: "نزيف",
  sets: {
    // THE VERB IS A TERM. `ينزف` / `تنزف` / `انزف` share NO substring with the noun `نزيف` —
    // ي-ن-ز-ف against ن-ز-ي-ف — so a boundary-matched `نزيف` is quiet on «الجرح ينزف», and
    // «ينزف من نص ساعة وما وقف» was silent while carrying the strongest predicate on the list.
    // `رعاف` is a TERM because a word that can only ever SUPPRESS is a word the class cannot
    // hear: it was in the veto set and in no term set, so «رعاف ما يوقف» — an unstoppable
    // epistaxis — produced no hit AT ANY TIER.
    TERM: [
      "دم", "دماء", "نزيف", "نزف", "نزفت", "ينزف", "تنزف", "انزف", "ينزفون",
      "نازف", "نازفه", "رعاف",
    ],
    PRED_PERSIST: [
      "ما يوقف", "ما وقف", "ما يبطل", "ما ينحبس", "ما ينقطع", "مستمر", "مستمره",
      "من نص ساعه", "من ساعتين",
    ],
    PRED_VOLUME: [
      "بغزاره", "غزير", "غزيره", "شديد", "شديده", "قوي", "قويه", "بقوه",
      "واجد", "وايد", "كثير", "كثيره",
    ],
    PRED_CHARACTER: ["يفور", "فوار", "هدار"],
    SITE: [
      "تقيا", "تقيات", "تقيت", "يتقيا", "تتقيا",
      "استفرغ", "استفرغت", "يستفرغ", "تستفرغ",
      "براز", "بعد الولاده", "بعد العمليه", "جرح", "جروح", "قطع", "طعنه", "طلق ناري",
    ],
    SITE_URGENT: ["بول", "التبول"],
    STANDALONE: [
      "براز اسود", "تقيا دم", "تقيات دم", "تقيت دم", "استفرغ دم", "استفرغت دم",
      "قيء دموي", "قي دموي", "دم بالبراز", "دم مع البراز",
    ],
    EXCL_RESOLVED: ["وقف النزيف", "وقف الدم", "بطل النزيف", "انحبس النزيف", "ما عاد ينزف"],
    EXCL_HYGIENE: ["افرش", "تفريش", "فرشاه", "المعجون", "اسناني"],
    /** The extraction / anticoagulant terms that LIFT the gum cap back to `emergency` (S1.5-5). */
    CAP_LIFT: ["خلع", "قلع", "الضرس", "السن", "مميع", "مميعات", "سيوله", "وارفرين", "اسبرين", "بلافكس"],
    /** Gum / nose sites — capped at `urgent` when no hygiene term and no cap-lift term. */
    SITE_CAPPED: ["اللثه", "لثتي", "الانف", "رعاف"],
  },
  fires: [
    { text: "نزيف ما يوقف", tier: "emergency" },
    { text: "الدم ما يوقف", tier: "emergency" },
    { text: "ينزف بغزارة", tier: "emergency" },
    { text: "الجرح عميق والدم فوار", tier: "emergency" },
    { text: "الدم يفور", tier: "emergency" },
    { text: "تقيأت دم", tier: "emergency" },
    { text: "استفرغ دم", tier: "emergency" },
    { text: "استفرغت دم", tier: "emergency" },
    { text: "يتقيأ دم", tier: "emergency" },
    { text: "خرج مني دم كثير", tier: "emergency" },
    { text: "براز أسود", tier: "emergency" },
    { text: "نزيف بعد العملية", tier: "emergency" },
    { text: "bleeding won't stop", tier: "emergency" },
    { text: "نزيف شديد", tier: "emergency" },
    { text: "نزيف غزير", tier: "emergency" },
    { text: "نزيف قوي مره", tier: "emergency" },
    { text: "الجرح ينزف بقوة", tier: "emergency" },
    { text: "دم واجد من الجرح", tier: "emergency" },
    { text: "ينزف من نص ساعة وما وقف", tier: "emergency" },
    { text: "الدم فوار من الجرح", tier: "emergency" },
    { text: "جرح عميق وينزف", tier: "emergency" },
    { text: "نزيف اللثة ما يوقف من ساعتين بعد خلع الضرس", tier: "emergency" },
    { text: "نزيف اللثة شديد وانا على مميع دم", tier: "emergency" },
    // §11.1's third-person assertion.
    { text: "الجرح حق ابني ينزف بقوة", tier: "emergency" },
    // §2.0 L6: «دم مع البول» is annotated «→ urgent unless with pain+fever», so it is
    // mirrored TWICE, once at each tier.
    { text: "دم مع البول", tier: "urgent" },
    { text: "دم بالبول", tier: "urgent" },
    { text: "دم مع البول وعندي ألم وحرارة", tier: "emergency" },
    { text: "نزيف اللثة شديد", tier: "urgent" },
    { text: "رعاف ما يوقف", tier: "urgent" },
    // §2.0 L7 precedence: this is class E, not class C — §2.3's own Fires annotation.
    { text: "نزيف بعد الولاده", tier: "emergency", cls: "obstetric" },
  ],
  nearMiss: [
    { text: "ألم في قدمي" },
    { text: "القدم السكري" },
    { text: "تقديم الأوراق" },
    { text: "عدم تحمل اللاكتوز" },
    { text: "نزيف اللثة لما أفرش أسناني", paired: "نزيف شديد" },
    // T1(c): «فرشاة» was un-normalized, so THIS row fired `hemorrhage/urgent` — and the
    // hygiene exclusion had been added in the same wave precisely to close it.
    { text: "نزيف اللثة شديد لما أفرش أسناني", paired: "نزيف شديد" },
    { text: "أبغى تحليل دم", paired: "دم واجد من الجرح" },
    { text: "فصيلة دمي" },
    { text: "تبرع بالدم" },
    { text: "صورة دم كاملة CBC" },
    { text: "نزلت عليّ الدورة" },
    { text: "الحمدلله وقف النزيف" },
    { text: "رعاف بسيط" },
  ],
  mirror: {
    TERM: {
      frames: ["ابغى تحليل {}", "كم سعر تحليل {}؟", "التبرع ب{} وين يكون؟", "فصيلة {}ي ايه؟"],
      per: {
        "دم": ["أبغى تحليل دم", "فصيلة دمي", "تبرع بالدم", "صورة دم كاملة"],
        "رعاف": ["رعاف بسيط", "الطفل عنده رعاف بسيط من الجو الجاف"],
        "جرح": ["ابغى موعد لتنظيف جرح قديم"],
      },
    },
    PRED_PERSIST: {
      frames: ["الدور {}", "الطابور {}", "الاتصال {}"],
      per: {
        "من نص ساعه": ["انا منتظر من نص ساعه في الاستقبال"],
        "من ساعتين": ["حجزت من ساعتين وما جاني تاكيد"],
        "مستمر": ["الازدحام مستمر من الصباح"],
        "مستمره": ["المواعيد مستمره لين المغرب؟"],
      },
    },
    PRED_VOLUME: { frames: ["الزحمة {} اليوم", "التاخير {} عندكم", "الاسعار {} شوي"] },
    PRED_CHARACTER: {
      per: {
        "يفور": ["الحليب يفور اذا سخنته"],
        "فوار": ["عندكم فوار فيتامين سي؟"],
        "هدار": ["صوت المكيف هدار في صالة الانتظار"],
      },
    },
    SITE: {
      frames: ["ابغى موعد بسبب {}"],
      per: {
        "تقيا": ["الطفل تقيا مرة وحدة بعد الاكل"],
        "تقيات": ["تقيات مرتين امس وارتحت"],
        "تقيت": ["تقيت امس بس اليوم احسن"],
        "يتقيا": ["الطفل يتقيا من ريحة الدواء"],
        "تتقيا": ["البنت تتقيا من السيارة"],
        "استفرغ": ["ابني استفرغ مرة من الدوخة"],
        "استفرغت": ["استفرغت امس من الاكل وارتحت"],
        "يستفرغ": ["الطفل يستفرغ من السفر"],
        "تستفرغ": ["البنت تستفرغ من الزحمة"],
        "براز": ["ابغى تحليل براز"],
        "بعد الولاده": ["ابغى متابعة بعد الولاده"],
        "بعد العمليه": ["موعد مراجعة بعد العمليه"],
        "جرح": ["موعد تنظيف جرح"],
        "جروح": ["عندكم عيادة جروح؟"],
        "قطع": ["قطع الغيار حق الجهاز موجود؟"],
        "طعنه": ["ودي اسال عن تقرير طعنه قديم للتامين"],
        "طلق ناري": ["ابغى تقرير عن اصابة طلق ناري قديمة للتامين"],
      },
    },
    SITE_URGENT: {
      per: {
        "بول": ["ابغى تحليل بول", "كم سعر تحليل بول؟"],
        "التبول": ["عندكم عيادة لمشاكل التبول؟"],
      },
    },
    STANDALONE: { onlyFinding: "haematemesis / melena phrases — no benign clinic reading" },
    EXCL_RESOLVED: { frames: ["الحمدلله {}"] },
    EXCL_HYGIENE: {
      per: {
        "افرش": ["افرش اسناني مرتين باليوم"],
        "تفريش": ["ابغى موعد تفريش وتنظيف"],
        "فرشاه": ["عندكم فرشاه كهربائية بالصيدلية؟"],
        "المعجون": ["اي المعجون تنصحون فيه؟"],
        "اسناني": ["ابغى تنظيف اسناني"],
      },
    },
    CAP_LIFT: {
      per: {
        "خلع": ["كم سعر خلع الضرس؟"],
        "قلع": ["ابغى موعد قلع ضرس العقل"],
        "الضرس": ["الضرس يعورني من امس"],
        "السن": ["السن مكسور وابغى تركيبة"],
        "مميع": ["الدكتور وصف لي مميع دم"],
        "مميعات": ["عندكم عيادة تتابع مميعات الدم؟"],
        "سيوله": ["ابغى تحليل سيوله"],
        "وارفرين": ["متوفر وارفرين بالصيدلية؟"],
        "اسبرين": ["كم سعر اسبرين الاطفال؟"],
        "بلافكس": ["بلافكس متوفر عندكم؟"],
      },
    },
    SITE_CAPPED: {
      per: {
        "اللثه": ["ابغى موعد لعلاج اللثه"],
        "لثتي": ["لثتي تحتاج تنظيف"],
        "الانف": ["ابغى موعد انف واذن وحنجرة عشان الانف"],
        "رعاف": ["رعاف بسيط عند الطفل من الجو"],
      },
    },
  },
}, HEMORRHAGE_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.4 D — AIRWAY (HARD) — inherit, do not re-invent
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const AIRWAY: ClassSpec = withEn({
  cls: "airway",
  label: "صعوبة تنفس",
  sets: {
    NEGATION: ["ما", "ماا", "مو", "موو", "موب", "مووب", "مب", "ماني", "مني", "مش"],
    AUX: [
      "اقدر", "يقدر", "تقدر", "يقدرون", "نقدر", "قادر", "قادره", "عارف", "عارفه",
      "عاد", "عاده",
    ],
    // `نفسه · نفسها` ARE STRUCK (T2). They are «his breath» AND «itself / the same», and with
    // ARM 1's bare negation in front they made seven ordinary clinic sentences —
    // «الموعد ما نفسه اللي حجزته» among them — raise an airway emergency, 997, a P0 page and
    // an operator-release-only booking lock. The machinery this class says it inherits never
    // had the hole: it guards bare `نفس` with a construct-head lookahead and the third person
    // with a PERSON anchor. The breath-idiom axis is ARM 3's and it keeps that anchor.
    BREATHE: ["اتنفس", "يتنفس", "تتنفس", "نتنفس", "التنفس", "تنفس", "ياخذ نفس", "تاخذ نفس", "اخذ نفس"],
    DIFFICULTY: ["صعوبه", "ضيق", "صعب"],
    BREATHE_NOUN: ["التنفس", "تنفس", "النفس"],
    // «مافي» / «مافيه» ARE ONE WORD IN NAJDI AND THE QUIET CORPUS FOUND THEM: 160 ordinary
    // denials — «مافي صعوبة في التنفس الحمدلله» — reached ARM 2 because the denial head was
    // enumerated only in its detached spelling. A denial that GOVERNS the difficulty noun is
    // not a symptom, and this is the same "a slot with one value in it" shape the airway
    // family was rebuilt to end, on the exclusion side rather than the firing side.
    DENIAL_HEAD: ["ما", "مافي", "مافيه", "ماكو", "مب", "مو", "بدون", "من غير"],
    DENIAL_MID: ["فيه", "فيها", "في", "عندي", "عنده", "عندها", "عندك", "عندنا", "صار", "صارت"],
    THROAT: [
      "حلقي", "حلقه", "حلقها", "زوري", "زوره", "زورها", "حنجرتي", "حنجرته", "حنجرتها",
      "بلعومي", "بلعومه", "بلعومها",
    ],
    LIPS_TONGUE: [
      "شفايفي", "شفايفه", "شفايفها", "شفتي", "شفته", "شفتها", "شفتينه", "شفتينها",
      "لساني", "لسانه", "لسانها",
    ],
    FACE_EYES: ["وشي", "وشه", "وشها", "وجهي", "وجهه", "وجهها", "عيني", "عينه", "عينها"],
    CLOSING: [
      "يقفل", "تقفل", "يتقفل", "بيقفل", "بتقفل", "يضيق", "تضيق", "يتضيق",
      "مسدود", "مسدوده", "قافل", "قافله", "يسكر", "تسكر",
    ],
    SWELLING: [
      "تورم", "تورمت", "يتورم", "تتورم", "بيتورم", "ورم", "منتفخ", "منتفخه",
      "انتفخ", "انتفخت", "ينتفخ", "تنتفخ", "كبرت",
    ],
    CYANOSIS_SUBJ: ["لوني", "لونه", "لونها", "شفايفي", "شفايفه", "شفايفها", "شفتينه", "شفتينها"],
    BLUE: ["ازرق", "زرقاء", "زرقا", "زرق", "زرقه"],
    EXACERBATION: ["اشتد", "اشتدت", "نوبه", "ازمه", "ما رد علي البخاخ", "البخاخ ما نفع", "ما ينفع معه البخاخ", "ما نفع"],
    ASTHMA: ["ربو"],
    // ARM 7b (T5) — the rescue-failure phrases as STANDALONE, with NO `ربو` required. ARM 7
    // needed the asthma noun AND an exacerbation predicate in the same clause, and a failed
    // rescue inhaler is a pure exacerbation report — which is how a patient in a hurry writes
    // it. «البخاخ ما نفع» was on this class's own Fires list and no arm could reach it.
    RESCUE_FAILED: ["البخاخ ما نفع", "ما رد علي البخاخ", "ما ينفع معه البخاخ", "البخاخ ما ينفع", "ما نفع البخاخ"],
    PHRASE: ["الطفل نفسه سريع", "صدره يشتغل وهو يتنفس", "اختناق", "شرق فيه اكل", "يغص", "يختنق", "تختنق"],
    // ARM 3 — the inherited «نفسي ضايق» idiom carve-out, with Faysal's clinic objects added.
    // The Kivo object list is a DELIVERY-COMPLAINT vocabulary and misses all five clinic
    // frustrations; driven, all five FIRE `[ضيق نفس]` on the real detector today.
    IDIOM_OBJECT: [
      "خدمه", "تعامل", "انتظار", "تاخير", "وضع", "كلام", "رد", "سوالف", "طريق", "زحمه",
      "دوام", "مواعيد", "موعد", "حجز", "اجراءات", "مستشفي", "عياده", "مجمع",
      "فاتوره", "استقبال", "تحويله", "تامين", "مراجعه",
    ],
  },
  fires: [
    { text: "ما أقدر أتنفس", tier: "emergency" },
    { text: "مو قادر أتنفس", tier: "emergency" },
    { text: "ابني ما يقدر يتنفس", tier: "emergency" },
    { text: "بنتي ما تقدر تتنفس", tier: "emergency" },
    { text: "الطفل ما يتنفس", tier: "emergency" },
    { text: "ابني مو قادر يتنفس", tier: "emergency" },
    { text: "أمي ما تقدر تتنفس", tier: "emergency" },
    { text: "مش عارف أتنفس", tier: "emergency" },
    { text: "ماني قادر أتنفس", tier: "emergency" },
    { text: "مب قادر أتنفس", tier: "emergency" },
    // The two recall holes in the inherited machinery this rule closes — driven silent on
    // the real `detectAllergenEmergency` at `e1791f5`.
    { text: "ما عاد يتنفس", tier: "emergency" },
    { text: "ما عاد يقدر يتنفس", tier: "emergency" },
    { text: "ابني ما عاد يتنفس", tier: "emergency" },
    { text: "عندي صعوبة بالتنفس", tier: "emergency" },
    { text: "عندي صعوبة في التنفس", tier: "emergency" },
    { text: "صعوبة في التنفس", tier: "emergency" },
    { text: "ضيق في التنفس", tier: "emergency" },
    { text: "ابني حلقه يقفل", tier: "emergency" },
    { text: "زوجتي حلقها يتورم", tier: "emergency" },
    { text: "بنتي لسانها يتورم", tier: "emergency" },
    { text: "ولدي وجهه منتفخ", tier: "emergency" },
    { text: "طفلي شفايفه تورمت", tier: "emergency" },
    { text: "ابني عمره سنتين وحلقه يقفل وما يقدر يتنفس", tier: "emergency" },
    { text: "لوني أزرق", tier: "emergency" },
    { text: "لونه أزرق", tier: "emergency" },
    { text: "شفايفه زرقاء", tier: "emergency" },
    { text: "شفايفها زرقاء", tier: "emergency" },
    { text: "صار لونه أزرق", tier: "emergency" },
    { text: "ابني شفايفه زرقاء", tier: "emergency" },
    { text: "الطفل نفسه سريع", tier: "emergency" },
    { text: "صدره يشتغل وهو يتنفس", tier: "emergency" },
    { text: "اختناق", tier: "emergency" },
    { text: "شرق فيه أكل وما يقدر يتنفس", tier: "emergency" },
    // ARM 7 and ARM 7b.
    { text: "الربو اشتد وما رد على البخاخ", tier: "emergency" },
    { text: "البخاخ ما نفع", tier: "emergency" },
    { text: "ما رد على البخاخ", tier: "emergency" },
    { text: "عندي ربو وجاتني نوبة", tier: "emergency" },
    { text: "نفسي ضايق", tier: "emergency" },
    { text: "نفسي ضايق وما اقدر اتنفس", tier: "emergency" },
    // §11.1 — the ONE accepted over-fire in this document, carried as an annotated MUST_FIRE
    // and never as a near-miss. §12 row 1 asks the physician whether it is the right trade.
    {
      text: "الحمدلله ما عاد حلقي يقفل",
      tier: "emergency",
      acceptedOverFire:
        "a RESOLVED airway complaint. The only rule that silences it — «ما عاد» as a " +
        "resolution veto — also silences FIVE ways of saying respiratory arrest, driven. " +
        "Class D is HARD and fails toward firing (§1.3). §12 row 1.",
    },
  ],
  nearMiss: [
    { text: "أبغى موعد في فرع الربوة" },
    { text: "كم كربوهيدرات في الوجبة؟" },
    { text: "الطلب مربوط بالتأمين" },
    { text: "عندي ربو ومحتاج تجديد البخاخ", paired: "الربو اشتد وما رد على البخاخ" },
    { text: "أبغى موعد صدرية" },
    { text: "تحليل وظائف رئة" },
    { text: "نفسي ضايق من الانتظار", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من التعامل", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من الدوام", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من المواعيد", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من الحجز", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من الاستقبال", paired: "نفسي ضايق" },
    { text: "نفسي ضايق من التأمين", paired: "نفسي ضايق" },
    { text: "فرع الشفا" },
    // N4's adopted prescription — a DENIAL of dyspnoea, driven quiet.
    { text: "ما عندي مشكلة في التنفس", paired: "ما أقدر أتنفس" },
    { text: "ما فيه صعوبة بالتنفس الحمدلله", paired: "عندي صعوبة بالتنفس" },
    // T2 — the seven ordinary clinic sentences `نفسه` in BREATHE made into an airway emergency.
    { text: "الموعد ما نفسه اللي حجزته", paired: "ما أقدر أتنفس" },
    { text: "السعر ما نفسه المعلن", paired: "ما أقدر أتنفس" },
    { text: "الفرع ما نفسه اللي رحت له", paired: "ما أقدر أتنفس" },
    { text: "الرقم ما نفسه المسجل", paired: "ما أقدر أتنفس" },
    { text: "التقرير ما نفسه", paired: "ما أقدر أتنفس" },
    { text: "الدكتور ما نفسه اللي شافني قبل", paired: "ما أقدر أتنفس" },
    { text: "المريض ما نفسه طويل على الانتظار", paired: "ما أقدر أتنفس" },
    { text: "الطلب نفسه واقف" },
    { text: "الحجز نفسه ما تم" },
    { text: "الملف نفسه ناقص" },
  ],
  mirror: {
    NEGATION: {
      // EVERY ORDINARY WORD THAT ENDS IN «ما» IS NOT A NEGATION, AND ALL OF THEM ONCE WERE.
      // «دايما ناخذ نفس الطلب» — a returning customer's most ordinary sentence — raised a
      // full emergency in the sibling module. The left boundary is what stops it, and these
      // strings are what prove the boundary is there.
      frames: ["{} عندي مشكلة في الموعد", "{} وصلني التاكيد"],
      per: {
        "ما": ["دايما ناخذ نفس الموعد", "عموما نراجع عندكم", "لما ياخذ الموعد يتاخر", "عندما نحجز نجيكم"],
        "مو": ["الفرع مو بعيد عنا"],
        "موب": ["الموعد موب مناسب لي"],
        "مب": ["السعر مب واضح في الفاتورة"],
        "مش": ["مش لاقي رقم الحجز"],
        "ماني": ["ماني متاكد من الموعد"],
        "مني": ["ما وصلني مني اي رد"],
        "ماا": ["ماا وصلني رد على الطلب"],
        "موو": ["الفرع موو مفتوح اليوم؟"],
        "مووب": ["الحجز مووب مؤكد"],
      },
    },
    AUX: { frames: ["{} احجز اونلاين؟", "{} اغير الموعد بنفسي؟"] },
    BREATHE: {
      frames: ["عندكم عيادة {} للاطفال؟", "فحص {} كم سعره؟"],
      per: {
        "ياخذ نفس": ["الاجراء ياخذ نفس الوقت تقريبا"],
        "تاخذ نفس": ["الاشعة تاخذ نفس المدة؟"],
        "اخذ نفس": ["ابغى اخذ نفس الموعد الاسبوع الجاي"],
      },
    },
    DIFFICULTY: {
      frames: ["عندي {} في الحجز اونلاين", "فيه {} في الوصول للفرع", "{} على المريض ينتظر كل هذا"],
    },
    BREATHE_NOUN: { frames: ["عيادة {} وين؟", "قسم {} يفتح كم؟"] },
    DENIAL_HEAD: {
      frames: ["{} فيه مواعيد اليوم؟"],
      per: {
        "مافي": ["مافي مواعيد اليوم؟"], "مافيه": ["مافيه دور طويل؟"],
        "ماكو": ["ماكو مواعيد بكرة؟"], "بدون": ["ابغى موعد بدون تأمين"],
        "من غير": ["ينفع كشف من غير موعد؟"],
      },
    },
    DENIAL_MID: { frames: ["ما {} مشكلة في الموعد"] },
    THROAT: {
      frames: ["{} فيه التهاب بسيط وابغى موعد", "ابغى موعد انف واذن عشان {}"],
    },
    LIPS_TONGUE: { frames: ["{} فيها جفاف من الجو", "ابغى موعد جلدية عشان {}"] },
    FACE_EYES: { frames: ["{} فيه حبوب وابغى موعد جلدية", "فحص {} كم سعره؟"] },
    CLOSING: {
      frames: ["الفرع {} الساعة كم؟", "الباب {} من برا"],
      per: {
        "يضيق": ["الوقت يضيق علي"], "تضيق": ["المواقف تضيق بالزحمة"],
        "يتضيق": ["الجدول يتضيق نهاية الاسبوع"],
        "مسدود": ["الشارع مسدود من الصيانة"], "مسدوده": ["الطريق مسدوده عند الفرع"],
        "قافل": ["المجمع قافل يوم الجمعة؟"], "قافله": ["الصيدلية قافله الحين؟"],
        "يسكر": ["الفرع يسكر الساعة كم؟"], "تسكر": ["العيادة تسكر متى؟"],
        "يقفل": ["المختبر يقفل الساعة عشر"], "تقفل": ["الصيدلية تقفل متى؟"],
        "يتقفل": ["الحجز يتقفل قبل الموعد بساعة"],
        "بيقفل": ["الفرع بيقفل بدري اليوم"], "بتقفل": ["العيادة بتقفل الجمعة"],
      },
    },
    SWELLING: {
      frames: ["الحساب {} عن المتوقع", "الملف {} من كثر التقارير"],
      per: {
        "كبرت": ["البنت كبرت وصارت تحتاج طبيب اطفال ثاني"],
        "ورم": ["ابغى استشارة عن ورم حميد قديم"],
        "تورم": ["عندكم عيادة لعلاج تورم القدمين المزمن؟"],
      },
    },
    CYANOSIS_SUBJ: { frames: ["{} صار احسن بعد العلاج"] },
    BLUE: { frames: ["الكيس {}", "السيارة لونها {}", "الشعار {} عندكم"] },
    EXACERBATION: {
      per: {
        "اشتد": ["الزحام اشتد بعد العصر"], "اشتدت": ["الزحمة اشتدت اليوم"],
        "نوبه": ["ابغى موعد لمتابعة نوبة قديمة"], "ازمه": ["ازمة المواقف عندكم تعبتنا"],
        "ما نفع": ["الاتصال ما نفع، جربت ثلاث مرات"],
      },
      // The three rescue-failure phrases are ARM 7b's, and they ARE the finding. The
      // ordinary sentences that carry «البخاخ» without a failure are driven in the
      // ordinary-clinic corpus and are quiet, because bare «البخاخ» is in no set.
      onlyFindingMembers: ["ما رد علي البخاخ", "البخاخ ما نفع", "ما ينفع معه البخاخ"],
    },
    ASTHMA: {
      // The branch name is the whole reason this term is boundary-matched and never bare.
      // A BARE CHRONIC-CONDITION NOUN IS NOT AN AIRWAY HIT. That is the pairing, and it is
      // the sentence §2.4's near-miss table already carries. The branch-name strings — «فرع
      // الربوة», «كربوهيدرات» — are in §Q, and they are a different assertion: the boundary
      // must not MATCH there at all.
      per: { "ربو": ["عندي ربو ومحتاج تجديد البخاخ", "عندي ربو من صغري ومتابع عندكم", "ابغى موعد صدرية عشان الربو"] },
    },
    RESCUE_FAILED: {
      onlyFinding:
        "a failed rescue inhaler. The ordinary clinic sentences that carry «البخاخ» without a " +
        "failure — «أبغى تجديد البخاخ», «كم سعر البخاخ؟», «البخاخ خلص عندي» — are quiet " +
        "because bare «البخاخ» is in no set; they are driven in the ordinary-clinic corpus.",
    },
    PHRASE: {
      onlyFinding: "retraction / choking phrases — no benign clinic reading",
      per: { "يغص": ["الطفل يغص شوي وقت الاكل بس يرجع طبيعي"] },
    },
    IDIOM_OBJECT: { frames: ["نفسي ضايق من ال{}"] },
  },
}, AIRWAY_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.5 E — OBSTETRIC (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const OBSTETRIC: ClassSpec = withEn({
  cls: "obstetric",
  label: "طوارئ حمل",
  sets: {
    TERM: ["حامل", "حامله", "حبلي", "بالشهر", "الجنين", "حملي", "ولادتي", "الولاده"],
    PRED_BLEED: ["نازل مني دم", "نازل منها دم", "نازل دم", "نزيف", "دم"],
    PRED_MOVE: ["ما يتحرك", "ما تتحرك", "ما احس بحركه"],
    PRED_LABOUR: ["طلق"],
    PRED_PREECL: ["صداع شديد", "زغلله", "تورم مفاجي", "تسمم حمل"],
    PRED_POSTPARTUM: ["حراره عاليه"],
    PRED_PAIN: ["توجعني بشده", "بطني توجعني"],
    // §2.0 L6's mirror found these: they carry NO pregnancy marker, so under this section's
    // own opening words they could never fire. They name the pregnancy implicitly.
    STANDALONE: ["نزل مني ماء", "نزل مني ماي", "انفجر كيس الماء", "انفجر كيس المياه", "تسمم حمل"],
    // `حامل` = CARD HOLDER. A real sentence at a private clinic reception.
    EXCL_GOVERNED: ["بطاقه", "شهاده", "الملف", "التامين"],
  },
  fires: [
    { text: "حامل ونازل مني دم", tier: "emergency" },
    { text: "نزيف وأنا حامل", tier: "emergency" },
    { text: "حامل وبطني توجعني بشده", tier: "emergency" },
    { text: "الجنين ما يتحرك من امس", tier: "emergency" },
    { text: "ما أحس بحركة الجنين", tier: "emergency" },
    { text: "نزل مني ماء", tier: "emergency" },
    { text: "انفجر كيس الماء", tier: "emergency" },
    { text: "جاني طلق وأنا بالشهر السابع", tier: "emergency" },
    { text: "تسمم حمل", tier: "emergency" },
    { text: "صداع شديد وزغللة وأنا حامل", tier: "emergency" },
    { text: "تورم مفاجئ بوجهي ويدي وأنا حامل", tier: "emergency" },
    { text: "حرارة عالية بعد الولادة", tier: "emergency" },
    { text: "أختي حامل ونازل منها دم", tier: "emergency" },
    { text: "تحليل حمل وانا حامل ونازل مني دم", tier: "emergency" },
    { text: "نزيف بعد الولاده", tier: "emergency" },
  ],
  nearMiss: [
    { text: "أنا حامل وأبغى متابعة حمل", paired: "حامل ونازل مني دم" },
    { text: "حامل بالشهر الثالث، أبغى سونار", paired: "حامل ونازل مني دم" },
    { text: "أنا حامل بطاقة بوبا", paired: "حامل ونازل مني دم" },
    { text: "تحليل حمل" },
    { text: "أبغى أعرف هل أنا حامل" },
    { text: "أختي حامل وتبي موعد", paired: "أختي حامل ونازل منها دم" },
    { text: "حركة الجنين قوية ماشاءالله" },
  ],
  mirror: {
    TERM: {
      frames: ["انا {} وابغى متابعة حمل", "{} وابغى سونار الاسبوع الجاي", "{} بالشهر الثالث والحمدلله بخير"],
      per: {
        "حامل": ["أنا حامل بطاقة بوبا", "انا حامل شهادة تأمين من الشركة", "حامل الملف معي"],
        "الولاده": ["ابغى موعد متابعة بعد الولاده", "كم تكلفة الولاده الطبيعية؟"],
        "ولادتي": ["ولادتي كانت عندكم قبل سنتين"],
        "بالشهر": ["الفاتورة بالشهر ولا بالزيارة؟"],
        "الجنين": ["ابغى سونار الجنين رباعي الابعاد"],
      },
    },
    PRED_BLEED: {
      per: {
        "دم": ["أبغى تحليل دم"], "نزيف": ["ابغى موعد انف واذن عشان نزيف بسيط بالانف"],
      },
      onlyFindingMembers: ["نازل دم", "نازل مني دم", "نازل منها دم"],
    },
    PRED_MOVE: {
      per: {
        "ما يتحرك": ["الدور ما يتحرك من ساعة"],
        "ما تتحرك": ["قائمة الانتظار ما تتحرك"],
        "ما احس بحركه": ["ما احس بحركة في قسم الاستقبال، وين الموظف؟"],
      },
    },
    PRED_LABOUR: { per: { "طلق": ["ابغى استشارة عن طلق كاذب صار قبل شهر"] } },
    PRED_PREECL: {
      per: {
        "صداع شديد": ["عندي صداع شديد وابغى موعد باطنة"],
        "زغلله": ["زغللة بسيطة من الشاشة، ابغى فحص نظر"],
      },
      onlyFindingMembers: ["تورم مفاجي", "تسمم حمل"],
    },
    PRED_POSTPARTUM: { per: { "حراره عاليه": ["حرارة عالية في الجو اليوم"] } },
    PRED_PAIN: {
      per: {
        "بطني توجعني": ["بطني توجعني شوي من الاكل، ابغى موعد باطنة"],
      },
      onlyFindingMembers: ["توجعني بشده"],
    },
    STANDALONE: { onlyFinding: "membrane rupture / pre-eclampsia phrases — no benign clinic reading" },
    EXCL_GOVERNED: { frames: ["انا حامل {} من الشركة"] },
  },
}, OBSTETRIC_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.6 F — INFANT FEVER (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const INFANT_FEVER: ClassSpec = withEn({
  cls: "infant_fever",
  label: "حرارة رضيع",
  sets: {
    TERM: ["حراره", "حرارته", "حرارتها", "سخونه", "حمي"],
    PRED_REDFLAG: [
      "تشنج", "تشنجات", "اختلاج", "خامل", "ما يفتح عينه", "ما يرضع",
      "مو راضع", "رافض الرضاعه", "بقع حمرا ما تختفي",
      "ما تختفي بالضغط", "رقبته متيبسه", "يصرخ من الضوء",
    ],
    // T5: `طفلي · طفلتي · ولدي · ابني · بنتي` were in NO set in this document, and there was
    // no persistence predicate on the fever axis at all, so «طفلي حرارته ما تنزل» — a parent
    // saying their child's fever will not come down — produced no hit at any tier.
    PRED_INFANT: [
      // «مولودي» / «مولودتي» — the possessive a parent actually types. The list carried
      // the bare «مولود» only, and `has` is a substring test, so «مولودي» matched it by
      // accident of spelling while «مولودتي» did not. Both mean one thing in an inbox,
      // and the word has no second reading to over-fire on.
      "رضيع", "رضيعي", "مولود", "مولودي", "مولودتي", "بيبي", "عمره شهر", "عمره شهرين",
      "عمرها شهر", "حديث الولاده",
      "طفلي", "طفلتي", "ولدي", "ابني", "بنتي",
    ],
    PRED_PERSIST: ["ما تنزل", "ما تنخفض", "ما ترد", "ما تروح", "ما نزلت", "ما تهدا"],
    EXCL_NOT_BODY: [
      "الجو", "المكيف", "الفرن", "الشمس", "الماء", "المويه", "الغرفه",
      "السياره", "الجهاز",
    ],
    EXCL_MUSCLE: ["عضله", "بعضله", "عضلات"],
    EXCL_CHRONIC: ["من كم شهر", "من شهور", "من كم اسبوع", "من سنه", "مزمن", "من زمان"],
  },
  fires: [
    { text: "رضيعي حرارته 39", tier: "emergency" },
    { text: "رضيعي حرارته ٣٩", tier: "emergency" },
    { text: "ابني عمره شهرين وحرارته 38.5", tier: "emergency" },
    { text: "طفلي حرارته ما تنزل", tier: "urgent" },
    { text: "الرضيع حرارته عاليه ومو راضع", tier: "emergency" },
    { text: "جاله تشنج من الحراره", tier: "emergency" },
    { text: "تشنجات", tier: "emergency" },
    { text: "ابني جاله تشنجات", tier: "emergency" },
    { text: "خامل ما يفتح عينه", tier: "emergency" },
    { text: "طلعت له بقع حمرا ما تختفي بالضغط", tier: "emergency" },
    { text: "رقبته متيبسه ويصرخ من الضوء", tier: "emergency" },
    { text: "الطفل حرارته 39", tier: "urgent" },
  ],
  nearMiss: [
    { text: "حرارة الجو خانقة" },
    { text: "المكيف حرارته عالية" },
    { text: "أبغى موعد تطعيم" },
    { text: "تشنج بعضلة رقبتي من النوم", paired: "ابني جاله تشنجات" },
    { text: "الطفل حرارته 37" },
    // T4 — the row's own reason says it downgrades to `urgent`, so the assertion is the TIER,
    // not `fired === false`. Transcribed as a quiet row, this proof was RED AT BIRTH.
    { text: "حرارته 39 من كم شهر", tier: "urgent" },
  ],
  mirror: {
    TERM: {
      frames: ["{} الجو خانقة اليوم", "المكيف {} عالية", "قياس {} في الاستقبال مجاني؟"],
      per: { "حمي": ["عندكم تطعيم الحمى الشوكية؟"] },
    },
    PRED_REDFLAG: {
      per: {
        "تشنج": ["تشنج بعضلة رقبتي من النوم"],
        // «خامل» IS A HOMOGRAPH AND THE MIRROR FOUND IT: lethargic (of a child) and DORMANT
        // (of an account). It fires only with a person anchor now, so both readings survive.
        "خامل": ["الحساب خامل من سنة، ابغى افعله", "الملف خامل من زمان"],
      },
      onlyFindingMembers: [
        "اختلاج",   // a clinical word for a seizure; a twitch is «رفة», not «اختلاج»
        "تشنجات", "ما يفتح عينه", "ما يرضع", "مو راضع", "رافض الرضاعه",
        "بقع حمرا ما تختفي", "ما تختفي بالضغط", "رقبته متيبسه", "يصرخ من الضوء",
      ],
    },
    PRED_INFANT: {
      // THE T5 WIDENING'S OWN QUIET SIDE. `طفلي · ابني · بنتي · ولدي` are the commonest words
      // in a paediatric inbox; a marker is only a marker WITH a fever TERM in the same clause,
      // and these are the sentences that prove it.
      frames: ["{} عنده موعد بكرة", "{} محتاج تطعيم", "متى دور {} في العيادة؟", "{} نسي بطاقته"],
      per: {
        "عمره شهر": ["الطفل عمره شهر وابغى موعد تطعيم"],
        "عمره شهرين": ["ابني عمره شهرين وابغى فحص روتيني"],
        "عمرها شهر": ["البنت عمرها شهر وابغى موعد"],
        "حديث الولاده": ["عندكم عيادة حديث الولاده؟"],
        "طفلي": ["طفلي عمره ثلاث سنوات وابغى موعد اسنان"],
        "ابني": ["ابني عنده موعد بكرة الصبح"],
        "بنتي": ["بنتي محتاجة تطعيم"],
        "ولدي": ["ولدي نسي بطاقته عندكم"],
        "طفلتي": ["طفلتي عندها موعد جلدية"],
      },
    },
    PRED_PERSIST: {
      per: {
        "ما تنزل": ["الاسعار ما تنزل ابدا"],
        "ما تنخفض": ["الفاتورة ما تنخفض عن كذا؟"],
        "ما ترد": ["العيادة ما ترد على الجوال"],
        "ما تروح": ["الزحمة ما تروح قبل العصر"],
        "ما نزلت": ["النتيجة ما نزلت في التطبيق"],
        "ما تهدا": ["صالة الانتظار ما تهدا"],
      },
    },
    EXCL_NOT_BODY: { frames: ["حرارة {} عالية اليوم"] },
    EXCL_MUSCLE: { frames: ["تشنج ب{} رقبتي من النوم"] },
    EXCL_CHRONIC: { frames: ["انا مراجع عندكم {}"] },
  },
}, INFANT_FEVER_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.7 G — POISONING (HARD)
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const POISONING: ClassSpec = withEn({
  cls: "poisoning",
  label: "ابتلاع مادة",
  sets: {
    VERB_SWALLOW: ["بلع", "بلعت", "بلعه", "بلعها", "شرب", "شربت", "شربه"],
    VERB_TAKE: ["اخذ", "اخذت", "اكل", "اكلت", "تناول", "تناولت"],
    SITE_POISON: [
      "كلور", "ديتول", "مبيد", "بنزين", "بطاريه", "بطاريات", "عمله", "سم",
      "سموم", "منظف", "منظفات", "كاز", "غاز",
    ],
    // T3 — THE MEDICATION SUB-LIST IS NAMED so the pills-only exclusion can be scoped to it.
    // As written, that exclusion covered `حبوب` and ONE object out of fifteen, while
    // `دوا · دواء · دواء الكبار` sat in the same list — so «أخذت الدواء الصبح», among the
    // most common sentences a clinic receives, raised a poisoning emergency and an
    // operator-release-only booking lock.
    SITE_MEDICATION: [
      "دوا", "دواء", "الدوا", "الدواء", "الكبار", "دواء الكبار", "حبوب",
      "علاج", "العلاج", "روشته", "الروشته",
    ],
    STANDALONE: ["تسمم", "اخذ جرعه زايده", "جرعه زايده", "اشتم غاز", "بلع بطاريه"],
    EXCL_PAST: ["قبل اسبوع", "قبل شهر", "قبل كم يوم", "قبل يومين", "قبل سنه", "صار لي قبل", "كان قبل"],
    /** The quantity / ownership qualifiers that DEFEAT the medication-taking exclusion. */
    QUALIFIER: [
      "كثير", "وايد", "علبه", "شريط", "حق امه", "امه", "ابوه", "الكبار",
      "جرعه", "جرعات", "كل الحبوب", "نص علبه",
    ],
  },
  fires: [
    { text: "ابني بلع كلور", tier: "emergency" },
    { text: "شرب ديتول", tier: "emergency" },
    { text: "بلع حبوب أمه", tier: "emergency" },
    { text: "بلع بطاريه", tier: "emergency" },
    { text: "بلع عمله", tier: "emergency" },
    { text: "شرب مبيد", tier: "emergency" },
    { text: "أخذ جرعه زايده", tier: "emergency" },
    { text: "تسمم", tier: "emergency" },
    { text: "شرب بنزين", tier: "emergency" },
    { text: "أكل دواء الكبار", tier: "emergency" },
    { text: "اشتم غاز وصار يستفرغ", tier: "emergency" },
    { text: "بنتي بلعت حبوب", tier: "emergency" },
    { text: "ابني بلع حبوب أمه", tier: "emergency" },
    { text: "ابي موعد طوارئ ابني بلع كلور", tier: "emergency" },
    { text: "أخذت حبوب كثير", tier: "emergency" },
    // T3's accepted over-fire, NAMED rather than traded away. §12 row 16.
    {
      text: "شربت الدواء مع المويه",
      tier: "emergency",
      acceptedOverFire:
        "`شرب` is a SWALLOW verb. *Drinking* a medicine is the ordinary way an Arabic " +
        "speaker describes taking a syrup AND how a parent reports a child who drank one; " +
        "narrowing `شرب` takes «شرب ديتول» and «شرب مبيد» with it. §12 row 16.",
    },
    { text: "تسمم غذائي صار لي قبل اسبوع", tier: "urgent" },
  ],
  nearMiss: [
    { text: "التهاب البلعوم" },
    { text: "عندي صعوبة في البلع" },
    { text: "حبوب منع الحمل" },
    { text: "خبز حبوب كاملة" },
    { text: "حبوب في وجهي" },
    { text: "الدكتور غير لي الجرعة" },
    { text: "عندي ضغط وآخذ حبوب", paired: "بنتي بلعت حبوب" },
    // T3 — the MEDICATION-taking family, and the §2.0 L8 mirror for that sub-list.
    { text: "أخذت الدواء الصبح", paired: "بنتي بلعت حبوب" },
    { text: "تناولت الدواء بعد الأكل زي ما قال الدكتور", paired: "بنتي بلعت حبوب" },
    { text: "أكلت الدواء بعد الفطور", paired: "بنتي بلعت حبوب" },
    { text: "أخذت دوا الضغط اليوم", paired: "بنتي بلعت حبوب" },
    { text: "تناولت دواء الحساسية", paired: "ابني بلع حبوب أمه" },
    { text: "ابني أخذ الدواء على وقته الحمدلله", paired: "ابني بلع حبوب أمه" },
    { text: "متى آخذ العلاج؟" },
    { text: "نسيت آخذ الدواء أمس" },
    { text: "الروشتة فيها ثلاث أدوية" },
    { text: "أخذت الحبوب حق الضغط", paired: "أخذت حبوب كثير" },
  ],
  mirror: {
    VERB_SWALLOW: {
      per: {
        "بلع": ["عندي صعوبة في البلع", "التهاب البلعوم"],
        "بلعت": ["بلعت الحبة بصعوبة، حجمها كبير"],
        "بلعه": ["الدواء صعب بلعه على الطفل"],
        "بلعها": ["الحبة كبيرة وصعب بلعها"],
        "شرب": ["شرب الماء الكثير مفيد للكلى؟"],
        "شربت": ["شربت الماء قبل التحليل، ينفع؟"],
        "شربه": ["الشاي ما ينفع شربه قبل التحليل"],
      },
    },
    VERB_TAKE: {
      // THE T3 MIRROR. A TAKE verb with a medication object and no qualifier is what a
      // chronic patient does every morning.
      frames: ["{} الدواء على وقته الحمدلله", "متى {} العلاج؟", "نسيت {} الدواء امس"],
      per: {
        "اخذ": ["ابني أخذ الدواء على وقته الحمدلله"],
        "اخذت": ["أخذت الدواء الصبح"],
        "اكل": ["الطفل اكل زين اليوم"],
        "اكلت": ["أكلت الدواء بعد الفطور"],
        "تناول": ["تناول الدواء بعد الاكل افضل؟"],
        "تناولت": ["تناولت دواء الحساسية"],
      },
    },
    SITE_POISON: {
      frames: ["عندكم {} في الصيدلية؟", "كم سعر {}؟"],
      per: {
        "بطاريه": ["بطارية الجهاز خلصت"], "بطاريات": ["عندكم بطاريات لجهاز السكر؟"],
        "عمله": ["تقبلون عمله اجنبية؟"], "سم": ["عندكم فحص للتحسس من سم النحل؟"],
        "سموم": ["عندكم قسم سموم؟"], "غاز": ["ريحة غاز في المطبخ، وش اسوي؟", "عندكم تحليل غاز في المختبر؟"],
        "كاز": ["محطة الكاز جنب الفرع؟"],
        "منظف": ["تستخدمون منظف معقم للعيادات؟"], "منظفات": ["ريحة المنظفات قوية بالممر"],
        "كلور": ["ريحة الكلور في المسبح قوية"], "ديتول": ["عندكم ديتول بالصيدلية؟"],
        "مبيد": ["رششتوا مبيد في الصالة؟"], "بنزين": ["اقرب محطة بنزين وين؟"],
      },
    },
    SITE_MEDICATION: {
      frames: ["نسيت اخذ {} امس", "متى اخذ {}؟", "عندكم {} في الصيدلية؟", "كم سعر {}؟"],
      per: {
        "حبوب": ["حبوب منع الحمل", "خبز حبوب كاملة", "حبوب في وجهي", "عندي ضغط وآخذ حبوب"],
        "الكبار": ["عندكم عيادة الكبار في السن؟"],
        "دواء الكبار": ["دواء الكبار جرعته تختلف عن الاطفال؟"],
        "روشته": ["ابغى تجديد روشته"], "الروشته": ["الروشتة فيها ثلاث أدوية"],
        "علاج": ["ابغى موعد علاج طبيعي"], "العلاج": ["متى آخذ العلاج؟"],
      },
    },
    STANDALONE: { onlyFinding: "poisoning / overdose / button-battery phrases — no benign clinic reading" },
    EXCL_PAST: { frames: ["راجعت عندكم {}"] },
    QUALIFIER: {
      frames: ["الزحمة {} اليوم"],
      per: {
        "علبه": ["ابغى علبة قفازات"], "شريط": ["عندكم شريط قياس السكر؟"],
        "حق امه": ["الملف حق امه عندكم؟"], "امه": ["الطفل مع امه في الانتظار"],
        "ابوه": ["الطفل جا مع ابوه"], "الكبار": ["عيادة الكبار في السن وين؟"],
        "جرعه": ["الدكتور غير لي الجرعة"], "جرعات": ["كم جرعات التطعيم؟"],
        "كل الحبوب": ["كل الحبوب متوفرة عندكم؟"], "نص علبه": ["باقي نص علبه من الدواء"],
        "كثير": ["الزحام كثير اليوم"], "وايد": ["الانتظار وايد طويل"],
      },
    },
  },
}, POISONING_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.8 H — TRAUMA (HARD) — PHRASES ONLY, DELIBERATELY
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Bare `حوادث` turns an ER-NAVIGATION question into the rail (the ER department is literally
// named «الطوارئ والحوادث»); bare `كسر` turns «الكسر العشري» — the decimal fraction — into one;
// bare `طاح` turns a price drop into one. There is no recall net here worth the false
// positives, and §11.2 pins all three.
export const TRAUMA: ClassSpec = withEn({
  cls: "trauma",
  label: "إصابة",
  sets: {
    STANDALONE: [
      "حادث سياره", "حادث دهس", "حادث مروري", "انقلبت فينا السياره", "انقلبت السياره",
      "طاح من الدرج", "طاح من السلم", "طاح علي راسه", "طاحت علي راسها", "ضرب راسه",
      "ضربت راسها", "غاب عن الوعي", "غابت عن الوعي", "فقد الوعي", "العظم بارز",
      "العظم طالع", "كسر مفتوح", "حرق كبير", "حروق كبيره", "انسكب عليه ماء حار",
      "ما يقدر يحمل رجله", "ما تقدر تحمل رجلها",
    ],
  },
  fires: [
    // T1(b): SIX of these 22 phrases were dead on arrival for want of normalization, and
    // «حادث سيارة» — the FIRST entry on this class's Fires list — was silent. `طاح على راسه`
    // is the exact entry §2.8's own correction note said it had fixed.
    { text: "حادث سيارة", tier: "emergency" },
    { text: "انقلبت فينا السياره", tier: "emergency" },
    { text: "طاح من الدرج", tier: "emergency" },
    { text: "طاح على راسه", tier: "emergency" },
    { text: "ضرب راسه وقاعد يستفرغ", tier: "emergency" },
    { text: "غاب عن الوعي بعد الضربه", tier: "emergency" },
    { text: "العظم بارز", tier: "emergency" },
    { text: "كسر مفتوح", tier: "emergency" },
    { text: "انسكب عليه ماء حار على صدره", tier: "emergency" },
    { text: "حرق كبير", tier: "emergency" },
    { text: "حروق كبيرة", tier: "emergency" },
    { text: "ما يقدر يحمل رجله بعد الطيحه", tier: "emergency" },
    { text: "ابني طاح على راسه وقاعد يستفرغ", tier: "emergency" },
  ],
  nearMiss: [
    { text: "وين قسم الحوادث؟", paired: "حادث سيارة" },
    { text: "الطوارئ والحوادث تفتح كم؟", paired: "حادث سيارة" },
    { text: "تقرير حادث للتأمين", paired: "حادث سيارة" },
    { text: "حساسية من المكسرات", paired: "كسر مفتوح" },
    { text: "انكسر الجهاز", paired: "كسر مفتوح" },
    { text: "الكسر العشري", paired: "كسر مفتوح" },
    { text: "طاح السعر", paired: "طاح من الدرج" },
    { text: "طاح شعري", paired: "طاح من الدرج" },
    { text: "حرق الدهون", paired: "حرق كبير" },
    { text: "جهاز الحرق", paired: "حرق كبير" },
  ],
  mirror: {
    STANDALONE: {
      onlyFinding:
        "phrases only, deliberately: every member IS the finding. The precision mirror for " +
        "this class is on the BARE STEMS that are NOT in it — `حوادث`, `كسر`, `طاح`, `حرق` — " +
        "and those are driven as near-misses above and in the ordinary-clinic corpus. A class " +
        "with no bare term has nothing to over-match, which is the whole design.",
    },
  },
}, TRAUMA_EN);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.9 I — SELF-HARM (HARD, exact match only, no fuzzy, no STT net)
// ═══════════════════════════════════════════════════════════════════════════════════════════
// §1.3: THIS IS THE ONLY CLASS WHERE THE OVER-FIRE COST IS ITSELF A SAFETY COST — a grieving
// or joking patient handed a crisis rail is harmed by the interaction and learns to stop
// talking to us. That is why rule 2 is a WHITELIST (T6) and not a blacklist, and it is the
// one place in §2 where a rule is stated positively.
export const SELF_HARM: ClassSpec = withEn({
  cls: "self_harm",
  label: "خطر على النفس",
  sets: {
    // S5 — rule 1's verb set, NAMED. §2.0 L1 permits an empty set; it forbids an unstated one.
    VERB: [
      "اموت", "موت", "انتحر", "بنتحر", "انهي حياتي", "اذيت نفسي", "اجرح نفسي",
      "جرحت نفسي", "اختفي", "ارتاح للابد", "اخلص من حياتي",
    ],
    STANDALONE: [
      "ابي اموت", "ودي اموت", "افكر انتحر", "بنتحر", "راح انهي حياتي",
      "ما عاد لي نفس اعيش", "ما لي داعي اعيش", "جرحت نفسي", "اذيت نفسي",
      "ابي ارتاح للابد", "ابي اختفي", "عبء علي اهلي",
    ],
    // T6 — THE WHITELIST. `أموت على X` is a hit ONLY when X is one of these. Every other
    // complement, and an absent complement, is quiet. No food list is required and none is
    // written, which is the point: the vocabulary of things Saudis love is not closable.
    LIFE_OBJECT: ["نفسي", "حالي", "روحي", "عمري", "الدنيا", "الحياه", "كل شي", "العيشه", "اهلي", "وضعي"],
    // Rule 2's remaining, CLOSED, non-`على` shapes. These are enumerable because they are
    // fixed particle+noun compounds, not an open complement slot.
    IDIOM_FRAME: [
      "من الضحك", "من الجوع", "من التعب", "من الحر", "من البرد",
      "من الزحمه", "من الشغل", "من الدوام", "من الانتظار", "من الملل",
    ],
    // Rule 2's allergy-disclosure carve-out, ENUMERATED AT LAST. The verb is conditional on an
    // allergen or disease noun, which is a DISCLOSURE and not ideation. This list is asserted
    // in the proof to be recognised by the SHARED `lib/ai/allergen-gate.ts` lexicon rather
    // than copied blind — a copy is how the symptom-frame lists drifted apart.
    DISEASE_OBJECT: [
      "فول سوداني", "سوداني", "مكسرات", "بندق", "فستق", "لوز", "كاجو", "جوز",
      "لبن", "البان", "حليب", "جلوتين", "قمح", "بيض", "بيظ", "سمسم", "صويا",
      "سمك", "جمبري", "قشريات", "لاكتوز", "طحينه", "ماكولات بحريه", "بحريات", "عين جمل",
    ],
    /** Rule 3 — `تعبت من` counts ONLY when its object is life. */
    TIRED_LIFE: ["الحياه", "الدنيا", "كل شي", "نفسي", "العيشه"],
    /** Rule 4 — bereavement SUPPRESSES the class and routes to `human_handoff`. */
    BEREAVEMENT: ["توفي", "توفيت", "الله يرحمه", "الله يرحمها", "انتقل الي رحمه الله", "فقدنا", "العزاء", "المتوفي"],
  },
  fires: [
    { text: "أبي أموت", tier: "emergency" },
    { text: "ودي أموت", tier: "emergency" },
    { text: "أفكر أنتحر", tier: "emergency" },
    { text: "بنتحر", tier: "emergency" },
    { text: "راح أنهي حياتي", tier: "emergency" },
    { text: "ما عاد لي نفس أعيش", tier: "emergency" },
    { text: "تعبت من الحياة", tier: "emergency" },
    { text: "ما لي داعي أعيش", tier: "emergency" },
    { text: "جرحت نفسي", tier: "emergency" },
    { text: "أذيت نفسي", tier: "emergency" },
    { text: "الدنيا ما فيها فايده وأبي أرتاح للأبد", tier: "emergency" },
    { text: "أحس إني عبء على أهلي وأبي أختفي", tier: "emergency" },
    { text: "I want to die", tier: "emergency" },
    { text: "kill myself", tier: "emergency" },
    { text: "end it all", tier: "emergency" },
    { text: "suicidal", tier: "emergency" },
    { text: "self harm", tier: "emergency" },
    { text: "3ayez amoot", tier: "emergency" },
    { text: "abi amoot", tier: "emergency" },
    // §2.0 L7 precedence: class I is evaluated FIRST, so this is `self_harm`, not `poisoning`.
    { text: "أخذت حبوب كثير عشان أخلص", tier: "emergency" },
    // The whitelist's own true positives.
    { text: "أموت على نفسي", tier: "emergency" },
    { text: "تعبت من الدنيا", tier: "emergency" },
  ],
  nearMiss: [
    { text: "أموت على الكبسة", paired: "أبي أموت" },
    { text: "ميت من الجوع", paired: "أبي أموت" },
    { text: "موت من الضحك", paired: "أبي أموت" },
    { text: "مت ضحك", paired: "أبي أموت" },
    { text: "قاتلني الصداع" },
    { text: "الصداع ذابحني" },
    { text: "بموت لو أكلت فول سوداني", paired: "أبي أموت" },
    { text: "ألغوا الموعد، توفي والدي الله يرحمه", paired: "أبي أموت" },
    { text: "تعبت من الانتظار", paired: "تعبت من الحياة" },
    { text: "تعبت من الدوام", paired: "تعبت من الحياة" },
    { text: "خلصت من التحاليل" },
    { text: "أبي أخلص بسرعة" },
    { text: "انتحار المشروع" },
    // The precision mirror for the intentional-overdose arm: «أخلص من X» is "be done with X"
    // for every X that is not a life object, and a painkiller sentence is ordinary traffic.
    { text: "أخذت الدواء عشان أخلص من الألم", paired: "أخذت حبوب كثير عشان أخلص" },
    { text: "أخذت الحبوب عشان أخلص من الصداع", paired: "أخذت حبوب كثير عشان أخلص" },
    { text: "بلعت الحبة عشان أخلص من الكحة", paired: "أخذت حبوب كثير عشان أخلص" },
    // T6 — the six foods nobody enumerated, and the shape a food blacklist fails on silently.
    { text: "أموت على المندي", paired: "أبي أموت" },
    { text: "أموت على القهوة", paired: "أبي أموت" },
    { text: "أموت على الشاورما", paired: "أبي أموت" },
    { text: "أموت على الكيك", paired: "أبي أموت" },
    { text: "أموت على قهوتكم بصراحة", paired: "أبي أموت" },
    { text: "أموت على السمبوسة برمضان", paired: "أبي أموت" },
    { text: "أموت على شغلي", paired: "أبي أموت" },
    { text: "أموت على المطاعم اللي عندكم", paired: "أبي أموت" },
    { text: "بموت على الحلا", paired: "أبي أموت" },
    { text: "يموت على الرياضة", paired: "أبي أموت" },
  ],
  mirror: {
    VERB: {
      // THE MIRROR IS WHAT SHOWED NO BLACKLIST CAN COVER THE `على` SLOT.
      frames: ["{} على المندي", "{} على قهوتكم بصراحة", "{} على الشاورما"],
      per: {
        "موت": ["موت من الضحك", "مت ضحك"],
        "اختفي": ["الملف اختفى من النظام"],
      },
      onlyFindingMembers: [
        "انتحر", "بنتحر", "انهي حياتي", "اذيت نفسي", "اجرح نفسي", "جرحت نفسي",
        "ارتاح للابد", "اخلص من حياتي",
      ],
    },
    STANDALONE: { onlyFinding: "first-person intent / plan / act — no benign clinic reading" },
    LIFE_OBJECT: {
      // A WHITELIST STILL NEEDS ITS MIRROR: each member must be quiet in an ordinary sentence
      // that does NOT carry a death verb, or the whitelist becomes the false positive.
      frames: ["ابغى اهتم ب{} اكثر", "{} احسن هالفترة الحمدلله"],
      per: {
        "نفسي": ["ابغى احجز بنفسي اونلاين"],
        "حالي": ["حالي احسن بعد العلاج الحمدلله"],
        "روحي": ["ودي اروح بروحي بدون مرافق"],
        "عمري": ["عمري اربعين، ايش الفحوصات المطلوبة؟"],
        "الدنيا": ["الدنيا حر اليوم"],
        "الحياه": ["نمط الحياه الصحي عندكم له عيادة؟"],
        "كل شي": ["كل شي تمام في الموعد الحمدلله"],
        "العيشه": ["العيشه غالية هالايام"],
        "اهلي": ["اهلي كلهم مسجلين عندكم"],
        "وضعي": ["وضعي المالي ما يسمح بالدفع كامل، فيه تقسيط؟"],
      },
    },
    IDIOM_FRAME: { frames: ["تعبت {}"] },
    DISEASE_OBJECT: { frames: ["عندي حساسية من {}", "هل الوجبة فيها {}؟"] },
    TIRED_LIFE: {
      frames: ["ابغى استشارة عن {}"],
      per: {
        "الحياه": ["نمط الحياه الصحي"], "الدنيا": ["الدنيا حر اليوم"],
        "كل شي": ["كل شي تمام"], "نفسي": ["ابغى احجز بنفسي"],
        "العيشه": ["العيشه غالية"],
      },
    },
    BEREAVEMENT: {
      frames: ["ألغوا الموعد، {} والدي"],
      per: {
        "توفي": ["ألغوا الموعد، توفي والدي الله يرحمه"],
        "توفيت": ["توفيت جدتي الله يرحمها، الغوا الموعد"],
        "الله يرحمه": ["ألغوا الموعد، توفي والدي الله يرحمه"],
        "الله يرحمها": ["توفيت والدتي الله يرحمها"],
        "انتقل الي رحمه الله": ["ابوي انتقل الى رحمة الله، الغوا المواعيد"],
        "فقدنا": ["فقدنا الوالد، نعتذر عن الموعد"],
        "العزاء": ["احنا في العزاء، الغوا الموعد"],
        "المتوفي": ["ابغى تقرير عن المتوفي للاحوال"],
      },
    },
  },
}, SELF_HARM_EN);

/** THE NINE CLASSES, in §2.0 L7's precedence order. `detect.ts` walks this array in order. */
export const CLASSES: readonly ClassSpec[] = [
  SELF_HARM, CARDIAC, STROKE, AIRWAY, OBSTETRIC,
  HEMORRHAGE, INFANT_FEVER, POISONING, TRAUMA,
];

/** Every enumerated set member in §2, flattened — the domain of the §2.0 L8 mirror. */
export function everyEnumeratedMember(): Array<{ cls: RedFlagClass; set: string; member: string }> {
  const out: Array<{ cls: RedFlagClass; set: string; member: string }> = [];
  for (const c of CLASSES) {
    for (const [set, members] of Object.entries(c.sets)) {
      for (const member of members) out.push({ cls: c.cls, set, member });
    }
  }
  return out;
}
