// ============================================================================
// MaitreAI — HOW ARABIC REPORTS A SYMPTOM, in one place.
//
// WHY THIS FILE EXISTS: TWO COPIES DRIFTED APART AND THE GAP WAS A DEAF SPOT.
//
// `allergen-context.ts` and `allergen-gate-symptoms.ts` each grew their own list of "the
// frame someone reports a symptom in". They were written a commit apart, and by the time an
// audit drove them they disagreed: the context file had «جاتني»، «أعاني من»، the symptom
// file had «بيجيني»، «يجيني»، and only one of them had been widened past the first person.
//
// The result was «ابني عنده طفح بعد ما أكل الكيك» — a parent reporting a child's rash after
// eating — heard by one detector and not the other, which on the live path means the hold
// depends on which arm happens to see it. `respond-and-send.ts` reads the SYMPTOM hit to set
// `emergency`/`staffNotified`, so the two are not interchangeable downstream.
//
// BOTH PERSONS, DELIBERATELY. First person is how you report your own body; third person is
// how a parent reports a child's, and that is the case this gate's ancestor was built for.
// ============================================================================

/** WHO the message is about, when it is not the sender. Split out of `FRAME_WORDS` because a
 *  SECOND caller needs the people without the frames: `allergen-emergency.ts` reads «ابني نفسه
 *  ضايق», where the person is the only thing separating a child's airway from «الطلب نفسه واقف»
 *  ("the order itself is stalled") — «نفسه» is both "his breath" and "itself". Exported rather
 *  than copied, because a copied list is how this file came to exist. */
// THE LIST WAS THE PEOPLE A SENDER NAMES BY RELATION, AND A PARENT IN A HURRY DOES NOT.
// «ابني» was here and «الولد» was not, so «الولد يختنق» — *the boy is choking*, and the most
// urgent sentence in the file — reached nothing, while «الولد ما يقدر يتنفس» fired, because
// THAT family carries no person anchor at all. The gap was the GATE, not the vocabulary: the
// signal that most needs a person to disambiguate it («اختنق» is also what traffic does) was
// the one gated on the shortest list. Gulf «الجاهل»/«الياهل» (a small child), «الصغير» and the
// plurals «عيالي»/«اولادي» are the same omission, and «البنت» is «الولد»'s pair.
// Longest first, so «الطفله» is not eaten by «الطفل».
export const PERSON_WORDS =
  "ابني|ابنتي|بنتي|ولدي|بنته|ابنه|زوجتي|زوجي|امي|ابوي|الوالده|الوالد|الطفله|الطفل|البيبي|" +
  "اخوي|اختي|صاحبي|صاحبتي|رفيجي|جوزي|مرتي|" +
  "الولد|البنت|الصغيره|الصغير|الجاهل|الياهل|الطفلة|عيالي|عيالنا|اولادي|ولدنا|بنتنا";

/** Alternation source (not a RegExp) so each caller can anchor it its own way. */
export const FRAME_WORDS =
  // «فيه»/«فيها» MEAN BOTH "he has" AND "in it", so they only count with a PERSON in front.
  // «ابني فيه طفح» is a father reporting his son; «الجو فيه كتمة» is a remark about the room,
  // and with the bare form in this list it read as a chest.
  "(?:" + PERSON_WORDS + ")\\s+(?:فيه|فيها|فيهم|عنده|عندها|عندهم)|" +
  "عندي|عندك|عنده|عندها|عندهم|فيني|جاني|جاله|جالها|جالي|جاتني|جاته|جاتها|جتني|" +
  "بيجيني|بيجيلي|يجيني|يجيلي|بتجيني|تجيني|" +
  "صار\\s*(?:لي|له|لها|لهم)|طلع\\s*(?:لي|له|لها|لهم)|ظهر\\s*(?:لي|له|لها|لهم)|طالع\\s*(?:لي|له|لها)|" +
  "احس\\s*ب?|حاسس\\s*ب?|حاس\\s*ب?|حسيت\\s*ب?|" +
  "اشكي\\s*من|يشكي\\s*من|تشكي\\s*من|اعاني\\s*من|يعاني\\s*من|تعاني\\s*من";

/** Places. A frame with one of these beside it is about the ROOM: «الجو فيه كتمة» is not a
 *  person reporting their chest, and «أحس بالجو كتمه» puts the place between the two. */
export const NOT_A_PERSON =
  "الجو|المحل|المطعم|المكان|القاعه|الغرفه|الفرن|الشارع|السياره";
