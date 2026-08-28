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
    // These were EGYPTIAN. `start` was byte-identical to the Egyptian line above it —
    // «مش هنكمل … غير لما … وهرجعلك» — and `newAllergy` had been half-converted, leaving
    // «لسه» behind. A Saudi customer declaring an allergy was answered in Cairene.
    start: "في حساسية هنا — ما نكمّل الطلب لين أتأكد من المطبخ، وبرجع لك على طول 🙏",
    newAllergy: "أضفت ملاحظة الحساسية هذي — والطلب موقّف لين أتأكد من المطبخ، وبرجع لك على طول 🙏",
  },
};

// The THREE rotating hold templates (founder-authored, escalate-always posture).
// Rotation is deterministic by hold count — see calmHoldingReply. No template may
// promise an immediate HUMAN reply or state opening hours.
//
// THESE WERE NOT DIALECT-BRANCHED AT ALL. calmHoldingReply accepted a `dialect`
// argument and ignored it, so every Saudi tenant received the Egyptian templates
// verbatim — «تمام يا فندم»، «لسه»، «لحد»، «هيتواصل»، «هيرد»، «مش هيتأكد»، «حابب».
//
// «يا فندم» is the single word khalid.ts:376 names as forbidden — "MSA/Egyptian
// officialese, not Saudi service voice" — and it was shipping on an ALLERGY SAFETY
// HOLD, the highest-stakes message this module sends.
//
// The Saudi variants also drop the 🙏 that T1 and T2 carried: khalid.ts:378 allows at
// most one emoji and NONE on a serious apology or a real safety message.
const CALM_HOLD_TEMPLATES: Record<CalmDialect, { t1: string; t2: string; t3: string; phoneLine: (p: string) => string }> = {
  egyptian: {
    t1: "تمام يا فندم 🙏 عشان سلامتك، في موضوع الحساسية لازم حد من الفريق يتأكد بنفسه. حوّلت المحادثة للفريق وهيتواصل معاك أول ما يكون متاح.",
    t2: "لسه محوّل طلبك لحد من الفريق يراجع موضوع الحساسية — أول ما حد يبقى متاح هيرد عليك هنا فورًا. شكرًا لصبرك 🙏",
    t3: "طلبك محفوظ ومش هيتأكد غير بعد مراجعة الفريق لموضوع الحساسية.",
    phoneLine: (p) => `لو حابب تتواصل مباشرة: ${p}`,
  },
  saudi: {
    t1: "تمام، عشان سلامتك موضوع الحساسية لازم أحد من الفريق يتأكد منه بنفسه. حوّلت المحادثة للفريق ويتواصلون معك أول ما يكونون متاحين.",
    t2: "لين الحين طلبك محوّل لأحد من الفريق يراجع موضوع الحساسية — أول ما أحد يكون متاح يرد عليك هنا على طول. شكراً لصبرك.",
    t3: "طلبك محفوظ وما يتأكد إلا بعد ما يراجع الفريق موضوع الحساسية.",
    phoneLine: (p) => `لو تحب تتواصل مباشرة: ${p}`,
  },
};

// T3 renders the branch's stored display phone as an OPTIONAL direct-contact line.
// If the phone is absent, the line is omitted cleanly (no placeholder, no fake number).
function calmHoldTemplate3(d: CalmDialect, branchPhone: string | null | undefined): string {
  const base = CALM_HOLD_TEMPLATES[d].t3;
  const phone = String(branchPhone ?? "").trim();
  return phone ? `${base}\n${CALM_HOLD_TEMPLATES[d].phoneLine(phone)}` : base;
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
  // The `dialect` argument was accepted and then discarded — that is the bug.
  const d = calmDialect(dialect);
  if (idx === 0) return CALM_HOLD_TEMPLATES[d].t1;
  if (idx === 1) return CALM_HOLD_TEMPLATES[d].t2;
  return calmHoldTemplate3(d, branchPhone);
}

export function calmNewAllergyReply(dialect: string | null | undefined): string {
  return ALLERGY_CALM_HOLD_COPY[calmDialect(dialect)].newAllergy;
}
