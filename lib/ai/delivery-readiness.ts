// ============================================================================
// MaitreAI — WO-LEAKGUARD (PART B): address completeness is a DETERMINISTIC flow.
//
// PURE (no I/O, no model calls). Production, DB-proven (Wesaya, 22:07): a delivery
// order captured only the ZONE («التعاون هرم») — no street address — yet the flow
// invited confirmation, finalize then failed, and its INTERNAL validator string
// leaked to the customer. The fix makes delivery readiness a CODE fact, not a model
// judgement:
//
//   • A delivery order is finalize-ready ONLY when it has BOTH a resolved zone AND
//     a written street-level address (the draft's `address` field).
//   • A zone-only capture makes the NEXT deterministic pending question the FROZEN
//     address ask (rendered by the ask-back machinery as the turn's single question).
//   • The recap CTA («أجهّزلك الطلب؟») is suppressed while any finalize-required field
//     is missing — the CTA must never invite confirmation of an unfinalizable draft.
//   • finalize_draft failures map to FROZEN customer-safe lines (never raw validator
//     text): missing address → the address ask; empty draft → an honest line; a stale
//     draft version → re-recap; an unknown failure → the Part A register fallback.
//
// The frozen customer-safe lines here are shared by the assembler's Part A fallback
// and the finalize failure mapping, so a customer only ever sees vetted text.
// ============================================================================

import type { OrderDraft } from "./tools";

const isSaudi = (d: string) => d === "saudi";

// --- frozen customer-safe lines ---------------------------------------------

/** The FROZEN address-detail ask, the single deterministic question after a
 *  zone-only delivery capture. Egyptian is the WO-specified verbatim string.
 *
 *  THE SAUDI BRANCH WAS EGYPTIAN. It said «ابعت لي» — the Egyptian/Levantine imperative
 *  of «بعت» — and differed from the Egyptian branch only by un-fusing «ابعتلي» into two
 *  words. A Riyadh speaker says «أرسل لي» or «اكتب لي». Observed live on production, on
 *  the najd demo tenant, in this exact turn.
 *
 *  It was diagnosed once as model drift and it is not: it is this hardcoded string. The
 *  diagnosis came from a truncated grep, and enabling address_flow_v2 is what made it
 *  fire. The Egyptian branch is unchanged and still correct for an Egyptian tenant. */
export function frozenAddressAsk(dialect: string): string {
  return isSaudi(dialect)
    ? "تمام 👌 اكتب لي العنوان بالتفصيل — الشارع ورقم العمارة وعلامة مميزة"
    : "تمام 👌 ابعتلي العنوان بالتفصيل — الشارع ورقم العمارة وعلامة مميزة";
}

/** A frozen "give me a second to sort your order" holding line — used when a draft
 *  is open but no specific pending question is known. Carries no internal text. */
export function frozenDraftHoldingLine(dialect: string): string {
  return isSaudi(dialect)
    ? "ثانية معك بس أظبط طلبك 🙏"
    : "ثواني معايا بس أظبط طلبك 🙏";
}

/** A frozen honest line for an empty draft / nothing to finalize. */
export function frozenEmptyDraftLine(dialect: string): string {
  return isSaudi(dialect)
    ? "ما عندي طلب مفتوح الحين 🙏 وش تحب تطلب؟"
    : "مفيش طلب مفتوح دلوقتي 🙏 تحب تطلب إيه؟";
}

/** A generic frozen honest line — the last-resort fallback (no draft, no pending). */
export function frozenGenericLine(dialect: string): string {
  return isSaudi(dialect)
    ? "ثانية معك 🙏"
    : "ثواني معايا 🙏";
}

/** A frozen safety-neutral deflection template. Used when the register guard blocks a
 *  SAFETY turn's text: the fallback must PRESERVE the safety content (defer to the
 *  kitchen/team, never certify) rather than substitute a cheerful order line. */
export function frozenSafetyDeflection(dialect: string): string {
  return isSaudi(dialect)
    ? "صحتك تهمنا 🙏 خلّني أتأكد لك من فريق المطبخ قبل ما نكمل."
    : "صحتك تهمنا 🙏 خليني أتأكدلك من فريق المطبخ قبل ما نكمل.";
}

