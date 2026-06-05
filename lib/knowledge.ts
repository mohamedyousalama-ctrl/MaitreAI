// ============================================================================
// MaitreAI — Local knowledge health computation (no AI involved)
// Derives the Restaurant Brain score from how completely the owner has
// configured each area. Pure functions over store state.
// ============================================================================

import type {
  Branch,
  DeliveryArea,
  FaqItem,
  KnowledgeArea,
  KnowledgeAlert,
  KnowledgeStatus,
  MenuItem,
  Modifier,
  Policies,
  AiToneConfig,
} from "./types";

export function statusFromScore(score: number): KnowledgeStatus {
  if (score >= 80) return "complete";
  if (score >= 50) return "attention";
  return "missing";
}

const pct = (filled: number, total: number) => (total === 0 ? 0 : Math.round((filled / total) * 100));
const avg = (nums: number[]) => (nums.length === 0 ? 0 : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length));

/** Per-item readiness: how complete is this menu item for the AI to use it. */
export function menuItemReadiness(item: MenuItem): number {
  const checks = [
    item.description.trim().length > 0,
    item.price > 0,
    item.ingredients.length > 0,
    item.imageUrl.trim().length > 0,
    item.modifierIds.length > 0,
  ];
  return pct(checks.filter(Boolean).length, checks.length);
}

function branchCompleteness(b: Branch): number {
  const checks = [
    b.name.trim().length > 0,
    b.address.trim().length > 0,
    b.hours.trim().length > 0,
    b.whatsappNumber.trim().length > 0,
    b.deliveryZones.length > 0,
  ];
  return pct(checks.filter(Boolean).length, checks.length);
}

interface KnowledgeInput {
  menuItems: MenuItem[];
  modifiers: Modifier[];
  branches: Branch[];
  faqs: FaqItem[];
  policies: Policies;
  deliveryAreas: DeliveryArea[];
  aiTone: AiToneConfig;
}

const FAQ_TARGET = 5;
const DELIVERY_TARGET = 3;

export function computeKnowledgeAreas(input: KnowledgeInput): KnowledgeArea[] {
  const { menuItems, branches, faqs, policies, deliveryAreas, aiTone } = input;

  const menuScore = menuItems.length === 0 ? 0 : avg(menuItems.map(menuItemReadiness));
  const branchScore = branches.length === 0 ? 0 : avg(branches.map(branchCompleteness));

  const activeFaqs = faqs.filter((f) => f.active).length;
  const faqScore = Math.min(100, Math.round((activeFaqs / FAQ_TARGET) * 100));

  const policyValues = Object.values(policies);
  const policyScore = pct(policyValues.filter((p) => p.trim().length > 0).length, policyValues.length);

  const activeAreas = deliveryAreas.filter((d) => d.active).length;
  const deliveryScore = Math.min(100, Math.round((activeAreas / DELIVERY_TARGET) * 100));

  const aiScore = aiTone.greeting.trim().length > 0 ? 100 : 60;

  const build = (key: string, label: string, score: number, detail: string): KnowledgeArea => ({
    key,
    label,
    score,
    status: statusFromScore(score),
    detail,
  });

  return [
    build("menu", "معرفة المنيو", menuScore, `${menuItems.length} صنف — اكتمال البيانات ${menuScore}%`),
    build("branch", "معرفة الفروع", branchScore, `${branches.length} فرع — اكتمال البيانات ${branchScore}%`),
    build("faq", "الأسئلة الشائعة", faqScore, `${activeFaqs} من ${FAQ_TARGET} أسئلة مفعّلة`),
    build("policy", "السياسات", policyScore, `${policyValues.filter((p) => p.trim()).length} من ${policyValues.length} سياسات مكتملة`),
    build("delivery", "مناطق التوصيل", deliveryScore, `${activeAreas} مناطق مفعّلة`),
    build("ai", "إعدادات الذكاء", aiScore, aiScore === 100 ? "مكتملة" : "تحتاج رسالة ترحيب"),
  ];
}

export function computeOverallScore(areas: KnowledgeArea[]): number {
  return avg(areas.map((a) => a.score));
}

const POLICY_LABELS: Record<keyof Policies, string> = {
  refund: "الاسترجاع",
  cancellation: "الإلغاء",
  delivery: "التوصيل",
  replacement: "الاستبدال",
  payment: "الدفع",
};

export function computeAlerts(input: KnowledgeInput): KnowledgeAlert[] {
  const { menuItems, branches, faqs, policies, deliveryAreas } = input;
  const alerts: KnowledgeAlert[] = [];

  // Empty policies
  (Object.keys(policies) as (keyof Policies)[]).forEach((key) => {
    if (!policies[key].trim()) {
      alerts.push({
        id: `policy-${key}`,
        area: "السياسات",
        message: `سياسة ${POLICY_LABELS[key]} غير مكتملة — يحتاج الذكاء الاصطناعي نصاً واضحاً`,
        severity: "high",
      });
    }
  });

  // Branches without whatsapp
  branches.forEach((b) => {
    if (!b.whatsappNumber.trim()) {
      alerts.push({
        id: `branch-${b.id}`,
        area: "الفروع",
        message: `${b.name} غير مرتبط برقم واتساب`,
        severity: "medium",
      });
    }
  });

  // Low-readiness menu items
  menuItems.forEach((m) => {
    const r = menuItemReadiness(m);
    if (r < 60) {
      alerts.push({
        id: `menu-${m.id}`,
        area: "المنيو",
        message: `صنف «${m.name}» تنقصه بيانات (جاهزية ${r}%)`,
        severity: r < 40 ? "medium" : "low",
      });
    }
  });

  // FAQ coverage
  const activeFaqs = faqs.filter((f) => f.active).length;
  if (activeFaqs < FAQ_TARGET) {
    alerts.push({
      id: "faq-coverage",
      area: "الأسئلة الشائعة",
      message: `أضف ${FAQ_TARGET - activeFaqs} أسئلة شائعة على الأقل لتحسين الردود`,
      severity: "low",
    });
  }

  // Delivery coverage
  const activeAreas = deliveryAreas.filter((d) => d.active).length;
  if (activeAreas < DELIVERY_TARGET) {
    alerts.push({
      id: "delivery-coverage",
      area: "مناطق التوصيل",
      message: `فعّل ${DELIVERY_TARGET - activeAreas} مناطق توصيل إضافية على الأقل`,
      severity: "low",
    });
  }

  return alerts;
}
