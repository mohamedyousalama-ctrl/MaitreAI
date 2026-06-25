// ============================================================================
// Kivo — /data-deletion — Public data deletion request page
// Required for Meta App Review (Facebook Login / WhatsApp data deletion callback).
// Publicly reachable, no authentication.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "حذف البيانات — Kivo",
  description: "طلب حذف بياناتك من منصة Kivo.",
};

export default function DataDeletionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">طلب حذف البيانات</h1>
        <p className="mt-2 text-sm text-slate-500" dir="ltr">Data Deletion Request — Last updated: June 2026</p>

        <div className="mt-10 space-y-8 text-slate-700 leading-relaxed" dir="rtl">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">كيف تطلب حذف بياناتك</h2>
            <p>
              لطلب حذف بياناتك من منصة Kivo، أرسل بريداً إلكترونياً إلى:
            </p>
            <p className="mt-3">
              <a
                href="mailto:info@getkivo.io?subject=طلب حذف البيانات"
                className="inline-block rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
                dir="ltr"
              >
                info@getkivo.io
              </a>
            </p>
            <p className="mt-4 text-sm text-slate-600">
              يُرجى تضمين الموضوع: <strong>«طلب حذف البيانات»</strong> وذكر اسم المطعم أو
              رقم الهاتف المرتبط بحسابك.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">ما الذي سيُحذف</h2>
            <p>عند تأكيد طلبك، سنحذف:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>حساب المطعم وبيانات المستخدمين المرتبطين به.</li>
              <li>بيانات المنيو والإعدادات والتكوينات.</li>
              <li>سجلات المحادثات والرسائل.</li>
              <li>بيانات العملاء (أرقام الهواتف وسجلات الطلبات).</li>
              <li>بيانات الاعتماد المخزنة (مثل توكن واتساب المُشفَّر).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">مدة المعالجة</h2>
            <p>
              سنُعالج طلبك خلال <strong>١٤ يوم عمل</strong> من استلامه وسنُرسل إليك تأكيداً
              بالبريد الإلكتروني عند اكتمال الحذف.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">ملاحظات</h2>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-slate-600">
              <li>قد نحتفظ ببعض البيانات التي يُلزمنا القانون الاحتفاظ بها (مثل سجلات الفوترة).</li>
              <li>حذف البيانات سيُنهي وصولك إلى منصة Kivo.</li>
              <li>
                بيانات عملاء المطعم المُخزَّنة في واتساب (Meta) تخضع لسياسة بيانات Meta المستقلة.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2" dir="ltr">Facebook / Meta — Data Deletion Callback</h2>
            <p className="text-sm" dir="ltr">
              If you connected Kivo to a Facebook or Meta business account and wish to revoke access
              and delete associated data, please email{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline">info@getkivo.io</a>{" "}
              with subject <strong>&ldquo;Meta Data Deletion Request&rdquo;</strong> and include your
              WhatsApp Business Account ID or the email address used during setup.
              We will process your request within 14 business days.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-slate-100 pt-8 text-xs text-slate-400 text-center" dir="ltr">
          <p>Kivo is a product of City Baker LLC — Commercial Register No. 216565 — Cairo, Egypt</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
