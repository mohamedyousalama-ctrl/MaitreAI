// ============================================================================
// Kivo (KSA) — WO-PAYLINK-MSG: the customer pay-link message COMPOSER (pure).
// Kept import-free (no server-only / @/ value imports) so it is node
// strip-types-testable and can be a blocking CI gate. The send helper that binds
// tenant creds + WhatsApp lives in ./paylink.ts.
// ============================================================================

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);

function fmtTotal(total: number): string {
  const n = Number(total || 0);
  // Exact amount — never round away halalas. Strip a redundant ".00".
  return toAr(Number.isInteger(n) ? String(n) : n.toFixed(2));
}

/** The verbatim customer pay-link message (PM-approved template). Carries the
 *  order #, the VAT-inclusive total in ر.س, the 15-min expiry, and the
 *  anti-phishing safety line. */
export function payLinkMessage(args: {
  restaurantName: string;
  orderNumber: string;
  total: number;
  payUrl: string;
}): string {
  const raw = String(args.orderNumber ?? "");
  const num = raw.startsWith("#") ? raw : `#${raw}`;
  return [
    `مطعم ${args.restaurantName}`,
    `طلبك رقم ${toAr(num)} — رابط الدفع الآمن 👇`,
    `الإجمالي: ${fmtTotal(args.total)} ر.س (شامل ضريبة القيمة المضافة ١٥٪)`,
    args.payUrl,
    `⏳ الرابط صالح ١٥ دقيقة — بعدها اطلب رابطاً جديداً.`,
    `🔒 الدفع يتم فقط داخل صفحة الدفع الآمنة — لا تشارك بيانات بطاقتك في المحادثة.`,
  ].join("\n");
}
