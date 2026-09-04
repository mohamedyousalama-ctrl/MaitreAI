// ============================================================================
// Kivo — /terms — Public terms of service page
// Required for Meta App Review. Publicly reachable, no authentication.
// WO-A5-PRIVACY: Arabic-first + English secondary section, KSA + Egypt aware.
// DRAFT FOR LEGAL REVIEW. Open business decisions marked «[قرار مطلوب: …]».
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "الشروط والأحكام — Kivo",
  description: "شروط وأحكام استخدام منصة Kivo لإدارة الطلبات عبر واتساب.",
};

function DraftBanner() {
  return (
    <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p dir="rtl">
        ⚠️ <strong>مسودة قيد المراجعة القانونية.</strong> هذه الشروط نسخة أولية تعكس الخدمة الحالية،
        وتحتاج مراجعة مستشار قانوني قبل اعتمادها كصيغة نهائية. البنود المعلّمة بـ «[قرار مطلوب: …]» قرارات عمل لم تُحسم بعد.
      </p>
      <p className="mt-1" dir="ltr">
        ⚠️ <strong>Draft — pending legal review.</strong> These terms reflect the current service and must be
        reviewed by counsel before they are treated as final. Items marked “[قرار مطلوب: …]” are open business decisions.
      </p>
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">الشروط والأحكام</h1>
        <p className="mt-2 text-sm text-slate-500" dir="ltr">Terms of Service — Last updated: July 2026</p>

        <DraftBanner />

        <div className="mt-10 space-y-8 text-slate-700 leading-relaxed" dir="rtl">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١. القبول بالشروط</h2>
            <p>
              باستخدامك لمنصة Kivo تقر بموافقتك على هذه الشروط والأحكام. إذا كنت تستخدم الخدمة نيابةً عن مطعم أو شركة،
              فأنت تقر بأن لديك الصلاحية للقبول بهذه الشروط باسم تلك الجهة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٢. وصف الخدمة</h2>
            <p>Kivo مساعد ذكي لاستقبال طلبات المطاعم عبر واتساب. تُمكِّن المنصة أصحاب المطاعم من:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>ربط رقم واتساب الخاص بالمطعم عبر واجهة Meta (WhatsApp Cloud API).</li>
              <li>تشغيل وكيل طلبات ذكي (كريم في مصر، خالد في السعودية) يرد على عملاء المطعم.</li>
              <li>إدارة المنيو والطلبات وعمليات التوصيل عبر لوحة تحكم Kivo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٣. الأدوار: البائع ومزوّد البرمجيات</h2>
            <p>
              <strong>المطعم هو البائع وصاحب المسؤولية التجارية (merchant of record)</strong> عن كل طلب: المنتجات، الأسعار،
              الدفع، والتوصيل، وهو المتحكم في بيانات عملائه. <strong>Kivo مزوّد برمجيات واتصالات</strong> يشغّل قناة الطلب،
              وليس بائعًا للطعام ولا طرفًا في عقد البيع بين المطعم وعميله.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٤. التزامات المطعم</h2>
            <p>بوصفك صاحب أو مشغّل مطعم، تلتزم بما يلي:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>تقديم معلومات منيو ومنتجات وأسعار دقيقة وحقيقية.</li>
              <li>الاستجابة للحالات التي يُحوِّلها النظام إلى موظف بشري (خاصة حالات الحساسية والسلامة الغذائية).</li>
              <li>الامتثال لسياسات واتساب وMeta في التواصل مع العملاء.</li>
              <li>عدم استخدام المنصة لإرسال رسائل غير مرغوب فيها أو محتوى مضلل.</li>
              <li>الحفاظ على سرية بيانات اعتماد حسابك.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٥. المسؤولية عن المحتوى</h2>
            <p>
              أنت المسؤول الكامل عن دقة المنيو والأسعار والمعلومات التي تُدخلها في المنصة.
              Kivo لا يتحمل المسؤولية عن أي خطأ ناتج عن بيانات منيو غير دقيقة أو غير محدَّثة.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٦. الذكاء الاصطناعي والقيود</h2>
            <p>
              يعمل وكيل الطلبات بتقنية نماذج الذكاء الاصطناعي. ورغم وجود بوابات أمان صارمة (خاصة في حالات الحساسية الغذائية)،
              لا يمكن ضمان الكمال المطلق في أداء النظام. يجب على أصحاب المطاعم الإشراف على المحادثات والطلبات ومراجعتها بصفة دورية.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٧. الخصوصية وبيانات العملاء</h2>
            <p>
              أنت تُقرّ بأنك المتحكم في بيانات عملاء مطعمك الذين يتواصلون عبر واتساب، وبأن Kivo معالجٌ بالنيابة عنك. راجع{" "}
              <Link href="/privacy" className="text-emerald-700 underline">سياسة الخصوصية</Link>{" "}
              لمزيد من التفاصيل حول كيفية معالجة هذه البيانات.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٨. الدفع والاشتراك</h2>
            <p>
              يتم الدفع بين العميل والمطعم مباشرةً (نقدًا عند الاستلام، محفظة، أو دفع إلكتروني عند تفعيله)، والمطعم هو المسؤول عنه.
              أما رسوم اشتراك المطعم في Kivo فتخضع للاتفاق التجاري.
              <em> [قرار مطلوب: رسوم الاشتراك ودورة الفوترة وسياسة الاسترداد]</em>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٩. توقف الخدمة والصيانة</h2>
            <p>
              قد تتوقف الخدمة مؤقتاً لأغراض الصيانة أو التحديث أو لأسباب خارجة عن إرادتنا. نسعى لإشعارك مسبقاً بأوقات الصيانة المجدولة.
              تُقدَّم الخدمة «كما هي» دون ضمان توافر متواصل.
              <em> [قرار مطلوب: أي التزام بمستوى خدمة (SLA) إن وُجد]</em>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٠. حدود المسؤولية</h2>
            <p>
              في أقصى حدود ما يسمح به النظام، لا تتحمل مؤسسة عمر حجاب المطيري للتجارة المسؤولية عن أي خسائر غير مباشرة أو عرضية أو تبعية
              تنشأ عن استخدام المنصة أو توقفها.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١١. إنهاء الاشتراك</h2>
            <p>
              يحق لك إنهاء استخدام المنصة في أي وقت، ويحق لنا تعليق أو إنهاء حساب أي مطعم يُخالف هذه الشروط.
              عند الإنهاء يمكنك طلب نسخة من بياناتك أو حذفها عبر{" "}
              <Link href="/data-deletion" className="text-emerald-700 underline">صفحة حذف البيانات</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٢. القانون المعمول به</h2>
            <p>
              بالنسبة للمطاعم في مصر، تخضع هذه الشروط للقانون المصري، وأي نزاع يُحال إلى المحاكم المختصة في القاهرة.
              <em> [قرار مطلوب: القانون الحاكم والاختصاص القضائي لعملاء المملكة العربية السعودية]</em>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٣. التعديلات والتواصل</h2>
            <p>
              نحتفظ بحق تعديل هذه الشروط في أي وقت، ونُخطرك بالتغييرات الجوهرية عبر البريد الإلكتروني؛ واستمرارك في الاستخدام بعد التعديل يُعدّ قبولاً.
              لأي استفسار:{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>
            </p>
          </section>
        </div>

        {/* ── English secondary section (same page, LTR) ── */}
        <div className="mt-14 border-t border-slate-200 pt-10 space-y-6 text-slate-700 leading-relaxed" dir="ltr">
          <h2 className="text-2xl font-bold text-slate-900">Terms of Service (English summary)</h2>
          <p className="text-sm text-slate-500">
            This English section summarizes the Arabic terms above; the Arabic text is the primary version. <strong>Draft — pending legal review.</strong>
          </p>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Service &amp; roles</h3>
            <p className="text-sm">
              Kivo is a WhatsApp-based AI ordering assistant for restaurants, a product of مؤسسة عمر حجاب المطيري للتجارة (Riyadh, Saudi Arabia). The <strong>restaurant is the merchant of record</strong> for every order — products, prices, payment, delivery — and the controller of its customers’ data. <strong>Kivo is a software and communications provider</strong>, not the seller of food and not a party to the sale between a restaurant and its customer.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Restaurant obligations</h3>
            <p className="text-sm">
              Provide accurate menu/price data; respond to cases the system hands off to a human (especially allergy/food-safety cases); comply with WhatsApp/Meta policies; don’t send spam or misleading content; keep account credentials confidential.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">AI limitations</h3>
            <p className="text-sm">
              The ordering agent uses AI models. Despite strict safety gates (especially for food allergies), perfect performance can’t be guaranteed; restaurants must supervise conversations and orders regularly.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Payment, availability &amp; liability</h3>
            <p className="text-sm">
              Payment is between the customer and the restaurant (cash on delivery, wallet, or card where enabled). Kivo subscription fees are per commercial agreement <em>[قرار مطلوب: subscription fees, billing cycle, refunds]</em>. The service is provided “as is” without a guarantee of continuous availability <em>[قرار مطلوب: SLA, if any]</em>. To the maximum extent permitted by law, مؤسسة عمر حجاب المطيري للتجارة is not liable for indirect, incidental, or consequential losses.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Governing law</h3>
            <p className="text-sm">
              For restaurants in Egypt, Egyptian law applies (courts of Cairo). <em>[قرار مطلوب: governing law &amp; jurisdiction for Saudi Arabia customers.]</em> See the <Link href="/privacy" className="text-emerald-700 underline">Privacy Policy</Link> and <Link href="/data-deletion" className="text-emerald-700 underline">Data Deletion</Link> pages.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-slate-100 pt-8 text-xs text-slate-400 text-center" dir="ltr">
          <p>Kivo is a product of مؤسسة عمر حجاب المطيري للتجارة — Unified National Number 7055031913 — Riyadh, Saudi Arabia</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
