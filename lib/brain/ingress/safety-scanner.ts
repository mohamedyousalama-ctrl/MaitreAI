import type {
  BrainSafetyEvidence,
  BrainSafetyEvidenceClass,
  BrainIngressSafetyScan,
  BrainIngressStore,
  BrainRawMessageForScan,
  BrainSafetyMatchedSpan,
  BrainSafetyScanResult,
  BrainSafetySpanKind,
  BrainSafetyTriageClass,
} from "./types";
import { sha256Hex } from "./signature";

export const INGRESS_SAFETY_SCANNER_VERSION = "brain-ingress-safety-v2";

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

interface NormalizedCharacter {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

function normalizeCharacter(character: string): string {
  return character
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .toLowerCase();
}

function normalizeWithOffsets(text: string): { text: string; characters: readonly NormalizedCharacter[] } {
  const expanded: NormalizedCharacter[] = [];
  let sourceOffset = 0;

  for (const character of text) {
    const end = sourceOffset + character.length;
    for (const normalizedCharacter of normalizeCharacter(character)) {
      expanded.push({ value: normalizedCharacter, start: sourceOffset, end });
    }
    sourceOffset = end;
  }

  const collapsed: NormalizedCharacter[] = [];
  for (let index = 0; index < expanded.length; ) {
    let runEnd = index + 1;
    while (runEnd < expanded.length && expanded[runEnd].value === expanded[index].value) runEnd++;
    const retained = Math.min(runEnd - index, 2);
    for (let offset = 0; offset < retained; offset++) {
      const source = expanded[index + offset];
      collapsed.push({
        value: source.value,
        start: source.start,
        end: offset === retained - 1 ? expanded[runEnd - 1].end : source.end,
      });
    }
    index = runEnd;
  }

  return {
    text: collapsed.map((character) => character.value).join(""),
    characters: collapsed,
  };
}

function normalizeForScan(text: string): string {
  return normalizeWithOffsets(text).text;
}

function findTerm(
  original: string,
  normalized: ReturnType<typeof normalizeWithOffsets>,
  spec: TermSpec,
  term: string
): BrainSafetyMatchedSpan | null {
  const normalizedTerm = normalizeForScan(term);
  const normalizedStart = normalized.text.indexOf(normalizedTerm);
  if (normalizedStart < 0 || normalizedTerm.length === 0) return null;

  const first = normalized.characters[normalizedStart];
  const last = normalized.characters[normalizedStart + normalizedTerm.length - 1];
  if (!first || !last) return null;
  return {
    kind: spec.kind,
    label: spec.label,
    text: original.slice(first.start, last.end),
    start: first.start,
    end: last.end,
  };
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
  const normalized = normalizeWithOffsets(text);
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

const SAFETY_EVIDENCE_KINDS = new Set<BrainSafetySpanKind>([
  "allergy",
  "allergen",
  "ingredient",
  "medical",
  "symptom",
  "cross_contact",
  "third_party",
]);

function evidenceForScan(
  scan: BrainIngressSafetyScan,
  args: {
    readonly evidenceClass: BrainSafetyEvidenceClass;
    readonly audioMessageReference?: string | null;
    readonly transcriptionProvider?: string | null;
    readonly transcriptionModel?: string | null;
  }
): BrainSafetyEvidence[] {
  if (!scan.safetyCandidate) return [];
  const customerAuthored = args.evidenceClass === "customer_text";
  return scan.matchedSpans
    .filter((span) => SAFETY_EVIDENCE_KINDS.has(span.kind))
    .map((span) => ({
      evidenceClass: args.evidenceClass,
      disclosureClass: span.kind,
      matchedExcerpt: span.text,
      startOffset: span.start,
      endOffset: span.end,
      excerptHash: sha256Hex(span.text),
      customerAuthored,
      audioMessageReference: customerAuthored ? null : args.audioMessageReference ?? null,
      transcriptionProvider: customerAuthored ? null : args.transcriptionProvider ?? null,
      transcriptionModel: customerAuthored ? null : args.transcriptionModel ?? null,
    }));
}

export async function scanAndRecordRawSafetyInbound(args: {
  readonly store: BrainIngressStore;
  readonly tenantId: string;
  readonly channelEventId: string;
  readonly rawMessage: BrainRawMessageForScan;
  readonly evidenceClass?: BrainSafetyEvidenceClass;
  readonly audioMessageReference?: string | null;
  readonly transcriptionProvider?: string | null;
  readonly transcriptionModel?: string | null;
}): Promise<BrainSafetyScanResult> {
  let scan: BrainIngressSafetyScan;
  try {
    scan = {
      ...scanRawMessageForSafety(args.rawMessage, args.tenantId),
      channelEventId: args.channelEventId,
    };
  } catch (error) {
    await args.store.failSafetyScan({
      tenantId: args.tenantId,
      channelEventId: args.channelEventId,
      provider: "whatsapp",
      sourceMessageId: args.rawMessage.sourceMessageId,
      rawTextHash: args.rawMessage.text ? sha256Hex(args.rawMessage.text) : null,
      scannerVersion: INGRESS_SAFETY_SCANNER_VERSION,
      errorCategory: "scanner_failed",
      scannedAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  }

  const evidenceClass = args.evidenceClass ?? "customer_text";
  const evidence = evidenceForScan(scan, {
    evidenceClass,
    audioMessageReference: args.audioMessageReference,
    transcriptionProvider: args.transcriptionProvider,
    transcriptionModel: args.transcriptionModel,
  });
  const outcome = evidence.length > 0 ? "completed_signal" : "completed_no_signal";

  try {
    return await args.store.completeSafetyScan(scan, evidence, outcome);
  } catch (error) {
    await args.store.failSafetyScan({
      tenantId: args.tenantId,
      channelEventId: args.channelEventId,
      provider: scan.provider,
      sourceMessageId: scan.sourceMessageId,
      rawTextHash: scan.rawTextHash,
      scannerVersion: scan.scannerVersion,
      errorCategory: "evidence_persist_failed",
      scannedAt: scan.scannedAt,
    }).catch(() => undefined);
    throw error;
  }
}
