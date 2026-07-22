import type {
  BrainIngressSafetyScan,
  BrainRawMessageForScan,
  BrainSafetyMatchedSpan,
  BrainSafetySpanKind,
  BrainSafetyTriageClass,
} from "./types";
import { sha256Hex } from "./signature";

export const INGRESS_SAFETY_SCANNER_VERSION = "brain-ingress-safety-v1";

interface TermSpec {
  readonly kind: BrainSafetySpanKind;
  readonly label: string;
  readonly terms: readonly string[];
}

const TERM_SPECS: readonly TermSpec[] = [
  { kind: "allergy", label: "allergy", terms: ["حساسية", "حساسيه", "حساس", "allergy", "allergic", "allergies", "7asaseya", "hasaseya"] },
  { kind: "allergen", label: "nuts", terms: ["مكسرات", "فول سوداني", "فول سودانى", "سوداني", "سودانى", "peanut", "peanuts", "nut", "nuts"] },
  { kind: "allergen", label: "milk", terms: ["لبن", "حليب", "لاكتوز", "lactose", "milk", "dairy"] },
  { kind: "allergen", label: "gluten", terms: ["جلوتين", "غلوتين", "قمح", "سيلياك", "celiac", "coeliac", "gluten", "wheat"] },
  { kind: "allergen", label: "egg", terms: ["بيض", "egg", "eggs"] },
  { kind: "allergen", label: "fish_shellfish", terms: ["سمك", "سمكه", "جمبري", "جمبرى", "روبيان", "fish", "shrimp", "shellfish", "seafood"] },
  { kind: "allergen", label: "sesame_soy", terms: ["سمسم", "صويا", "sesame", "soy", "soya"] },
  { kind: "ingredient", label: "ingredient", terms: ["مكونات", "مكون", "فيه", "فيها", "contains", "ingredient", "ingredients", "may contain"] },
  { kind: "medical", label: "medical", terms: ["حساسي", "حساسيه", "ربو", "سكري", "ضغط", "حامل", "medical", "diabetic", "asthma", "pregnant"] },
  { kind: "symptom", label: "symptom", terms: ["طفح", "حكة", "حكه", "تورم", "اختناق", "ضيق نفس", "rash", "itch", "swelling", "choking", "breathing"] },
  { kind: "cross_contact", label: "cross_contact", terms: ["تلوث", "اختلاط", "زيت مشترك", "قلاية", "مقلاة", "اثر", "آثار", "cross contact", "cross-contamination", "shared fryer", "same oil", "traces"] },
  { kind: "third_party", label: "third_party", terms: ["ابني", "ابنى", "بنتي", "بنتى", "طفلي", "طفلى", "مراتي", "مراتى", "زوجتي", "زوجتى", "my son", "my daughter", "my kid", "my child", "my wife"] },
  { kind: "preference", label: "preference", terms: ["مش بحب", "بدون", "من غير", "ما بحبش", "preference", "prefer", "no onions", "vegetarian"] },
  { kind: "stop", label: "stop", terms: ["الغاء", "إلغاء", "الغي", "إلغي", "وقف", "اوقف", "cancel", "stop", "nevermind"] },
  { kind: "human", label: "human", terms: ["موظف", "انسان", "إنسان", "كلموني", "كلمني", "مدير", "خدمة عملاء", "human", "agent", "manager", "staff"] },
];

const QUESTION_TERMS = ["فيه", "فيها", "مكونات", "هل", "does", "contain", "contains", "ingredient", "ingredients", "?"];
const DISCLOSURE_TERMS = ["عندي", "عندى", "لدي", "لدى", "عنده", "عندها", "انا", "i am", "i'm", "my"];

function normalizeForScan(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .replace(/(.)\1{2,}/g, "$1$1")
    .toLowerCase();
}

