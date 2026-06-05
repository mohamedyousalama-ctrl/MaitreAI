// ============================================================================
// MaitreAI — Centralized mock data
// Realistic Saudi restaurant data for مطعم الذواقة. This is the single source
// of truth for the UI during Sprint 1. No component should hardcode domain data.
// ============================================================================

import type {
  Branch,
  Conversation,
  Customer,
  KnowledgeAlert,
  KnowledgeArea,
  Kpi,
  MenuItem,
  Order,
  Promotion,
} from "./types";

export const RESTAURANT = {
  name: "مطعم الذواقة",
  tagline: "موظف واتساب الذكي للمطاعم",
  currency: "ر.س",
};

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export const branches: Branch[] = [
  {
    id: "b1",
    name: "فرع الياسمين",
    address: "حي الياسمين، شارع الأمير محمد بن سلمان، الرياض",
    hours: "12:00 ظهراً - 2:00 صباحاً",
    deliveryZones: ["الياسمين", "النرجس", "العقيق"],
    whatsappConnected: true,
    open: true,
    phone: "+966 50 123 4567",
  },
  {
    id: "b2",
    name: "فرع العليا",
    address: "حي العليا، طريق الملك فهد، الرياض",
    hours: "1:00 ظهراً - 1:00 صباحاً",
    deliveryZones: ["العليا", "السليمانية", "المروج"],
    whatsappConnected: true,
    open: true,
    phone: "+966 50 234 5678",
  },
  {
    id: "b3",
    name: "فرع النرجس",
    address: "حي النرجس، شارع أنس بن مالك، الرياض",
    hours: "12:00 ظهراً - 12:00 منتصف الليل",
    deliveryZones: ["النرجس", "الياسمين", "بنبان"],
    whatsappConnected: false,
    open: false,
    phone: "+966 50 345 6789",
  },
];

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export const menuCategories = ["الكل", "برجر", "مقبلات", "مشروبات", "وجبات", "حلويات"];

