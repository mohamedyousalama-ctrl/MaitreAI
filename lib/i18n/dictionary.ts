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
// ============================================================================

import type { Lang } from "@/lib/i18n/dir";

export const DICTIONARY = {
  ar: {
    "nav.conversations": "المحادثات",
    "nav.orders": "الطلبات",
    "nav.customers": "العملاء",
    "nav.settings": "الإعدادات",
    "status.live": "مباشر",
    "status.paused": "متوقف",
    "action.save": "حفظ",
    "action.cancel": "إلغاء",
    "customers.atRisk": "عملاء معرّضون للفقد",
    "customers.topBySpend": "الأعلى إنفاقاً",
    "handoff.notEntered": "لم تُدخَل في النظام",
  },
  en: {
    "nav.conversations": "Conversations",
    "nav.orders": "Orders",
    "nav.customers": "Customers",
    "nav.settings": "Settings",
    "status.live": "Live",
    "status.paused": "Paused",
    "action.save": "Save",
    "action.cancel": "Cancel",
    "customers.atRisk": "At-risk customers",
    "customers.topBySpend": "Top by spend",
    "handoff.notEntered": "Not entered",
  },
} as const;

export type DictKey = keyof (typeof DICTIONARY)["ar"];

/** Look up a key in the given language. Both languages carry every key (enforced
 *  by the shared DictKey type), so a lookup never falls back to the raw key. */
export function t(key: DictKey, lang: Lang): string {
  return DICTIONARY[lang][key];
}
