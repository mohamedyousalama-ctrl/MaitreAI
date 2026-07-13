// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: plain-Arabic guidance per alert type.
//
// Mohamed is non-technical. Every alert that reaches him (WhatsApp / email) must
// say, in simple Arabic, WHAT broke and WHAT to do first ("افحص X / بلّغ فارس")
// — never a raw error type nobody can act on. This is the single source of truth
// for that text; the WhatsApp + email channels append it, and the runbook
// (docs/ALERTS_RUNBOOK_AR.md) mirrors it. Pure (no imports) — trivially testable.
//
// Keys are the CriticalAlertType strings. A type with no entry falls back to the
// bare detail (unchanged behavior for any type not listed here).
// ============================================================================

export interface AlertGuidance {
  /** One-line, plain-Arabic "what happened". */
  what: string;
  /** One-line, plain-Arabic "first action" — concrete, non-technical. */
  action: string;
}

const GUIDANCE: Record<string, AlertGuidance> = {
  // ── Monitoring sweep alerts (the launch blockers) ─────────────────────────
  delivery_silence: {
    what: "ما وصلتنا أي رسالة من العملاء على واتساب مدة طويلة والمطعم مفتوح — يمكن الاتصال بواتساب متوقف (زي عطل وصايا).",
    action: "ابعت رسالة تجربة لرقم المطعم على واتساب. لو ما وصلتك ردود، بلّغ فارس فوراً وافحص إعدادات Meta.",
  },
  webhook_signature_spike: {
    what: "واتساب يرفض رسائل كثيرة بسبب توقيع غير صحيح — غالباً App Secret أو التوقيع تغيّر (زي الحادثة السابقة).",
    action: "بلّغ فارس عشان يفحص WHATSAPP_APP_SECRET في الإعدادات ويتأكد إنه مطابق لإعدادات Meta.",
  },
  webhook_unresolved_spike: {
    what: "رسائل كثيرة جاية من رقم واتساب مو معروف في النظام، فتم تجاهلها — يمكن رقم مطعم خرج من الربط.",
    action: "بلّغ فارس عشان يتأكد إن أرقام المطاعم (phone_number_id) مربوطة صح في النظام.",
  },
  webhook_tenant_resolution_failed: {
    what: "رسالة واتساب وصلت لكن النظام رفض يربطها بأي مطعم لأن إعداد WHATSAPP_RESTAURANT_ID ناقص، ورفض التخمين حتى لا يرسلها لمطعم غلط.",
    action: "بلّغ فارس فوراً عشان يضبط WHATSAPP_RESTAURANT_ID أو ALERT_PLATFORM_RESTAURANT_ID في Vercel ويتأكد من ربط رقم واتساب بالمطعم الصحيح.",
  },
  agent_error_rate: {
    what: "المساعد الذكي (كريم) يفشل في الرد على نسبة عالية من العملaء — غالباً خدمة Claude فيها مشكلة أو بطء.",
    action: "افحص حالة Anthropic/Claude. المحادثات المتأثرة تحوّلت لموظف تلقائياً — تابعها من شاشة المحادثات.",
  },
  daily_spend: {
    what: "مصروف اليوم على الذكاء الاصطناعي (Claude) تجاوز الحد المحدد.",
    action: "راجع الاستهلاك. لو مرتفع بدون سبب، بلّغ فارس عشان يتأكد ما فيه استخدام غير طبيعي.",
  },
  uptime_down: {
    what: "النظام ما نجح في فحص نفسه — يمكن قاعدة البيانات غير متصلة أو إعداد ناقص.",
    action: "بلّغ فارس فوراً. لو الموقع كامل ما يفتح، اتصل به مباشرة.",
  },

  // ── Existing inline alerts (enriched so they're actionable too) ───────────
  agent_error: {
    what: "المساعد تعذّر عليه الرد على عميل، وتم تحويل المحادثة لموظف.",
    action: "افتح المحادثة المذكورة وردّ على العميل. لو تكررت كثير، بلّغ فارس.",
  },
  whatsapp_send_failed: {
    what: "رسالة رد ما وصلت للعميل على واتساب.",
    action: "افتح المحادثة وأعد إرسال الرد يدوياً. لو تكرر، بلّغ فارس.",
  },
  inbound_persist_failed: {
    what: "رسالة عميل وصلت لكن ما انحفظت في النظام.",
    action: "بلّغ فارس عشان يفحص قاعدة البيانات. العميل ممكن يحتاج تتواصل معه.",
  },
};

/** Plain-Arabic (what happened / first action) for an alert type, or null when
 *  the type has no dedicated guidance (callers fall back to the raw detail). */
export function alertGuidance(type: string): AlertGuidance | null {
  return GUIDANCE[type] ?? null;
}
