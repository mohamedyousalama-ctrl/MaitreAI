// ============================================================================
// فيصل / Faysal — SAFETY RAIL · the composed reader every surface calls.
// SPEC-4-SAFETY.md §1.1, §1.5 R3, §11.9.
//
// A GUARD PROVEN IN ONE DETECTOR IS NOT A GUARD, AND THIS REPO HAS SHIPPED THAT MISTAKE
// TWICE. Every inbound surface — the WhatsApp webhook, the voice path, the human-active
// safety bridge, the operator-reply path, any demo route — calls `isFaysalSafetyInbound`,
// not `detectRedFlag` directly, and §11.9 reads the SOURCE of each surface to prove it.
//
// THE EXCEPTION WRAPPER IS PART OF THE UNION, NOT SOMETHING EACH SURFACE REMEMBERS TO ADD.
// That is the whole reason this file exists as a separate export from `detect.ts`.
// ============================================================================

import { detectRedFlag, type RedFlagHit } from "./detect";
import type { RedFlagClass, RedFlagTier } from "./lexicon";

export { detectRedFlag };
export type { RedFlagHit, RedFlagClass, RedFlagTier };
export * from "./rail";
export * from "./triage-hold";
export { normalizeForSafety, normalizeEn, foldDigits } from "./normalize";
export {
  CLASSES, CLASS_ORDER, everyEnumeratedMember,
  AIRWAY, CARDIAC, HEMORRHAGE, INFANT_FEVER, OBSTETRIC, POISONING, SELF_HARM, STROKE, TRAUMA,
} from "./lexicon";
export type { ClassSpec, FiresEntry, NearMiss, Mirror } from "./lexicon";

/** The composed verdict. `class` is nullable HERE and only here: the detector-exception path
 *  could not classify, and §1.5 R3 says so explicitly. */
export interface SafetyVerdict {
  readonly fired: boolean;
  readonly class: RedFlagClass | null;
  readonly tier: RedFlagTier | null;
  readonly termAr: string | null;
  readonly ruleId: string | null;
  readonly label: string | null;
}

const QUIET: SafetyVerdict = Object.freeze({
  fired: false, class: null, tier: null, termAr: null, ruleId: null, label: null,
});

/** §1.5 R3 — A DETECTOR EXCEPTION IS AN `emergency`, NEVER AN `urgent`.
 *
 *  The defect this closes: §10 said "detector throws → fail closed: treat as `urgent`", and
 *  §1.3 says `urgent` leaves BOOKING AVAILABLE. So the designated fail-closed path was
 *  fail-OPEN for the one thing the rail exists to prevent, on the one turn where we have no
 *  information at all. A malformed transcript throwing inside `detectRedFlag` on
 *  «صدري يعورني وأتعرق» produced a same-day appointment offer and a P1 handoff for an active
 *  infarct.
 *
 *  The over-fire cost is stated honestly and accepted: an exception on «كم سعر تنظيف
 *  الأسنان؟» renders an ambulance instruction to someone asking about a cleaning. That is a
 *  bad turn, it is a RARE bad turn — an exception rate above a handful per week is itself a
 *  P1 operational alert — and it is the correct trade against a silent same-day booking for
 *  an infarct. §3.4's false-positive budget EXCLUDES `detector_exception` from the ≤ 0.5 %
 *  rate and counts it under its own gate: ≤ 0.05 % of inbound, every one investigated. */
export const DETECTOR_EXCEPTION: SafetyVerdict = Object.freeze({
  fired: true,
  class: null,
  tier: "emergency",
  termAr: null,
  ruleId: "detector_exception",
  label: "تعذّر الفحص",
});

/** Is the returned object actually a conforming hit? A non-conforming return is treated
 *  exactly like a throw — §1.5 R3 says "any throw, timeout, OR NON-CONFORMING RETURN". */
function conforms(h: unknown): h is RedFlagHit {
  if (h === null || typeof h !== "object") return false;
  const o = h as Record<string, unknown>;
  return o.fired === true
    && typeof o.class === "string"
    && (o.tier === "emergency" || o.tier === "urgent")
    && typeof o.termAr === "string"
    && typeof o.ruleId === "string"
    && typeof o.label === "string";
}

/**
 * THE UNION. Pre-model, pure, and total.
 *
 * `detect` is injectable ONLY so §11.9 can stub it to throw and prove the exception path is
 * real. Production callers pass nothing.
 */
export function isFaysalSafetyInbound(
  text: string,
  detect: (t: string) => RedFlagHit | null = detectRedFlag,
): SafetyVerdict {
  let h: RedFlagHit | null;
  try {
    h = detect(text);
  } catch {
    return DETECTOR_EXCEPTION;
  }
  if (h === null) return QUIET;
  if (!conforms(h)) return DETECTOR_EXCEPTION;
  return { fired: true, class: h.class, tier: h.tier, termAr: h.termAr, ruleId: h.ruleId, label: h.label };
}
