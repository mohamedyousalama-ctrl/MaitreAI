export function normalizeEpisodeArabicText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface EpisodeTextSignals {
  readonly normalized: string;
  readonly newOrder: boolean;
  readonly resetOrder: boolean;
  readonly cancelOrder: boolean;
  readonly priorOrderReference: boolean;
  readonly supportOrStatus: boolean;
  readonly orderingIntent: boolean;
  readonly matched: readonly string[];
}

const newOrderTerms = [
  "عاوز اوردر تاني",
  "عايز اوردر تاني",
  "عاوز طلب تاني",
  "عايز طلب تاني",
  "اطلب تاني",
  "اعمل اوردر جديد",
  "اوردر جديد",
  "طلب جديد",
  "طلب ثاني",
  "ابغي طلب ثاني",
  "ابغى طلب ثاني",
  "ابي طلب ثاني",
  "ابدا طلب جديد",
  "بطلب مره ثانيه",
  "another order",
  "new order",
  "order again",
];

const resetTerms = [
  "ابدا من جديد",
  "ابدأ من جديد",
  "من الاول",
  "صفر الطلب",
  "خلينا نبدا",
  "start over",
  "reset order",
];

const cancelTerms = [
  "الغي الطلب",
  "الغاء الطلب",
  "كنسل الطلب",
  "cancel order",
];

const priorReferenceTerms = [
  "الطلب اللي فات",
  "الاوردر اللي فات",
  "الطلب السابق",
  "الاوردر السابق",
  "نفس الطلب السابق",
  "نفس الاوردر السابق",
  "طلبي رقم",
  "طلب رقم",
  "اوردر رقم",
  "order number",
  "previous order",
];

const supportTerms = [
  "فين الطلب",
  "فين الاوردر",
  "حاله الطلب",
  "حالة الطلب",
  "وصل الطلب",
  "الدليفري فين",
  "المندوب فين",
  "عايز اكلم حد",
  "اكلم موظف",
  "status",
  "support",
  "delivery",
];

const orderingTerms = [
  "عايز",
  "عاوز",
  "ابغي",
  "ابغى",
  "ابي",
  "اطلب",
  "اوردر",
  "طلب",
  "كشري",
  "فراخ",
  "ساندوتش",
  "وجبه",
  "order",
];

function includesAny(normalized: string, terms: readonly string[], matched: string[]): boolean {
  let found = false;
  for (const term of terms) {
    const normalizedTerm = normalizeEpisodeArabicText(term);
    if (normalized.includes(normalizedTerm)) {
      matched.push(term);
      found = true;
    }
  }
  return found;
}

export function detectEpisodeTextSignals(text: string): EpisodeTextSignals {
  const normalized = normalizeEpisodeArabicText(text);
  const matched: string[] = [];
  const newOrder = includesAny(normalized, newOrderTerms, matched);
  const resetOrder = includesAny(normalized, resetTerms, matched);
  const cancelOrder = includesAny(normalized, cancelTerms, matched);
  const priorOrderReference = includesAny(normalized, priorReferenceTerms, matched) || /(?:طلب|اوردر)\s*#?\s*\d+/.test(normalized);
  const supportOrStatus = includesAny(normalized, supportTerms, matched);
  const orderingIntent = includesAny(normalized, orderingTerms, matched);

  return {
    normalized,
    newOrder,
    resetOrder,
    cancelOrder,
    priorOrderReference,
    supportOrStatus,
    orderingIntent,
    matched: [...new Set(matched)],
  };
}
