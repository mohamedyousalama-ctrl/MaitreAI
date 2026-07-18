// ============================================================================
// MaitreAI — deterministic allergy calm-hold copy (PURE).
//
// Used only behind allergy_calm_hold. These are fixed Arabic string-table replies:
// no LLM, no reassurance, no safety certification, no moralizing.
// ============================================================================

type CalmDialect = "egyptian" | "saudi";

export const ALLERGY_CALM_HOLD_COPY: Record<CalmDialect, {
  start: string;
  holding: string;
  newAllergy: string;
}> = {
  egyptian: {
    start: "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏",
    holding: "لسه موقف الطلب لحد ما أتأكد من المطبخ، وهرجعلك على طول 🙏",
    newAllergy: "أضفت ملاحظة الحساسية دي — والطلب لسه موقف لحد ما أتأكد من المطبخ، وهرجعلك على طول 🙏",
  },
  saudi: {
    start: "في حساسية هنا — مش هنكمل الطلب غير لما أتأكد من المطبخ، وهرجعلك على طول 🙏",
    holding: "لسه موقف الطلب لين أتأكد من المطبخ، وبرجع لك على طول 🙏",
    newAllergy: "أضفت ملاحظة الحساسية هذه — والطلب لسه موقف لين أتأكد من المطبخ، وبرجع لك على طول 🙏",
  },
};

function calmDialect(dialect: string | null | undefined): CalmDialect {
  return dialect === "saudi" ? "saudi" : "egyptian";
}

export function calmHoldReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].start;
}

export function calmHoldingReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].holding;
}

export function calmNewAllergyReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].newAllergy;
}
