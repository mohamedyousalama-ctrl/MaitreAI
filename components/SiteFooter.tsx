// ============================================================================
// MaitreAI — shared public-site footer
// Renders on the public pages (landing, /contact, auth pages). Shows the
// contact email and the Saudi establishment legal entity block (bilingual).
// NOT used inside the authenticated dashboard shell.
// ============================================================================

import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-8 text-center">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
          <Link href="/" className="transition hover:text-slate-900">
            الرئيسية
          </Link>
          <Link href="/contact" className="transition hover:text-slate-900">
            اتصل بنا
          </Link>
          <Link href="/privacy" className="transition hover:text-slate-900">
            سياسة الخصوصية
          </Link>
          <Link href="/terms" className="transition hover:text-slate-900">
            الشروط والأحكام
          </Link>
          <Link href="/data-deletion" className="transition hover:text-slate-900">
            حذف البيانات
          </Link>
          <a href="mailto:info@getkivo.io" className="transition hover:text-slate-900" dir="ltr">
            info@getkivo.io
          </a>
        </nav>

        <div className="mt-5 space-y-1 text-xs leading-relaxed text-slate-500">
          <p dir="rtl">
            Kivo هو منتج من مؤسسة عمر حجاب المطيري للتجارة — الرقم الوطني الموحد ٧٠٥٥٠٣١٩١٣ —
            الرياض، المملكة العربية السعودية
          </p>
          <p dir="ltr">
            Kivo is a product of مؤسسة عمر حجاب المطيري للتجارة — Unified National Number
            7055031913 — Riyadh, Saudi Arabia
          </p>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          © {year} مؤسسة عمر حجاب المطيري للتجارة — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  );
}
