// ============================================================================
// getkivo.io landing — bilingual copy + market facts (WO-C4-LANDING).
// The brief (docs/product/LANDING_BRIEF.md) is the source of truth for messaging
// and the LOCKED claim-language rules (§5). Arabic is the default; English is the
// secondary language toggle. The COUNTRY toggle (Egypt ↔ KSA) only changes FACTS
// that genuinely differ (currency + payment methods) — never the pitch.
//
// HONEST-PROOF RULE (§5): no fabricated logos, testimonials, or metrics. Where the
// brief calls for social proof we don't have yet, the copy carries the explicit
// placeholder token below so it is impossible to ship a fake number by accident.
// ============================================================================

export type Lang = "ar" | "en";
export type Country = "eg" | "ksa";

/** The one honest-placeholder token. Anything marked with it is NOT real data and
 *  must be filled from a verified source before it can present as proof. */
export const NEEDS_REAL_DATA = { ar: "[بيانات حقيقية مطلوبة]", en: "[real data needed]" } as const;

// Build-adjacent dependencies (brief §4/§8) — placeholders until Mohamed provisions
// the demo tenant + number and a booking calendar. Kept as named constants so the
// swap is a one-line change and greppable.
export const DEMO_WA_LINK = "https://wa.me/000000000000"; // TODO(demo-tenant): real demo number
export const BOOK_CALL_LINK = "#book"; // TODO(booking): real calendar link
export const APP_ONBOARDING = "/onboarding";
export const APP_LOGIN = "/login";

export interface MarketFacts {
  currency: { ar: string; en: string };
  /** Payment methods available, phrased per the §5 KSA rule. */
  pay: { ar: string; en: string };
  sampleOrder: string; // a round order total shown in the margin visual, in this market's currency
}

export const FACTS: Record<Country, MarketFacts> = {
  eg: {
    currency: { ar: "ج.م", en: "EGP" },
    pay: { ar: "الدفع عند الاستلام + فودافون كاش", en: "Cash on delivery + Vodafone Cash" },
    sampleOrder: "٢٤٠",
  },
  ksa: {
    currency: { ar: "ر.س", en: "SAR" },
    // §5 KSA rule: online payments are "coming" until Moyasar is live.
    pay: { ar: "الدفع عند الاستلام + مدفوعات إلكترونية (قريباً في السعودية)", en: "Cash on delivery + online payments (coming to KSA)" },
    sampleOrder: "١٦٠",
  },
};

export interface Copy {
  dir: "rtl";
  langToggle: string;
  countryToggle: { eg: string; ksa: string };
  nav: { how: string; brain: string; safety: string; login: string; start: string };
  hero: {
    badge: string;
    // The brief §1 wedge, verbatim.
    h1: string[];
    wedge: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trust: string;
  };
  problem: { kicker: string; title: string; items: { stat: string; label: string }[] };
  how: { kicker: string; title: string; sub: string; steps: { n: string; title: string; body: string }[]; consoleCap: string };
  brain: { kicker: string; title: string; sub: string; items: { title: string; body: string }[] };
  safety: { kicker: string; title: string; body: string; points: string[] };
  proof: { kicker: string; title: string; neutral: string; disclaimer: string; metricLabel: string };
  cta: { title: string; body: string; primary: string; secondary: string };
  footer: { tagline: string; legal: string; links: { privacy: string; terms: string; dataDeletion: string; contact: string }; rights: string };
}

