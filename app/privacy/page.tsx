// ============================================================================
// Kivo — /privacy — Public privacy policy page
// Required for Meta App Review. Publicly reachable, no authentication.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — Kivo",
  description: "سياسة خصوصية Kivo — كيف نجمع بياناتك ونستخدمها ونحميها.",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-slate-500" dir="ltr">Privacy Policy — Last updated: June 2026</p>

        <div className="mt-10 space-y-8 text-slate-700 leading-relaxed" dir="rtl">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١. من نحن</h2>
            <p>
              Kivo هو منتج من شركة سيتي بيكر (ش.ذ.م.م)، سجل تجاري رقم ٢١٦٥٦٥،
              ١٤٩ شارع النصر، المعادي، القاهرة، مصر.
              للتواصل: <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٢. البيانات التي نجمعها</h2>
            <p>نجمع البيانات التالية لتشغيل خدمة Kivo:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>بيانات المطعم: الاسم، الشعار، المنيو، ساعات العمل، مناطق التوصيل، إعدادات النظام.</li>
              <li>بيانات المستخدمين (أصحاب ومشغّلو المطاعم): البريد الإلكتروني، الدور الوظيفي.</li>
              <li>بيانات عملاء المطعم: رقم الهاتف (واتساب)، رسائل المحادثة، بيانات الطلبات.</li>
              <li>بيانات الاستخدام: سجلات النظام، أداء الوكيل الذكي، إحصاءات الجلسات.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٣. كيف نستخدم بياناتك</h2>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>تشغيل وكيل الطلبات الذكي (كريم) وتلقّي الطلبات عبر واتساب.</li>
              <li>عرض المحادثات والطلبات في لوحة تحكم المطعم.</li>
              <li>إرسال إشعارات الطلبات والإيصالات للعملاء.</li>
              <li>تحسين جودة الخدمة وأداء النظام.</li>
            </ul>
            <p className="mt-2 text-sm">لا نبيع بياناتك لأي طرف ثالث.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٤. مشاركة البيانات</h2>
            <p>قد نشارك بياناتك مع الجهات التالية فقط لتشغيل الخدمة:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li><strong>Meta (WhatsApp Cloud API):</strong> لإرسال واستقبال رسائل واتساب.</li>
              <li><strong>Supabase:</strong> قاعدة البيانات (مستضافة في الاتحاد الأوروبي).</li>
              <li><strong>Anthropic:</strong> نماذج الذكاء الاصطناعي لمعالجة رسائل العملاء.</li>
              <li><strong>Vercel:</strong> استضافة التطبيق.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٥. الاحتفاظ بالبيانات</h2>
            <p>
              نحتفظ ببيانات المطعم والمحادثات طوال مدة الاشتراك النشط. عند إلغاء الحساب،
              يمكنك طلب حذف بياناتك عبر البريد الإلكتروني أو عبر صفحة{" "}
              <Link href="/data-deletion" className="text-emerald-700 underline">حذف البيانات</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٦. أمان البيانات</h2>
            <p>
              نستخدم تشفير البيانات أثناء النقل (HTTPS/TLS)، وتشفير بيانات الاعتماد الحساسة
              (مثل توكن واتساب) في قاعدة البيانات، وسياسات أمان مستوى الصف (RLS) في Supabase
              لعزل بيانات كل مطعم عن الآخر.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٧. حقوقك</h2>
            <p>يحق لك في أي وقت:</p>
            <ul className="mt-2 list-disc list list-inside space-y-1 text-sm">
              <li>الاطلاع على البيانات التي نحتفظ بها عنك.</li>
              <li>تصحيح أي بيانات غير دقيقة.</li>
              <li>طلب حذف بياناتك (راجع صفحة <Link href="/data-deletion" className="text-emerald-700 underline">حذف البيانات</Link>).</li>
              <li>الاعتراض على معالجة بياناتك.</li>
            </ul>
            <p className="mt-2 text-sm">
              لممارسة أي من هذه الحقوق، تواصل معنا على{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٨. ملفات تعريف الارتباط (Cookies)</h2>
            <p>
              نستخدم ملفات تعريف الارتباط لإدارة جلسات تسجيل الدخول فقط. لا نستخدم ملفات
              تعريف الارتباط للتتبع الإعلاني.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٩. التغييرات على هذه السياسة</h2>
            <p>
              قد نحدّث هذه السياسة من وقت لآخر. سنُخطرك بالتغييرات الجوهرية عبر البريد
              الإلكتروني أو إشعار داخل التطبيق.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٠. التواصل</h2>
            <p>
              لأي استفسار حول سياسة الخصوصية، تواصل معنا على{" "}
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
