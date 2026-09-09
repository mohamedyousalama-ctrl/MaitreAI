// ============================================================================
// فيصل / Faysal — insurance. SPEC-1-DOMAIN.md §10.
//
// Rule INS-1 — FAYSAL NEVER PROMISES COVERAGE. Not partial, not full, not
// "should be covered", not "usually covered". Coverage depends on the carrier,
// the policy class, the deductible, the service, pre-approval and campaign-day
// exclusions. Faysal knows none of those. It has a list of networks the
// BUILDINGS appear on. That is not eligibility.
//
// The distinction between `insurer` and `tpa_discount_card` is load-bearing: a
// discount card is not health insurance, and a patient told "we accept Takaful"
// who arrives expecting cover has been misled by a category error.
//
// Also enforced here:
//   INS-2  a directory_source is never named to a patient as an accepted payer
//   INS-3  a facility code is an internal key — NEVER read to a patient
//   INS-4  aesthetic services: "usually cash" is not stated as fact
//   INS-5  insurance NEVER gates the booking
//   PRICE-4 no TPA percentage is ever spoken
// ============================================================================

import { isSiteId, siteById } from "./sites";
import type { InsuranceAnswer, Payer, SiteId } from "./types";

const D4 = "§4 L216-217";

function payer(
  id: string,
  nameEn: string,
  nameAr: string,
  kind: Payer["kind"],
  siteEvidence: Payer["siteEvidence"],
  aliases: string[] = []
): Payer & { aliases: string[] } {
  return { id, nameEn, nameAr, kind, siteEvidence, aliases };
}

export const PAYERS: ReadonlyArray<Payer & { aliases: string[] }> = Object.freeze([
  // Insurers — from the group-wide network paragraph [D §4 L216–217].
  payer("bupa", "Bupa Arabia", "بوبا العربية", "insurer", [
    { siteId: "wattan-4", dossierRef: "§3.4 L171", note: "June 2024 announcement — an ANNOUNCEMENT, not a present-tense fact" },
    { siteId: "group", dossierRef: D4, note: "historically listed among Shoaa's accepted insurers" },
  ], ["bupa", "بوبا"]),
  payer("tawuniya", "Tawuniya", "التعاونية", "insurer", [
    { siteId: "wattan-1", dossierRef: "§3.1 L121", note: "Tawuniya-class hospital lists" },
    { siteId: "group", dossierRef: D4, note: "group network paragraph" },
  ], ["tawuniya", "التعاونية", "تعاونية"]),
  payer("medgulf", "Medgulf", "ميدغلف", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["medgulf", "ميدغلف"]),
  payer("walaa", "Walaa", "ولاء", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["walaa", "ولاء"]),
  payer("gulf-general", "Gulf General", "الخليج العامة", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["gulf general", "الخليج"]),
  payer("saico", "SAICO", "سايكو", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["saico", "سايكو"]),
  payer("malath", "Malath", "ملاذ", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["malath", "ملاذ"]),
  payer("united", "United", "المتحدة", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["united", "المتحدة"]),
  payer("al-etihad", "Al-Etihad", "الاتحاد", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["al etihad", "al-etihad", "الاتحاد"]),
  payer("enaya", "Enaya Saudi", "عناية السعودية", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["enaya", "عناية"]),
  payer("solidarity", "Solidarity", "سوليدرتي", "insurer", [{ siteId: "group", dossierRef: D4, note: "group network paragraph" }], ["solidarity", "سوليدرتي"]),

  // TPA / discount cards — NOT insurance.
  payer("takaful-al-arabia", "Takaful Al Arabia", "تكافل العربية", "tpa_discount_card", [
    { siteId: "wattan-3", dossierRef: "§3.3 L161", note: "published discount-card rates at Complex 3" },
    { siteId: "wattan-4", dossierRef: "§3.4 L172-173", note: "same discount-card pattern" },
  ], ["takaful al arabia", "تكافل العربية", "تكافل"]),
  payer("takaful-watan", "Takaful Watan", "تكافل وطن", "tpa_discount_card", [
    { siteId: "group", dossierRef: D4, note: "group discount-card paragraph" },
  ], ["takaful watan", "تكافل وطن"]),

  // Directory sources — PROVENANCE for a facility code, never a payer to quote
  // (Rule INS-2). They are named here so a caller cannot mistake one for cover.
  payer("amana", "Amana", "أمانة", "directory_source", [
    { siteId: "wattan-1", dossierRef: "§3.1 L121", note: "insurer PDFs carrying facility codes" },
  ], ["amana", "أمانة"]),
  payer("al-jazeera-takaful", "Al Jazeera Takaful", "الجزيرة تكافل", "directory_source", [
    { siteId: "wattan-1", dossierRef: "§9 L291", note: "insurer PDFs carrying facility codes" },
  ], ["al jazeera takaful", "الجزيرة تكافل"]),
]);

