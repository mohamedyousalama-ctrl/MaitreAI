// ============================================================================
// فيصل / Faysal — SAFETY RAIL · THE ENGLISH ARM OF THE §2 LEXICON, AS DATA.
// PURE. Written NORMALIZED, in `normalizeEn`'s spelling (§2.0 L6).
//
// WHY THIS FILE EXISTS, AND IT IS NOT A TRANSLATION EXERCISE.
//
// §2 is titled "Riyadh Arabic as patients actually type it" and every one of its nine classes
// is written that way. The English that shipped with it is four `STANDALONE_EN` arrays holding
// eighteen strings between them, matched with `raw.toLowerCase().includes(p)` — no boundary, no
// clause, no composition, no age, no temperature, and NOTHING AT ALL for obstetric, infant
// fever, poisoning or trauma. The product books appointments in English. So:
//
//     «my baby has a fever and won't wake up»   →  no hit, no rail, a booking offer
//
// — an infant with a fever and reduced consciousness, which is the exact population §2.6 was
// written for, handed a slot. Driven through the real engine before this file existed.
//
// THE SAME LAWS, NOT A SECOND SET OF THEM. Every class below states its sets and its `HIT_EN`
// formula in §2.0 L1's template; every entry on every `fires` list is mirrored into MUST_FIRE by
// L6; every enumerated member is mirrored into MUST_BE_QUIET by L8; exclusions are clause-scoped
// arm exclusions naming words that are IN THE MESSAGE (L5), never frames, because every class in
// §1.3 is HARD and §1.5 R1 says a frame may not touch one.
//
// WHAT IS DIFFERENT, AND IT IS ONLY THIS: the boundary. §1.2's matcher exists because Arabic has
// no `\b` in JS. English has one, and it is exactly the ASCII rule `\b` implements — which is
// why `match.ts` carries TWO matchers and why a single regex written across both scripts is
// loose in one of them. See the header there.
//
// THE HOMOGRAPHS ARE ENGLISH ONES AND THEY ARE NOT THE ARABIC ONES TRANSLATED. An Arabic quiet
// corpus cannot find them, and §Q is Arabic by construction — the proof's own header says so and
// names it a gap. This file's near-misses, and §QE in the proof, are the other half:
//
//   chest    the thorax · A CHEST OF DRAWERS · a chest x-ray
//   fell     fell over · FELL BEHIND ON A PAYMENT · the price fell
//   accident a crash · «ACCIDENT AND EMERGENCY», the department's own name (§2.8's «الحوادث»)
//   blood    haemorrhage · A BLOOD TEST · blood work · BLOOD PRESSURE
//   killing  ending a life · KILLING TIME · «this headache is killing me»
//   dying    dying · «DYING TO GET AN APPOINTMENT» · «to die for»
//   stroke   a CVA · STROKE REHAB · a stroke clinic follow-up
//   breathing dyspnoea · A BREATHING EXERCISES CLASS · a breathing test
//   heart    the organ · A HEART CLINIC · cardiology follow-up
//   fever    a fever now · «HAD A FEVER LAST MONTH» · post-vaccine fever
//   took     an overdose · «TOOK MY MEDICINE THIS MORNING» (§2.7's T3, in English)
//   speak    aphasia · «I CAN'T SPEAK ARABIC», the commonest sentence in an expatriate inbox
// ============================================================================