// --- delivery readiness (pure predicates) -----------------------------------

/** True when the delivery draft carries a resolved zone — either the persisted
 *  zone-of-truth (WO-STATE-TRUTH) or the legacy deliveryZone the pricer reads. */
export function deliveryZoneResolved(draft: OrderDraft): boolean {
  const persisted = draft.zone?.zoneName;
  return (typeof persisted === "string" && persisted.trim().length > 0) ||
    (typeof draft.deliveryZone === "string" && draft.deliveryZone.trim().length > 0);
}

/** True when the delivery draft carries written street-level address text. */
export function deliveryStreetAddressPresent(draft: OrderDraft): boolean {
  return typeof draft.address === "string" && draft.address.trim().length > 0;
}

/** The finalize-required delivery fields still missing on the draft, in ask order.
 *  Only meaningful for a delivery draft (pickup requires neither). */
export function deliveryMissingFields(draft: OrderDraft): Array<"zone" | "address"> {
  if (draft.fulfillment !== "delivery") return [];
  const missing: Array<"zone" | "address"> = [];
  if (!deliveryZoneResolved(draft)) missing.push("zone");
  if (!deliveryStreetAddressPresent(draft)) missing.push("address");
  return missing;
}

/** True when a delivery draft has a resolved zone but NO street address yet — the
 *  zone-only capture that must trigger the frozen address ask (and block confirm). */
export function needsStreetAddress(draft: OrderDraft): boolean {
  return draft.fulfillment === "delivery" && deliveryZoneResolved(draft) && !deliveryStreetAddressPresent(draft);
}

/** True when a finalize-required field is missing on a DELIVERY draft, so the recap
 *  CTA must be suppressed (never invite confirmation of an unfinalizable draft).
 *  Pickup/unset-fulfillment are out of scope here (handled by their own flows). */
export function finalizeRequiredFieldMissing(draft: OrderDraft): boolean {
  return deliveryMissingFields(draft).length > 0;
}

// --- finalize failure mapping (deterministic, frozen) -----------------------

export type FinalizeFailureKind =
  | "empty_draft"
  | "no_fulfillment"
  | "missing_address"
  | "stale_version"
  | "delivery_notice" // a customer-safe graceful delivery notice (below-min / invalid zone)
  | "unknown";

/** Classify a finalize_draft refusal from the DRAFT STATE (never by parsing the
 *  Arabic content), so the mapping is deterministic and locale-agnostic. The tool's
 *  graceful delivery notices (below-min / invalid zone) are already customer-safe and
 *  are recognized so they pass through unchanged. `staleVersion` is threaded when the
 *  caller detected an optimistic-version mismatch (re-recap the current draft). */
export function classifyFinalizeFailure(
  draft: OrderDraft,
  opts: { toolContent?: string; staleVersion?: boolean } = {}
): FinalizeFailureKind {
  if (opts.staleVersion) return "stale_version";
  if (!draft.lines.length) return "empty_draft";
  if (!draft.fulfillment) return "no_fulfillment";
  if (draft.fulfillment === "delivery" && !deliveryStreetAddressPresent(draft)) return "missing_address";
  const content = opts.toolContent ?? "";
  // The tool's own graceful, data-sourced delivery notices are customer-safe.
  if (/الحد الأدنى|مش ضمن مناطق التوصيل|بتتبع فرع تاني/u.test(content)) return "delivery_notice";
  return "unknown";
}

/** The FROZEN customer-safe reply for a known finalize failure. Returns null for
 *  "unknown" and "no_fulfillment" (the caller owns those: unknown → Part A register
 *  fallback + finalize_failed_unknown; no_fulfillment → the pickup/delivery buttons).
 *  "delivery_notice" returns the (already safe) tool content unchanged. */
export function finalizeFailureReply(
  kind: FinalizeFailureKind,
  draft: OrderDraft,
  dialect: string,
  toolContent?: string
): string | null {
  switch (kind) {
    case "missing_address":
      return frozenAddressAsk(dialect);
    case "empty_draft":
      return frozenEmptyDraftLine(dialect);
    case "delivery_notice":
      return toolContent && toolContent.trim() ? toolContent : null;
    case "stale_version":
    case "no_fulfillment":
    case "unknown":
    default:
      return null;
  }
}