export const menuItems: MenuItem[] = [
  {
    id: "m1",
    name: "برجر كلاسيك",
    category: "برجر",
    price: 32,
    available: true,
    description: "لحم بقري طازج مع جبنة شيدر وصلصة الذواقة الخاصة",
    modifiers: ["جبنة إضافية", "بدون بصل", "حار", "خبز محمص"],
    ingredients: ["لحم بقري", "جبنة شيدر", "خس", "طماطم", "صلصة خاصة"],
    allergens: ["جلوتين", "ألبان"],
    aiReadiness: 95,
  },
  {
    id: "m2",
    name: "برجر دجاج حار",
    category: "برجر",
    price: 30,
    available: true,
    description: "صدر دجاج مقرمش بنكهة حارة مع مايونيز الثوم",
    modifiers: ["زيادة حار", "بدون مايونيز", "جبنة إضافية"],
    ingredients: ["دجاج", "بهارات حارة", "مايونيز ثوم", "مخلل"],
    allergens: ["جلوتين", "بيض"],
    aiReadiness: 88,
  },
  {
    id: "m3",
    name: "بطاطس كبيرة",
    category: "مقبلات",
    price: 15,
    available: true,
    description: "بطاطس مقلية ذهبية مقرمشة",
    modifiers: ["بنكهة الجبن", "حار", "صوص إضافي"],
    ingredients: ["بطاطس", "زيت", "ملح"],
    allergens: [],
    aiReadiness: 70,
  },
  {
    id: "m4",
    name: "كولا",
    category: "مشروبات",
    price: 6,
    available: true,
    description: "مشروب غازي بارد",
    modifiers: ["بدون ثلج", "حجم كبير"],
    ingredients: ["مشروب غازي"],
    allergens: [],
    aiReadiness: 60,
  },
  {
    id: "m5",
    name: "وجبة العائلة",
    category: "وجبات",
    price: 145,
    available: true,
    description: "4 برجر + 2 بطاطس كبيرة + 4 مشروبات + حلى",
    modifiers: ["اختيار البرجر", "اختيار المشروبات"],
    ingredients: ["برجر", "بطاطس", "مشروبات", "حلى"],
    allergens: ["جلوتين", "ألبان"],
    aiReadiness: 82,
  },
  {
    id: "m6",
    name: "كنافة",
    category: "حلويات",
    price: 25,
    available: false,
    description: "كنافة بالجبن مع القطر والفستق",
    modifiers: ["فستق إضافي", "قطر جانبي"],
    ingredients: ["عجينة كنافة", "جبنة", "قطر", "فستق"],
    allergens: ["جلوتين", "ألبان", "مكسرات"],
    aiReadiness: 45,
  },
];

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export const customers: Customer[] = [
  {
    id: "c1",
    name: "عبدالله",
    phone: "+966 55 111 2233",
    lastOrder: "اليوم، 1:24 م",
    totalOrders: 24,
    totalSpent: 1860,
    favoriteItem: "برجر كلاسيك",
    notes: "يفضل التوصيل السريع، حساسية من المكسرات",
    segment: "عميل مميز",
  },
  {
    id: "c2",
    name: "سارة",
    phone: "+966 56 222 3344",
    lastOrder: "أمس، 9:10 م",
    totalOrders: 11,
    totalSpent: 720,
    favoriteItem: "برجر دجاج حار",
    notes: "تطلب دائماً بدون بصل",
    segment: "عميل متكرر",
  },
  {
    id: "c3",
    name: "ناصر",
    phone: "+966 53 333 4455",
    lastOrder: "اليوم، 12:40 م",
    totalOrders: 3,
    totalSpent: 240,
    favoriteItem: "وجبة العائلة",
    notes: "",
    segment: "عميل جديد",
  },
  {
    id: "c4",
    name: "ريم",
    phone: "+966 54 444 5566",
    lastOrder: "قبل 5 أيام",
    totalOrders: 8,
    totalSpent: 540,
    favoriteItem: "كنافة",
    notes: "تحب العروض والخصومات",
    segment: "عميل متكرر",
  },
  {
    id: "c5",
    name: "خالد",
    phone: "+966 50 555 6677",
    lastOrder: "قبل 3 أسابيع",
    totalOrders: 2,
    totalSpent: 130,
    favoriteItem: "بطاطس كبيرة",
    notes: "لم يطلب منذ فترة",
    segment: "خامل",
  },
];

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const orders: Order[] = [
  {
    id: "1042",
    customer: "عبدالله",
    customerPhone: "+966 55 111 2233",
    branch: "فرع الياسمين",
    status: "قيد التحضير",
    paymentStatus: "مدفوع",
    fulfillment: "توصيل",
    total: 85,
    items: [
      { name: "برجر كلاسيك", qty: 2, price: 32, modifiers: ["جبنة إضافية"] },
      { name: "بطاطس كبيرة", qty: 1, price: 15 },
      { name: "كولا", qty: 1, price: 6 },
    ],
    notes: "الجرس لا يعمل، اتصل عند الوصول",
    time: "1:24 م",
    createdAtMinutesAgo: 8,
    source: "WhatsApp",
  },
  {
    id: "1041",
    customer: "ناصر",
    customerPhone: "+966 53 333 4455",
    branch: "فرع العليا",
    status: "بانتظار الدفع",
    paymentStatus: "بانتظار الدفع",
    fulfillment: "استلام",
    total: 145,
    items: [{ name: "وجبة العائلة", qty: 1, price: 145, modifiers: ["برجر كلاسيك ×4"] }],
    time: "12:40 م",
    createdAtMinutesAgo: 22,
    source: "WhatsApp",
  },
  {
    id: "1040",
    customer: "سارة",
    customerPhone: "+966 56 222 3344",
    branch: "فرع الياسمين",
    status: "جاهز",
    paymentStatus: "مدفوع",
    fulfillment: "توصيل",
    total: 51,
    items: [
      { name: "برجر دجاج حار", qty: 1, price: 30, modifiers: ["بدون بصل", "زيادة حار"] },
      { name: "بطاطس كبيرة", qty: 1, price: 15 },
      { name: "كولا", qty: 1, price: 6 },
    ],
    time: "12:18 م",
    createdAtMinutesAgo: 35,
    source: "WhatsApp",
  },
  {
    id: "1039",
    customer: "ريم",
    customerPhone: "+966 54 444 5566",
    branch: "فرع العليا",
    status: "جديد",
    paymentStatus: "بانتظار الدفع",
    fulfillment: "توصيل",
    total: 62,
    items: [
      { name: "برجر كلاسيك", qty: 1, price: 32 },
      { name: "كنافة", qty: 1, price: 25 },
      { name: "كولا", qty: 1, price: 6 },
    ],
    time: "1:30 م",
    createdAtMinutesAgo: 2,
    source: "WhatsApp",
  },
  {
    id: "1038",
    customer: "خالد",
    customerPhone: "+966 50 555 6677",
    branch: "فرع الياسمين",
    status: "خرج للتوصيل",
    paymentStatus: "مدفوع",
    fulfillment: "توصيل",
    total: 38,
    items: [
      { name: "برجر دجاج حار", qty: 1, price: 30 },
      { name: "كولا", qty: 1, price: 6 },
    ],
    time: "12:05 م",
    createdAtMinutesAgo: 48,
    source: "WhatsApp",
  },
  {
    id: "1037",
    customer: "عبدالله",
    customerPhone: "+966 55 111 2233",
    branch: "فرع الياسمين",
    status: "مكتمل",
    paymentStatus: "مدفوع",
    fulfillment: "استلام",
    total: 47,
    items: [
      { name: "برجر كلاسيك", qty: 1, price: 32 },
      { name: "بطاطس كبيرة", qty: 1, price: 15 },
    ],
    time: "11:50 ص",
    createdAtMinutesAgo: 70,
    source: "WhatsApp",
  },
  {
    id: "1036",
    customer: "سارة",
    customerPhone: "+966 56 222 3344",
    branch: "فرع العليا",
    status: "ملغي",
    paymentStatus: "مسترجع",
    fulfillment: "توصيل",
    total: 30,
    items: [{ name: "برجر دجاج حار", qty: 1, price: 30 }],
    notes: "ألغى العميل الطلب",
    time: "11:20 ص",
    createdAtMinutesAgo: 95,
    source: "WhatsApp",
  },
];

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export const conversations: Conversation[] = [
  {
    id: "conv1",
    customer: "عبدالله",
    phone: "+966 55 111 2233",
    avatarColor: "#2563eb",
    status: "بانتظار الدفع",
    lastMessage: "تمام، أرسل لي رابط الدفع",
    lastTime: "1:24 م",
    unread: 0,
    branch: "فرع الياسمين",
    linkedOrderId: "1042",
    suggestedAction: "إرسال رابط الدفع للطلب #1042",
    messages: [
      { id: "x1", sender: "customer", text: "السلام عليكم، أبغى أطلب", time: "1:18 م" },
      {
        id: "x2",
        sender: "ai",
        text: "وعليكم السلام ورحمة الله 🌟 أهلاً بك في مطعم الذواقة. تفضل، وش تحب تطلب اليوم؟",
        time: "1:18 م",
        confidence: 98,
      },
      { id: "x3", sender: "customer", text: "٢ برجر كلاسيك مع جبنة إضافية وبطاطس كبيرة وكولا", time: "1:20 م" },
      {
        id: "x4",
        sender: "ai",
        text: "تمام ✅ طلبك:\n• برجر كلاسيك ×2 (جبنة إضافية)\n• بطاطس كبيرة ×1\n• كولا ×1\nالإجمالي 85 ر.س. توصيل لفرع الياسمين؟",
        time: "1:21 م",
        confidence: 95,
      },
      { id: "x5", sender: "customer", text: "أي توصيل، نفس العنوان", time: "1:23 م" },
      {
        id: "x6",
        sender: "ai",
        text: "ممتاز! بأرسل لك رابط الدفع الآن 💳",
        time: "1:23 م",
        confidence: 92,
      },
      { id: "x7", sender: "customer", text: "تمام، أرسل لي رابط الدفع", time: "1:24 م" },
    ],
    aiTyping: true,
  },
  {
    id: "conv2",
    customer: "سارة",
    phone: "+966 56 222 3344",
    avatarColor: "#9333ea",
    status: "يحتاج تدخل موظف",
    lastMessage: "في صرصور بالطلب اللي وصلني أمس!!",
    lastTime: "1:12 م",
    unread: 2,
    branch: "فرع العليا",
    suggestedAction: "تصعيد لموظف خدمة العملاء — شكوى جودة",
    messages: [
      { id: "y1", sender: "customer", text: "السلام عليكم", time: "1:10 م" },
      {
        id: "y2",
        sender: "ai",
        text: "وعليكم السلام، أهلاً بك 🌟 كيف أقدر أساعدك؟",
        time: "1:10 م",
        confidence: 97,
      },
      { id: "y3", sender: "customer", text: "في صرصور بالطلب اللي وصلني أمس!!", time: "1:12 م", confidence: undefined },
      {
        id: "y4",
        sender: "ai",
        text: "أعتذر بشدة عن هذا 🙏 هذه شكوى مهمة وسأقوم بتحويلك لأحد موظفينا فوراً.",
        time: "1:12 م",
        confidence: 41,
      },
    ],
  },
  {
    id: "conv3",
    customer: "ناصر",
    phone: "+966 53 333 4455",
    avatarColor: "#059669",
    status: "AI نشط",
    lastMessage: "كم تكلفة وجبة العائلة؟",
    lastTime: "12:40 م",
    unread: 1,
    branch: "فرع العليا",
    linkedOrderId: "1041",
    suggestedAction: "اقتراح إضافة حلى لزيادة قيمة الطلب",
    messages: [
      { id: "z1", sender: "customer", text: "هلا، عندكم وجبات عائلية؟", time: "12:38 م" },
      {
        id: "z2",
        sender: "ai",
        text: "هلا والله 👋 إي نعم، عندنا وجبة العائلة: 4 برجر + 2 بطاطس كبيرة + 4 مشروبات + حلى.",
        time: "12:39 م",
        confidence: 96,
      },
      { id: "z3", sender: "customer", text: "كم تكلفة وجبة العائلة؟", time: "12:40 م" },
      {
        id: "z4",
        sender: "ai",
        text: "وجبة العائلة بـ 145 ر.س فقط 🎉 تحب أضيفها لك؟",
        time: "12:40 م",
        confidence: 94,
      },
    ],
  },
  {
    id: "conv4",
    customer: "ريم",
    phone: "+966 54 444 5566",
    avatarColor: "#f97316",
    status: "تم التحويل لموظف",
    lastMessage: "موظف خدمة العملاء: تم تطبيق الخصم لك ✅",
    lastTime: "12:30 م",
    unread: 0,
    branch: "فرع العليا",
    suggestedAction: "متابعة رضا العميلة بعد حل المشكلة",
    messages: [
      { id: "w1", sender: "customer", text: "عندكم عرض على الكنافة؟", time: "12:25 م" },
      {
        id: "w2",
        sender: "ai",
        text: "حالياً الكنافة غير متوفرة 😔 بس عندنا عروض ثانية، تحب أعرضها لك؟",
        time: "12:26 م",
        confidence: 73,
      },
      { id: "w3", sender: "customer", text: "أبغى أكلم موظف", time: "12:27 م" },
      { id: "w4", sender: "system", text: "تم تحويل المحادثة إلى موظف خدمة العملاء", time: "12:27 م" },
      { id: "w5", sender: "agent", text: "أهلاً ريم، معك فهد من خدمة العملاء، كيف أقدر أخدمك؟", time: "12:28 م" },
      { id: "w6", sender: "agent", text: "تم تطبيق الخصم لك ✅", time: "12:30 م" },
    ],
  },
  {
    id: "conv5",
    customer: "خالد",
    phone: "+966 50 555 6677",
    avatarColor: "#06b6d4",
    status: "طلب مكتمل",
    lastMessage: "شكراً، وصل الطلب 🙏",
    lastTime: "11:30 ص",
    unread: 0,
    branch: "فرع الياسمين",
    suggestedAction: "طلب تقييم للتجربة",
    messages: [
      { id: "v1", sender: "customer", text: "وين طلبي؟", time: "11:15 ص" },
      {
        id: "v2",
        sender: "ai",
        text: "طلبك #1038 خرج للتوصيل وبيوصلك خلال 15 دقيقة تقريباً 🛵",
        time: "11:16 ص",
        confidence: 91,
      },
      { id: "v3", sender: "customer", text: "شكراً، وصل الطلب 🙏", time: "11:30 ص" },
      {
        id: "v4",
        sender: "ai",
        text: "العفو 🌟 صحتين وعافية! نتشرف بخدمتك دائماً.",
        time: "11:30 ص",
        confidence: 99,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export const promotions: Promotion[] = [
  {
    id: "p1",
    name: "وجبة العائلة بخصم 20%",
    offerType: "خصم نسبة",
    startDate: "1 يونيو 2026",
    endDate: "30 يونيو 2026",
    conditions: "على طلبات وجبة العائلة فقط",
    active: true,
    aiSuggested: false,
    redemptions: 142,
  },
  {
    id: "p2",
    name: "بطاطس مجانية",
    offerType: "هدية مع الطلب",
    startDate: "5 يونيو 2026",
    endDate: "12 يونيو 2026",
    conditions: "عند الطلب فوق 60 ر.س",
    active: true,
    aiSuggested: true,
    redemptions: 67,
  },
  {
    id: "p3",
    name: "عرض نهاية الأسبوع",
    offerType: "اشترِ 1 واحصل على 1",
    startDate: "13 يونيو 2026",
    endDate: "14 يونيو 2026",
    conditions: "على البرجر الكلاسيك",
    active: false,
    aiSuggested: true,
    redemptions: 0,
  },
];

// ---------------------------------------------------------------------------
// Restaurant Brain — knowledge health
// ---------------------------------------------------------------------------
export const knowledgeAreas: KnowledgeArea[] = [
  { key: "menu", label: "معرفة المنيو", score: 88 },
  { key: "branch", label: "معرفة الفروع", score: 76 },
  { key: "policy", label: "معرفة السياسات", score: 64 },
  { key: "delivery", label: "مناطق التوصيل", score: 82 },
  { key: "faq", label: "الأسئلة الشائعة", score: 70 },
  { key: "tone", label: "نبرة الصوت", score: 91 },
];

export const overallKnowledgeScore = 79;

export const knowledgeAlerts: KnowledgeAlert[] = [
  {
    id: "a1",
    area: "السياسات",
    message: "سياسة الاسترجاع والاستبدال غير مكتملة — يحتاج الذكاء الاصطناعي تفاصيل أوضح",
    severity: "high",
  },
  {
    id: "a2",
    area: "المنيو",
    message: "صنف «كنافة» غير متوفر حالياً وجاهزيته للذكاء الاصطناعي منخفضة (45%)",
    severity: "medium",
  },
  {
    id: "a3",
    area: "الفروع",
    message: "فرع النرجس غير مرتبط بواتساب بعد",
    severity: "medium",
  },
];

export const faqs = [
  { q: "كم وقت التوصيل؟", a: "عادة من 30 إلى 45 دقيقة حسب المنطقة." },
  { q: "هل يوجد حد أدنى للطلب؟", a: "الحد الأدنى للتوصيل 30 ر.س." },
  { q: "ما طرق الدفع المتاحة؟", a: "مدى، آبل باي، والبطاقات الائتمانية عبر رابط الدفع." },
];

export const toneOfVoice = {
  style: "ودود ومحترف بلهجة سعودية خفيفة",
  emojis: "استخدام معتدل",
  greeting: "السلام عليكم ورحمة الله، أهلاً بك في مطعم الذواقة 🌟",
};

// ---------------------------------------------------------------------------
// Dashboard KPIs & AI daily summary
// ---------------------------------------------------------------------------
export const dashboardKpis: Kpi[] = [
  { key: "ordersToday", label: "طلبات اليوم", value: "47", delta: "+12%", trend: "up" },
  { key: "revenueToday", label: "إيرادات اليوم", value: "3,240 ر.س", delta: "+8%", trend: "up" },
  { key: "openConversations", label: "محادثات مفتوحة", value: "9", delta: "+3", trend: "up" },
  { key: "paidOrders", label: "طلبات مدفوعة", value: "38", delta: "81%", trend: "flat" },
  { key: "avgOrderValue", label: "متوسط قيمة الطلب", value: "69 ر.س", delta: "+5%", trend: "up" },
  { key: "avgResponseTime", label: "متوسط زمن الرد", value: "8 ثانية", delta: "-2 ث", trend: "up" },
];

export const aiDailySummary = {
  headline: "أداء ممتاز اليوم 👏",
  body: "تعامل الموظف الذكي مع 47 طلباً و 62 محادثة بمعدل رد 8 ثوانٍ. تم تحويل محادثتين لموظف بشري (شكوى جودة + طلب خصم). نوصي بمراجعة سياسة الاسترجاع لتقليل التحويلات.",
  highlights: [
    "81% من الطلبات تم دفعها تلقائياً عبر الرابط",
    "أكثر صنف مطلوب اليوم: برجر كلاسيك",
    "ذروة الطلبات كانت 1:00 - 2:00 ظهراً",
  ],
};

export const systemStatus = [
  { label: "واتساب", status: "متصل", ok: true },
  { label: "محرك الذكاء الاصطناعي", status: "نشط", ok: true },
  { label: "بوابة الدفع", status: "متصل", ok: true },
  { label: "فرع النرجس", status: "غير متصل", ok: false },
];