// Facts token helper — {cur}, {pay}, {order} are substituted at render time so the
// country toggle stays a data swap, not a copy fork.
export const COPY: Record<Lang, Copy> = {
  ar: {
    dir: "rtl",
    langToggle: "EN",
    countryToggle: { eg: "مصر", ksa: "السعودية" },
    nav: { how: "إزاي بيشتغل", brain: "أكتر من شات بوت", safety: "الأمان والثقة", login: "دخول", start: "ابدأ" },
    hero: {
      badge: "وكيل واتساب لمطاعمك",
      h1: ["كريم بياخد طلباتك", "على واتساب،", "ويوريك ليه العملاء", "بيشتروا أو لأ."],
      wedge:
        "كريم ياخد طلباتك على واتساب، يخدم عملاءك، ويوريك ليه العملاء بيشتروا أو مبيشتروش — وبعدين يساعدك تحسّن المبيعات والمنيو والعروض.",
      ctaPrimary: "جرّب كريم على واتساب",
      ctaSecondary: "احجز مكالمة",
      trust: "بيشتغل جنب الكاشير عندك — من غير أسعار مخترعة ولا أصناف وهمية.",
    },
    problem: {
      kicker: "المشكلة",
      title: "ثلاث حاجات بتاكل من مطعمك كل يوم",
      items: [
        { stat: "طلبات بتضيع", label: "رسايل واتساب بترد عليها متأخر أو بتفوتك، فالعميل بيروح لغيرك." },
        { stat: "~٣٠٪ عمولة", label: "تطبيقات التوصيل بتاخد شريحة كبيرة من كل طلب — هامش بيخرج من جيبك." },
        { stat: "مفيش رؤية", label: "مش عارف ليه العميل طلب أو ما طلبش — ولا إزاي تحسّن." },
      ],
    },
    how: {
      kicker: "إزاي بيشتغل",
      title: "ثلاث خطوات، وكريم بيمشي الباقي",
      sub: "من أول رسالة لحد ما الطلب يتسجّل — كله على واتساب.",
      steps: [
        { n: "٠١", title: "العميل بيكلّم كريم", body: "بيبعت رسالة عادية على رقم واتساب مطعمك. كريم بيرد باللهجة المحلية، بيفهم الطلب ويرشّح ويجاوب." },
        { n: "٠٢", title: "كريم بياخد الطلب", body: "بيأكّد الأصناف والعنوان، بيحسب الإجمالي من نظامك (مش بيخترع سعر)، وبيحوّل للفريق لو محتاج تدخّل — بأمان تجاه الحساسية." },
        { n: "٠٣", title: "فريقك بيشغّله من لوحة واحدة", body: "الطلب بيوصلك في الكونسول بحالته، وفريقك بيشغّله من مكان واحد — من غير عمولة وسيط." },
      ],
      consoleCap: "الكونسول — بالعربي، لحظة بلحظة",
    },
    brain: {
      kicker: "أكتر من شات بوت",
      title: "الدماغ اللي ورا كريم",
      sub: "مزايا شغّالة فعلاً النهارده — مفيش وعود «قريباً».",
      items: [
        { title: "حقيقة الطلب", body: "كل طلب مبني على المنيو والأسعار الحقيقية من نظامك — مفيش رقم مخترع." },
        { title: "ذاكرة العميل", body: "كريم بيفتكر عملاءك وسياق طلباتهم، فالخدمة بتبقى شخصية." },
        { title: "تسوية الكاش (COD)", body: "تحصيل الدفع عند الاستلام بيتسجّل ويتسوّى مع المندوب — فلوسك متراقبة." },
        { title: "مناطق التوصيل", body: "ارسم مناطقك على الخريطة، والطلب بيتوجّه لفرعه ورسومه تلقائياً." },
        { title: "تسليم للفريق", body: "أي محادثة محتاجة إنسان، فريقك بيستلمها بضغطة ويرجّعها لكريم لما يخلص." },
      ],
    },
    safety: {
      kicker: "الأمان والثقة",
      title: "تقدر تأمن كريم مع عملاءك؟",
      body: "الأمان مش رأي الموديل — هو قاعدة حتمية جوّه المنتج.",
      points: [
        "أمان حساسية حتمي — أي إشارة لحساسية بتصعّد لفريقك، مش بيأكّد الأمان بنفسه.",
        "تستلم في أي لحظة — المحادثة بتبقى في إيدك بضغطة، وترجّعها لكريم لما تخلص.",
        "من غير أسعار مخترعة ولا أصناف وهمية — كل رقم وكل صنف من نظامك.",
      ],
    },
    proof: {
      kicker: "الإثبات",
      title: "مبنيّ على شغل فعلي",
      neutral: "اتبنى وبيشتغل مع مطعم دجاج مصري حقيقي.",
      disclaimer:
        "مبنعرضش أرقام مخترعة. مطعمك بيبدأ في وضع «بنجمع بيانات» وبتظهر أرقامه الحقيقية أول ما يكفي الحجم.",
      metricLabel: "قصة عميل باسمه",
    },
    cta: {
      title: "خلّي كريم يرد على عميلك الجاي",
      body: "جرّبه بنفسك على واتساب — كريم بياخد طلب تجريبي في دقيقة. الديمو هو العرض.",
      primary: "جرّب كريم على واتساب",
      secondary: "احجز مكالمة",
    },
    footer: {
      tagline: "خلّي طلباتك ماشية",
      legal: "City Baker LLC",
      links: { privacy: "الخصوصية", terms: "الشروط", dataDeletion: "حذف البيانات", contact: "تواصل" },
      rights: "كل الطلبات على واتساب، من غير عمولة وسطاء",
    },
  },
  en: {
    dir: "rtl",
    langToggle: "ع",
    countryToggle: { eg: "Egypt", ksa: "Saudi Arabia" },
    nav: { how: "How it works", brain: "Beyond the chatbot", safety: "Safety & trust", login: "Log in", start: "Start" },
    hero: {
      badge: "The WhatsApp agent for your restaurant",
      h1: ["Karim takes your orders", "on WhatsApp —", "and shows you why", "customers buy or don't."],
      wedge:
        "Karim takes your orders on WhatsApp, serves your customers, and shows you why they buy or don't — then helps you improve sales, menu, and offers.",
      ctaPrimary: "Try Karim on WhatsApp",
      ctaSecondary: "Book a call",
      trust: "Works alongside your POS — with no invented prices or availability.",
    },
    problem: {
      kicker: "The problem",
      title: "Three things that eat your restaurant every day",
      items: [
        { stat: "Missed orders", label: "WhatsApp messages answered late or missed — the customer goes elsewhere." },
        { stat: "~30% commission", label: "Delivery apps take a big slice of every order — margin out of your pocket." },
        { stat: "No visibility", label: "You don't know why a customer ordered or didn't — or how to improve." },
      ],
    },
    how: {
      kicker: "How it works",
      title: "Three steps — Karim runs the rest",
      sub: "From the first message to a logged order — all on WhatsApp.",
      steps: [
        { n: "01", title: "The customer messages Karim", body: "A normal message to your restaurant's WhatsApp. Karim replies in the local dialect, understands the order, recommends and answers." },
        { n: "02", title: "Karim takes the order", body: "Confirms items and address, computes the total from your system (never invents a price), and hands off to your team when needed — escalating any allergy concern to your staff, never certifying safety itself." },
        { n: "03", title: "Your team runs it from one console", body: "The order lands in your console with its status; your team runs it from one place — with no aggregator commission." },
      ],
      consoleCap: "The console — in Arabic, moment to moment",
    },
    brain: {
      kicker: "Beyond the chatbot",
      title: "The brain behind Karim",
      sub: "Features that actually ship today — no “coming soon”.",
      items: [
        { title: "Order truth", body: "Every order is built from your real menu and prices — no invented number." },
        { title: "Customer memory", body: "Karim remembers your customers and their order context, so service is personal." },
        { title: "Cash reconciliation (COD)", body: "Cash-on-delivery is logged and reconciled with the driver — your money is accounted for." },
        { title: "Delivery zones", body: "Draw your zones on the map; the order routes to its branch and fee automatically." },
        { title: "Staff handoff", body: "Any conversation that needs a human, your team takes over with one tap and returns it to Karim when done." },
      ],
    },
    safety: {
      kicker: "Safety & trust",
      title: "Can you trust Karim with your customers?",
      body: "Safety isn't the model's opinion — it's a deterministic rule inside the product.",
      points: [
        "Deterministic allergy safety — any allergy signal escalates to your staff; Karim never certifies safety itself.",
        "Take over any time — the conversation is yours with one tap, and back to Karim when you're done.",
        "No invented prices or availability — every number and every item comes from your system.",
      ],
    },
    proof: {
      kicker: "Proof",
      title: "Built on real work",
      neutral: "Built with — and running on — a working Egyptian fried-chicken restaurant.",
      disclaimer:
        "We don't show invented numbers. Your restaurant starts in a “gathering data” state and shows its real numbers once there's enough volume.",
      metricLabel: "A named customer story",
    },
    cta: {
      title: "Let Karim answer your next customer",
      body: "Try it yourself on WhatsApp — Karim takes a demo order in a minute. The demo is the pitch.",
      primary: "Try Karim on WhatsApp",
      secondary: "Book a call",
    },
    footer: {
      tagline: "Keep every order moving",
      legal: "City Baker LLC",
      links: { privacy: "Privacy", terms: "Terms", dataDeletion: "Data deletion", contact: "Contact" },
      rights: "Every order on WhatsApp, with no aggregator commission",
    },
  },
};
