// ============================================================================
// MaitreAI — public /contact page
// Contact email + company (legal entity) details. Publicly reachable.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "اتصل بنا — MaitreAI",
  description: "تواصل مع فريق MaitreAI وبيانات الشركة.",
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">اتصل بنا</h1>
        <p className="mt-3 text-slate-600">
          للاستفسارات والدعم والمبيعات، يسعدنا تواصلك معنا عبر البريد الإلكتروني:
        </p>
        <a
          href="mailto:info@maitre.chat"
          className="mt-3 inline-block text-lg font-semibold text-emerald-700 transition hover:text-emerald-800"
          dir="ltr"
        >
          info@maitre.chat
        </a>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-sm font-semibold text-slate-700">بيانات الشركة — Company Details</h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            <p dir="rtl">
              MaitreAI هو منتج من شركة سيتي بيكر (ش.ذ.م.م) — سجل تجاري رقم ٢١٦٥٦٥ — ١٤٩ شارع النصر،
              المعادي، القاهرة، مصر
            </p>
            <p dir="ltr">
              MaitreAI is a product of City Baker LLC — Commercial Register No. 216565 — 149 El-Nasr
              St., Maadi, Cairo, Egypt
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
