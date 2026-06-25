// ============================================================================
// Kivo — /terms — Public terms of service page
// Required for Meta App Review. Publicly reachable, no authentication.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "الشروط والأحكام — Kivo",
  description: "شروط وأحكام استخدام منصة Kivo لإدارة الطلبات عبر واتساب.",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">الشروط والأحكام</h1>
        <p className="mt-2 text-sm text-slate-500" dir="ltr">Terms of Service — Last updated: June 2026</p>

        <div className="mt-10 space-y-8 text-slate-700 leading-relaxed" dir="rtl">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١. القبول بالشروط</h2>
            <p>
              باستخدامك لمنصة Kivo، تقر بموافقتك على هذه الشروط والأحكام. إذا كنت تستخدم
              الخدمة نيابةً عن مطعم أو شركة، فأنت تقر بأن لديك الصلاحية للقبول بهذه الشروط
              باسم تلك الجهة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٢. وصف الخدمة</h2>
            <p>
              Kivo هو نظام تشغيل للطلبات المباشرة للمطاعم. تُمكِّن المنصة أصحاب المطاعم من:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>ربط رقم واتساب الخاص بالمطعم عبر واجهة برمجية Meta (WhatsApp Cloud API).</li>
              <li>تشغيل وكيل طلبات ذكي (كريم) يرد على عملاء المطعم.</li>
              <li>إدارة المنيو والطلبات وعمليات التوصيل عبر لوحة تحكم Kivo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٣. التزامات المطعم</h2>
            <p>بوصفك صاحب أو مشغّل مطعم، تلتزم بما يلي:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>تقديم معلومات منيو ومنتجات دقيقة وحقيقية.</li>
              <li>الاستجابة للحالات التي يُحوِّلها النظام إلى موظف بشري (خاصة حالات الحساسية والسلامة الغذائية).</li>
              <li>الامتثال لسياسات واتساب وMeta في التواصل مع العملاء.</li>
              <li>عدم استخدام المنصة لإرسال رسائل غير مرغوب فيها أو محتوى مضلل.</li>
              <li>الحفاظ على سرية بيانات اعتماد حسابك.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٤. المسؤولية عن المحتوى</h2>
            <p>
              أنت المسؤول الكامل عن دقة المنيو والأسعار والمعلومات التي تُدخلها في المنصة.
              Kivo لا يتحمل المسؤولية عن أي خطأ ناتج عن بيانات منيو غير دقيقة أو غير محدَّثة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٥. الذكاء الاصطناعي والقيود</h2>
            <p>
              وكيل الطلبات (كريم) يعمل بتقنية نماذج الذكاء الاصطناعي. على الرغم من وجود بوابات
              أمان صارمة (خاصة في حالات الحساسية الغذائية)، لا يمكن ضمان الكمال المطلق في أداء
              النظام. يجب على أصحاب المطاعم الإشراف على المحادثات والطلبات ومراجعتها بصفة دورية.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٦. الخصوصية وبيانات العملاء</h2>
            <p>
              أنت تُقرّ بأنك المتحكم في بيانات عملاء مطعمك الذين يتواصلون عبر واتساب. راجع{" "}
              <Link href="/privacy" className="text-emerald-700 underline">سياسة الخصوصية</Link>{" "}
              لمزيد من التفاصيل حول كيفية معالجة هذه البيانات.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٧. توقف الخدمة والصيانة</h2>
            <p>
              قد تتوقف الخدمة مؤقتاً لأغراض الصيانة أو التحديث أو لأسباب خارجة عن إرادتنا.
              نسعى لإشعارك مسبقاً بأوقات الصيانة المجدولة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٨. حدود المسؤولية</h2>
            <p>
              في أقصى حدود ما يسمح به القانون، لا تتحمل شركة سيتي بيكر (ش.ذ.م.م) المسؤولية
              عن أي خسائر غير مباشرة أو عرضية أو تبعية تنشأ عن استخدام المنصة أو توقفها.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٩. إنهاء الاشتراك</h2>
            <p>
              يحق لك إنهاء استخدام المنصة في أي وقت. يحق لنا أيضاً تعليق أو إنهاء حساب أي
              مطعم يُخالف هذه الشروط. عند الإنهاء، يمكنك طلب نسخة من بياناتك أو حذفها عبر{" "}
              <Link href="/data-deletion" className="text-emerald-700 underline">صفحة حذف البيانات</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٠. القانون المعمول به</h2>
            <p>
              تخضع هذه الشروط للقانون المصري. أي نزاع يُحال إلى المحاكم المختصة في القاهرة، مصر.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١١. التعديلات</h2>
            <p>
              نحتفظ بحق تعديل هذه الشروط في أي وقت. سنُخطرك بالتغييرات الجوهرية عبر البريد
              الإلكتروني. استمرارك في استخدام الخدمة بعد التعديل يُعدّ قبولاً بالشروط المحدَّثة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٢. التواصل</h2>
            <p>
              لأي استفسار حول هذه الشروط:{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>
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