import type { EnglishArm } from "./lexicon";

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.1 A — CARDIAC (HARD)
// HIT_EN = STANDALONE_EN ∨ (TERM_EN ∧ (PAIN ∨ PRESSURE ∨ BURNING ∨ COMPANION)), per clause.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const CARDIAC_EN: EnglishArm = {
  sets: {
    // BARE `heart` IS NEVER A TERM, for the same reason bare `قلب` is not: «heart clinic»,
    // «heart check-up», «cardiology follow-up» are booking sentences and they are the highest
    // volume thing this class sees. `chest` IS a term — and it is the English «الصدر», saved
    // only by the predicate requirement, which is what «chest x-ray» and «chest of drawers»
    // depend on. §11.2 pairs all of them with «pain in my chest».
    TERM_EN: ["chest", "my heart", "his heart", "her heart"],
    PRED_PAIN_EN: ["pain", "pains", "hurts", "hurting", "aches", "aching", "sore", "painful"],
    PRED_PRESSURE_EN: [
      "pressure", "tight", "tightness", "heavy", "heaviness", "crushing", "squeezing",
      "weight on", "band around",
    ],
    PRED_BURNING_EN: ["burning", "on fire"],
    // A COMPANION COUNTS ONLY WITH A TERM IN THE SAME CLAUSE — §2.1's rule, and the reason the
    // Fires rows below are written as whole sentences and never as the bare companion.
    PRED_COMPANION_EN: [
      "sweating", "cold sweat", "sweaty", "clammy", "dizzy", "nauseous", "nausea",
      "radiating", "down my left arm", "down his left arm", "into my jaw", "between my shoulders",
    ],
    STANDALONE_EN: [
      "chest pain", "chest pains", "heart attack", "pressure in my chest", "cardiac arrest",
      "angina", "myocardial infarction", "crushing chest pain",
      // Franco-Arabic, and ONLY where it is unambiguous on a Latin keyboard: `sadri` is «my
      // chest» and is not an English word, so the phrase cannot mean anything else. A franco
      // spelling that collides with an English word is not in this list at any tier.
      "sadri ye3awerni", "sadri yewja3ni", "waja3 fi sadri", "alam fi sadri",
    ],
  },
  fires: [
    { text: "I have chest pain and I'm sweating", tier: "emergency" },
    { text: "crushing pain in my chest", tier: "emergency" },
    { text: "pain in my chest", tier: "emergency" },
    { text: "my chest hurts", tier: "emergency" },
    { text: "my chest is hurting and I feel sick", tier: "emergency" },
    { text: "tightness in my chest", tier: "emergency" },
    { text: "heaviness in my chest since this morning", tier: "emergency" },
    { text: "my chest feels tight and I'm dizzy", tier: "emergency" },
    { text: "there is pressure on my chest", tier: "emergency" },
    { text: "burning in my chest", tier: "emergency" },
    { text: "chest pains since this morning", tier: "emergency" },
    { text: "my husband has chest pain", tier: "emergency" },
    { text: "my heart hurts and I'm sweating", tier: "emergency" },
    { text: "he is having a heart attack", tier: "emergency" },
    { text: "cardiac arrest", tier: "emergency" },
    { text: "chest pain radiating down my left arm", tier: "emergency" },
    { text: "chest pain going into my jaw", tier: "emergency" },
    { text: "my chest hurts and I have a cold sweat", tier: "emergency" },
    { text: "sadri ye3awerni", tier: "emergency" },
    { text: "waja3 fi sadri", tier: "emergency" },
    // §1.5 R1 IN ENGLISH: a booking frame and the symptom in ONE clause, no punctuation to
    // split on. Class A is HARD, so `BOOKING_FRAME_RE` is never consulted — and the English
    // arm has no booking frame at all, which is the same mechanism stated as an absence.
    { text: "I want an appointment today because my chest hurts and I'm sweating", tier: "emergency" },
    // §11.1's denial-opener row, in English. §1.2: a denial may suppress VOCABULARY, never a
    // SYMPTOM. «I have no other problems but my chest hurts and I'm sweating» is an infarct.
    { text: "I have no other problems but my chest hurts and I'm sweating", tier: "emergency" },
  ],
  nearMiss: [
    { text: "I need a chest x-ray", paired: "pain in my chest" },
    { text: "how much is a chest x ray?", paired: "pain in my chest" },
    { text: "the chest x-ray report is ready?", paired: "pain in my chest" },
    { text: "my chest of drawers is broken", paired: "my chest hurts" },
    { text: "chest clinic appointment please" },
    { text: "heart clinic appointment" },
    { text: "cardiology follow-up" },
    { text: "I need an ECG before the operation" },
    { text: "my heart medication needs a refill" },
    { text: "the report says my heart is fine" },
    { text: "I have high blood pressure and I take pills for it" },
    { text: "work pressure is killing me, I need a day off" },
  ],
  mirror: {
    TERM_EN: {
      per: {
        "chest": ["i need a chest x ray", "how much is a chest scan", "my chest of drawers is broken", "chest clinic appointment please"],
        "my heart": ["my heart check up is due next month", "is my heart clinic appointment confirmed"],
        "his heart": ["his heart medication needs a refill"],
        "her heart": ["her heart check up was normal"],
      },
    },
    PRED_PAIN_EN: {
      per: {
        "pain": ["i have pain in my knee from walking"], "pains": ["growing pains in my sons legs"],
        "hurts": ["my tooth hurts when i chew"], "hurting": ["my back is hurting from sitting at work"],
        "aches": ["my tooth aches after the filling"], "aching": ["my legs are aching after the gym"],
        "sore": ["my throat is sore since yesterday"], "painful": ["the injection site is painful"],
      },
    },
    PRED_PRESSURE_EN: {
      per: {
        "pressure": ["work pressure is killing me", "do you check blood pressure at reception"],
        "tight": ["the appointment schedule is tight this week"],
        "tightness": ["tightness in my calf after running"],
        "heavy": ["the traffic is heavy on the way to the branch"],
        "heaviness": ["heaviness in my legs at the end of the day"],
        "crushing": ["the parking is crushing at 5pm"],
        "squeezing": ["the machine keeps squeezing my arm during the reading"],
        "weight on": ["is there a weight on the file for insurance"],
        "band around": ["they put a band around my arm for the test"],
      },
    },
    PRED_BURNING_EN: {
      per: { "burning": ["burning in my stomach after coffee"], "on fire": ["my throat feels on fire from the flu"] },
    },
    PRED_COMPANION_EN: {
      per: {
        "sweating": ["sweating at the gym is normal right"], "cold sweat": ["the ac gives me a cold sweat"],
        "sweaty": ["my hands are sweaty, is that a thyroid thing"], "clammy": ["the waiting room is clammy today"],
        "dizzy": ["i get dizzy when i stand up too fast"], "nauseous": ["the medicine makes me nauseous"],
        "nausea": ["nausea from the antibiotic, can i change it"],
        "radiating": ["the wifi is not radiating to the second floor"],
        "down my left arm": ["the rash goes down my left arm"],
        "down his left arm": ["the eczema is down his left arm"],
        "into my jaw": ["the filling goes into my jaw area"],
        "between my shoulders": ["i carry the bag between my shoulders"],
      },
    },
    STANDALONE_EN: { onlyFinding: "named cardiac events in English and franco — no benign clinic reading" },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.2 B — STROKE (HARD)
// HIT_EN = STANDALONE_EN ∨ (TERM_EN ∧ FAILURE) ∨ (ONSET ∧ FAILURE_PERSON_ONLY) ∨ SPEECH_LOSS,
//          per clause, minus EXCL_FOLLOWUP (the bare noun arm only) and EXCL_BENIGN.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const STROKE_EN: EnglishArm = {
  sets: {
    TERM_EN: [
      "face", "arm", "arms", "leg", "legs", "hand", "hands", "mouth", "tongue",
      "speech", "words", "one side", "left side", "right side",
    ],
    PRED_FAILURE_EN: [
      "drooping", "droops", "droopy", "cant move", "cannot move", "wont move", "not moving",
      "numb", "numbness", "weak", "weakness", "paralysed", "paralyzed",
      "slurred", "slurring", "crooked", "twisted", "cant feel", "cannot feel", "went limp",
    ],
    PRED_ONSET_EN: ["suddenly", "all of a sudden", "out of nowhere", "just now", "a few minutes ago"],
    // THE ONSET ARM IS SCOPED TO THE PERSON-ONLY FAILURES, exactly as §2.2's Arabic arm is and
    // for exactly the reason the §2.0 L8 mirror found there: «الدور ما يتحرك من ساعة» — the
    // queue hasn't moved for an hour — was a STROKE EMERGENCY. English has the same sentence
    // («the queue is not moving», «the line suddenly stopped moving») and the same answer:
    // a queue can fail to move and a file can be heavy, but nothing administrative slurs its
    // speech or sees double.
    PRED_FAILURE_PERSON_ONLY_EN: [
      "drooping", "slurred", "slurring", "paralysed", "paralyzed", "seeing double",
      "cant feel", "cannot feel", "went limp",
    ],
    STANDALONE_EN: [
      "stroke", "face drooping", "facial droop", "face is drooping", "drooping on one side",
      "slurred speech", "speech is slurred", "weakness on one side", "numbness on one side",
      "one side of his body", "one side of her body", "one side of my body",
      "half his body", "half her body", "sudden loss of vision",
      "lost vision in one eye", "cant see out of one eye", "hemiplegia",
    ],
    // «I CAN'T SPEAK ARABIC» IS THE COMMONEST SENTENCE IN AN EXPATRIATE CLINIC INBOX, and it is
    // the same five words as aphasia. The complement slot is open — Arabic, English, Urdu,
    // Tagalog, Malayalam, and the next language nobody enumerated — so a blacklist of languages
    // is the shape §2.9's T6 struck down. THE RULE IS INVERTED, exactly as T6 inverted rule 2:
    // the phrase fires when it ENDS ITS CLAUSE (an intransitive report — «my father suddenly
    // can't speak») or when its complement is one of the enumerated adverbs below, and every
    // other complement is quiet. Driven, that pair is the whole test:
    //     «my father suddenly cant speak»   FIRES     «i cant speak arabic»   quiet
    INTRANSITIVE_EN: ["cant speak", "cannot speak", "cant talk", "cannot talk", "couldnt speak", "unable to speak", "seeing double"],
    INTRANSITIVE_ADVERB_EN: ["properly", "clearly", "or move", "or walk", "since this morning", "all of a sudden", "suddenly"],
    // AN ARM EXCLUSION, NOT A FRAME (§2.0 L5): a word IN THE MESSAGE saying the event is not
    // current. §2.2's own near-miss table rules «متابعة بعد الجلطة» and «موعد علاج طبيعي بعد
    // الجلطة» quiet, and it gets that for free because bare `جلطة` is not an Arabic term. Bare
    // `stroke` IS an English term — it shipped as one and removing it would take a real stroke
    // report with it — so the follow-up reading is named instead. It scopes the BARE NOUN arm
    // only: a clause carrying a FAST sign fires whatever else is in it.
    EXCL_FOLLOWUP_EN: [
      "rehab", "rehabilitation", "physio", "physiotherapy", "occupational therapy",
      "speech therapy", "post stroke", "after his stroke", "after her stroke",
      "stroke clinic", "stroke unit", "recovering from", "stroke patient", "prevention",
    ],
    EXCL_BENIGN_EN: [
      "from sitting", "from sleeping", "from the way i slept", "from my pillow",
      "from standing", "slept on it", "pins and needles",
    ],
  },
  fires: [
    { text: "his face is drooping", tier: "emergency" },
    { text: "her face is drooping and she can't speak", tier: "emergency" },
    { text: "face drooping on one side", tier: "emergency" },
    { text: "slurred speech", tier: "emergency" },
    { text: "his speech is slurred since an hour ago", tier: "emergency" },
    { text: "he is slurring his words", tier: "emergency" },
    { text: "sudden weakness one side", tier: "emergency" },
    { text: "sudden weakness on one side of his body", tier: "emergency" },
    { text: "my father suddenly can't speak", tier: "emergency" },
    { text: "he can't move his arm", tier: "emergency" },
    { text: "she can't move her leg", tier: "emergency" },
    { text: "my mother's arm went limp suddenly", tier: "emergency" },
    { text: "numbness on one side", tier: "emergency" },
    { text: "his hand is numb and his face is drooping", tier: "emergency" },
    { text: "he is seeing double all of a sudden", tier: "emergency" },
    { text: "sudden loss of vision", tier: "emergency" },
    { text: "my father had a stroke", tier: "emergency" },
    { text: "I think my wife is having a stroke", tier: "emergency" },
    { text: "his mouth is crooked and he can't talk properly", tier: "emergency" },
  ],
  nearMiss: [
    { text: "physio after his stroke", paired: "my father had a stroke" },
    { text: "stroke rehab appointment", paired: "my father had a stroke" },
    { text: "my father is a stroke patient and needs a follow up", paired: "my father had a stroke" },
    { text: "speech therapy for my son", paired: "slurred speech" },
    { text: "I can't speak Arabic, do you have an English doctor?", paired: "my father suddenly can't speak" },
    { text: "I can't talk right now, call me later" },
    { text: "I can't move my appointment to Sunday", paired: "he can't move his arm" },
    { text: "the queue is not moving" },
    { text: "my hand is numb from sleeping on it", paired: "his hand is numb and his face is drooping" },
    { text: "pins and needles in my leg from sitting" },
    { text: "do you have a stroke prevention clinic?" },
  ],
  mirror: {
    TERM_EN: {
      per: {
        "face": ["i want a facial at the derma clinic for my face"],
        "arm": ["they took blood from my arm and it bruised"],
        "arms": ["my arms are tired from carrying the baby"],
        "leg": ["i need a leg x ray after the gym"], "legs": ["my legs ache after the gym"],
        "hand": ["a hand physio appointment please"], "hands": ["my hands are dry in winter"],
        "mouth": ["a mouth ulcer, which clinic do i book"], "tongue": ["white coating on my tongue"],
        "speech": ["speech therapy for my son"], "words": ["the report has words i dont understand"],
        "one side": ["parking is only on one side of the building"],
        "left side": ["the lab is on the left side of reception"],
        "right side": ["the pharmacy is on the right side"],
      },
    },
    PRED_FAILURE_EN: {
      per: {
        "drooping": ["the plant at reception is drooping"], "droops": ["the sign droops over the door"],
        "droopy": ["my eyelid is droopy in photos, is there a cosmetic clinic"],
        "cant move": ["i cant move my appointment to sunday"],
        "cannot move": ["i cannot move the booking, the app refuses"],
        "wont move": ["the queue wont move at all today"], "not moving": ["the queue is not moving"],
        "numb": ["my hand is numb from sleeping on it"], "numbness": ["numbness in my toes from the new shoes"],
        "weak": ["the wifi signal is weak in the waiting room"],
        "weakness": ["general weakness after ramadan, which vitamin test"],
        "paralysed": ["the booking system is paralysed since morning"],
        "paralyzed": ["the phone line is paralyzed, nobody answers"],
        "slurred": ["the recording is slurred, i cant hear the address"],
        "slurring": ["the automated voice is slurring the numbers"],
        "crooked": ["my tooth is crooked, do you do braces"],
        "twisted": ["i twisted my ankle at the gym last month"],
        "cant feel": ["i cant feel any difference after the treatment"],
        "cannot feel": ["i cannot feel the cream working"],
        "went limp": ["the balloon went limp before the party"],
      },
    },
    PRED_ONSET_EN: {
      per: {
        "suddenly": ["the price suddenly changed on the invoice"],
        "all of a sudden": ["all of a sudden the app logged me out"],
        "out of nowhere": ["out of nowhere the appointment disappeared"],
        "just now": ["i called just now and nobody answered"],
        "a few minutes ago": ["i sent the file a few minutes ago"],
      },
    },
    PRED_FAILURE_PERSON_ONLY_EN: {
      per: {
        "drooping": ["the plant at reception is drooping"],
        "slurred": ["the recording is slurred, i cant hear the address"],
        "slurring": ["the automated voice is slurring the numbers"],
        "paralysed": ["the booking system is paralysed since morning"],
        "paralyzed": ["the phone line is paralyzed, nobody answers"],
        "seeing double": ["im seeing double entries for the same booking"],
        "cant feel": ["i cant feel any difference after the treatment"],
        "cannot feel": ["i cannot feel the cream working"],
        "went limp": ["the balloon went limp before the party"],
      },
    },
    STANDALONE_EN: {
      per: {
        "stroke": ["physio after his stroke", "stroke rehab appointment", "do you have a stroke prevention clinic"],
      },
      onlyFindingMembers: [
        "face drooping", "facial droop", "face is drooping", "drooping on one side",
        "slurred speech", "speech is slurred", "weakness on one side", "numbness on one side",
        "one side of his body", "one side of her body", "one side of my body",
        "half his body", "half her body", "sudden loss of vision",
        "lost vision in one eye", "cant see out of one eye", "hemiplegia",
      ],
    },
    INTRANSITIVE_EN: {
      per: {
        "cant speak": ["i cant speak arabic, do you have an english doctor"],
        "cannot speak": ["i cannot speak arabic well, is there a translator"],
        "cant talk": ["i cant talk right now, call me later"],
        "cannot talk": ["i cannot talk at work, please send a message"],
        "couldnt speak": ["i couldnt speak to anyone on the phone yesterday"],
        "unable to speak": ["i was unable to speak to the operator, the line was busy"],
        "seeing double": ["im seeing double entries for the same booking"],
      },
    },
    INTRANSITIVE_ADVERB_EN: {
      per: {
        "properly": ["the app doesnt work properly on my phone"],
        "clearly": ["please write the address clearly"],
        "or move": ["can i cancel or move the booking"],
        "or walk": ["is there parking or walk in only"],
        "since this morning": ["ive been calling since this morning"],
        "all of a sudden": ["all of a sudden the app logged me out"],
        "suddenly": ["the price suddenly changed on the invoice"],
      },
    },
    EXCL_FOLLOWUP_EN: {
      per: {
        "rehab": ["is rehab covered by bupa"], "rehabilitation": ["how much does rehabilitation cost per session"],
        "physio": ["physio after his stroke"], "physiotherapy": ["physiotherapy twice a week please"],
        "occupational therapy": ["occupational therapy for my father"],
        "speech therapy": ["speech therapy for my son"],
        "post stroke": ["post stroke follow up appointment"],
        "after his stroke": ["physio after his stroke"], "after her stroke": ["rehab after her stroke"],
        "stroke clinic": ["is the stroke clinic open on saturday"],
        "stroke unit": ["where is the stroke unit in the building"],
        "recovering from": ["he is recovering from an operation"],
        "stroke patient": ["my father is a stroke patient and needs a follow up"],
        "prevention": ["do you have a stroke prevention clinic"],
      },
    },
    EXCL_BENIGN_EN: {
      per: {
        "from sitting": ["my back hurts from sitting all day"],
        "from sleeping": ["my hand is numb from sleeping on it"],
        "from the way i slept": ["my neck hurts from the way i slept"],
        "from my pillow": ["my neck hurts from my pillow"],
        "from standing": ["my legs ache from standing at work"],
        "slept on it": ["my arm tingles, i slept on it"],
        "pins and needles": ["pins and needles in my leg from sitting"],
      },
    },
  },
};


// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.3 C — HEMORRHAGE (HARD)
// HIT_EN = STANDALONE_EN ∨ (TERM_EN ∧ (VOLUME-adjacent ∨ PERSIST ∨ SITE ∨ SITE_URGENT)),
//          per clause, minus EXCL_RESOLVED. Gum / nose capped at `urgent`; the cap is LIFTED
//          by an extraction or anticoagulant term (§2.3's S1.5-5) and the whole class is not a
//          hit at all when a hygiene term is present.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const HEMORRHAGE_EN: EnglishArm = {
  sets: {
    // THE VERB IS A TERM, the same correction §2.3 made for `ينزف` against `نزيف`: «the wound is
    // bleeding» shares no word with «blood», and a class that enumerates only the noun is deaf
    // to the way a wound is actually reported.
    TERM_EN: ["blood", "bleeding", "bleed", "bleeds", "bled", "hemorrhage", "haemorrhage", "hemorrhaging", "haemorrhaging"],
    // VOLUME IS MATCHED ADJACENT TO THE TERM, NOT ANYWHERE IN THE CLAUSE, and that is a
    // deliberate difference from §2.3's Arabic arm. `بغزاره` and `فوار` mean one thing; `heavy`,
    // `severe` and `a lot of` are among the commonest words in English, and a co-occurrence
    // reading puts them in the same clause as «blood test» all day — «the traffic is heavy and
    // I need a blood test» would be an ambulance. Adjacency is what §2.0 L2 already requires
    // wherever a finding is made of parts, and it is required in BOTH orders here because
    // English writes «heavy bleeding» and «bleeding heavily» with equal frequency.
    PRED_VOLUME_EN: [
      "heavy", "heavily", "a lot", "a lot of", "lots of", "so much", "severe", "severely",
      "soaked", "soaking", "gushing", "pouring", "everywhere", "profuse",
    ],
    PRED_PERSIST_EN: [
      "wont stop", "will not stop", "doesnt stop", "hasnt stopped", "cant stop it",
      "still bleeding", "keeps bleeding", "nonstop", "non stop",
      "for an hour", "for half an hour", "for two hours",
    ],
    SITE_EN: [
      "wound", "cut", "gash", "stabbed", "gunshot", "after the operation", "after surgery",
      "vomiting blood", "throwing up blood", "vomited blood", "threw up blood",
      "coughing up blood", "coughed up blood", "black stool", "black stools", "in my stool",
    ],
    // §2.3's TIER row: a urinary site with no pain and no fever is `urgent`, WITH pain or fever
    // it is `emergency`. «دم مع البول» is on §2.3's Fires list at BOTH tiers (§2.0 L6) and so
    // is its English twin.
    SITE_URGENT_EN: ["in my urine", "in the urine", "when i pee", "when i urinate"],
    STANDALONE_EN: [
      "bleeding wont stop", "vomiting blood", "throwing up blood", "vomited blood",
      "coughing up blood", "black stool", "black stools", "hemorrhage", "haemorrhage",
    ],
    EXCL_RESOLVED_EN: ["stopped bleeding", "bleeding stopped", "bleeding has stopped", "no more bleeding"],
    EXCL_HYGIENE_EN: ["when i brush", "brushing", "toothbrush", "flossing", "brush my teeth", "toothpaste"],
    SITE_CAPPED_EN: ["gums", "gum", "nose", "nosebleed", "nose bleed"],
    CAP_LIFT_EN: ["extraction", "tooth out", "pulled out", "warfarin", "blood thinner", "blood thinners", "aspirin", "plavix", "anticoagulant"],
  },
  fires: [
    { text: "heavy bleeding", tier: "emergency" },
    { text: "she is bleeding heavily", tier: "emergency" },
    { text: "the bleeding won't stop", tier: "emergency" },
    { text: "bleeding won't stop", tier: "emergency" },
    { text: "his cut is still bleeding after an hour", tier: "emergency" },
    { text: "there is a lot of blood", tier: "emergency" },
    { text: "blood everywhere from the wound", tier: "emergency" },
    { text: "the wound is bleeding and it is deep", tier: "emergency" },
    { text: "severe bleeding after the operation", tier: "emergency" },
    { text: "I am vomiting blood", tier: "emergency" },
    { text: "he is throwing up blood", tier: "emergency" },
    { text: "coughing up blood", tier: "emergency" },
    { text: "black stool", tier: "emergency" },
    { text: "the bandage is soaked with blood", tier: "emergency" },
    { text: "the bleeding hasn't stopped for two hours", tier: "emergency" },
    // The urinary site at BOTH tiers, per §2.3's TIER row and §2.0 L6's "mirrored twice, once
    // at each tier" instruction for a conditional Fires entry.
    { text: "blood in my urine", tier: "urgent" },
    { text: "blood in my urine with pain and fever", tier: "emergency" },
    // The gum cap and its lift (S1.5-5). A brushing complaint is not a hit at all; a gum bleed
    // with a volume predicate is capped at `urgent`; an anticoagulated post-extraction bleed is
    // an `emergency` again. §12 row 2 carries the DOAC question to the physician.
    { text: "my gums are bleeding a lot", tier: "urgent" },
    { text: "my gums won't stop bleeding after the extraction", tier: "emergency" },
    { text: "my gums are bleeding heavily and I am on blood thinners", tier: "emergency" },
    { text: "my nose won't stop bleeding", tier: "urgent" },
  ],
  nearMiss: [
    { text: "blood test", paired: "heavy bleeding" },
    { text: "blood work results", paired: "heavy bleeding" },
    { text: "I need a blood test before the appointment", paired: "there is a lot of blood" },
    { text: "when will my blood work be ready?", paired: "heavy bleeding" },
    { text: "what is my blood type?" },
    { text: "do you have a blood donation day?" },
    { text: "do you check blood pressure at reception?" },
    { text: "my gums bleed when I brush my teeth", paired: "my gums are bleeding a lot" },
    { text: "the bleeding has stopped, thank you" },
    { text: "my period started yesterday" },
  ],
  mirror: {
    TERM_EN: {
      per: {
        "blood": ["blood test", "blood work results", "do you check blood pressure at reception"],
        "bleeding": ["the bleeding has stopped, thank you"],
        "bleed": ["my gums bleed when i brush my teeth"],
        "bleeds": ["the printer bleeds ink on the report"],
        "bled": ["the injection site bled a little and stopped"],
        "hemorrhaging": ["the consent form explains hemorrhaging risk"],
        "haemorrhaging": ["the leaflet lists haemorrhaging as a rare side effect"],
      },
      // A PATIENT WHO TYPES «hemorrhage» IS REPORTING ONE. The word has a consent-form reading
      // and that is CLINICIAN language, not inbox language, so there is no ordinary sentence to
      // pair it with — precisely the case §2.0 L8 detail 2 says to annotate rather than
      // fabricate a sentence for. The `-ing` forms are different: they are how a leaflet
      // describes a RISK, and they are paired above.
      onlyFindingMembers: ["hemorrhage", "haemorrhage"],
    },
    PRED_VOLUME_EN: {
      per: {
        "heavy": ["the traffic is heavy on the way"], "heavily": ["it rained heavily this morning"],
        "a lot": ["i waited a lot yesterday"], "a lot of": ["a lot of people in reception today"],
        "lots of": ["lots of paperwork for the insurance"], "so much": ["so much waiting for one report"],
        "severe": ["is there a clinic for severe acne"], "severely": ["the line is severely delayed"],
        "soaked": ["i got soaked in the rain waiting outside"],
        "soaking": ["soaking my feet helps the swelling"],
        "gushing": ["the tap is gushing in the waiting room toilet"],
        "pouring": ["it is pouring outside, can i come later"],
        "everywhere": ["there are queues everywhere today"],
        "profuse": ["profuse apologies for missing the appointment"],
      },
    },
    PRED_PERSIST_EN: {
      per: {
        "wont stop": ["my son wont stop coughing at night"],
        "will not stop": ["the phone will not stop ringing engaged"],
        "doesnt stop": ["the queue doesnt stop growing"],
        "hasnt stopped": ["my daughter hasnt stopped asking about the vaccine"],
        "cant stop it": ["the app keeps logging me out and i cant stop it"],
        "nonstop": ["the phone rings nonstop and nobody answers"],
        "non stop": ["i called non stop for an hour"],
        "for an hour": ["i waited for an hour in reception"],
        "for half an hour": ["the line was busy for half an hour"],
        "for two hours": ["i have been waiting for two hours"],
      },
      // «still bleeding» and «keeps bleeding» CONTAIN the class's own TERM and ARE its own
      // persistence predicate, so no sentence can carry either one without being the finding.
      onlyFindingMembers: ["still bleeding", "keeps bleeding"],
    },
    SITE_EN: {
      per: {
        "wound": ["a wound dressing appointment please"], "cut": ["i cut my finger cooking, do i need a tetanus shot"],
        "gash": ["a small gash on my knee from the gym, does it need a stitch"],
        "stabbed": ["i stabbed my finger with a needle at work, do i need a test"],
        "gunshot": ["do you write a gunshot report for the police"],
        "after the operation": ["a follow up after the operation please"],
        "after surgery": ["physio after surgery, is it covered"],
        "in my stool": ["there is mucus in my stool, which clinic"],
      },
      onlyFindingMembers: [
        "vomiting blood", "throwing up blood", "vomited blood", "threw up blood",
        "coughing up blood", "coughed up blood", "black stool", "black stools",
      ],
    },
    SITE_URGENT_EN: {
      per: {
        "in my urine": ["there is protein in my urine on the report"],
        "in the urine": ["the lab found sugar in the urine"],
        "when i pee": ["it burns when i pee, which clinic do i book"],
        "when i urinate": ["it stings when i urinate, is that an infection"],
      },
    },
    STANDALONE_EN: { onlyFinding: "haematemesis, haemoptysis and melena in English — no benign clinic reading" },
    EXCL_RESOLVED_EN: {
      per: {
        "stopped bleeding": ["it stopped bleeding after ten minutes"],
        "bleeding stopped": ["the bleeding stopped by itself"],
        "bleeding has stopped": ["the bleeding has stopped, thank you"],
        "no more bleeding": ["no more bleeding since yesterday"],
      },
    },
    EXCL_HYGIENE_EN: {
      per: {
        "when i brush": ["my gums bleed when i brush"], "brushing": ["brushing hurts my gums"],
        "toothbrush": ["which toothbrush do you recommend"], "flossing": ["flossing makes my gums sore"],
        "brush my teeth": ["i brush my teeth twice a day"],
        "toothpaste": ["which toothpaste for sensitive teeth"],
      },
    },
    SITE_CAPPED_EN: {
      per: {
        "gums": ["my gums are sore after the cleaning"], "gum": ["is gum disease treated at the dental clinic"],
        "nose": ["a blocked nose for a week, which clinic"], "nosebleed": ["a small nosebleed in dry weather is normal"],
        "nose bleed": ["a small nose bleed in winter, should i worry"],
      },
    },
    CAP_LIFT_EN: {
      per: {
        "extraction": ["how much is an extraction"], "tooth out": ["i want a tooth out, how much"],
        "pulled out": ["the tooth was pulled out last week"],
        "warfarin": ["i take warfarin, do i stop it before the cleaning"],
        "blood thinner": ["i am on a blood thinner, is that a problem for the extraction"],
        "blood thinners": ["do i stop blood thinners before surgery"],
        "aspirin": ["do i take aspirin before the appointment"],
        "plavix": ["i take plavix daily, is the dose on the file"],
        "anticoagulant": ["my anticoagulant needs a refill"],
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.4 D — AIRWAY (HARD)
// ARM 1  inability   ADJ_EN(NEG, [mids], BREATHE)
// ARM 2  difficulty  ADJ_EN(DIFFICULTY, [in|with|to|of|when|his|her|my], BREATHE_NOUN)
//                    minus ADJ_EN(DENIAL_HEAD, [DENIAL_MID], DIFFICULTY)   ← the denial GOVERNS
// ARM 4  part+verb   ADJ_EN(PART, [mids], SWELL ∪ CLOSE) in BOTH orders
// ARM 6  phrases     PHRASE_EN
// HIT_EN = any arm, per clause.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const AIRWAY_EN: EnglishArm = {
  sets: {
    // `stopped` AND `struggling` SIT IN THE NEGATION SET DELIBERATELY. A cessation is the limit
    // case of an inability and «he stopped breathing» is the single most urgent sentence in this
    // file; putting it in the same slot as «cant» is what lets one arm cover «cant breathe»,
    // «isn't breathing», «stopped breathing» and «struggling to breathe» without four rules.
    NEG_EN: [
      "cant", "cannot", "can not", "couldnt", "could not", "not", "isnt", "is not",
      "wont", "will not", "unable", "hardly", "barely", "stopped", "struggling",
    ],
    // THE MIDDLE SLOTS ARE ENUMERATED AND SHORT, and the two that are NOT here are the whole
    // reason: `a` and `the`. With them, «it is not a breathing problem» and «its not the
    // breathing test i booked» — a patient DENYING a breathing complaint and a patient talking
    // about a booking — both become airway emergencies. That is §2.0 L2's co-occurrence failure
    // arriving through the middle slot instead of through the rule, and it is why the phrases
    // that need «a» («cant take a breath») are enumerated in PHRASE_EN instead.
    MID_EN: ["able", "to", "even", "really", "hardly", "barely", "properly", "longer", "seem"],
    BREATHE_EN: ["breathe", "breathing", "breaths"],
    DIFFICULTY_EN: ["difficulty", "difficulties", "trouble", "hard", "struggle", "struggling", "short", "shortness", "labored", "laboured"],
    DIFFICULTY_MID_EN: ["in", "with", "to", "of", "when", "his", "her", "my", "him"],
    BREATHE_NOUN_EN: ["breathing", "breath", "breathe"],
    // ARM 2's DENIAL, and it is not optional. «no difficulty breathing» · «he has no trouble
    // breathing» · «not short of breath» are triage-form English and a co-occurrence reading of
    // ARM 2 hands every one of them an ambulance instruction and a P0 page — the exact pair
    // §2.4 drove in Arabic («ما عندي مشكلة في التنفس»), in the script this file adds.
    DENIAL_HEAD_EN: ["no", "not", "without", "denies", "never", "isnt", "wasnt", "doesnt", "dont", "didnt", "havent", "hasnt"],
    DENIAL_MID_EN: ["any", "a", "the", "he", "she", "has", "have", "had", "is", "was", "having", "got", "much", "real"],
    PART_EN: ["throat", "tongue", "lips", "lip", "face", "eyes"],
    PART_MID_EN: ["is", "are", "has", "started", "getting", "keeps", "all", "really", "very", "so", "in", "his", "her", "my"],
    SWELL_EN: ["swelling", "swollen", "puffed up", "puffing up", "blown up"],
    // `closed` AND `shut` ARE NOT HERE, and that is the §2.0 L8 mirror doing its job before the
    // fact: «the branch is closed», «is the lab closed today», «his eyes are closed» are
    // ordinary sentences and two of them carry a PART. `closing` — the process — is the finding.
    CLOSE_EN: ["closing", "closing up", "closed up", "blocked", "tightening"],
    PHRASE_EN: [
      "choked on", "is choking", "gasping", "gasping for air", "gasping for breath",
      "wheezing badly", "anaphylaxis", "anaphylactic", "throat closing", "throat is closing",
      "cant catch my breath", "cant catch his breath", "cant catch her breath",
      "cant take a breath", "struggling to breathe", "struggling for breath",
      "stopped breathing", "not breathing", "turning blue", "went blue",
      "lips are blue", "blue lips", "lips turned blue",
      "asthma attack", "inhaler isnt working", "inhaler is not working",
      "inhaler didnt help", "inhaler doesnt work", "inhaler not helping",
    ],
    STANDALONE_EN: ["cant breathe", "cannot breathe", "choking", "anaphylaxis", "throat closing"],
    // AN EXCLUSION ABOUT MATERIAL, NOT ABOUT A PLACE, and the difference is load-bearing. A
    // leaflet or a brochure describing a RISK is not a symptom report; a CLASSROOM is, because
    // «my son cant breathe during PE class» is asthma. So `class` and `course` are NOT in this
    // set — only the words that name printed material about a hazard. It scopes the `choking`
    // phrase alone; ARM 1, ARM 2, ARM 4 and ARM 5 never consult it.
    EXCL_HAZARD_EN: ["hazard", "hazards", "leaflet", "brochure", "awareness"],
  },
  fires: [
    { text: "can't breathe", tier: "emergency" },
    { text: "I can't breathe", tier: "emergency" },
    { text: "he can't breathe", tier: "emergency" },
    { text: "she cannot breathe properly", tier: "emergency" },
    { text: "he's not breathing", tier: "emergency" },
    { text: "my baby is not breathing", tier: "emergency" },
    { text: "he stopped breathing", tier: "emergency" },
    { text: "he is barely breathing", tier: "emergency" },
    { text: "I am struggling to breathe", tier: "emergency" },
    { text: "difficulty breathing", tier: "emergency" },
    { text: "she has trouble breathing", tier: "emergency" },
    { text: "trouble with his breathing since last night", tier: "emergency" },
    { text: "it's hard to breathe", tier: "emergency" },
    { text: "shortness of breath", tier: "emergency" },
    { text: "I am short of breath", tier: "emergency" },
    { text: "I can't catch my breath", tier: "emergency" },
    { text: "she's choking", tier: "emergency" },
    { text: "my son is choking", tier: "emergency" },
    { text: "he choked on a piece of apple", tier: "emergency" },
    { text: "gasping for air", tier: "emergency" },
    { text: "his throat is closing", tier: "emergency" },
    { text: "her tongue is swelling", tier: "emergency" },
    { text: "his lips are swollen and he can't breathe", tier: "emergency" },
    { text: "swelling in his throat after the peanut", tier: "emergency" },
    { text: "his face is swelling up", tier: "emergency" },
    { text: "he is turning blue", tier: "emergency" },
    { text: "her lips are blue", tier: "emergency" },
    { text: "anaphylaxis", tier: "emergency" },
    { text: "asthma attack and the inhaler isn't working", tier: "emergency" },
    { text: "the inhaler is not working", tier: "emergency" },
    { text: "I want an appointment but I can't breathe", tier: "emergency" },
  ],
  nearMiss: [
    { text: "breathing exercises class", paired: "difficulty breathing" },
    { text: "do you have a breathing exercises class?", paired: "difficulty breathing" },
    { text: "I need a breathing test, a spirometry", paired: "difficulty breathing" },
    { text: "no difficulty breathing, the doctor checked", paired: "difficulty breathing" },
    { text: "he has no trouble breathing at all", paired: "she has trouble breathing" },
    { text: "not short of breath, just tired" },
    { text: "it's not the breathing test I booked" },
    { text: "it's hard to get an appointment this week", paired: "it's hard to breathe" },
    { text: "I have asthma and I need an inhaler refill", paired: "asthma attack and the inhaler isn't working" },
    { text: "how much is the inhaler?" },
    { text: "the branch is closed on Friday" },
    { text: "is the lab closed today?" },
    { text: "my throat is sore, which clinic?" },
    { text: "I have a short appointment at 4" },
  ],
  mirror: {
    NEG_EN: {
      per: {
        "cant": ["i cant find the branch on the map"], "cannot": ["i cannot open the report link"],
        "can not": ["i can not see the invoice in the app"],
        "couldnt": ["i couldnt reach reception yesterday"],
        "could not": ["i could not park anywhere near the clinic"],
        "not": ["the report is not ready yet"], "isnt": ["the invoice isnt in the app"],
        "is not": ["the doctor is not available on sunday"],
        "wont": ["the app wont accept my insurance card"],
        "will not": ["the pharmacy will not open before nine"],
        "unable": ["i was unable to attend, please reschedule"],
        "hardly": ["i hardly ever get a saturday slot"],
        "barely": ["i barely made it before closing"],
        "stopped": ["the app stopped sending reminders"],
        "struggling": ["im struggling to get through on the phone"],
      },
    },
    MID_EN: {
      per: {
        "able": ["will i be able to park there"], "to": ["i want to book for tomorrow"],
        "even": ["the line doesnt even ring"], "really": ["i really need an early slot"],
        "hardly": ["i hardly ever get a saturday slot"], "barely": ["i barely made it before closing"],
        "properly": ["the app doesnt work properly on my phone"],
        "longer": ["is the wait longer on thursday"], "seem": ["i cant seem to find the invoice"],
      },
    },
    BREATHE_EN: {
      per: {
        "breathe": ["the mask makes it easier to breathe at the gym, is it useful"],
        "breathing": ["do you have a breathing exercises class"],
        "breaths": ["the app counts my breaths during yoga"],
      },
    },
    DIFFICULTY_EN: {
      per: {
        "difficulty": ["i have difficulty finding parking at the branch"],
        "difficulties": ["there are difficulties with my insurance approval"],
        "trouble": ["im having trouble with the booking app"],
        "hard": ["its hard to get an appointment this week"],
        "struggle": ["its a struggle to reach anyone on the phone"],
        "struggling": ["im struggling to get through on the phone"],
        "short": ["i have a short appointment at 4"],
        "shortness": ["is shortness of staff why the wait is long"],
        "labored": ["the report says labored effort during the test"],
        "laboured": ["the physio notes say laboured effort on the treadmill"],
      },
    },
    DIFFICULTY_MID_EN: {
      per: {
        "in": ["is the lab in the same building"], "with": ["can i book with doctor ahmed"],
        "to": ["i want to book for tomorrow"], "of": ["what is the price of the cleaning"],
        "when": ["when does the pharmacy open"], "his": ["his file number is on the card"],
        "her": ["her insurance is with bupa"], "my": ["my appointment is at nine"],
        "him": ["can you send him the report"],
      },
    },
    BREATHE_NOUN_EN: {
      per: {
        "breathing": ["do you have a breathing exercises class"],
        "breath": ["bad breath, which clinic do i book"],
        "breathe": ["the mask makes it easier to breathe at the gym"],
      },
    },
    DENIAL_HEAD_EN: {
      per: {
        "no": ["no answer on the phone all morning"], "not": ["the report is not ready yet"],
        "without": ["can i come without an appointment"], "denies": ["the insurance denies the claim"],
        "never": ["they never called me back"], "isnt": ["the invoice isnt in the app"],
        "wasnt": ["the doctor wasnt there yesterday"], "doesnt": ["the app doesnt show my file"],
        "dont": ["i dont have my insurance card with me"],
        "didnt": ["i didnt get the confirmation message"],
        "havent": ["i havent received the report"], "hasnt": ["the lab hasnt called me"],
      },
    },
    DENIAL_MID_EN: {
      per: {
        "any": ["do you have any slot on friday"], "a": ["i need a report for work"],
        "the": ["the file is under my wifes name"], "he": ["he needs a dentist"],
        "she": ["she has an appointment at two"], "has": ["my son has an appointment"],
        "have": ["do you have parking"], "had": ["i had a booking last week"],
        "is": ["is the branch open"], "was": ["the doctor was very kind"],
        "having": ["im having trouble with the app"], "got": ["i got the reminder message"],
        "much": ["how much is the consultation"], "real": ["is this the real price with vat"],
      },
    },
    PART_EN: {
      per: {
        "throat": ["my throat is sore, which clinic"], "tongue": ["white coating on my tongue"],
        "lips": ["dry lips in winter, which cream"], "lip": ["a cut on my lip from the gym"],
        "face": ["a facial at the derma clinic for my face"],
        "eyes": ["my eyes are dry from the screen"],
      },
    },
    PART_MID_EN: {
      per: {
        "is": ["is the branch open"], "are": ["are you open on friday"], "has": ["my son has an appointment"],
        "started": ["the rash started last week"], "getting": ["im getting the report tomorrow"],
        "keeps": ["the app keeps logging me out"], "all": ["all the slots are full"],
        "really": ["i really need an early slot"], "very": ["the doctor was very kind"],
        "so": ["so many people in reception"], "in": ["is the lab in the same building"],
        "his": ["his file number is on the card"], "her": ["her insurance is with bupa"],
        "my": ["my appointment is at nine"],
      },
    },
    SWELL_EN: {
      per: {
        "swelling": ["swelling in my ankle after the gym, which clinic"],
        "swollen": ["my ankle is swollen from running"],
        "puffed up": ["the cushion is puffed up in the waiting room"],
        "puffing up": ["the mattress keeps puffing up in the heat"],
        "blown up": ["the balloon at the kids corner is blown up"],
      },
    },
    CLOSE_EN: {
      per: {
        "closing": ["what is your closing time on thursday"],
        "closing up": ["are they closing up before maghrib"],
        "closed up": ["the pharmacy closed up early yesterday"],
        "blocked": ["my nose is blocked from a cold, which clinic"],
        "tightening": ["the braces need tightening, can i book"],
      },
    },
    PHRASE_EN: {
      per: {
        "choking": ["is there a choking hazard leaflet for toddlers"],
        "turning blue": ["the bruise is turning blue, is that normal"],
        "went blue": ["the bruise went blue after two days"],
      },
      onlyFindingMembers: [
        "choked on", "is choking", "gasping", "gasping for air", "gasping for breath",
        "wheezing badly", "anaphylaxis", "anaphylactic", "throat closing", "throat is closing",
        "cant catch my breath", "cant catch his breath", "cant catch her breath",
        "cant take a breath", "struggling to breathe", "struggling for breath",
        "stopped breathing", "not breathing", "lips are blue", "blue lips", "lips turned blue",
        "asthma attack", "inhaler isnt working", "inhaler is not working",
        "inhaler didnt help", "inhaler doesnt work", "inhaler not helping",
      ],
    },
    // «choking» IS NOT ONLY-FINDING, and saying so would be the loophole §2.0 L8 detail 2
    // forbids: «is there a choking hazard leaflet for toddlers?» is an ordinary paediatric
    // question. It is quiet by the enumerated hazard exclusion, which scopes THIS arm only.
    STANDALONE_EN: {
      per: { "choking": ["is there a choking hazard leaflet for toddlers"] },
      onlyFindingMembers: ["cant breathe", "cannot breathe", "anaphylaxis", "throat closing"],
    },
    EXCL_HAZARD_EN: {
      per: {
        "hazard": ["is there a choking hazard leaflet for toddlers"],
        "hazards": ["a leaflet about home hazards for toddlers please"],
        "leaflet": ["can you send the leaflet by whatsapp"],
        "brochure": ["is there a brochure about the packages"],
        "awareness": ["do you run an awareness day for schools"],
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.5 E — OBSTETRIC (HARD)
// HIT_EN = STANDALONE_EN ∨ (TERM_EN ∧ (BLEED ∨ MOVE ∨ LABOUR ∨ PREECL ∨ PAIN)), per clause.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const OBSTETRIC_EN: EnglishArm = {
  sets: {
    TERM_EN: ["pregnant", "pregnancy", "trimester", "weeks pregnant", "postpartum", "gave birth", "after delivery"],
    // BARE `blood` IS NOT A BLEEDING PREDICATE HERE, and §2.5's own near-miss table is why.
    // «تحليل حمل» is quiet in Arabic because `حمل` and `حامل` are different words; English has
    // ONE stem, so «I need a blood test to see if I'm pregnant» — a pregnancy test, the highest
    // volume OB message there is — carries the marker and the word `blood` in one clause.
    // Driven: with bare `blood` in this set it fires `obstetric/emergency`. The bleeding
    // predicates are the ones that say blood is COMING OUT.
    PRED_BLEED_EN: ["bleeding", "spotting", "hemorrhaging", "passing clots", "blood clots", "losing blood"],
    PRED_MOVE_EN: ["not moving", "hasnt moved", "stopped moving", "no movement", "cant feel the baby", "not kicking", "hasnt kicked"],
    PRED_LABOUR_EN: ["contractions", "in labour", "in labor", "water broke", "waters broke", "waters have broken"],
    PRED_PREECL_EN: ["severe headache", "blurred vision", "seeing spots", "sudden swelling", "swollen face", "preeclampsia", "pre eclampsia", "eclampsia"],
    PRED_PAIN_EN: ["severe pain", "severe cramps", "bad cramps", "terrible pain", "cramping badly"],
    STANDALONE_EN: [
      "my water broke", "my waters broke", "waters have broken",
      "baby is not moving", "baby not moving", "the baby hasnt moved",
      "preeclampsia", "pre eclampsia", "eclampsia",
    ],
  },
  fires: [
    { text: "I'm pregnant and bleeding", tier: "emergency" },
    { text: "I am pregnant and I am bleeding", tier: "emergency" },
    { text: "bleeding and I'm 30 weeks pregnant", tier: "emergency" },
    { text: "my wife is pregnant and spotting", tier: "emergency" },
    { text: "baby not moving", tier: "emergency" },
    { text: "the baby hasn't moved since yesterday", tier: "emergency" },
    { text: "I can't feel the baby moving and I'm 32 weeks pregnant", tier: "emergency" },
    { text: "my water broke", tier: "emergency" },
    { text: "I'm pregnant and having contractions", tier: "emergency" },
    { text: "I'm pregnant with a severe headache and blurred vision", tier: "emergency" },
    { text: "pre eclampsia", tier: "emergency" },
    { text: "sudden swelling in my hands and I'm pregnant", tier: "emergency" },
    // §2.0 L7's ORDER IS D BEFORE E, and this row records it rather than working around it:
    // facial swelling in a pregnant woman is pre-eclampsia AND angioedema, both `emergency`,
    // both the same rail. What differs is the audit row and which clinician is paged.
    { text: "my face is swollen and I'm 30 weeks pregnant", tier: "emergency", cls: "airway" },
    { text: "severe pain and I'm pregnant", tier: "emergency" },
    { text: "heavy bleeding after delivery", tier: "emergency" },
    { text: "I want a booking today because I'm pregnant and bleeding", tier: "emergency" },
  ],
  nearMiss: [
    { text: "I'm pregnant and I want to book an antenatal appointment", paired: "I'm pregnant and bleeding" },
    { text: "I need a blood test to see if I'm pregnant", paired: "I'm pregnant and bleeding" },
    { text: "pregnancy test price?", paired: "I'm pregnant and bleeding" },
    { text: "my wife is pregnant, we want a scan" },
    { text: "I'm in my second trimester and want to change doctor" },
    { text: "the baby is moving a lot, is that normal?", paired: "baby not moving" },
    { text: "do you do postpartum check-ups?" },
  ],
  mirror: {
    TERM_EN: {
      per: {
        "pregnant": ["im pregnant and i want to book an antenatal appointment"],
        "pregnancy": ["pregnancy test price"],
        "trimester": ["im in my second trimester and want to change doctor"],
        "weeks pregnant": ["im 12 weeks pregnant and want to register for delivery"],
        "postpartum": ["do you do postpartum check ups"],
        "gave birth": ["i gave birth last year at your branch, is the file still open"],
        "after delivery": ["when is the first check up after delivery"],
      },
    },
    PRED_BLEED_EN: {
      per: {
        "bleeding": ["the bleeding has stopped, thank you"],
        "spotting": ["im spotting the difference in the two invoices"],
        "hemorrhaging": ["the consent form explains hemorrhaging risk"],
        "passing clots": ["the leaflet mentions passing clots as a reason to call"],
        "blood clots": ["do you have a clinic for blood clots prevention"],
        "losing blood": ["the donation leaflet says losing blood is safe up to a limit"],
      },
    },
    PRED_MOVE_EN: {
      per: {
        "not moving": ["the queue is not moving"], "hasnt moved": ["my file hasnt moved since last week"],
        "stopped moving": ["the lift stopped moving between floors"],
        "no movement": ["there is no movement on my insurance approval"],
        "not kicking": ["the vending machine is not kicking out the change"],
        "hasnt kicked": ["the discount hasnt kicked in on the invoice"],
      },
      onlyFindingMembers: ["cant feel the baby"],
    },
    PRED_LABOUR_EN: {
      onlyFindingMembers: ["contractions", "in labour", "in labor", "water broke", "waters broke", "waters have broken"],
    },
    PRED_PREECL_EN: {
      per: {
        "severe headache": ["a severe headache for three days, which clinic do i book"],
        "blurred vision": ["blurred vision when i read, do you have an optometrist"],
        "seeing spots": ["im seeing spots on the scan image, is that dust"],
        "sudden swelling": ["sudden swelling in my ankle after the gym"],
      },
      // «a swollen face after the dental extraction» is an ordinary clinic sentence and it
      // FIRES — on §2.4's part-and-swelling arm, not on this one, exactly as its Arabic twin
      // «وجهي منتفخ» does. It is an ACCEPTED OVER-FIRE carried in MUST_FIRE with its reason
      // (§11.1) rather than hidden here, because the exclusion that would close it («after the
      // extraction») is one letter away from «after the injection», and facial swelling after
      // an injection is anaphylaxis.
      onlyFindingMembers: ["preeclampsia", "pre eclampsia", "eclampsia", "swollen face"],
    },
    PRED_PAIN_EN: {
      per: {
        "severe pain": ["severe pain in my tooth, is there an emergency dentist"],
        "severe cramps": ["severe cramps in my calf at night"],
        "bad cramps": ["bad cramps after the gym, which clinic"],
        "terrible pain": ["terrible pain in my ear since the flight"],
        "cramping badly": ["my leg is cramping badly at night"],
      },
    },
    STANDALONE_EN: { onlyFinding: "obstetric emergencies in English — rupture of membranes, absent fetal movement, eclampsia" },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.6 F — INFANT FEVER (HARD)
// HIT_EN = REDFLAG ∨ (TERM_EN ∧ (INFANT ∨ CHILD ∨ PERSIST ∨ value ≥ 38.0 ∨ age < 3 months)),
//          per clause, minus EXCL_NOT_BODY / EXCL_PAST / EXCL_RESOLVED, tiered by AGE.
//
// THE AGE IS READ, AND THAT IS THE DIFFERENCE FROM §2.6's ARABIC ARM. §2.6 puts «age < 3 months»
// at the centre of the class and the Arabic detector substitutes a WORD LIST for it — `رضيع`,
// `عمره شهرين`. An English-speaking parent writes the number: «she is 6 weeks», «36 days old»,
// «3 months». `ageInMonthsEn` reads it and the tier table below uses it, which is the only place
// in this file where an English rule is STRONGER than its Arabic twin rather than equal to it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const INFANT_FEVER_EN: EnglishArm = {
  sets: {
    TERM_EN: ["fever", "fevers", "temperature", "temp", "feverish", "burning up", "high temp"],
    // `unresponsive` · `lethargic` · `floppy` NEED A PERSON, and this is §2.6's `خامل` finding in
    // English: «the clinic is unresponsive», «the app is unresponsive», «the line is unresponsive»
    // are ordinary complaints, and a one-word red flag whose other reading is administrative
    // fires only with a person anchor or beside a second red flag. Every way a parent actually
    // writes it has one.
    PRED_REDFLAG_EN: [
      "seizure", "seizures", "convulsion", "convulsions", "had a fit",
      "wont wake up", "will not wake up", "cant wake him", "cant wake her", "cant wake him up",
      "not waking up", "unresponsive", "lethargic", "floppy",
      "not feeding", "wont feed", "refusing to feed", "wont drink", "refusing the bottle",
      "not taking the bottle", "not drinking anything",
      "rash that doesnt fade", "rash doesnt fade", "doesnt fade when i press", "non blanching",
      "stiff neck", "neck is stiff", "purple spots", "spots that dont fade",
      "the light hurts his eyes", "the light hurts her eyes", "screams from the light",
      "screaming from the light",
    ],
    // A STIFF NECK IS MENINGISM IN A CHILD AND A PILLOW IN AN ADULT, and the tell is the cause
    // the writer names — §2.2's benign-cause exclusion in a second class (§2.0 L5). A parent
    // reporting meningism does not attribute it to the way they slept.
    EXCL_BENIGN_NECK_EN: ["from the pillow", "from my pillow", "from the way i slept", "from sleeping", "from sitting", "from the gym", "from the ac", "from work"],
    PRED_REDFLAG_NEEDS_PERSON_EN: ["unresponsive", "lethargic", "floppy"],
    PRED_INFANT_EN: ["baby", "babies", "newborn", "new born", "infant", "neonate", "preemie"],
    PRED_CHILD_EN: ["my son", "my daughter", "my child", "my kid", "my boy", "my girl", "son", "daughter", "child", "children", "kid", "kids", "toddler"],
    PRED_PERSIST_EN: ["wont come down", "wont go down", "doesnt come down", "not coming down", "hasnt come down", "not going down", "keeps coming back"],
    EXCL_NOT_BODY_EN: ["weather", "room", "the ac", "air conditioner", "air conditioning", "oven", "outside", "the water", "the car", "the fridge"],
    // AN EXPLICIT PAST-TIME MARKER IS AN ARM EXCLUSION, NOT A FRAME (§2.0 L5), and it is the
    // English shape of §2.7's `قبل اسبوع`. «my son had a fever last month, he's fine now, I want
    // a check-up» splits into three clauses and the RESOLUTION is in the third, so a
    // clause-scoped resolution veto cannot reach the first — the first has to be quiet on its
    // own, and what makes it quiet is the month in it. Nothing shorter than a week is here:
    // «he had a fever yesterday» is a current illness and it fires.
    EXCL_PAST_EN: ["last month", "last week", "last year", "a month ago", "a week ago", "weeks ago", "months ago", "two weeks ago", "in ramadan"],
    EXCL_CHRONIC_EN: ["for months", "for weeks", "for the past month", "on and off", "chronic", "every month"],
    EXCL_RESOLVED_EN: ["fine now", "got better", "recovered", "cleared up", "gone now", "no fever now", "back to normal"],
  },
  fires: [
    { text: "my baby has a fever", tier: "emergency" },
    { text: "my baby has a fever and won't wake up", tier: "emergency" },
    { text: "newborn fever", tier: "emergency" },
    { text: "my newborn has a temperature of 38.5", tier: "emergency" },
    { text: "my baby is 6 weeks and has a fever", tier: "emergency" },
    { text: "she is 36 days old and has a fever", tier: "emergency" },
    { text: "my 2 month old has a fever of 39", tier: "emergency" },
    { text: "my baby's temperature is 102 F", tier: "emergency" },
    { text: "my baby has a temperature of 103 degrees", tier: "emergency" },
    { text: "he had a seizure", tier: "emergency" },
    { text: "my son had a seizure last night", tier: "emergency" },
    { text: "he had a fit and a high fever", tier: "emergency" },
    { text: "won't wake up", tier: "emergency" },
    { text: "my daughter won't wake up", tier: "emergency" },
    { text: "I can't wake him up", tier: "emergency" },
    { text: "my baby is not feeding", tier: "emergency" },
    { text: "he is refusing to feed and he is hot", tier: "emergency" },
    { text: "a rash that doesn't fade when I press it", tier: "emergency" },
    { text: "my son has purple spots and a stiff neck", tier: "emergency" },
    { text: "my baby is floppy and not feeding", tier: "emergency" },
    { text: "my child is lethargic and burning up", tier: "emergency" },
    { text: "my daughter is 9 and has a fever of 39", tier: "urgent" },
    { text: "my son is 2 years old and has a fever", tier: "urgent" },
    { text: "my son's fever won't come down", tier: "urgent" },
    { text: "her temperature is 102.5F", tier: "urgent" },
    { text: "I need an appointment today because my baby has a fever and is not feeding", tier: "emergency" },
  ],
  nearMiss: [
    { text: "my son had a fever last month, he's fine now, I want a check-up", paired: "my baby has a fever" },
    { text: "post-vaccine fever in my 4-year-old", paired: "my baby has a fever" },
    { text: "my son is 9 and needs a dentist", paired: "my daughter is 9 and has a fever of 39" },
    { text: "the room temperature is 39 in the waiting area", paired: "my baby has a fever" },
    { text: "the weather is 43 outside" },
    { text: "his temperature is 37 and he is fine" },
    { text: "my baby needs a vaccination appointment" },
    { text: "my daughter is 9 and needs braces" },
    { text: "the clinic is unresponsive on the phone", paired: "my baby is floppy and not feeding" },
    { text: "the app is unresponsive since the update" },
    { text: "my baby has a rash on his arm" },
  ],
  mirror: {
    TERM_EN: {
      per: {
        "fever": ["post vaccine fever in my 4 year old", "my son had a fever last month"],
        "fevers": ["are recurring fevers checked at the paediatric clinic"],
        "temperature": ["the room temperature is 39 in the waiting area"],
        "temp": ["what is the room temp in the waiting area"],
        "feverish": ["the leaflet explains what feverish means"],
        "burning up": ["the oven is burning up the food, is that a hazard question for you"],
        "high temp": ["is a high temp normal after the vaccine, per the leaflet"],
      },
    },
    PRED_REDFLAG_EN: {
      per: {
        "unresponsive": ["the clinic is unresponsive on the phone", "the app is unresponsive since the update"],
        "floppy": ["the floppy disk in the old file cabinet, do you still keep records like that"],
        "stiff neck": ["a stiff neck from the pillow, which clinic"],
        "neck is stiff": ["my neck is stiff from the way i slept"],
      },
      onlyFindingMembers: [
        "seizure", "seizures", "convulsion", "convulsions", "had a fit",
        "wont wake up", "will not wake up", "cant wake him", "cant wake her", "cant wake him up",
        "not waking up", "lethargic", "not feeding", "wont feed", "refusing to feed",
        "wont drink", "refusing the bottle", "not taking the bottle", "not drinking anything",
        "rash that doesnt fade", "rash doesnt fade", "doesnt fade when i press", "non blanching",
        "purple spots", "spots that dont fade",
        "the light hurts his eyes", "the light hurts her eyes", "screams from the light",
        "screaming from the light",
      ],
    },
    EXCL_BENIGN_NECK_EN: {
      per: {
        "from the pillow": ["a stiff neck from the pillow, which clinic"],
        "from my pillow": ["my neck hurts from my pillow"],
        "from the way i slept": ["my neck is stiff from the way i slept"],
        "from sleeping": ["my hand is numb from sleeping on it"],
        "from sitting": ["my back hurts from sitting all day"],
        "from the gym": ["my shoulder aches from the gym"],
        "from the ac": ["my neck is sore from the ac at work"],
        "from work": ["my back is tired from work"],
      },
    },
    PRED_REDFLAG_NEEDS_PERSON_EN: {
      per: {
        "unresponsive": ["the clinic is unresponsive on the phone"],
        "lethargic": ["the booking system is lethargic today"],
        "floppy": ["the floppy disk in the old cabinet, do you still keep records like that"],
      },
    },
    PRED_INFANT_EN: {
      per: {
        "baby": ["my baby needs a vaccination appointment"], "babies": ["do you have a well babies clinic"],
        "newborn": ["a newborn hearing test, do you do it"], "new born": ["a new born screening appointment please"],
        "infant": ["is the infant vaccine schedule on your website"],
        "neonate": ["does the neonate clinic take walk ins"],
        "preemie": ["my preemie needs a follow up with the paediatrician"],
      },
    },
    PRED_CHILD_EN: {
      per: {
        "my son": ["my son is 9 and needs a dentist"], "my daughter": ["my daughter is 9 and needs braces"],
        "my child": ["my child needs a school medical report"], "my kid": ["my kid lost his insurance card"],
        "my boy": ["my boy has a football injury check up next week"],
        "my girl": ["my girl needs the school vaccination form"],
        "son": ["my son is 9 and needs a dentist"], "daughter": ["my daughter is 9 and needs braces"],
        "child": ["is there a child dentist on saturday"],
        "children": ["is the children's clinic on the first floor"],
        "kid": ["is there a kid friendly waiting area"],
        "kids": ["the kids play area is closed today"],
        "toddler": ["a toddler check up appointment please"],
      },
    },
    PRED_PERSIST_EN: {
      per: {
        "wont come down": ["the price wont come down even with insurance"],
        "wont go down": ["the swelling on the invoice total wont go down"],
        "doesnt come down": ["the lift doesnt come down to the basement"],
        "not coming down": ["the doctor is not coming down to reception"],
        "hasnt come down": ["the report hasnt come down from the lab yet"],
        "not going down": ["the queue number is not going down"],
        "keeps coming back": ["the error keeps coming back in the app"],
      },
    },
    EXCL_NOT_BODY_EN: {
      per: {
        "weather": ["the weather is 43 outside"], "room": ["the room temperature is 39 in the waiting area"],
        "the ac": ["the ac in the waiting room is too cold"],
        "air conditioner": ["the air conditioner is dripping in reception"],
        "air conditioning": ["is the air conditioning fixed in the lab"],
        "oven": ["the oven at home is 200, not related, sorry"],
        "outside": ["it is 43 outside, can i wait in the car"],
        "the water": ["the water cooler is empty"], "the car": ["the car is hot, i will wait inside"],
        "the fridge": ["the fridge for the insulin, do you have one"],
      },
    },
    EXCL_PAST_EN: {
      per: {
        "last month": ["i booked last month and never got a call"],
        "last week": ["i came last week for the blood test"],
        "last year": ["my file was opened last year"],
        "a month ago": ["i paid a month ago, where is the receipt"],
        "a week ago": ["the report was promised a week ago"],
        "weeks ago": ["i sent the insurance approval weeks ago"],
        "months ago": ["i registered months ago"],
        "two weeks ago": ["i had the cleaning two weeks ago"],
        "in ramadan": ["are the hours different in ramadan"],
      },
    },
    EXCL_CHRONIC_EN: {
      per: {
        "for months": ["ive been waiting for months for this approval"],
        "for weeks": ["the app has been down for weeks"],
        "for the past month": ["for the past month nobody answers the phone"],
        "on and off": ["the line has been on and off all day"],
        "chronic": ["do you have a chronic disease programme"],
        "every month": ["i come every month for the injection"],
      },
    },
    EXCL_RESOLVED_EN: {
      per: {
        "fine now": ["he is fine now, i want a routine check up"],
        "got better": ["she got better after the antibiotic"],
        "recovered": ["he recovered fully, thank you"],
        "cleared up": ["the rash cleared up with the cream"],
        "gone now": ["the cough is gone now"],
        "no fever now": ["no fever now, just a check up"],
        "back to normal": ["everything is back to normal, thank you"],
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.7 G — POISONING (HARD)
// HIT_EN = STANDALONE_EN ∨ ADJ_EN(VERB, [≤2 tokens], OBJECT), per clause, minus the
//          medication-taking exclusion (T3) and downgraded by EXCL_PAST.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const POISONING_EN: EnglishArm = {
  sets: {
    VERB_SWALLOW_EN: ["swallowed", "swallows", "drank"],
    VERB_TAKE_EN: ["took", "taken", "taking", "take", "ate", "eaten"],
    VERB_MID_EN: ["a", "an", "the", "some", "his", "her", "my", "their", "one", "two", "half"],
    SITE_POISON_EN: [
      "bleach", "detergent", "chlorine", "dettol", "pesticide", "insecticide", "petrol",
      "gasoline", "kerosene", "battery", "batteries", "button battery", "coin", "poison",
      "rat poison", "drain cleaner", "acid", "paint thinner", "nail polish remover",
    ],
    SITE_MEDICATION_EN: ["pills", "pill", "tablets", "tablet", "medicine", "medication", "medicines", "meds", "syrup", "drops"],
    // T3 IN ENGLISH, AND IT IS THE SAME DEFECT WORD FOR WORD. «I took my medicine this morning»
    // is what a chronic patient types every day of their life; a TAKE verb with a medication
    // object and NO quantity or ownership qualifier is not an ingestion event. SWALLOW verbs are
    // unaffected — «my daughter swallowed pills» fires with no qualifier at all, because
    // SWALLOWING pills is alarming on its own and TAKING them is a prescription being followed.
    QUALIFIER_EN: [
      "too many", "a lot of", "lots of", "whole bottle", "the whole box", "all the", "handful",
      "a box of", "overdose", "by mistake", "by accident", "his mother", "her mother",
      "my mother", "his sister", "her brother", "the wrong", "double dose", "twice the dose",
    ],
    STANDALONE_EN: [
      "overdose", "overdosed", "took too many pills", "swallowed pills", "swallowed a battery",
      "swallowed a button battery", "drank bleach", "food poisoning", "poisoning", "poisoned",
    ],
    EXCL_PAST_EN: ["last week", "a week ago", "last month", "days ago", "two days ago", "yesterday"],
  },
  fires: [
    { text: "my son swallowed bleach", tier: "emergency" },
    { text: "he swallowed a button battery", tier: "emergency" },
    { text: "my daughter swallowed a coin", tier: "emergency" },
    { text: "swallowed pills", tier: "emergency" },
    { text: "she swallowed her mother's pills", tier: "emergency" },
    { text: "he drank detergent", tier: "emergency" },
    { text: "my son drank kerosene", tier: "emergency" },
    { text: "took too many pills", tier: "emergency" },
    { text: "he took too many tablets", tier: "emergency" },
    { text: "overdose", tier: "emergency" },
    { text: "I think he overdosed", tier: "emergency" },
    { text: "he took the wrong medicine by mistake", tier: "emergency" },
    { text: "she ate a whole bottle of syrup", tier: "emergency" },
    { text: "my son took his mother's tablets", tier: "emergency" },
    { text: "poisoning", tier: "emergency" },
    { text: "I want an emergency appointment because my son swallowed bleach", tier: "emergency" },
    { text: "food poisoning last week", tier: "urgent" },
  ],
  nearMiss: [
    { text: "I took my medicine this morning", paired: "swallowed pills" },
    { text: "I take my medicine after food, is that right?", paired: "he took too many tablets" },
    { text: "he took the tablets at the right time, thank God", paired: "my son took his mother's tablets" },
    { text: "I forgot to take my medicine yesterday" },
    { text: "when do I take the syrup?" },
    { text: "the prescription has three medicines on it" },
    { text: "I take pills for blood pressure" },
    { text: "do you have this medication in stock?" },
    { text: "I need a refill for my daughter's drops" },
  ],
  mirror: {
    VERB_SWALLOW_EN: {
      per: {
        "swallowed": ["i swallowed my food the wrong way and coughed, is that a clinic thing"],
        "swallows": ["the machine swallows my card at the payment kiosk"],
        "drank": ["i drank water before the fasting blood test, does it count"],
      },
    },
    VERB_TAKE_EN: {
      per: {
        "took": ["i took my medicine this morning"], "taken": ["i have taken my medicine already"],
        "taking": ["i am taking my medicine after food"], "take": ["i take pills for blood pressure"],
        "ate": ["i ate before the blood test by mistake"], "eaten": ["i have eaten, can i still do the test"],
      },
    },
    VERB_MID_EN: {
      per: {
        "a": ["i need a report for work"], "an": ["can i get an earlier slot"],
        "the": ["the file is under my wifes name"], "some": ["i need some advice about the insurance"],
        "his": ["his file number is on the card"], "her": ["her insurance is with bupa"],
        "my": ["my appointment is at nine"], "their": ["their insurance covers dental"],
        "one": ["one slot on saturday please"], "two": ["two appointments on the same day"],
        "half": ["half the price was covered last time"],
      },
    },
    SITE_POISON_EN: {
      per: {
        "bleach": ["do you sell bleach free mouthwash"], "detergent": ["is the detergent allergy test available"],
        "chlorine": ["my eyes sting from chlorine at the pool, which clinic"],
        "dettol": ["do you recommend dettol for the wound dressing"],
        "pesticide": ["is there a pesticide exposure test"],
        "insecticide": ["the building is spraying insecticide, is the clinic open"],
        "petrol": ["the petrol station next to the branch, is that the right landmark"],
        "gasoline": ["is the gasoline smell in the parking normal"],
        "kerosene": ["do you test for kerosene exposure at work"],
        "battery": ["the hearing aid battery, do you sell it"],
        "batteries": ["do you sell hearing aid batteries"],
        "button battery": ["is there a button battery warning leaflet for parents"],
        "coin": ["is there a coin operated locker at reception"],
        "poison": ["is there a poison control number on the leaflet"],
        "rat poison": ["the building used rat poison, should i worry about the smell"],
        "drain cleaner": ["the drain cleaner smell in the toilet is strong"],
        "acid": ["do you do acid reflux tests"], "paint thinner": ["the paint thinner smell in the corridor"],
        "nail polish remover": ["does the beauty clinic use nail polish remover with acetone"],
      },
    },
    SITE_MEDICATION_EN: {
      per: {
        "pills": ["i take pills for blood pressure"], "pill": ["is the pill available at your pharmacy"],
        "tablets": ["he took the tablets at the right time, thank god"],
        "tablet": ["one tablet after food, correct"],
        "medicine": ["i took my medicine this morning"],
        "medication": ["do you have this medication in stock"],
        "medicines": ["the prescription has three medicines on it"],
        "meds": ["my meds are finished, i need a refill"],
        "syrup": ["when do i take the syrup"],
        "drops": ["i need a refill for my daughters drops"],
      },
    },
    QUALIFIER_EN: {
      per: {
        "too many": ["there are too many people in reception"],
        "a lot of": ["a lot of paperwork for the insurance"],
        "lots of": ["lots of missed calls from your number"],
        "whole bottle": ["do you sell the whole bottle or a sample"],
        "the whole box": ["is the whole box covered by insurance"],
        "all the": ["all the slots are full this week"],
        "handful": ["a handful of forms to fill at reception"],
        "a box of": ["a box of gloves, do you sell them"],
        "by mistake": ["i booked the wrong branch by mistake"],
        "by accident": ["i cancelled by accident, can you restore it"],
        "his mother": ["his mother file is the one with the insurance"],
        "her mother": ["her mother name is on the booking"],
        "my mother": ["my mother appointment is at ten"],
        "his sister": ["his sister has the same file number"],
        "her brother": ["her brother is booked after her"],
        "the wrong": ["i went to the wrong branch"],
        "double dose": ["is a double dose covered by insurance"],
        "twice the dose": ["the leaflet says twice the dose for adults"],
      },
      onlyFindingMembers: ["overdose"],
    },
    STANDALONE_EN: { onlyFinding: "ingestion events in English — overdose, swallowed poison, a swallowed battery" },
    EXCL_PAST_EN: {
      per: {
        "last week": ["i came last week for the blood test"], "a week ago": ["the report was promised a week ago"],
        "last month": ["i booked last month and never got a call"],
        "days ago": ["i sent the approval days ago"],
        "two days ago": ["i called two days ago about the invoice"],
        "yesterday": ["i missed my appointment yesterday"],
      },
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.8 H — TRAUMA (HARD) — PHRASES ONLY, DELIBERATELY, and the English homographs are worse
// than the Arabic ones. `accident` is the ER department's own name in English — «Accident and
// Emergency» — which is §2.8's «الطوارئ والحوادث» trap in the language it was borrowed from.
// `fell` is «fell behind on my payments» and «the price fell». `burn` is «fat burning». Bare
// `fracture` is a booking noun («my fracture follow-up»). None of the four is a term here, and
// there is no recall net worth the false positives.
// HIT_EN = STANDALONE_EN, per clause.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const TRAUMA_EN: EnglishArm = {
  sets: {
    STANDALONE_EN: [
      "car accident", "car crash", "road accident", "traffic accident", "hit by a car",
      "run over", "ran over", "fell down the stairs", "fell off the stairs",
      "fell from the stairs", "fell down the steps", "fell from the balcony", "fell off the roof",
      "fell and hit his head", "fell and hit her head", "fell and hit my head",
      "fell on his head", "fell on her head", "hit his head", "hit her head",
      "banged his head", "banged her head", "knocked out", "lost consciousness",
      "passed out", "unconscious", "bone is sticking out", "bone sticking out",
      "open fracture", "compound fracture", "severe burn", "bad burn", "boiling water on",
      "scalded", "cant put weight on his leg", "cant put weight on her leg",
    ],
  },
  fires: [
    { text: "car accident", tier: "emergency" },
    { text: "we had a car accident", tier: "emergency" },
    { text: "my son was hit by a car", tier: "emergency" },
    { text: "he fell down the stairs", tier: "emergency" },
    { text: "he fell and hit his head", tier: "emergency" },
    { text: "my daughter fell and hit her head and is vomiting", tier: "emergency" },
    { text: "he hit his head and he is vomiting", tier: "emergency" },
    { text: "she banged her head on the table", tier: "emergency" },
    { text: "he was knocked out for a minute", tier: "emergency" },
    { text: "he lost consciousness", tier: "emergency" },
    { text: "my father is unconscious", tier: "emergency" },
    { text: "I passed out at work", tier: "emergency" },
    { text: "the bone is sticking out", tier: "emergency" },
    { text: "open fracture", tier: "emergency" },
    { text: "a severe burn on his arm", tier: "emergency" },
    { text: "boiling water on her leg", tier: "emergency" },
    { text: "he can't put weight on his leg after the fall", tier: "emergency" },
    { text: "I need an appointment now because he fell down the stairs", tier: "emergency" },
  ],
  nearMiss: [
    { text: "where is accident and emergency?", paired: "car accident" },
    { text: "what time does accident and emergency open?", paired: "we had a car accident" },
    { text: "I need an accident report for the insurance", paired: "car accident" },
    { text: "I fell behind on my payments", paired: "he fell down the stairs" },
    { text: "the price fell last month" },
    { text: "do you have a fat burning programme?", paired: "a severe burn on his arm" },
    { text: "burn cream, do you sell it?" },
    { text: "my fracture follow-up appointment", paired: "open fracture" },
    { text: "he had a fall last week and needs an x-ray" },
  ],
  mirror: {
    STANDALONE_EN: { onlyFinding: "high-energy trauma phrases in English — no benign clinic reading, which is why the class is phrases only" },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §2.9 I — SELF-HARM (HARD, EXACT MATCH ONLY)
//
// §1.3: this is the ONE class where the over-fire cost is itself a safety cost — a grieving or
// joking patient handed a crisis rail is harmed by the interaction and learns to stop talking to
// us. So the English arm is STANDALONE PHRASES AND NOTHING ELSE. There is no composition, no
// term × predicate, and NO BARE DEATH VERB AT ANY TIER.
//
// THAT DESIGN IS T6, RE-DERIVED FOR ENGLISH RATHER THAN TRANSLATED. §2.9's `أموت على X` had to
// become a whitelist because the complement slot is open — the vocabulary of things a Saudi
// loves is not closable. English death talk is worse: «killing me», «dying to», «to die for»,
// «dead tired», «kill for», «I could murder a coffee» are all idioms of ENTHUSIASM, ANNOYANCE or
// FATIGUE, and the slot after them is open too. A blacklist would have to enumerate them; a
// whitelist of life objects would have to enumerate the other side. Neither closes. The English
// answer is that no bare verb is ever a term, so every one of those sentences is quiet BECAUSE
// NOTHING MATCHES — not because a veto caught it. The enumerated exclusions below exist only for
// the handful of idioms that contain a WHOLE ENUMERATED PHRASE («I could kill myself for
// forgetting the appointment»), which is a closed compound and not an open slot.
//
// HIT_EN = STANDALONE_EN, per clause, minus IDIOM_EXCL, ACCIDENT_EXCL and BEREAVEMENT.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const SELF_HARM_EN: EnglishArm = {
  sets: {
    STANDALONE_EN: [
      "i want to die", "want to kill myself", "kill myself", "kill my self",
      "thinking of killing myself", "thinking about killing myself",
      "end my life", "ending my life", "end it all", "take my own life", "taking my own life",
      "commit suicide",
      "suicidal", "suicidal thoughts", "self harm", "harming myself",
      "cut myself", "cutting myself",
      "i dont want to live", "dont want to live anymore", "no reason to live",
      "no point in living", "better off dead", "i want to disappear", "wish i was dead",
      // Franco-Arabic, unambiguous on a Latin keyboard and already shipped in two forms.
      "3ayez amoot", "abi amoot", "widi amoot", "wedi amoot",
    ],
    // THE MODAL-REGRET IDIOM. «I could kill myself for forgetting the appointment» is
    // self-reproach and it contains the enumerated phrase whole, so nothing else can catch it.
    // A closed compound — a modal plus the phrase — which is the shape §2.9 says IS enumerable.
    IDIOM_EXCL_EN: [
      "could kill myself", "could just kill myself", "could have killed myself",
      "killing me", "killing time", "dying to", "dying for", "to die for", "dead tired",
      "kill for", "died laughing", "dying of boredom", "dying of hunger", "im dying to",
    ],
    // THE ACT PHRASES ARE AMBIGUOUS IN ENGLISH IN A WAY THEY ARE NOT IN ARABIC. «I cut myself
    // shaving» and «I cut myself cooking» are injury reports, and this class cannot afford to
    // read one as ideation. An enumerated accident term IN THE MESSAGE (§2.0 L5) scopes the
    // `cut myself` arm only; everything else in STANDALONE_EN never consults it.
    ACCIDENT_EXCL_EN: ["shaving", "cooking", "with a knife", "by accident", "accidentally", "on the door", "at the gym", "playing", "at work"],
    // Rule 4 — bereavement SUPPRESSES the class and routes to `human_handoff` with
    // `reason: bereavement`, so a person still sees it. Firing a suicide rail at a grieving
    // patient cancelling an appointment is the single most damaging false positive in §2.
    BEREAVEMENT_EN: [
      "passed away", "rest in peace", "condolences", "he died", "she died", "my father died",
      "my mother died", "funeral", "the deceased", "allah yerhamo", "allah yerhamha",
    ],
  },
  fires: [
    { text: "I want to kill myself", tier: "emergency" },
    { text: "I want to die", tier: "emergency" },
    { text: "I want to end my life", tier: "emergency" },
    { text: "end my life", tier: "emergency" },
    { text: "I am thinking of ending my life", tier: "emergency" },
    { text: "I want to end it all", tier: "emergency" },
    { text: "I am thinking about taking my own life", tier: "emergency" },
    { text: "I am thinking of killing myself", tier: "emergency" },
    {
      text: "is there a self harm awareness leaflet for schools?", tier: "emergency",
      acceptedOverFire:
        "A school-liaison question raises the crisis rail. The exclusion that would close it — " +
        "an enumerated material word in the clause — has the same shape as «I'm suicidal, is " +
        "there a programme I can join?», which is a person in crisis asking for help. §1.3 " +
        "makes class I the one class where a false positive is itself a safety cost AND the " +
        "one class where under-firing is death; §12 row 5 owns the trade.",
    },
    { text: "I want to commit suicide", tier: "emergency" },
    { text: "I have suicidal thoughts", tier: "emergency" },
    { text: "I have been cutting myself", tier: "emergency" },
    { text: "I cut myself again last night", tier: "emergency" },
    { text: "I don't want to live anymore", tier: "emergency" },
    { text: "there is no reason to live", tier: "emergency" },
    { text: "everyone would be better off dead without me", tier: "emergency" },
    { text: "I want to disappear", tier: "emergency" },
    { text: "abi amoot", tier: "emergency" },
    { text: "widi amoot", tier: "emergency" },
  ],
  nearMiss: [
    { text: "killing time in the waiting room", paired: "I want to kill myself" },
    { text: "I'm dying to get an appointment", paired: "I want to die" },
    { text: "this headache is killing me", paired: "I want to kill myself" },
    { text: "the waiting is killing me", paired: "I want to die" },
    { text: "I could kill myself for forgetting the appointment", paired: "I want to kill myself" },
    { text: "your coffee is to die for" },
    { text: "I'm dead tired after work" },
    { text: "I'm killing myself trying to reach your call centre", paired: "I am thinking of killing myself" },
    { text: "I could kill for an earlier slot" },
    { text: "I cut myself shaving, do I need a tetanus shot?", paired: "I cut myself again last night" },
    { text: "I cut myself cooking last night", paired: "I have been cutting myself" },
    { text: "please cancel the appointment, my father died yesterday, may God have mercy on him", paired: "I want to die" },
    { text: "we are at the funeral, please move the booking" },
  ],
  mirror: {
    STANDALONE_EN: {
      per: {
        "kill myself": ["i could kill myself for forgetting the appointment"],
        "cut myself": ["i cut myself shaving, do i need a tetanus shot"],
        "cutting myself": ["i keep cutting myself shaving, which razor do you recommend"],
      },
      // «self harm» AND «i want to die» ARE ANNOTATED, AND THAT IS THE ONE PLACE THIS FILE
      // REFUSES AN EXCLUSION. «Is there a self-harm awareness leaflet for schools?» is an
      // ordinary sentence and it FIRES; the exclusion that would close it — an enumerated
      // material word in the clause — has the same shape as «I'm suicidal, is there a programme
      // I can join?», which is a person in crisis ASKING FOR HELP. §1.3 makes this the one
      // class where a false positive is itself a safety cost, and also the one class where
      // under-firing is death. The leaflet question is carried as an ACCEPTED OVER-FIRE in
      // MUST_FIRE (§11.1) with its reason attached, and no exclusion is written.
      onlyFindingMembers: [
        "want to kill myself", "kill my self", "i want to die", "self harm",
        "thinking of killing myself", "thinking about killing myself",
        "end my life", "ending my life", "end it all", "take my own life", "taking my own life",
        "commit suicide", "suicidal", "suicidal thoughts", "harming myself",
        "i dont want to live", "dont want to live anymore", "no reason to live",
        "no point in living", "better off dead", "i want to disappear", "wish i was dead",
        "3ayez amoot", "abi amoot", "widi amoot", "wedi amoot",
      ],
    },
    IDIOM_EXCL_EN: {
      per: {
        "could kill myself": ["i could kill myself for forgetting the appointment"],
        "could just kill myself": ["i could just kill myself for missing the slot"],
        "could have killed myself": ["i could have killed myself when i saw the invoice"],
        "killing me": ["this headache is killing me"], "killing time": ["killing time in the waiting room"],
        "dying to": ["im dying to get an appointment"], "dying for": ["im dying for a coffee"],
        "to die for": ["your coffee is to die for"], "dead tired": ["im dead tired after work"],
        "kill for": ["i could kill for an earlier slot"],
        "died laughing": ["i died laughing at the hold music"],
        "dying of boredom": ["im dying of boredom in the waiting room"],
        "dying of hunger": ["im dying of hunger, is the fasting over"],
        "im dying to": ["im dying to finish this paperwork"],
      },
    },
    ACCIDENT_EXCL_EN: {
      per: {
        "shaving": ["i cut myself shaving"], "cooking": ["i burnt my hand cooking"],
        "with a knife": ["i nicked my finger with a knife in the kitchen"],
        "by accident": ["i cancelled by accident"], "accidentally": ["i accidentally booked the wrong branch"],
        "on the door": ["i banged my elbow on the door"], "at the gym": ["i pulled a muscle at the gym"],
        "playing": ["he twisted his ankle playing football"], "at work": ["i hurt my back at work"],
      },
    },
    BEREAVEMENT_EN: {
      per: {
        "passed away": ["my grandfather passed away, please cancel his appointment"],
        "rest in peace": ["may he rest in peace, please close the file"],
        "condolences": ["thank you for the condolences message"],
        "he died": ["he died last month, please remove the reminders"],
        "she died": ["she died in ramadan, please close her file"],
        "my father died": ["my father died yesterday, please cancel the booking"],
        "my mother died": ["my mother died last week, cancel her follow up"],
        "funeral": ["we are at the funeral, please move the booking"],
        "the deceased": ["the deceased file needs closing, what do you need from me"],
        "allah yerhamo": ["allah yerhamo, please cancel his appointment"],
        "allah yerhamha": ["allah yerhamha, close the file please"],
      },
    },
  },
};
