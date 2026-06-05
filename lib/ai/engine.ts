// ============================================================================
// MaitreAI — Local mock AI engine (NO real AI / NO network)
// Rule-based intent detection + entity extraction + Arabic response generation
// driven entirely by the editable Restaurant Brain data. This simulates the
// real AI workflow before integrating any external model in a later sprint.
// ============================================================================

import type {
  AiToneConfig,
  Branch,
  DeliveryArea,
  ExtractedEntities,
  FaqItem,
  IntentResult,
  IntentType,
  KnowledgeSource,
  MenuItem,
  Modifier,
  Policies,
  RestaurantProfile,
  DraftOrder,
  OrderEntity,
} from "../types";

export interface Brain {
  profile: RestaurantProfile;
  menuItems: MenuItem[];
  modifiers: Modifier[];
  branches: Branch[];
  deliveryAreas: DeliveryArea[];
  faqs: FaqItem[];
  policies: Policies;
  aiTone: AiToneConfig;
}

// Arabic display labels for each intent (used in the context panel).
export const INTENT_LABELS: Record<IntentType, string> = {
  greeting: "ترحيب",
  menu_question: "سؤال عن المنيو",
  branch_question: "سؤال عن الفروع",
  working_hours: "أوقات العمل",
  delivery_area: "منطقة التوصيل",
  ingredient_allergen: "مكونات/حساسية",
  create_order: "طلب جديد",
  modify_order: "تعديل الطلب",
  cancel_order: "إلغاء الطلب",
  payment_question: "سؤال عن الدفع",
  order_tracking: "تتبع الطلب",
  complaint: "شكوى",
  human_request: "طلب موظف",
  unknown: "غير معروف",
};

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------
const AR_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

export function normalize(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
    .replace(/[ًٌٍَُِّْـ]/g, "") // diacritics + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NUMBER_WORDS: [string, number][] = [
  ["واحد", 1],
  ["اثنين", 2],
  ["اثنان", 2],
  ["زوج", 2],
  ["ثلاث", 3],
  ["اربع", 4],
  ["خمس", 5],
];

const has = (text: string, words: string[]) => words.some((w) => text.includes(normalize(w)));

// Core form of an Arabic word: drop a leading definite article "ال" so that
// clitic-prefixed forms (e.g. "للياسمين", "بالعليا") still match the name.
const core = (word: string) => word.replace(/^ال/, "");

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------
function quantityBefore(text: string, nameNorm: string): number {
  const idx = text.indexOf(nameNorm);
  if (idx < 0) return 1;
  const before = text.slice(Math.max(0, idx - 8), idx);
  const digit = before.match(/(\d+)\s*$/);
  if (digit) return Math.max(1, parseInt(digit[1], 10));
  for (const [w, n] of NUMBER_WORDS) if (before.includes(w)) return n;
  return 1;
}

const ALLERGEN_KEYWORDS = ["مكسرات", "البان", "الالبان", "جلوتين", "بيض", "قمح", "صويا", "سمك", "فستق"];

export function extractEntities(text: string, brain: Brain): ExtractedEntities {
  const items: OrderEntity[] = [];
  for (const m of brain.menuItems) {
    const nameNorm = normalize(m.name);
    if (nameNorm && text.includes(nameNorm)) {
      items.push({ name: m.name, quantity: quantityBefore(text, nameNorm) });
    }
  }

  // Modifiers: explicit library matches + generic "بدون X" patterns.
  const modifiers = new Set<string>();
  for (const mod of brain.modifiers) {
    if (mod.active && text.includes(normalize(mod.name))) modifiers.add(mod.name);
  }
  const withoutMatches = text.match(/بدون\s+[ا-ي]+/g);
  if (withoutMatches) withoutMatches.forEach((w) => modifiers.add(w.trim()));

  // Branch: match by any distinctive token of the branch name (excluding "فرع").
  // Strip a leading "ال" so Arabic clitics like "لل..."/"بال..." still match.
  let branch: string | undefined;
  for (const b of brain.branches) {
    const tokens = normalize(b.name)
      .split(" ")
      .filter((t) => t && t !== "فرع")
      .map(core);
    if (tokens.some((t) => t.length >= 3 && text.includes(t))) {
      branch = b.name;
      break;
    }
  }

  // Delivery area (clitic-aware)
  let deliveryArea: string | undefined;
  for (const a of brain.deliveryAreas) {
    const c = core(normalize(a.name));
    if (c.length >= 3 && text.includes(c)) {
      deliveryArea = a.name;
      break;
    }
  }

  const allergens = ALLERGEN_KEYWORDS.filter((k) => text.includes(normalize(k)));
  const paymentIntent = has(text, ["ادفع", "الدفع", "دفع", "رابط الدفع", "مدى", "ابل باي", "فيزا", "اونلاين"]);
  const complaintKeywords = ["مشكله", "تاخر", "بارد", "ناقص", "صرصور", "شكوي", "حشره", "خربان", "وسخ"].filter((k) =>
    text.includes(normalize(k))
  );

  return { items, modifiers: Array.from(modifiers), branch, deliveryArea, allergens, paymentIntent, complaintKeywords };
}