function findTerm(original: string, normalized: string, spec: TermSpec, term: string): BrainSafetyMatchedSpan | null {
  const normalizedTerm = normalizeForScan(term);
  const originalLower = original.toLowerCase();
  const directIndex = originalLower.indexOf(term.toLowerCase());
  if (directIndex >= 0) {
    return {
      kind: spec.kind,
      label: spec.label,
      text: original.slice(directIndex, directIndex + term.length),
      start: directIndex,
      end: directIndex + term.length,
    };
  }

  if (normalized.includes(normalizedTerm)) {
    return {
      kind: spec.kind,
      label: spec.label,
      text: term,
      start: 0,
      end: original.length,
    };
  }

  return null;
}

function uniqueSpans(spans: readonly BrainSafetyMatchedSpan[]): BrainSafetyMatchedSpan[] {
  const seen = new Set<string>();
  const out: BrainSafetyMatchedSpan[] = [];
  for (const span of spans) {
    const key = `${span.kind}:${span.label}:${span.text}:${span.start}:${span.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(span);
  }
  return out;
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeForScan(text);
  return terms.some((term) => normalized.includes(normalizeForScan(term)));
}

function classify(text: string, spans: readonly BrainSafetyMatchedSpan[]): BrainSafetyTriageClass | null {
  const kinds = new Set(spans.map((span) => span.kind));
  const safetyCandidate =
    kinds.has("allergy") ||
    kinds.has("allergen") ||
    kinds.has("ingredient") ||
    kinds.has("medical") ||
    kinds.has("symptom") ||
    kinds.has("cross_contact");

  if (!safetyCandidate) {
    return kinds.has("preference") ? "NON_MEDICAL_PREFERENCE" : null;
  }

  if (kinds.has("cross_contact")) return "CROSS_CONTAMINATION_QUERY";
  if (kinds.has("third_party") && (kinds.has("allergy") || kinds.has("allergen") || kinds.has("medical"))) {
    return "THIRD_PARTY_DISCLOSURE";
  }
  if ((kinds.has("allergy") || kinds.has("medical")) && hasAny(text, DISCLOSURE_TERMS)) {
    return "EXPLICIT_CUSTOMER_DISCLOSURE";
  }
  if (kinds.has("ingredient") && hasAny(text, QUESTION_TERMS) && !kinds.has("allergy")) {
    return "SAFETY_INFORMATION_QUERY";
  }
  if (kinds.has("allergy") || kinds.has("allergen")) return "PROBABLE_DISCLOSURE";
  return "UNCERTAIN_SAFETY_SIGNAL";
}

function fastPathMarkers(message: BrainRawMessageForScan): string[] {
  const markers: string[] = [];
  if (message.interactiveId) markers.push("interactive_reply");
  if (message.messageType === "location") markers.push("location");
  if (message.mediaType) markers.push(`media:${message.mediaType}`);
  if (message.messageType === "audio" || message.mediaType === "audio") markers.push("media:audio");
  return [...new Set(markers)];
}

export function scanRawMessageForSafety(message: BrainRawMessageForScan, tenantId: string): BrainIngressSafetyScan {
  const text = message.text ?? "";
  const normalized = normalizeForScan(text);
  const spans = uniqueSpans(
    TERM_SPECS.flatMap((spec) => spec.terms.map((term) => findTerm(text, normalized, spec, term)).filter((span): span is BrainSafetyMatchedSpan => Boolean(span)))
  );
  const triageClass = classify(text, spans);
  const kinds = new Set(spans.map((span) => span.kind));

  return {
    tenantId,
    provider: "whatsapp",
    sourceMessageId: message.sourceMessageId,
    rawTextHash: text ? sha256Hex(text) : null,
    triageClass,
    safetyCandidate: triageClass !== null && triageClass !== "NON_MEDICAL_PREFERENCE",
    explicitStop: kinds.has("stop"),
    humanTakeoverRequested: kinds.has("human"),
    fastPathMarkers: fastPathMarkers(message),
    matchedSpans: spans,
    scannerVersion: INGRESS_SAFETY_SCANNER_VERSION,
    scannedAt: new Date().toISOString(),
  };
}
