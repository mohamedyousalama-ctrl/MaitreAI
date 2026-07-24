// ============================================================================
// WO-EVIDENCE-1 — the multilingual allergen-detector adversarial corpus.
//
// EVIDENCE ARTEFACT, not a spec. Each case records the raw text exactly as a
// customer would send it, the SAFETY-CORRECT expected verdict, the allergen/class
// it should detect, and why the case is hard. The corpus states what SHOULD be
// detected; the runner (scripts/proof-detector-corpus.ts) reports what the current
// detector ACTUALLY does. Misses are FINDINGS — they belong to the PM and auditor.
// Do NOT tune the detector or the expectations to make this pass.
//
// `nativeReview: true` marks a case whose dialect authenticity OR expected verdict I
// am not fully certain about (I am not a native Egyptian/Saudi speaker). Flagging
// uncertainty is required: a corpus that quietly encodes wrong expectations is worse
// than a smaller honest one.
//
// `expect`:
//   "signal"      — a safety signal SHOULD fire (a real disclosure). A miss here is
//                   the dangerous case: silent, no evidence, no alert, no kitchen note.
//   "no_signal"   — the detector should NOT fire (preference / non-allergy). A hit
//                   here is a false positive (real cost: needless human handoff, and
//                   staff who see noise stop trusting the signal).
//   "record_only" — negation/retraction. Per the work order: RECORD what the detector
//                   does; do NOT judge whether it is correct — that is a safety-policy
//                   question for the auditor, not the evidence lane.
// ============================================================================

export type DetectorExpectation = "signal" | "no_signal" | "record_only";

export type CorpusCategory =
  | "spelling_variation" // Egyptian Arabic spelling variation
  | "symptom_no_word" // symptoms stated without the word «حساسية»
  | "mixed_ar_en" // mixed Arabic/English + Latin-script Arabic (Arabizi)
  | "third_person" // the person at risk is not the person typing
  | "negation_retraction" // negations / retractions (record-only)
  | "saudi_dialect" // Saudi variants (Khalid ships to the same detector)
  | "voice_artifacts" // transcription artefacts (dropped hamza, run-together, homophones)
  | "ambiguity"; // preference vs allergy; avoidance possibly medical

export interface CorpusCase {
  id: string;
  category: CorpusCategory;
  /** Raw text EXACTLY as a customer would send it — preserved verbatim. */
  text: string;
  expect: DetectorExpectation;
  /** The allergen / class it should detect (null for no_signal / record_only). */
  allergen: string | null;
  /** Why this case is hard. */
  whyHard: string;
  /** True when I am uncertain about the dialect or the expectation — needs a native speaker. */
  nativeReview?: boolean;
  /** True to drive the detector on the voice-transcript path (phonetic safety net). */
  isVoiceTranscript?: boolean;
}

