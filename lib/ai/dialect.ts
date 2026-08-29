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
export const LEGACY_DIALECT_DEFAULT: Dialect = "egyptian";

/** Which signal actually decided the dialect. "own" is the healthy case; anything else is a
 *  data defect, and the caller may want to record it somewhere a human will actually see. */
export type DialectSource = "own" | "country" | "legacy-default";

/** The resolution WITHOUT the logging, so a caller that has somewhere better than stderr to
 *  put the signal can ask why the answer came out the way it did. Single source of truth:
 *  resolveTenantDialect() is this function plus a warn. */
export function resolveTenantDialectDetailed(
  row: { dialect?: string | null; country?: string | null } | null | undefined
): { dialect: Dialect; source: DialectSource; country: string } {
  const d = String(row?.dialect ?? "").trim().toLowerCase();
  const country = String(row?.country ?? "").trim().toUpperCase();
  if (KNOWN_DIALECTS.has(d)) return { dialect: d as Dialect, source: "own", country };

  const byCountry = COUNTRY_DIALECT[country];
  if (byCountry) return { dialect: byCountry, source: "country", country };

  return { dialect: LEGACY_DIALECT_DEFAULT, source: "legacy-default", country };
}

/**
 * The tenant's dialect: its own value, else derived from its country, else the historical
 * default. `where` names the call site so a warning identifies which path saw the bad row,
 * and `restaurantId` names the TENANT — without it a warning says something is wrong but not
 * which row to fix, which is a signal nobody can act on.
 */
export function resolveTenantDialect(
  row: { dialect?: string | null; country?: string | null } | null | undefined,
  where: string,
  restaurantId?: string | null
): Dialect {
  const { dialect, source, country } = resolveTenantDialectDetailed(row);
  if (source === "own") return dialect;

  const who = restaurantId ? ` restaurant=${restaurantId}` : "";
  if (source === "country") {
    console.warn(`[dialect] ${where}:${who} tenant has no dialect set; derived "${dialect}" from country ${country}`);
    return dialect;
  }
  // Deliberately does not claim the tenant HAS no country — `country` is NOT NULL in the
  // schema, so the usual cause is that this call site's SELECT did not ask for it.
  console.warn(
    `[dialect] ${where}:${who} no usable dialect, and no known country available on the row ` +
      `(country="${country}"); using "${LEGACY_DIALECT_DEFAULT}"`
  );
  return dialect;
}

/**
 * True when a tenant's dialect and currency disagree — «مطعم الذواقة» is dialect:"saudi",
 * country:"SA", currency:"ج.م", i.e. a Saudi restaurant priced in Egyptian pounds. Nothing
 * detects that today, so it sits in the data until a customer sees the wrong symbol on a
 * total. Observability only: it never blocks a turn and never rewrites a tenant's money.
 */
// The SAME currency, written differently, is not a mismatch. «ر.س»، «ريال»، «﷼» and «SAR»
// are all the Saudi riyal, and dialect.ts's own comment calls profile.currency
// AUTHORITATIVE — so a detector that reads "differs from the default" as "wrong" contradicts
// the field it inspects. A detector that cries wolf on valid data trains everyone to ignore
// it, which is a failure this codebase has already had once.
const CURRENCY_ALIASES: Readonly<Record<Dialect, readonly string[]>> = {
  saudi: ["ر.س", "ر س", "ريال", "﷼", "sar", "s.r", "sr"],
  egyptian: ["ج.م", "ج م", "جنيه", "egp", "le", "l.e"],
};

/** Normalise for comparison: fold case, strip dots/tatweel/spaces so «ج.م.» === «ج.م», and
 *  strip the INVISIBLE bidi marks (RLM/LRM/ALM, the embedding and isolate controls). A
 *  currency typed or pasted in an RTL editor routinely carries a trailing U+200F that no
 *  human can see — flagging «ر.س\u200f» as the wrong currency would be a wolf-cry nobody
 *  could even diagnose by looking at the value. */
function normalizeCurrency(c: string): string {
  return c
    .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.\s\u0640]/g, "");
}

export function tenantCurrencyMismatch(
  row: { dialect?: string | null; currency?: string | null } | null | undefined
): { mismatch: boolean; expected: string | null; actual: string | null } {
  const d = String(row?.dialect ?? "").trim().toLowerCase();
  const actual = String(row?.currency ?? "").trim() || null;
  const profile = KNOWN_DIALECTS.has(d) ? DIALECTS[d as Dialect] : null;
  const expected = profile?.currencyDefault ?? null;
  // Absence is not a contradiction: with either half missing there is nothing to disagree.
  // (`expected` is checked only for the type narrowing — it is non-empty for both profiles,
  // so it is never falsy unless `profile` already is.)
  if (!profile || !actual) return { mismatch: false, expected, actual };
  const accepted = CURRENCY_ALIASES[d as Dialect].map(normalizeCurrency);
  return { mismatch: !accepted.includes(normalizeCurrency(actual)), expected, actual };
}
