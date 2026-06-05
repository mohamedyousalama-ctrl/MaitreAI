// ============================================================================
// MaitreAI — Payment helpers: Arabic labels, status colors, methods.
// Local mock only — no real provider.
// ============================================================================

import type { PaymentMethodKey, PaymentSessionStatus } from "./types";

export const PAYMENT_SESSION_LABELS: Record<PaymentSessionStatus, string> = {
  created: "تم الإنشاء",
  link_sent: "تم إرسال الرابط",
  opened: "تم فتح الرابط",
  paid: "مدفوع",
  failed: "فشل الدفع",
  expired: "منتهي الصلاحية",
  cancelled: "ملغي",
  refunded: "مسترجع",
};

export const PAYMENT_SESSION_STYLES: Record<PaymentSessionStatus, string> = {
  created: "bg-slate-50 text-slate-600 ring-slate-200",
  link_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  opened: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  paid: "bg-purple-50 text-purple-700 ring-purple-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-amber-50 text-amber-700 ring-amber-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
  refunded: "bg-red-50 text-red-700 ring-red-200",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  mada: "مدى",
  applepay: "آبل باي",
  card: "بطاقة ائتمانية",
};

export const DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/** A session is open for payment (link active, not yet resolved). */
export function isSessionActive(status: PaymentSessionStatus): boolean {
  return status === "created" || status === "link_sent" || status === "opened";
}