// ---------------------------------------------------------------------------
// Intent detection (priority ordered; uses extracted entities)
// ---------------------------------------------------------------------------
export function detectIntent(text: string, entities: ExtractedEntities): IntentType {
  if (has(text, ["موظف", "حولني", "تحويل", "ممثل", "مسؤول", "ابي احد يرد", "ابغي احد يرد", "خدمه العملاء"])) return "human_request";
  if (entities.complaintKeywords.length > 0 || has(text, ["سيي", "زفت", "ما عجبني", "رديء"])) return "complaint";
  if (has(text, ["الغ", "كنسل", "ما ابغاه", "ما ابيه", "الغاء", "ما اريده"])) return "cancel_order";
  if (entities.paymentIntent || has(text, ["كيف ادفع", "طريقه الدفع"])) return "payment_question";
  if (has(text, ["وين طلبي", "طلبي وين", "وصل الطلب", "الطلب وصل", "كم باقي", "وين الطلب", "متي يوصل", "حاله الطلب"])) return "order_tracking";

  const orderVerb = has(text, ["ابغي", "ابغا", "ابي", "اريد", "اطلب", "عطني", "ودي", "حاب اطلب", "ممكن اطلب", "اضف لي"]);
  const menuBrowse = has(text, ["المنيو", "منيو", "قائمه", "وش عندكم", "ايش عندكم", "شو عندكم", "وش فيه", "افضل", "تنصح"]);
  if (orderVerb && entities.items.length > 0) return "create_order";
  if (orderVerb && !menuBrowse) return "create_order";

  if (has(text, ["شيل", "بدل", "خليها", "خلها", "زياده", "نقص", "اضف جبنه", "غيرها"])) return "modify_order";
  if (has(text, ["توصلون", "توصيل", "التوصيل", "يوصل", "توصل", "تغطون", "كم التوصيل"]) || entities.deliveryArea) return "delivery_area";
  if (has(text, ["متي تفتحون", "تفتحون", "مفتوحين", "مفتوح", "اوقات العمل", "الدوام", "تسكرون", "ساعات العمل"])) return "working_hours";
  if (has(text, ["وين موقعكم", "موقعكم", "فرع", "فروع", "وين انتم", "العنوان", "وين تقعون"]) || entities.branch) return "branch_question";
  if (entities.allergens.length > 0 || has(text, ["مكسرات", "حساسيه", "يحتوي", "مكونات", "فيه لحم", "فيه دجاج", "حار"])) return "ingredient_allergen";
  if (menuBrowse || (entities.items.length > 0 && has(text, ["عندكم", "متوفر", "فيه", "موجود"]))) return "menu_question";
  if (has(text, ["السلام", "سلام", "هلا", "هلو", "مرحبا", "مساء الخير", "صباح الخير", "اهلا", "هاي"])) return "greeting";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Reply generation
// ---------------------------------------------------------------------------
const e = (tone: AiToneConfig, glyph: string) => (tone.emojiUsage === "none" ? "" : ` ${glyph}`);
const listNames = (items: { name: string }[]) => items.map((i) => i.name).join("، ");

function describeOrder(items: OrderEntity[]): string {
  return items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join("، ");
}

export function analyzeMessage(raw: string, brain: Brain): IntentResult {
  const text = normalize(raw);
  const entities = extractEntities(text, brain);
  const intent = detectIntent(text, entities);
  const tone = brain.aiTone;
  const name = brain.profile.name;

  let reply = "";
  let confidence = 70;
  let sources: KnowledgeSource[] = [];
  let suggestedAction = "";
  let status: IntentResult["status"] = "AI نشط";
  let escalate = false;
  let escalationReason: string | undefined;

  switch (intent) {
    case "greeting": {
      reply = `حياك الله${e(tone, "👋")} في ${name}، كيف أقدر أخدمك اليوم؟`;
      confidence = 98;
      sources = ["إعدادات النبرة"];
      suggestedAction = "عرض المنيو أو سؤال العميل عن طلبه";
      break;
    }
    case "menu_question": {
      sources = ["المنيو"];
      suggestedAction = "اقتراح صنف مناسب للعميل";
      if (entities.items.length > 0) {
        const item = brain.menuItems.find((m) => m.name === entities.items[0].name)!;
        confidence = 95;
        reply = item.available
          ? `نعم، ${item.name} متوفر بسعر ${item.price} ر.س.`
          : `${item.name} غير متوفر حالياً، لكن لدينا أصناف أخرى رائعة أقدر أرشحها لك.`;
      } else {
        const available = brain.menuItems.filter((m) => m.available);
        confidence = available.length ? 88 : 60;
        reply = available.length
          ? `أكيد، عندنا ${listNames(available)}. ماذا تحب تطلب؟`
          : "المنيو قيد التحديث حالياً، أمهلني لحظة وسأحوّلك لموظف.";
      }
      break;
    }
    case "branch_question": {
      sources = ["الفروع"];
      suggestedAction = "مشاركة موقع الفرع المناسب";
      const b = entities.branch ? brain.branches.find((x) => x.name === entities.branch) : undefined;
      if (b) {
        confidence = 92;
        reply = `نعم، ${b.name} يقع في ${b.address} ويعمل ${b.hours}.`;
      } else {
        confidence = 80;
        reply = brain.branches.length
          ? `لدينا الفروع التالية: ${listNames(brain.branches)}. أي فرع أقرب لك؟`
          : "سأحوّلك لموظف لتزويدك بمواقع الفروع.";
      }
      break;
    }
    case "working_hours": {
      sources = ["الفروع"];
      suggestedAction = "تأكيد أوقات العمل للعميل";
      confidence = 90;
      const b = (entities.branch && brain.branches.find((x) => x.name === entities.branch)) || brain.branches[0];
      reply = b ? `${b.name} يعمل ${b.hours}.` : "سأحوّلك لموظف لتأكيد أوقات العمل.";
      break;
    }
    case "delivery_area": {
      sources = ["مناطق التوصيل"];
      suggestedAction = "تأكيد التغطية ورسوم التوصيل";
      const area = entities.deliveryArea ? brain.deliveryAreas.find((a) => a.name === entities.deliveryArea) : undefined;
      if (area && area.active) {
        confidence = 95;
        reply = `نعم نوصل إلى ${area.name}. رسوم التوصيل ${area.deliveryFee} ر.س والوقت المتوقع ${area.estimatedTime}.`;
      } else if (area && !area.active) {
        confidence = 70;
        reply = `${area.name} خارج نطاق التوصيل حالياً. تقدر تختار الاستلام من أقرب فرع.`;
      } else {
        const placeHint = /(^|\s)ل[ا-ي]{3,}/.test(text) || text.includes(" الى ");
        if (placeHint) {
          confidence = 55;
          escalate = true;
          escalationReason = "منطقة توصيل غير مؤكدة";
          status = "يحتاج تدخل موظف";
          reply = "حالياً لا أملك تأكيداً لمنطقة التوصيل هذه. سأحوّل المحادثة لموظف للتأكد.";
        } else {
          confidence = 76;
          reply = "أي حي تحب نوصل له؟ وأخبرك بالرسوم والوقت المتوقع.";
        }
      }
      break;
    }
    case "ingredient_allergen": {
      sources = ["المنيو"];
      suggestedAction = "تأكيد المكونات أو التصعيد للموظف";
      const item = entities.items.length
        ? brain.menuItems.find((m) => m.name === entities.items[0].name)
        : undefined;
      const hasData = !!item && (item.allergens.length > 0 || item.ingredients.length > 0);
      if (hasData && item) {
        confidence = 90;
        const asked = entities.allergens[0];
        if (asked) {
          const contains = item.allergens.some((a) => normalize(a).includes(normalize(asked)));
          reply = contains
            ? `نعم، ${item.name} يحتوي على ${asked}.`
            : `لا، ${item.name} لا يحتوي على ${asked}.`;
        } else {
          reply = `${item.name} يحتوي على ${item.allergens.join(" و ") || "مكونات أساسية"}، ويمكن تعديله حسب رغبتك.`;
        }
      } else {
        confidence = 55;
        escalate = true;
        escalationReason = "معلومة مكونات/حساسية غير مؤكدة";
        status = "يحتاج تدخل موظف";
        reply = "أحتاج تأكيداً من الموظف بخصوص هذه المعلومة، سأحوّل المحادثة للمراجعة.";
      }
      break;
    }
    case "create_order": {
      sources = entities.modifiers.length ? ["المنيو", "الإضافات"] : ["المنيو"];
      if (entities.items.length > 0) {
        confidence = 94;
        status = "طلب قيد البناء";
        suggestedAction = "اقتراح إضافة بطاطس أو مشروب ثم تأكيد الطلب";
        const modText = entities.modifiers.length ? ` (${entities.modifiers.join("، ")})` : "";
        reply = `تمام، أضفت ${describeOrder(entities.items)}${modText} إلى الطلب. هل ترغب بإضافة بطاطس أو مشروب؟`;
      } else {
        confidence = 70;
        suggestedAction = "مساعدة العميل في اختيار صنف من المنيو";
        reply = "أبشر! وش تحب تطلب من المنيو؟";
      }
      break;
    }
    case "modify_order": {
      sources = ["الإضافات"];
      status = "طلب قيد البناء";
      suggestedAction = "تأكيد التعديلات على الطلب";
      confidence = entities.modifiers.length ? 88 : 70;
      reply = entities.modifiers.length
        ? `تمام، طبّقت التعديل: ${entities.modifiers.join("، ")}. شيء ثاني؟`
        : "تمام، عدّلت الطلب حسب طلبك. شيء ثاني؟";
      break;
    }
    case "cancel_order": {
      sources = ["السياسات"];
      confidence = 60;
      escalate = true;
      escalationReason = "طلب إلغاء يحتاج تأكيد";
      status = "يحتاج تدخل موظف";
      suggestedAction = "تأكيد الإلغاء عبر موظف حسب السياسة";
      reply = "طلب الإلغاء يحتاج تأكيد من موظف حسب سياسة الإلغاء، سأحوّل المحادثة الآن.";
      break;
    }
    case "payment_question": {
      sources = brain.policies.payment.trim() ? ["السياسات"] : ["الأسئلة الشائعة"];
      confidence = 85;
      status = "بانتظار الدفع";
      suggestedAction = "إرسال رابط الدفع";
      reply = "نوفّر الدفع الإلكتروني عبر رابط آمن (مدى، آبل باي، والبطاقات). بأرسل لك رابط الدفع الآن.";
      break;
    }
    case "order_tracking": {
      sources = ["الأسئلة الشائعة"];
      confidence = 80;
      suggestedAction = "تزويد العميل بحالة الطلب";
      reply = `طلبك قيد المتابعة، وبأحدثك بأي تطور${e(tone, "🛵")}.`;
      break;
    }
    case "complaint": {
      sources = ["السياسات"];
      confidence = 50;
      escalate = true;
      escalationReason = "شكوى عميل تتطلب تدخلاً بشرياً";
      status = "يحتاج تدخل موظف";
      suggestedAction = "تصعيد الشكوى لموظف خدمة العملاء";
      reply = `نعتذر لك عن المشكلة${e(tone, "🙏")} سأحوّل المحادثة فوراً لموظف لمساعدتك.`;
      break;
    }
    case "human_request": {
      sources = [];
      confidence = 60;
      escalate = true;
      escalationReason = "العميل طلب التحدث مع موظف";
      status = "تم التحويل لموظف";
      suggestedAction = "انتظار رد الموظف على العميل";
      reply = "أكيد، سأحوّل المحادثة الآن إلى أحد الموظفين.";
      break;
    }
    default: {
      sources = [];
      confidence = 40;
      escalate = true;
      escalationReason = "تعذّر فهم رسالة العميل";
      status = "يحتاج تدخل موظف";
      suggestedAction = "توضيح الطلب أو التصعيد لموظف";
      reply = "لم أفهم طلبك بشكل كامل. هل تقصد طلباً من المنيو، سؤالاً عن التوصيل، أو التحدث مع موظف؟";
    }
  }

  // Global confidence-based escalation safety net.
  if (confidence < 65 && !escalate) {
    escalate = true;
    escalationReason = escalationReason ?? "ثقة منخفضة في الرد";
    status = "يحتاج تدخل موظف";
  }

  return { intent, confidence, entities, sources, suggestedAction, reply, status, escalate, escalationReason };
}

// ---------------------------------------------------------------------------
// Lightweight draft order builder (NOT the real order engine — Sprint 4)
// ---------------------------------------------------------------------------
export function applyDraft(current: DraftOrder | undefined, result: IntentResult, brain: Brain): DraftOrder | undefined {
  const items = current ? current.items.map((i) => ({ ...i, modifiers: [...i.modifiers] })) : [];

  if (result.intent === "cancel_order") return { items: [] };

  if (result.intent === "create_order" && result.entities.items.length > 0) {
    for (const ent of result.entities.items) {
      const menu = brain.menuItems.find((m) => m.name === ent.name);
      const price = menu?.price ?? 0;
      const existing = items.find((i) => i.name === ent.name);
      if (existing) existing.quantity += ent.quantity;
      else items.push({ name: ent.name, quantity: ent.quantity, price, modifiers: [...result.entities.modifiers] });
    }
    return { items };
  }

  if (result.intent === "modify_order" && result.entities.modifiers.length > 0 && items.length > 0) {
    const last = items[items.length - 1];
    for (const mod of result.entities.modifiers) if (!last.modifiers.includes(mod)) last.modifiers.push(mod);
    return { items };
  }

  return current;
}
