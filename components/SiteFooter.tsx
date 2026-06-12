// ============================================================================
// MaitreAI — shared public-site footer
// Renders on the public pages (landing, /contact, auth pages). Shows the
// contact email and the City Baker LLC legal entity block (bilingual, exact
// wording). NOT used inside the authenticated dashboard shell.
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
          <a href="mailto:info@maitre.chat" className="transition hover:text-slate-900" dir="ltr">
            info@maitre.chat
          </a>
        </nav>

        <div className="mt-5 space-y-1 text-xs leading-relaxed text-slate-500">
          <p dir="rtl">
            MaitreAI هو منتج من شركة سيتي بيكر (ش.ذ.م.م) — سجل تجاري رقم ٢١٦٥٦٥ — ١٤٩ شارع النصر،
            المعادي، القاهرة، مصر
          </p>
          <p dir="ltr">
            MaitreAI is a product of City Baker LLC — Commercial Register No. 216565 — 149 El-Nasr
            St., Maadi, Cairo, Egypt
          </p>
        </div>

        <p className="mt-5 text-xs text-slate-400">© {year} City Baker LLC — جميع الحقوق محفوظة</p>
      </div>
    </footer>
  );
}
