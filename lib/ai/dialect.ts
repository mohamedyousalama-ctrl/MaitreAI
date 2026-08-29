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
    /** Warm "no current offers" decline + pivot (answer like an employee, never escalate). */
    noOffers: string;
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
      orderConfirm: "تم، راجعت الطلب والإجمالي. أجهّزلك الطلب؟",
      escalation: "أحتاج أتأكد من الفريق عشان أعطيك إجابة دقيقة. بحوّل محادثتك لفريق المطعم ويردّون عليك في أقرب وقت 🙏",
      closed: "المطعم مسكّر الحين 🌙 نفتح الساعة 11 الصبح.",
      voiceNote: "سمعتك 👌 ... صح؟",
      unavailable: "للأسف هذا الصنف غير متوفر حالياً، بس أقدر أرشّح لك بديل من المتوفر إذا تحب 👌",
      noOffers: "للأسف ما في عروض متاحة حالياً 🙏، بس تحب أرشّح لك الأكثر طلباً عندنا؟",
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
      orderConfirm: "تمام، راجعت الطلب والإجمالي. أجهّزلك الطلب؟",
      escalation: "محتاج أتأكد من الفريق عشان أرد عليك صح. هحوّل المحادثة لفريق المطعم وهيردّوا عليك في أقرب وقت 🙏",
      closed: "معلش 🌙 المطعم مقفول دلوقتي، بنفتح الساعة ١١ الصبح.",
      voiceNote: "سمعتك 👌 ... صح كده؟",
      unavailable: "للأسف الصنف ده مش متوفر دلوقتي، بس أقدر أرشّحلك بديل من المتوفر لو تحب 👌",
      noOffers: "للأسف مفيش عروض متاحة دلوقتي 🙏، بس تحب أرشّحلك الأكثر مبيعاً عندنا؟",
    },
  },
};

/** Resolve a dialect profile from a (possibly null/legacy) DB value. */
export function dialectProfile(d: string | null | undefined): DialectProfile {
  return DIALECTS[d as Dialect] ?? DIALECTS.saudi;
}

// ── RESOLVING A TENANT'S DIALECT ────────────────────────────────────────────
//
// Seven sites across customer-turn, respond-and-send and typed-actions each wrote
// `String(row.dialect ?? "egyptian")`. A tenant whose `dialect` column is null or blank
// therefore received the ENTIRE Egyptian persona — every branch, every reply — including a
// Saudi restaurant. Meanwhile dialectProfile() a few lines above defaults the other way, to
// SAUDI, so two parts of the same module disagreed about what an unset dialect means.
//
// No tenant is currently affected: all 13 rows have a dialect set, so this is latent rather
// than live. It is fixed anyway, because the failure is silent and total — nothing errors,
// nothing logs, the restaurant simply speaks the wrong country's Arabic to its customers —
// and a tenant created without a dialect is an ordinary onboarding slip.
//
// The resolution order is: the tenant's own dialect · then its COUNTRY · then the historical
// default, which is preserved so that no tenant alive today changes behaviour. Each fallback
// warns, because a tenant reaching either of them is a data defect worth seeing.

const KNOWN_DIALECTS: ReadonlySet<string> = new Set(Object.keys(DIALECTS));

/** Only the countries this product actually serves. Guessing beyond them would be the same
 *  class of mistake as the default it replaces. */
const COUNTRY_DIALECT: Readonly<Record<string, Dialect>> = { SA: "saudi", EG: "egyptian" };

/** The pre-existing default at all seven call sites. Kept so this change is a no-op for
 *  every tenant that has a dialect, which today is all of them. */
export const LEGACY_DIALECT_DEFAULT = "egyptian";

/**
 * The tenant's dialect: its own value, else derived from its country, else the historical
 * default. `where` names the call site so a warning identifies which path saw the bad row.
 */
export function resolveTenantDialect(
  row: { dialect?: string | null; country?: string | null } | null | undefined,
  where: string
): string {
  const d = String(row?.dialect ?? "").trim().toLowerCase();
  if (KNOWN_DIALECTS.has(d)) return d;

  const country = String(row?.country ?? "").trim().toUpperCase();
  const byCountry = COUNTRY_DIALECT[country];
  if (byCountry) {
    console.warn(`[dialect] ${where}: tenant has no dialect set; derived "${byCountry}" from country ${country}`);
    return byCountry;
  }
  console.warn(`[dialect] ${where}: tenant has neither a dialect nor a known country; using "${LEGACY_DIALECT_DEFAULT}"`);
  return LEGACY_DIALECT_DEFAULT;
}

/**
 * True when a tenant's dialect and currency disagree — «مطعم الذواقة» is dialect:"saudi",
 * country:"SA", currency:"ج.م", i.e. a Saudi restaurant priced in Egyptian pounds. Nothing
 * detects that today, so it sits in the data until a customer sees the wrong symbol on a
 * total. Observability only: it never blocks a turn and never rewrites a tenant's money.
 */
export function tenantCurrencyMismatch(
  row: { dialect?: string | null; currency?: string | null } | null | undefined
): { mismatch: boolean; expected: string | null; actual: string | null } {
  const d = String(row?.dialect ?? "").trim().toLowerCase();
  const actual = String(row?.currency ?? "").trim() || null;
  const profile = KNOWN_DIALECTS.has(d) ? DIALECTS[d as Dialect] : null;
  const expected = profile?.currencyDefault ?? null;
  if (!profile || !actual || !expected) return { mismatch: false, expected, actual };
  return { mismatch: actual !== expected, expected, actual };
}
