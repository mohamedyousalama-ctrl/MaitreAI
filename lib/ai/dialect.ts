// ============================================================================
// MaitreAI — Customer-agent dialect profiles (Layer B)
// Source of truth: ARABIC_LANGUAGE_GUIDE.md §1 (the two Arabic layers) + §4
// (numbers/currency). The customer WhatsApp agent is dialect-aware per tenant
// (restaurants.dialect: saudi | egyptian). These few-shot examples are injected
// into the system prompt to anchor voice — replies are generated, not templated.
// ============================================================================

export type Dialect = "saudi" | "egyptian";

export interface DialectProfile {
  dialect: Dialect;
  label: string; // Arabic label for the dialect
  country: "SA" | "EG";
  currencyDefault: string; // ر.س | ج.م (profile.currency is authoritative)
  /** Customer-facing digit style (Guide §4): KSA Western, Egypt Arabic-Indic. */
  digitStyle: "western" | "arabic-indic";
  /** Few-shot voice anchors (Guide §1 Layer B table). */
  examples: {
    greeting: string;
    orderConfirm: string;
    escalation: string;
    closed: string;
    voiceNote: string;
    /** Acknowledge-then-pivot anchor for an unavailable/unknown item (§G). */
    unavailable: string;
  };
}

export const DIALECTS: Record<Dialect, DialectProfile> = {
  saudi: {
    dialect: "saudi",
    label: "سعودي",
    country: "SA",
    currencyDefault: "ر.س",
    digitStyle: "western",
    examples: {
      greeting: "هلا فيك، وش تحب تطلب اليوم؟",
      orderConfirm: "تم، حسبت الطلب من السيستم وراجعت الإجمالي. تؤكد الطلب؟",
      escalation: "أحتاج أتأكد من الفريق عشان أعطيك إجابة دقيقة. بحوّلك لأحد من الفريق الآن.",
      closed: "نعتذر منك 🌙 المطعم مغلق حالياً، نفتح الساعة ١١ صباحاً.",
      voiceNote: "سمعتك 👌 ... صح؟",
      unavailable: "للأسف هذا الصنف غير متوفر حالياً، بس أقدر أرشّح لك بديل من المتوفر إذا تحب 👌",
    },
  },
  egyptian: {
    dialect: "egyptian",
    label: "مصري",
    country: "EG",
    currencyDefault: "ج.م",
    digitStyle: "arabic-indic",
    examples: {
      greeting: "أهلاً بيك، تحب تطلب إيه النهارده؟",
      orderConfirm: "تمام، حسبت الطلب من السيستم وراجعت الإجمالي. تأكد الطلب؟",
      escalation: "محتاج أتأكد من الفريق عشان أرد عليك صح. هحوّلك لحد من الفريق دلوقتي.",
      closed: "معلش 🌙 المطعم مقفول دلوقتي، بنفتح الساعة ١١ الصبح.",
      voiceNote: "سمعتك 👌 ... صح كده؟",
      unavailable: "للأسف الصنف ده مش متوفر دلوقتي، بس أقدر أرشّحلك بديل من المتوفر لو تحب 👌",
    },
  },
};

/** Resolve a dialect profile from a (possibly null/legacy) DB value. */
export function dialectProfile(d: string | null | undefined): DialectProfile {
  return DIALECTS[d as Dialect] ?? DIALECTS.saudi;
}
