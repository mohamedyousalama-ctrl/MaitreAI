// ============================================================================
// MaitreAI — Seed data for the editable Restaurant Brain store
// These are the INITIAL values used the first time the app runs. After that,
// the Zustand store persists the owner's edits to localStorage and this seed
// is no longer read. Realistic Saudi restaurant data for مطعم الذواقة.
// ============================================================================

import type {
  AiToneConfig,
  Branch,
  DeliveryArea,
  FaqItem,
  MenuItem,
  Modifier,
  Policies,
  RestaurantProfile,
} from "./types";

export const seedProfile: RestaurantProfile = {
  name: "مطعم الذواقة",
  logoUrl: "",
  phone: "+966 50 123 4567",
  email: "info@aldhawaqah.sa",
  currency: "ر.س",
  defaultLanguage: "العربية",
  timezone: "توقيت الرياض (GMT+3)",
  businessType: "مطعم وجبات سريعة",
};

export const menuCategories = ["برجر", "مقبلات", "مشروبات", "وجبات", "حلويات"];

export const modifierCategories = ["إضافات", "تعديلات", "خيارات"];

export const seedModifiers: Modifier[] = [
  { id: "mod1", name: "جبنة إضافية", priceImpact: 5, category: "إضافات", active: true },
  { id: "mod2", name: "بدون بصل", priceImpact: 0, category: "تعديلات", active: true },
  { id: "mod3", name: "حار", priceImpact: 0, category: "تعديلات", active: true },
  { id: "mod4", name: "خبز محمص", priceImpact: 0, category: "تعديلات", active: true },
  { id: "mod5", name: "زيادة حار", priceImpact: 2, category: "إضافات", active: true },
  { id: "mod6", name: "بدون مايونيز", priceImpact: 0, category: "تعديلات", active: true },
  { id: "mod7", name: "بنكهة الجبن", priceImpact: 3, category: "إضافات", active: true },
  { id: "mod8", name: "صوص إضافي", priceImpact: 2, category: "إضافات", active: true },
  { id: "mod9", name: "حجم كبير", priceImpact: 3, category: "خيارات", active: true },
  { id: "mod10", name: "بدون ثلج", priceImpact: 0, category: "تعديلات", active: true },
  { id: "mod11", name: "فستق إضافي", priceImpact: 5, category: "إضافات", active: true },
  { id: "mod12", name: "قطر جانبي", priceImpact: 0, category: "خيارات", active: true },
];

export const seedMenuItems: MenuItem[] = [
  {
    id: "m1",
    name: "برجر كلاسيك",
    category: "برجر",
    price: 32,
    available: true,
    description: "لحم بقري طازج مع جبنة شيدر وصلصة الذواقة الخاصة",
    imageUrl: "",
    modifierIds: ["mod1", "mod2", "mod3", "mod4"],
    ingredients: ["لحم بقري", "جبنة شيدر", "خس", "طماطم", "صلصة خاصة"],
    allergens: ["جلوتين", "ألبان"],
  },
  {
    id: "m2",
    name: "برجر دجاج حار",
    category: "برجر",
    price: 30,
    available: true,
    description: "صدر دجاج مقرمش بنكهة حارة مع مايونيز الثوم",
    imageUrl: "",
    modifierIds: ["mod5", "mod6", "mod1"],
    ingredients: ["دجاج", "بهارات حارة", "مايونيز ثوم", "مخلل"],
    allergens: ["جلوتين", "بيض"],
  },
  {
    id: "m3",
    name: "بطاطس كبيرة",
    category: "مقبلات",
    price: 15,
    available: true,
    description: "بطاطس مقلية ذهبية مقرمشة",
    imageUrl: "",
    modifierIds: ["mod7", "mod3", "mod8"],
    ingredients: ["بطاطس", "زيت", "ملح"],
    allergens: [],
  },
  {
    id: "m4",
    name: "كولا",
    category: "مشروبات",
    price: 6,
    available: true,
    description: "مشروب غازي بارد",
    imageUrl: "",
    modifierIds: ["mod10", "mod9"],
    ingredients: ["مشروب غازي"],
    allergens: [],
  },
  {
    id: "m5",
    name: "وجبة العائلة",
    category: "وجبات",
    price: 145,
    available: true,
    description: "4 برجر + 2 بطاطس كبيرة + 4 مشروبات + حلى",
    imageUrl: "",
    modifierIds: [],
    ingredients: ["برجر", "بطاطس", "مشروبات", "حلى"],
    allergens: ["جلوتين", "ألبان"],
  },
  {
    id: "m6",
    name: "كنافة",
    category: "حلويات",
    price: 25,
    available: false,
    description: "كنافة بالجبن مع القطر والفستق",
    imageUrl: "",
    modifierIds: ["mod11", "mod12"],
    ingredients: ["عجينة كنافة", "جبنة", "قطر", "فستق"],
    allergens: ["جلوتين", "ألبان", "مكسرات"],
  },
];

