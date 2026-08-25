// ============================================================================
// Kivo Delivery Network — private driver/customer link helpers (PURE).
//
// The operator must be able to copy/share the assigned driver link to WhatsApp
// without the token being rendered into evidence prose, logs, or a visible
// monospace URL. The raw URL stays in memory for clipboard / wa.me only.
// ============================================================================

const TOKEN_PATH = /(\/d\/r\/|\/d\/|\/t\/|\/p\/)[A-Za-z0-9_-]+/g;

/** Strip token path segments so a URL can be named in logs/handback. */
export function redactDeliveryUrl(url: string): string {
  return url.replace(TOKEN_PATH, "$1[redacted]");
}

export function isTokenBearingUrl(url: string): boolean {
  return /\/(?:d\/r|d|t|p)\/[A-Za-z0-9_-]{8,}/.test(url);
}

/** WhatsApp share deep-link. The token stays in the href, never in surrounding UI copy. */
export function whatsappShareHref(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`صفحة التوصيل:\n${link}`)}`;
}

export function whatsappDispatchLabel(status: string): string {
  if (status === "sent") return "تم إرسال الرابط عبر واتساب.";
  if (status === "failed") return "تعذّر إرسال واتساب. انسخ الرابط وشاركه مع المندوب.";
  // skipped / unknown — do NOT say «وضع تجريبي»; the Cairo surface is a Pilot, not a demo.
  return "لم يُرسل عبر واتساب. انسخ الرابط وشاركه مع المندوب.";
}
