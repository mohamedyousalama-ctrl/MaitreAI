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

/** Alternation source (not a RegExp) so each caller can anchor it its own way. */
export const FRAME_WORDS =
  // «فيه»/«فيها» MEAN BOTH "he has" AND "in it", so they only count with a PERSON in front.
  // «ابني فيه طفح» is a father reporting his son; «الجو فيه كتمة» is a remark about the room,
  // and with the bare form in this list it read as a chest.
  "(?:ابني|بنتي|ولدي|بنته|ابنه|زوجتي|زوجي|امي|ابوي|الوالده|الوالد|الطفل|الطفله|البيبي|" +
  "اخوي|اختي|صاحبي|صاحبتي|رفيجي|جوزي|مرتي)\\s+(?:فيه|فيها|فيهم|عنده|عندها|عندهم)|" +
  "عندي|عندك|عنده|عندها|عندهم|فيني|جاني|جاله|جالها|جالي|جاتني|جاته|جاتها|جتني|" +
  "بيجيني|بيجيلي|يجيني|يجيلي|بتجيني|تجيني|" +
  "صار\\s*(?:لي|له|لها|لهم)|طلع\\s*(?:لي|له|لها|لهم)|ظهر\\s*(?:لي|له|لها|لهم)|طالع\\s*(?:لي|له|لها)|" +
  "احس\\s*ب?|حاسس\\s*ب?|حاس\\s*ب?|حسيت\\s*ب?|" +
  "اشكي\\s*من|يشكي\\s*من|تشكي\\s*من|اعاني\\s*من|يعاني\\s*من|تعاني\\s*من";

/** Places. A frame with one of these beside it is about the ROOM: «الجو فيه كتمة» is not a
 *  person reporting their chest, and «أحس بالجو كتمه» puts the place between the two. */
export const NOT_A_PERSON =
  "الجو|المحل|المطعم|المكان|القاعه|الغرفه|الفرن|الشارع|السياره";
