// ============================================================================
// MaitreAI — deterministic allergy calm-hold copy (PURE).
//
// Used only behind allergy_calm_hold. These are fixed Arabic string-table replies:
// no LLM, no reassurance, no safety certification, no moralizing.
//
// WO escalate-mode (text only): the repeating HOLD reply now rotates across THREE
// deterministic templates by the count of holds already sent in this conversation
// (no model call, no randomness). None promises an immediate HUMAN reply or states
// opening hours — the old «هرجعلك على طول» falsely implied an instant response at
// night. The start/new-allergy templates and all hold-state logic are UNCHANGED.
// ============================================================================

type CalmDialect = "egyptian" | "saudi";

export const ALLERGY_CALM_HOLD_COPY: Record<CalmDialect, {
  start: string;
  newAllergy: string;
}> = {
  egyptian: {
    start: "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏",
    newAllergy: "أضفت ملاحظة الحساسية دي — والطلب لسه موقف لحد ما أتأكد من المطبخ، وهرجعلك على طول 🙏",
  },
  saudi: {
    start: "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏",
    newAllergy: "أضفت ملاحظة الحساسية هذه — والطلب لسه موقف لين أتأكد من المطبخ، وبرجع لك على طول 🙏",
  },
};

// The THREE rotating hold templates (founder-authored, escalate-always posture).
// Rotation is deterministic by hold count — see calmHoldingReply. No template may
// promise an immediate HUMAN reply or state opening hours.
const CALM_HOLD_TEMPLATE_1 =
  "تمام يا فندم 🙏 عشان سلامتك، في موضوع الحساسية لازم حد من الفريق يتأكد بنفسه. حوّلت المحادثة للفريق وهيتواصل معاك أول ما يكون متاح.";
const CALM_HOLD_TEMPLATE_2 =
  "لسه محوّل طلبك لحد من الفريق يراجع موضوع الحساسية — أول ما حد يبقى متاح هيرد عليك هنا فورًا. شكرًا لصبرك 🙏";
// T3 renders the branch's stored display phone as an OPTIONAL direct-contact line.
// If the phone is absent, the line is omitted cleanly (no placeholder, no fake number).
const CALM_HOLD_TEMPLATE_3_BASE =
  "طلبك محفوظ ومش هيتأكد غير بعد مراجعة الفريق لموضوع الحساسية.";

function calmHoldTemplate3(branchPhone: string | null | undefined): string {
  const phone = String(branchPhone ?? "").trim();
  return phone
    ? `${CALM_HOLD_TEMPLATE_3_BASE}\nلو حابب تتواصل مباشرة: ${phone}`
    : CALM_HOLD_TEMPLATE_3_BASE;
}

function calmDialect(dialect: string | null | undefined): CalmDialect {
  return dialect === "saudi" ? "saudi" : "egyptian";
}

export function calmHoldReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].start;
}

/** Rotating HOLD reply. `holdCount` = number of holds already sent in this
 *  conversation; the reply cycles T1→T2→T3→T1… deterministically (no randomness,
 *  no model call). `branchPhone` is the restaurant's stored display phone — used
 *  only by T3, and omitted cleanly when absent. */
export function calmHoldingReply(
  dialect: string | null | undefined,
  holdCount: number = 0,
  branchPhone: string | null | undefined = null
): string {
  const n = Number.isFinite(holdCount) ? Math.trunc(holdCount) : 0;
  const idx = ((n % 3) + 3) % 3;
  if (idx === 0) return CALM_HOLD_TEMPLATE_1;
  if (idx === 1) return CALM_HOLD_TEMPLATE_2;
  return calmHoldTemplate3(branchPhone);
}

export function calmNewAllergyReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].newAllergy;
}