export const ALLERGEN_DETECTOR_CORPUS: readonly CorpusCase[] = [
  // ------------------------------------------------------------------ spelling
  { id: "spell-01", category: "spelling_variation", text: "عندي حساسيه من المكسرات", expect: "signal", allergen: "مكسرات", whyHard: "taa marbuta written as haa (حساسيه)" },
  { id: "spell-02", category: "spelling_variation", text: "حساااسية من الفول السوداني", expect: "signal", allergen: "فول سوداني", whyHard: "letters repeated for emphasis (elongation)" },
  { id: "spell-03", category: "spelling_variation", text: "عندى حساسيه من البيض", expect: "signal", allergen: "بيض", whyHard: "alef maqsura ى for ي + haa ending" },
  { id: "spell-04", category: "spelling_variation", text: "حساسيةة من اللبن", expect: "signal", allergen: "لبن", whyHard: "doubled final taa marbuta typo" },
  { id: "spell-05", category: "spelling_variation", text: "حسسية من السمك", expect: "signal", allergen: "سمك", whyHard: "dropped alef misspelling (حسسية)", nativeReview: true },
  { id: "spell-06", category: "spelling_variation", text: "عندي حساسه من القمح", expect: "signal", allergen: "قمح", whyHard: "dropped ي (حساسه)", nativeReview: true },

  // ---------------------------------------------------------- symptom, no word
  { id: "symp-01", category: "symptom_no_word", text: "بيجيلي طفح لما اكل جمبري", expect: "signal", allergen: "جمبري/محار", whyHard: "rash symptom, word «حساسية» never used" },
  { id: "symp-02", category: "symptom_no_word", text: "بتورم شفايفي من الفراولة", expect: "signal", allergen: "فراولة", whyHard: "lip swelling stated as the symptom" },
  { id: "symp-03", category: "symptom_no_word", text: "بختنق لما اكل فول سوداني", expect: "signal", allergen: "فول سوداني", whyHard: "choking (airway) symptom, no allergy word" },
  { id: "symp-04", category: "symptom_no_word", text: "ابني بيكحّ ويحمرّ لما ياكل بيض", expect: "signal", allergen: "بيض", whyHard: "child symptom (cough + redness), third-person, no allergy word", nativeReview: true },
  { id: "symp-05", category: "symptom_no_word", text: "لو اكلت سمسم بحس إني هموت", expect: "signal", allergen: "سمسم", whyHard: "severity implied («I feel I'll die»), no allergy word" },
  { id: "symp-06", category: "symptom_no_word", text: "كل ما اكل مكسرات بطرش وبتعبني معدتي", expect: "signal", allergen: "مكسرات", whyHard: "GI symptoms (vomit/stomach) — could be intolerance not allergy; over-detection risk", nativeReview: true },
  { id: "symp-07", category: "symptom_no_word", text: "حلقي بيقفل لما اكل موز", expect: "signal", allergen: "موز", whyHard: "throat-closing (anaphylaxis) stated as symptom; banana is an uncommon allergen term", nativeReview: true },
  { id: "symp-08", category: "symptom_no_word", text: "بحس بحكة في بقي وانا باكل لبن", expect: "signal", allergen: "لبن", whyHard: "oral itch («بحكة في بقي») while eating; mild symptom, no allergy word", nativeReview: true },

  // ------------------------------------------------------------- mixed / franco
  { id: "mix-01", category: "mixed_ar_en", text: "عندي allergy من الـ nuts", expect: "signal", allergen: "nuts/مكسرات", whyHard: "English allergen + English «allergy» inside Arabic" },
  { id: "mix-02", category: "mixed_ar_en", text: "I have حساسية from لبن", expect: "signal", allergen: "لبن", whyHard: "English frame, Arabic «حساسية» + Arabic allergen" },
  { id: "mix-03", category: "mixed_ar_en", text: "3andi 7asaseya men el laban", expect: "signal", allergen: "لبن/laban", whyHard: "full Arabizi (Latin-script Arabic): 3=ع, 7=ح" },
  { id: "mix-04", category: "mixed_ar_en", text: "bantefax lama akol seafood", expect: "signal", allergen: "seafood", whyHard: "Arabizi symptom («I swell up») + English allergen", nativeReview: true },
  { id: "mix-05", category: "mixed_ar_en", text: "my son has حساسية from shellfish", expect: "signal", allergen: "shellfish/محار", whyHard: "English third-person + Arabic «حساسية» + English allergen" },
  { id: "mix-06", category: "mixed_ar_en", text: "حساسية من الـ shellfish", expect: "signal", allergen: "shellfish/محار", whyHard: "Arabic «حساسية» + Arabic definite article on an English allergen" },
  { id: "mix-07", category: "mixed_ar_en", text: "ana bamoot law akalt jambari", expect: "signal", allergen: "jambari (shrimp)", whyHard: "Arabizi severity idiom («I die if I eat shrimp»), no explicit allergy word", nativeReview: true },
  { id: "mix-08", category: "mixed_ar_en", text: "3andi hasaseya men el foul el soudani", expect: "signal", allergen: "foul soudani (peanut)", whyHard: "Arabizi explicit «hasaseya» + Arabizi allergen", nativeReview: true },
  { id: "mix-09", category: "mixed_ar_en", text: "I can't eat البيض at all", expect: "signal", allergen: "بيض", whyHard: "English avoidance frame + Arabic allergen, no allergy word" },
  { id: "mix-10", category: "mixed_ar_en", text: "عندي مشكلة مع الـ dairy", expect: "signal", allergen: "dairy/ألبان", whyHard: "Arabic avoidance frame «عندي مشكلة مع» + English allergen" },

  // ---------------------------------------------------------------- third person
  { id: "third-01", category: "third_person", text: "ابني عنده حساسية من البيض", expect: "signal", allergen: "بيض", whyHard: "child at risk, not the sender (ابني)" },
  { id: "third-02", category: "third_person", text: "مراتي بتتحسس من السمك", expect: "signal", allergen: "سمك", whyHard: "wife at risk; verb form بتتحسس, no noun «حساسية»" },
  { id: "third-03", category: "third_person", text: "واحد معانا عنده حساسية فول سوداني", expect: "signal", allergen: "فول سوداني", whyHard: "a guest at the table («واحد معانا»)" },
  { id: "third-04", category: "third_person", text: "بنتي الصغيرة بيطلعلها طفح من اللبن", expect: "signal", allergen: "لبن", whyHard: "child + symptom (rash) + third-person, no allergy word", nativeReview: true },
  { id: "third-05", category: "third_person", text: "صاحبي بيموت لو اكل مكسرات", expect: "signal", allergen: "مكسرات", whyHard: "friend at risk, severity idiom («بيموت لو»)" },

  // --------------------------------------------------------- negation / retraction
  { id: "neg-01", category: "negation_retraction", text: "مش عندي حساسية", expect: "record_only", allergen: null, whyHard: "plain negation of the allergy word" },
  { id: "neg-02", category: "negation_retraction", text: "لأ خلاص مش مهم", expect: "record_only", allergen: null, whyHard: "retraction AFTER a prior disclosure (context-dependent; no allergy word here)", nativeReview: true },
  { id: "neg-03", category: "negation_retraction", text: "مليش حساسية من حاجة", expect: "record_only", allergen: null, whyHard: "negation idiom «مليش» + «من حاجة» (from anything)" },
  { id: "neg-04", category: "negation_retraction", text: "كنت فاكر عندي حساسية بس لأ", expect: "record_only", allergen: null, whyHard: "self-correction: asserts then retracts in one message" },
  { id: "neg-05", category: "negation_retraction", text: "عندي حساسية من المكسرات بس مش النهاردة هطلبها", expect: "record_only", allergen: "مكسرات", whyHard: "assertion PLUS an unrelated «بس» clause — should NOT read as a retraction", nativeReview: true },

  // ------------------------------------------------------------------ saudi dialect
  { id: "saudi-01", category: "saudi_dialect", text: "عندي حساسية من الروبيان", expect: "signal", allergen: "روبيان (shrimp)", whyHard: "Saudi «روبيان» for shrimp (Egyptian says جمبري)" },
  { id: "saudi-02", category: "saudi_dialect", text: "ما اقدر آكل زبدة الفول السوداني", expect: "signal", allergen: "فول سوداني", whyHard: "Saudi «ما اقدر» avoidance; peanut butter phrasing", nativeReview: true },
  { id: "saudi-03", category: "saudi_dialect", text: "يطلع لي حساسية من الحليب", expect: "signal", allergen: "حليب (milk)", whyHard: "Saudi «حليب» for milk (Egyptian says لبن); «يطلع لي»" },
  { id: "saudi-04", category: "saudi_dialect", text: "عيالي يتحسسون من البيض", expect: "signal", allergen: "بيض", whyHard: "Saudi «عيالي» (my kids), plural verb يتحسسون, third-person", nativeReview: true },
  { id: "saudi-05", category: "saudi_dialect", text: "اذا اكلت مكسرات يجيني ضيق نفس", expect: "signal", allergen: "مكسرات", whyHard: "Saudi «اذا» + airway symptom «ضيق نفس», no allergy word", nativeReview: true },

  // -------------------------------------------------------------- voice artefacts
  { id: "voice-01", category: "voice_artifacts", text: "عندي حساسيه من الفستق", expect: "signal", allergen: "فستق", whyHard: "STT drops hamza / uses haa ending", isVoiceTranscript: true },
  { id: "voice-02", category: "voice_artifacts", text: "حساسيه من السمك", expect: "signal", allergen: "سمك", whyHard: "STT run-together / minimal spacing", isVoiceTranscript: true, nativeReview: true },
  { id: "voice-03", category: "voice_artifacts", text: "عندي حسسيه من ابندق", expect: "signal", allergen: "بندق", whyHard: "STT homophone/dropped letters: البندق→ابندق, حساسيه→حسسيه", isVoiceTranscript: true, nativeReview: true },
  { id: "voice-04", category: "voice_artifacts", text: "انا باتحسس من اللبن", expect: "signal", allergen: "لبن", whyHard: "verb form باتحسس (no noun «حساسية»), voice-typical", isVoiceTranscript: true },
  { id: "voice-05", category: "voice_artifacts", text: "في عندي حساسيه للمكسرات", expect: "signal", allergen: "مكسرات", whyHard: "«للمكسرات» (to-nuts) preposition; voice phrasing", isVoiceTranscript: true },

  // ------------------------------------------------------------------- ambiguity
  { id: "amb-01", category: "ambiguity", text: "مش بحب اللبن", expect: "no_signal", allergen: null, whyHard: "PREFERENCE («I don't like milk»), not an allergy — must NOT fire" },
  { id: "amb-02", category: "ambiguity", text: "مابحبش طعم المكسرات", expect: "no_signal", allergen: null, whyHard: "taste preference — must NOT fire" },
  { id: "amb-03", category: "ambiguity", text: "بتجنب السكر عشان بعمل رجيم", expect: "no_signal", allergen: null, whyHard: "diet avoidance (sugar/rigime), not allergy — must NOT fire" },
  { id: "amb-04", category: "ambiguity", text: "مبحبش الجمبري بس باكله عادي", expect: "no_signal", allergen: null, whyHard: "preference AND explicitly eats it — must NOT fire" },
  { id: "amb-05", category: "ambiguity", text: "بحاول أتجنب الجلوتين", expect: "signal", allergen: "جلوتين", whyHard: "avoidance POSSIBLY medical (celiac). Err toward safety = signal; but over-detection cost is real if it's a fad diet", nativeReview: true },
  { id: "amb-06", category: "ambiguity", text: "الدكتور منعني من الملح", expect: "no_signal", allergen: null, whyHard: "medical dietary restriction (salt) but NOT an allergen — should not fire as an allergy", nativeReview: true },
];

export const CORPUS_CATEGORIES: readonly CorpusCategory[] = [
  "spelling_variation",
  "symptom_no_word",
  "mixed_ar_en",
  "third_person",
  "negation_retraction",
  "saudi_dialect",
  "voice_artifacts",
  "ambiguity",
];
