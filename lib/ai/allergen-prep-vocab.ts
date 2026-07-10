// ============================================================================
// MaitreAI — Preparation / cross-contact controlled vocabulary (WO-COMPANION W2)
// PURE, no I/O. The axis-2 counterpart to allergen-vocab.ts: the ONLY tokens that
// may be stored in menu_items.cross_contact_risks / prep_status / kitchen_can_isolate.
// Editor + gated change-request + staff-command validate against these; anything
// off-list is rejected so the DB never holds a free-text prep token.
//
// Spec §2 verbatim: cross_contact_risks tags [shared_fryer, shared_grill,
// shared_oil, shared_utensils, shared_prep_area, garnish_risk, sauce_risk,
// supplier_may_contain]; prep_status controlled|shared_risk|unknown;
// kitchen_can_isolate yes|no|unknown.
// ============================================================================

// --- cross-contact risk tags ------------------------------------------------
export const CROSS_CONTACT_TAGS = [
  "shared_fryer",
  "shared_grill",
  "shared_oil",
  "shared_utensils",
  "shared_prep_area",
  "garnish_risk",
  "sauce_risk",
  "supplier_may_contain",
] as const;
export type CrossContactTag = (typeof CROSS_CONTACT_TAGS)[number];

const CROSS_CONTACT_LABEL_AR: Record<CrossContactTag, string> = {
  shared_fryer: "قلاية مشتركة",
  shared_grill: "شواية مشتركة",
  shared_oil: "زيت مشترك",
  shared_utensils: "أدوات مشتركة",
  shared_prep_area: "منطقة تحضير مشتركة",
  garnish_risk: "احتمال من الزينة/التقديم",
  sauce_risk: "احتمال من الصوص",
  supplier_may_contain: "المورّد يذكر «قد يحتوي»",
};

// --- prep_status ------------------------------------------------------------
export const PREP_STATUSES = ["controlled", "shared_risk", "unknown"] as const;
export type PrepStatusValue = (typeof PREP_STATUSES)[number];

const PREP_STATUS_LABEL_AR: Record<PrepStatusValue, string> = {
  controlled: "تحضير مضبوط/معزول",
  shared_risk: "مشترك — فيه احتمال تلامس",
  unknown: "غير مؤكّد",
};

// --- kitchen_can_isolate ----------------------------------------------------
export const ISOLATE_VALUES = ["yes", "no", "unknown"] as const;
export type KitchenCanIsolate = (typeof ISOLATE_VALUES)[number];

const ISOLATE_LABEL_AR: Record<KitchenCanIsolate, string> = {
  yes: "نعم، يقدر يعزل",
  no: "لا يقدر يعزل",
  unknown: "غير مؤكّد",
};

// --- validators (the server-side write guard) -------------------------------
export function isValidCrossContactTag(v: unknown): v is CrossContactTag {
  return typeof v === "string" && (CROSS_CONTACT_TAGS as readonly string[]).includes(v);
}
export function isValidPrepStatus(v: unknown): v is PrepStatusValue {
  return typeof v === "string" && (PREP_STATUSES as readonly string[]).includes(v);
}
export function isValidKitchenCanIsolate(v: unknown): v is KitchenCanIsolate {
  return typeof v === "string" && (ISOLATE_VALUES as readonly string[]).includes(v);
}

/** Filter a raw array down to the valid, de-duplicated cross-contact tags (order
 *  preserved). Anything off-vocab is dropped — the DB never stores a bad token. */
export function sanitizeCrossContactTags(raw: unknown): CrossContactTag[] {
  if (!Array.isArray(raw)) return [];
  const out: CrossContactTag[] = [];
  for (const v of raw) if (isValidCrossContactTag(v) && !out.includes(v)) out.push(v);
  return out;
}

// --- Arabic labels (for the editor + any operator surface) ------------------
export function crossContactLabelAr(tag: string): string {
  return isValidCrossContactTag(tag) ? CROSS_CONTACT_LABEL_AR[tag] : tag;
}
export function prepStatusLabelAr(status: string | null | undefined): string {
  return status && isValidPrepStatus(status) ? PREP_STATUS_LABEL_AR[status] : PREP_STATUS_LABEL_AR.unknown;
}
export function kitchenCanIsolateLabelAr(v: string | null | undefined): string {
  return v && isValidKitchenCanIsolate(v) ? ISOLATE_LABEL_AR[v] : ISOLATE_LABEL_AR.unknown;
}
