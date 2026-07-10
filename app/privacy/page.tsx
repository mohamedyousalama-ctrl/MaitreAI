// ============================================================================
// Kivo — /privacy — Public privacy policy page
// Required for Meta App Review. Publicly reachable, no authentication.
// WO-A5-PRIVACY: Arabic-first + English secondary section, PDPL (KSA) + Egypt
// aware. DRAFT FOR LEGAL REVIEW — counsel must review before this is final.
// Business-decision values not yet set by Mohamed are marked «[قرار مطلوب: …]».
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — Kivo",
  description: "سياسة خصوصية Kivo — كيف نجمع بياناتك ونستخدمها ونحميها.",
};

/** DRAFT-FOR-LEGAL-REVIEW banner (bilingual). Visible on the live page on purpose:
 *  these pages ship as drafts pending counsel — better than a Google-Doc link. */
function DraftBanner() {
  return (
    <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p dir="rtl">
        ⚠️ <strong>مسودة قيد المراجعة القانونية.</strong> هذه الصفحة نسخة أولية تعكس ممارساتنا الحالية،
        وتحتاج مراجعة مستشار قانوني قبل اعتمادها كصيغة نهائية. البنود المعلّمة بـ «[قرار مطلوب: …]» قرارات عمل لم تُحسم بعد.
      </p>
      <p className="mt-1" dir="ltr">
        ⚠️ <strong>Draft — pending legal review.</strong> This page reflects current practice and must be
        reviewed by counsel before it is treated as final. Items marked “[قرار مطلوب: …]” are open business decisions.
      </p>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link href="/" className="text-sm font-medium text-emerald-700 transition hover:text-emerald-800">
          ← العودة إلى الرئيسية
        </Link>

        <h1 className="mt-8 text-3xl font-bold text-slate-900">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-slate-500" dir="ltr">Privacy Policy — Last updated: July 2026</p>

        <DraftBanner />

        <div className="mt-10 space-y-8 text-slate-700 leading-relaxed" dir="rtl">

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١. من نحن ونطاق الخدمة</h2>
            <p>
              Kivo (كيفو) مساعد ذكي لاستقبال طلبات المطاعم عبر واتساب، يديره وكيلُ محادثة (كريم في مصر، خالد في السعودية).
              Kivo منتج من شركة سيتي بيكر (ش.ذ.م.م)، سجل تجاري رقم ٢١٦٥٦٥، ١٤٩ شارع النصر، المعادي، القاهرة، مصر.
              نخدم مطاعم في مصر والمملكة العربية السعودية، ونلتزم في السعودية بروح نظام حماية البيانات الشخصية (PDPL)،
              وفي مصر بقانون حماية البيانات الشخصية رقم ١٥١ لسنة ٢٠٢٠.
              للتواصل: <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٢. أدوارنا: من يتحكم في البيانات</h2>
            <p>
              بالنسبة لبيانات <strong>عملاء المطعم</strong> (رقم واتساب، الرسائل، الطلبات) يكون <strong>المطعم هو المتحكم في البيانات</strong>،
              وKivo <strong>معالِجٌ بالنيابة عنه</strong> — نعالج هذه البيانات لتشغيل خدمة الطلبات فقط، وفق تعليمات المطعم.
              المطعم هو <strong>البائع وصاحب المسؤولية التجارية (merchant of record)</strong> عن الطلبات والأسعار والدفع؛
              وKivo مزوّد برمجيات واتصالات وليس بائعًا للطعام.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٣. البيانات التي نجمعها</h2>
            <p>نجمع البيانات التالية لتشغيل خدمة Kivo:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>بيانات المطعم: الاسم، الشعار، المنيو، ساعات العمل، مناطق التوصيل، إعدادات النظام.</li>
              <li>بيانات المستخدمين (أصحاب ومشغّلو المطاعم): البريد الإلكتروني، الدور الوظيفي.</li>
              <li>بيانات عملاء المطعم: رقم الهاتف (واتساب)، رسائل المحادثة، وبيانات الطلبات (الأصناف، العنوان، طريقة الدفع).</li>
              <li>ملاحظات السلامة: عندما يذكر العميل حساسية غذائية أو ملاحظة صحية متعلقة بالطلب، نسجّلها كملاحظة على الطلب لتوجيه المطبخ وتنبيه الموظفين.</li>
              <li>الرسائل الصوتية: عند إرسال العميل ملاحظة صوتية، نحوّلها إلى نص لمعالجة الطلب.</li>
              <li>بيانات الاستخدام: سجلات النظام، أداء الوكيل الذكي، إحصاءات الجلسات.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٤. لماذا نعالج بياناتك (الغرض)</h2>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>تنفيذ الطلب: استقباله عبر واتساب، تسعيره من منيو المطعم، وتوجيهه للمطبخ.</li>
              <li>توجيه المطبخ والسلامة: تذكرة المطبخ مع ملاحظات الحساسية، وتحويل حالات السلامة إلى موظف بشري.</li>
              <li>عرض المحادثات والطلبات في لوحة تحكم المطعم، وإرسال الإشعارات والإيصالات للعملاء.</li>
              <li>تحسين جودة الخدمة وأداء النظام وأمنه.</li>
            </ul>
            <p className="mt-2 text-sm"><strong>لا نبيع بياناتك</strong> ولا نستخدم رسائل العملاء للإعلانات.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٥. واتساب وMeta (ناقل الرسائل)</h2>
            <p>
              تُرسَل الرسائل وتُستقبَل عبر <strong>واجهة واتساب السحابية من Meta (WhatsApp Cloud API)</strong> بوصفها
              <strong> ناقل الاتصال</strong>. يخضع استخدام واتساب أيضًا لشروط وسياسة خصوصية Meta/واتساب، وهي جهة مستقلة عنّا.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٦. مشاركة البيانات (مزوّدو الخدمة)</h2>
            <p>قد نشارك بياناتك مع الجهات التالية فقط لتشغيل الخدمة، وبأدنى قدرٍ لازم:</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li><strong>Meta (WhatsApp Cloud API):</strong> لإرسال واستقبال رسائل واتساب.</li>
              <li><strong>Supabase:</strong> قاعدة البيانات والاستضافة. <em>[قرار مطلوب: تأكيد منطقة استضافة البيانات (Supabase region) قبل ذكرها صراحةً]</em></li>
              <li><strong>Anthropic:</strong> نماذج الذكاء الاصطناعي لمعالجة رسائل العملاء وصياغة الردود.</li>
              <li><strong>Vercel:</strong> استضافة التطبيق.</li>
              <li><strong>مزوّد الدفع الإلكتروني</strong> (عند تفعيله للمطعم): لمعالجة الدفع — ميسّر في السعودية، ومحافظ محلية في مصر.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٧. الاحتفاظ بالبيانات</h2>
            <p>
              نحتفظ ببيانات المطعم والمحادثات والطلبات طوال مدة الاشتراك النشط لتشغيل الخدمة والسجل التشغيلي.
              عند إلغاء الحساب نحذف البيانات أو نُجهّلها خلال مدة معقولة
              <em> [قرار مطلوب: تحديد مدة الاحتفاظ بعد الإلغاء — مثلاً ٣٠ أو ٩٠ يومًا]</em>،
              مع مراعاة أي التزامات قانونية أو محاسبية بالاحتفاظ. يمكنك طلب الحذف في أي وقت عبر البريد الإلكتروني
              أو صفحة{" "}
              <Link href="/data-deletion" className="text-emerald-700 underline">حذف البيانات</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٨. أمان البيانات</h2>
            <p>
              نستخدم تشفير البيانات أثناء النقل (HTTPS/TLS)، وتشفير بيانات الاعتماد الحساسة (مثل توكن واتساب) في قاعدة البيانات،
              وسياسات أمان مستوى الصف (RLS) لعزل بيانات كل مطعم عن الآخر. لا يمكن ضمان أمان مطلق لأي نظام، لكننا نطبّق ضوابط متناسبة مع حساسية البيانات.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">٩. حقوقك</h2>
            <p>
              وفق الأنظمة المعمول بها (نظام حماية البيانات الشخصية PDPL في السعودية، وقانون حماية البيانات رقم ١٥١ لسنة ٢٠٢٠ في مصر) يحق لك:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
              <li>الاطلاع على البيانات التي نحتفظ بها عنك والحصول على نسخة منها.</li>
              <li>تصحيح أي بيانات غير دقيقة.</li>
              <li>طلب حذف بياناتك (راجع صفحة <Link href="/data-deletion" className="text-emerald-700 underline">حذف البيانات</Link>).</li>
              <li>الاعتراض على معالجة بياناتك أو تقييدها، وسحب الموافقة حيثما كانت المعالجة قائمة عليها.</li>
            </ul>
            <p className="mt-2 text-sm">
              بما أن المطعم هو المتحكم في بيانات عملائه، قد نوجّه بعض الطلبات إلى المطعم المعني. لممارسة حقوقك تواصل معنا على{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>.
              <em> [قرار مطلوب: تعيين مسؤول حماية بيانات (DPO) وقناة تواصل مخصّصة للخصوصية إن لزم للامتثال]</em>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١٠. ملفات تعريف الارتباط (Cookies)</h2>
            <p>
              نستخدم ملفات تعريف الارتباط لإدارة جلسات تسجيل دخول المشغّلين فقط. لا نستخدم ملفات تعريف الارتباط للتتبع الإعلاني.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">١١. التغييرات والتواصل</h2>
            <p>
              قد نحدّث هذه السياسة من وقت لآخر، ونُخطرك بالتغييرات الجوهرية عبر البريد الإلكتروني أو إشعار داخل التطبيق.
              لأي استفسار حول الخصوصية:{" "}
              <a href="mailto:info@getkivo.io" className="text-emerald-700 underline" dir="ltr">info@getkivo.io</a>
            </p>
          </section>
        </div>

        {/* ── English secondary section (same page, LTR) ── */}
        <div className="mt-14 border-t border-slate-200 pt-10 space-y-6 text-slate-700 leading-relaxed" dir="ltr">
          <h2 className="text-2xl font-bold text-slate-900">Privacy Policy (English summary)</h2>
          <p className="text-sm text-slate-500">
            This English section summarizes the Arabic policy above; the Arabic text is the primary version. <strong>Draft — pending legal review.</strong>
          </p>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Who we are &amp; scope</h3>
            <p className="text-sm">
              Kivo is a WhatsApp-based AI ordering assistant for restaurants (agent “Karim” in Egypt, “Khalid” in Saudi Arabia), a product of City Baker LLC
              (Commercial Register No. 216565, Cairo, Egypt). We serve restaurants in Egypt and Saudi Arabia and align with Saudi PDPL and Egypt’s Data Protection Law 151/2020.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Roles</h3>
            <p className="text-sm">
              For a restaurant’s <strong>customer</strong> data (WhatsApp number, messages, orders) the <strong>restaurant is the data controller</strong> and Kivo is a
              <strong> processor</strong> acting on its instructions. The restaurant is the <strong>merchant of record</strong> for orders, prices, and payment; Kivo is a software and communications provider, not the seller of food.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">What we process &amp; why</h3>
            <p className="text-sm">
              Conversation messages, order details, phone numbers, and allergy/safety notes — to receive and fulfil orders, route the kitchen ticket (including allergy notes), escalate safety cases to a human, show conversations in the restaurant’s console, and send receipts. Voice notes are transcribed to process the order. <strong>We do not sell your data</strong> and do not use customer messages for advertising.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">WhatsApp / Meta</h3>
            <p className="text-sm">
              Messages are sent and received via Meta’s <strong>WhatsApp Cloud API</strong> as the transport; Meta/WhatsApp is an independent party governed by its own terms and privacy policy.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Service providers</h3>
            <p className="text-sm">
              Meta (WhatsApp Cloud API), Supabase (database/hosting — <em>[قرار مطلوب: confirm data-residency region]</em>), Anthropic (AI models), Vercel (app hosting), and a payment processor when enabled (Moyasar in Saudi Arabia; local wallets in Egypt). Shared only to run the service.
            </p>
          </section>
          <section>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Retention, security &amp; your rights</h3>
            <p className="text-sm">
              We keep data for the active subscription and delete or anonymise it within a reasonable period after cancellation <em>[قرار مطلوب: retention period, e.g. 30/90 days]</em>, subject to legal obligations. We use TLS in transit, encryption of sensitive credentials, and row-level isolation per restaurant. You may access, correct, delete, or object to processing — contact <a href="mailto:info@getkivo.io" className="text-emerald-700 underline">info@getkivo.io</a>. Because the restaurant is the controller, some requests may be routed to it.
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