export const seedBranches: Branch[] = [
  {
    id: "b1",
    name: "فرع الياسمين",
    address: "حي الياسمين، شارع الأمير محمد بن سلمان، الرياض",
    hours: "12:00 ظهراً - 2:00 صباحاً",
    whatsappNumber: "+966 50 123 4567",
    deliveryZones: ["الياسمين", "النرجس", "العقيق"],
    open: true,
    notes: "الفرع الرئيسي، يدعم التوصيل والاستلام",
    whatsappConnected: true,
    phone: "+966 50 123 4567",
  },
  {
    id: "b2",
    name: "فرع العليا",
    address: "حي العليا، طريق الملك فهد، الرياض",
    hours: "1:00 ظهراً - 1:00 صباحاً",
    whatsappNumber: "+966 50 234 5678",
    deliveryZones: ["العليا", "السليمانية", "المروج"],
    open: true,
    notes: "",
    whatsappConnected: true,
    phone: "+966 50 234 5678",
  },
  {
    id: "b3",
    name: "فرع النرجس",
    address: "حي النرجس، شارع أنس بن مالك، الرياض",
    hours: "12:00 ظهراً - 12:00 منتصف الليل",
    whatsappNumber: "",
    deliveryZones: ["النرجس", "الياسمين", "بنبان"],
    open: false,
    notes: "بانتظار ربط رقم واتساب",
    whatsappConnected: false,
    phone: "+966 50 345 6789",
  },
];

export const seedDeliveryAreas: DeliveryArea[] = [
  { id: "d1", name: "الياسمين", minOrder: 30, deliveryFee: 10, estimatedTime: "30-45 دقيقة", active: true },
  { id: "d2", name: "النرجس", minOrder: 30, deliveryFee: 12, estimatedTime: "35-50 دقيقة", active: true },
  { id: "d3", name: "العليا", minOrder: 40, deliveryFee: 15, estimatedTime: "40-55 دقيقة", active: true },
  { id: "d4", name: "العقيق", minOrder: 35, deliveryFee: 12, estimatedTime: "35-50 دقيقة", active: false },
];

export const seedFaqs: FaqItem[] = [
  { id: "f1", question: "كم وقت التوصيل؟", answer: "عادة من 30 إلى 45 دقيقة حسب المنطقة.", category: "التوصيل", active: true },
  { id: "f2", question: "هل يوجد حد أدنى للطلب؟", answer: "الحد الأدنى للتوصيل 30 ر.س.", category: "التوصيل", active: true },
  { id: "f3", question: "ما طرق الدفع المتاحة؟", answer: "مدى، آبل باي، والبطاقات الائتمانية عبر رابط الدفع.", category: "الدفع", active: true },
  { id: "f4", question: "هل يمكنني الدفع نقداً؟", answer: "حالياً ندعم الدفع الإلكتروني فقط عبر رابط الدفع.", category: "الدفع", active: true },
  { id: "f5", question: "ما هي أوقات العمل؟", answer: "نعمل يومياً من 12:00 ظهراً حتى 2:00 صباحاً.", category: "عام", active: true },
];

export const seedPolicies: Policies = {
  refund: "يحق للعميل طلب استرجاع المبلغ خلال 24 ساعة في حال وجود خطأ في الطلب أو مشكلة في الجودة.",
  cancellation: "يمكن إلغاء الطلب قبل بدء التحضير. بعد بدء التحضير لا يمكن الإلغاء.",
  delivery: "التوصيل متاح داخل مناطق التغطية المحددة. رسوم التوصيل تختلف حسب المنطقة.",
  replacement: "",
  payment: "الدفع إلكتروني عبر رابط آمن. يتم تأكيد الطلب بعد إتمام الدفع.",
};

export const seedAiTone: AiToneConfig = {
  personality: "friendly",
  responseLength: "medium",
  emojiUsage: "minimal",
  language: "ar",
  greeting: "السلام عليكم ورحمة الله، أهلاً بك في مطعم الذواقة 🌟",
};
