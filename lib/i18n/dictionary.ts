// ============================================================================
// MaitreAI — Item 12: i18n dictionary scaffold (فصحى + EN)
// A tiny, typed string table so console copy has ONE source of truth per key in
// both Modern Standard Arabic (فصحى — the neutral written register for a
// multi-dialect KSA/EG pilot) and English. Values are PLAIN static strings — a
// value with a runtime name/number must be composed via the Bdi/Num/Phone
// primitives at the call site, NEVER by interpolating into a dictionary string
// (that's exactly what the no-arabic-name-number-interpolation ESLint rule bans).
//
// Scaffold: a representative starter set, not the full surface. `t()` is the
// lookup; adding a key is type-checked in both languages by DICTIONARY's shape.
//
// PR 1 (console_v2) extends this with the app-shell vocabulary: the display-state
// labels the mapping table (lib/console-v2/display-state.ts) resolves via
// labelKey, the truth-state chips, attribution chips, and the one-rail sections.
// ============================================================================

import type { Lang } from "@/lib/i18n/dir";

export const DICTIONARY = {
  ar: {
    // nav — legacy + console_v2 one-rail items
    "nav.conversations": "المحادثات",
    "nav.orders": "الطلبات",
    "nav.customers": "العملاء",
    "nav.settings": "الإعدادات",
    "nav.liveShift": "الوردية المباشرة",
    "nav.outcomes": "النتائج",
    "nav.knowledge": "المعرفة",
    "nav.team": "الفريق",
    "nav.insights": "الرؤى",
    "nav.approvals": "الموافقات",
    "nav.askKivo": "اسأل كيفو",
    "nav.onboarding": "الإعداد",
    "nav.campaigns": "الحملات",
    // nav — one-rail section headers (MAIN / MODULES / CRM / ADMIN)
    "nav.section.main": "الرئيسي",
    "nav.section.modules": "الوحدات",
    "nav.section.crm": "إدارة العلاقات",
    "nav.section.admin": "الإدارة",
    // status / actions
    "status.live": "مباشر",
    "status.paused": "متوقف",
    "action.save": "حفظ",
    "action.cancel": "إلغاء",
    "customers.atRisk": "عملاء معرّضون للفقد",
    "customers.topBySpend": "الأعلى إنفاقاً",
    "handoff.notEntered": "لم تُدخَل في النظام",
    // display-state: orders (deriveOrderDisplay)
    "state.order.incoming": "طلب جديد",
    "state.order.awaiting_payment": "بانتظار الدفع",
    "state.order.confirmed": "مؤكَّد",
    "state.order.in_kitchen": "قيد التحضير",
    "state.order.ready": "جاهز",
    "state.order.on_the_way": "في الطريق",
    "state.order.completed": "مكتمل",
    "state.order.cancelled": "ملغى",
    // display-state: POS hand-off (derivePosDisplay)
    "state.pos.needs_pos": "بانتظار الإدخال في النظام",
    "state.pos.entered": "مُدخَل في النظام",
    "state.pos.sent_to_kitchen": "أُرسِل إلى المطبخ",
    // display-state: payments (derivePaymentDisplay)
    "state.pay.unpaid": "غير مدفوع",
    "state.pay.link_sent": "أُرسِل رابط الدفع",
    "state.pay.paid": "مدفوع",
    "state.pay.failed": "فشل الدفع",
    "state.pay.refunded": "مُسترجَع",
    // display-state: conversations (deriveConversationDisplay)
    "state.conv.ai_active": "المساعد نشط",
    "state.conv.human_active": "موظف يتولّى",
    "state.conv.human_idle": "موظف (غير نشط)",
    "state.conv.safety_hold": "إيقاف للسلامة",
    "state.conv.closed": "مغلقة",
    // attribution chips (deriveAttribution)
    "attr.ai": "المساعد",
    "attr.human": "موظف",
    "attr.system": "النظام",
    // truth-state chips (LIVE / GATHERING / DEGRADED / SOON)
    "truth.live": "مباشر",
    "truth.gathering": "جاري جمع البيانات",
    "truth.degraded": "خدمة متعثّرة",
    "truth.soon": "قريباً",
  },
  en: {
    "nav.conversations": "Conversations",
    "nav.orders": "Orders",
    "nav.customers": "Customers",
    "nav.settings": "Settings",
    "nav.liveShift": "Live Shift",
    "nav.outcomes": "Outcomes",
    "nav.knowledge": "Knowledge",
    "nav.team": "Team",
    "nav.insights": "Insights",
    "nav.approvals": "Approvals",
    "nav.askKivo": "Ask Kivo",
    "nav.onboarding": "Onboarding",
    "nav.campaigns": "Campaigns",
    "nav.section.main": "Main",
    "nav.section.modules": "Modules",
    "nav.section.crm": "CRM",
    "nav.section.admin": "Admin",
    "status.live": "Live",
    "status.paused": "Paused",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "customers.atRisk": "At-risk customers",
    "customers.topBySpend": "Top by spend",
    "handoff.notEntered": "Not entered",
    "state.order.incoming": "New",
    "state.order.awaiting_payment": "Awaiting payment",
    "state.order.confirmed": "Confirmed",
    "state.order.in_kitchen": "In kitchen",
    "state.order.ready": "Ready",
    "state.order.on_the_way": "On the way",
    "state.order.completed": "Completed",
    "state.order.cancelled": "Cancelled",
    "state.pos.needs_pos": "Awaiting POS entry",
    "state.pos.entered": "In POS",
    "state.pos.sent_to_kitchen": "Sent to kitchen",
    "state.pay.unpaid": "Unpaid",
    "state.pay.link_sent": "Link sent",
    "state.pay.paid": "Paid",
    "state.pay.failed": "Payment failed",
    "state.pay.refunded": "Refunded",
    "state.conv.ai_active": "Assistant active",
    "state.conv.human_active": "Staff handling",
    "state.conv.human_idle": "Staff (idle)",
    "state.conv.safety_hold": "Safety hold",
    "state.conv.closed": "Closed",
    "attr.ai": "Assistant",
    "attr.human": "Staff",
    "attr.system": "System",
    "truth.live": "Live",
    "truth.gathering": "Gathering data",
    "truth.degraded": "Degraded",
    "truth.soon": "Soon",
  },
} as const;

export type DictKey = keyof (typeof DICTIONARY)["ar"];

/** Look up a key in the given language. Both languages carry every key (enforced
 *  by the shared DictKey type), so a lookup never falls back to the raw key. */
export function t(key: DictKey, lang: Lang): string {
  return DICTIONARY[lang][key];
}