/**
 * Light matching only: trim, collapse whitespace, lowercase Latin. Arabic
 * variant folding belongs to the AUTHORITATIVE `normalizeAr`
 * (lib/ai/allergen-gate.ts → lib/util/arabic-normalize.ts after SPEC-3 §10.2's
 * extraction) and this module deliberately does NOT ship a third divergent copy
 * of it. An unmatched carrier degrades to the honest-unknown answer, which is
 * the safe direction: it promises nothing and routes to reception.
 */
function fold(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function payerByName(carrier: string): (Payer & { aliases: string[] }) | null {
  const q = fold(carrier);
  if (!q) return null;

  const exact = PAYERS.find(
    (p) => fold(p.id) === q || fold(p.nameEn) === q || fold(p.nameAr) === q || p.aliases.some((a) => fold(a) === q)
  );
  if (exact) return exact;

  // LONGEST ALIAS WINS. «عندي تكافل وطن» contains «تكافل», which is also Takaful
  // Al Arabia's alias — first-match-wins would name the wrong card back to the
  // patient. Both are discount cards, so the category is safe either way; the
  // NAME is not, and a card named wrongly is the kind of small error that costs
  // the reception desk an argument.
  let best: (Payer & { aliases: string[] }) | null = null;
  let bestLen = 0;
  for (const p of PAYERS) {
    for (const a of p.aliases) {
      const folded = fold(a);
      if (folded && q.includes(folded) && folded.length > bestLen) {
        best = p;
        bestLen = folded.length;
      }
    }
  }
  return best;
}

// ── The permitted sentence shapes (§10.4) ───────────────────────────────────

const BRING_CARD =
  "احضر الهوية أو الإقامة وبطاقة التأمين، واسأل الاستقبال تحت أي فئة شبكة تُحتسب الزيارة.";

const CLASS_HONESTY =
  "تغطية زيارتك تعتمد على فئة شبكتك والتحمّل في بطاقتك — الاستقبال يتحقق لك منها قبل الكشف.";

/**
 * The ONE insurance answer. Renderer-emitted, never composed by a model, and
 * checked against the banned list before it is returned — a promise a model can
 * make is a promise the product made.
 */
export function insuranceAnswer(carrier: string, siteId: SiteId): InsuranceAnswer {
  if (!isSiteId(siteId)) throw new Error(`unknown_site:${siteId}`);
  const site = siteById(siteId);
  const p = payerByName(carrier);
  const shown = (p?.nameAr ?? String(carrier ?? "").trim()) || "التأمين";

  let accepted: InsuranceAnswer["accepted"] = "unknown";
  let sentenceAr: string;
  let payerKind: InsuranceAnswer["payerKind"] = p?.kind ?? null;

  if (!p || p.kind === "directory_source") {
    // Rule INS-2 — a directory source is provenance for a code, nothing more.
    // It is never named to a patient as an accepted payer, so it answers exactly
    // like an unrecognised carrier.
    payerKind = p ? "directory_source" : null;
    accepted = "unknown";
    sentenceAr = `ما أقدر أأكد لك إن ${shown} ضمن الشبكات المعتمدة عند ${site.nameAr}. ${CLASS_HONESTY} ${BRING_CARD}`;
  } else if (p.kind === "tpa_discount_card") {
    accepted = "yes";
    sentenceAr =
      `${shown} بطاقة خصم وليست تأمين — يعني ما تشتغل مثل بوليصة التأمين. ` +
      `المجموعة تتعامل مع بطاقات الخصم، والاستقبال يوضح لك الخصم على بطاقتك بالتحديد. ${BRING_CARD}`;
  } else {
    const forThisSite = p.siteEvidence.some((e) => e.siteId === siteId);
    const contested = site.operatingStatus.state === "operational_contested";
    accepted = "yes";
    if (p.id === "bupa" && siteId === "wattan-4") {
      // Never a present-tense fact: the evidence is a June 2024 announcement at
      // a branch whose status is contested (§3.4.1).
      sentenceAr =
        `مرضى ${shown} انعلن استقبالهم في ${site.nameAr} (إعلان يونيو ٢٠٢٤)، والاستقبال يأكد لك الوضع الحالي. ` +
        `${CLASS_HONESTY} ${BRING_CARD}`;
    } else if (forThisSite) {
      sentenceAr = `${site.nameAr} مدرج ضمن شبكات عدة شركات تأمين، منها ${shown}. ${CLASS_HONESTY} ${BRING_CARD}`;
    } else {
      sentenceAr =
        `مجمعات المجموعة مدرجة ضمن شبكات عدة شركات تأمين، منها ${shown}، ` +
        `وما عندي تأكيد خاص بـ${site.nameAr}. ${CLASS_HONESTY} ${BRING_CARD}`;
      accepted = "unknown";
    }
    if (contested && p.id !== "bupa") {
      sentenceAr += " ووضع الفرع نفسه نأكده لك بالاتصال قبل ما تجي.";
    }
  }

  assertNoCoveragePromise(sentenceAr);
  assertNoFacilityCode(sentenceAr);

  return {
    accepted,
    listedNotCovered: true,
    // §10.3 — "Always verify the current network class (A/B/C) and deductible on
    // the patient's card." We were told to verify it; we have not; therefore it
    // is unknown, and Faysal never states one.
    classKnown: false,
    networkClass: "unknown",
    payerKind,
    sentenceAr,
    blocksBooking: false,
  };
}

/**
 * The Arabic name of a payer, for a renderer that has the patient's own wording.
 * An unrecognised carrier echoes back what the patient typed — we never rename a
 * carrier we do not know, and we never imply we recognised it.
 */
export function carrierNameAr(carrier: string): string {
  return payerByName(carrier)?.nameAr ?? String(carrier ?? "").trim();
}

/** Rule INS-4 — the aesthetic-services line, in the cautious direction. */
export function aestheticInsuranceNoteAr(): string {
  const line =
    "خدمات الليزر والتبييض والتقويم التجميلي عادة تُعامل كخدمات نقدية، والاستقبال يأكد لك ذلك حسب بوليصتك.";
  assertNoCoveragePromise(line);
  return line;
}

// ── Guards — a rule that lives only in prose is not a rule ──────────────────

const BANNED_COVERAGE_FRAGMENTS: readonly string[] = [
  "مغطى",
  "مغطاة",
  "مغطي",
  "التأمين يغطي",
  "يغطيها التأمين",
  "بالمجان",
  "covered",
  "fully covered",
  "insurance will pay",
  "free with your insurance",
];

export function assertNoCoveragePromise(sentence: string): void {
  const s = String(sentence ?? "");
  for (const bad of BANNED_COVERAGE_FRAGMENTS) {
    if (s.includes(bad)) throw new Error(`ins1_violated:${bad}`);
  }
  // PRICE-4 — no TPA percentage, in either digit set.
  if (/(20|25|30)\s*%/.test(s) || /[٠-٩]+\s*٪/.test(s)) throw new Error("price4_violated:percentage");
  // §10.3 — never a stated network class.
  if (/فئة\s*(A|B|C|أ|ب|ج)\b/.test(s)) throw new Error("ins3_violated:network_class");
}

/** Rule INS-3 — a code is an internal key, not a licence number. */
export function assertNoFacilityCode(sentence: string): void {
  const s = String(sentence ?? "");
  for (const code of ["18002", "18003", "17985", "18004", "17081"]) {
    if (s.includes(code)) throw new Error(`ins3_violated:${code}`);
  }
}
