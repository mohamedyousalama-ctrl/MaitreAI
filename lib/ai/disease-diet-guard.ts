// ============================================================================
// MaitreAI — disease/diet suitability claim guard (PURE, UNCONDITIONAL).
//
// Founder escalate-always posture: Karim NEVER reassures that a dish is suitable
// for a health/diet condition (diabetes, blood pressure, cholesterol, "diet",
// sugar-free …). Such a claim asserts health suitability with no operator-verified
// data, so it is unsafe. This module DETECTS the claim in a draft reply; respond.ts
// replaces it with the honest careful line that hands to a human.
//
// This EXTENDS the unconditional output floor alongside the allergen-safety guard:
// no flag, no hold-state, no money. It only ADDS caution — it never removes any
// existing guard, and the allergen detector/hold logic elsewhere is untouched.
// ============================================================================

import { normalizeAr } from "./allergen-gate";

// Health/diet suitability REASSURANCE patterns (matched over normalizeAr output —
// diacritics stripped, أإآٱ→ا, ة→ه, ى→ي). Each is a claim that a dish fits a
// disease or diet need, the exact posture the founder forbids.
const DISEASE_DIET_CLAIM_RE: RegExp[] = [
  /مناسب ?ل?مرضي ?السكر/,   // مناسب لمرضى السكر / السكري
  /مناسب ?ل?مرضي/,           // مناسب لمرضى (any condition)
  /صحي ?ل?مرضي/,             // صحي لمرضى
  /ينفع ?ل?مريض/,           // ينفع لمريض / لمرضى
  /(?<![ء-ي])دايت(?![ء-ي])/, // دايت (diet)
  /خالي ?من ?السكر/,        // خالي من السكر / السكري
  /(ما ?)?في?هوش ?سكر/,      // مفيهوش سكر / ما فيهوش سكر
  /مناسب ?ل?لضغط/,          // مناسب للضغط
  /مناسب ?ل?لكوليسترول/,    // مناسب للكوليسترول
  /لو ?عندك ?سكر/,          // لو عندك سكر (... عادي / مفيش مشكلة)
];

/** True when the draft reassures that a dish suits a disease/diet condition. */
export function assertsDiseaseDietClaim(reply: string): boolean {
  const n = normalizeAr(reply);
  if (!n) return false;
  return DISEASE_DIET_CLAIM_RE.some((re) => re.test(n));
}

/** The honest careful replacement — hands health/allergy suitability to a human.
 *
 *  IT WAS NEVER DIALECT-AGNOSTIC — it was EGYPTIAN. The old comment said "dialect-agnostic
 *  by design (single founder-authored line)" and the line reads «بنفضّل حد من الفريق
 *  يأكدلك» — the b-imperfect «بنفضّل», «حد» (Najdi: أحد), and «يأكدلك». The parameter was
 *  accepted and discarded, so a Riyadh customer asking «عندكم مشروب دايت؟» got an Egyptian
 *  health escalation. Caught in a live 50-conversation run, byte-identical in two
 *  unrelated conversations. */
export function diseaseDietCarefulLine(dialect?: string | null): string {
  return String(dialect) === "saudi"
    ? "في مواضيع الصحة والحساسية أفضّل أحد من الفريق يتأكد لك بنفسه 🙏 أوصلك فيه؟"
    : "في مواضيع الصحة والحساسية بنفضّل حد من الفريق يأكدلك بنفسه 🙏 أحوّلك لحد من الفريق؟";
}
