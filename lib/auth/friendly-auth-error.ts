// ============================================================================
// MaitreAI — friendly auth-error mapping (pure; browser+server safe).
//
// Supabase auth errors come back in English; the login surfaces short, friendly
// Arabic (SPEC 01 §3) instead of leaking a raw provider code. Extracted from
// app/login/LoginForm.tsx so the mapping is unit-testable (FR-001).
//
// FR-001 (field report): when the email provider is briefly down, Supabase returns
// "Error sending magic link email" and the user saw the generic fallback. That is a
// TRANSIENT delivery problem, not bad input — so it gets its own honest line telling
// them to retry shortly, not "check your data".
// ============================================================================

/** Map a raw provider auth-error message to a short, friendly Arabic line. */
export function friendlyAuthError(message: string): string {
  const m = (message || "").toLowerCase();
  // Transient email-delivery failure (provider hiccup) — retry shortly, not a data error.
  if (m.includes("magic link") || (m.includes("sending") && m.includes("email"))) {
    return "في مشكلة مؤقتة في إرسال رمز الدخول — جرّب تاني بعد شوية.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "حاولت كتير في وقت قصير، استنى دقيقة وجرّب تاني.";
  }
  if (m.includes("invalid") || m.includes("expired") || m.includes("token") || m.includes("otp")) {
    return "الرمز غلط أو خلصت صلاحيته، اطلب رمز جديد.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed")) {
    return "في مشكلة في الاتصال، اطمئن على النت وجرّب تاني.";
  }
  if (m.includes("not allowed") || m.includes("disabled") || m.includes("locked")) {
    return "الحساب ده مش متاح حالياً، كلّم الدعم.";
  }
  return "معرفناش نكمّل، اتأكد من البيانات وجرّب تاني.";
}
