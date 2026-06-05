import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsCard, SettingsRow, Toggle } from "@/components/ui/SettingsCard";
import { RESTAURANT } from "@/lib/mock-data";
import {
  Settings as SettingsIcon,
  Store,
  MessageCircle,
  CreditCard,
  Bot,
  Hand,
  Languages,
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="الإعدادات"
        subtitle="إعداد المطعم والتكاملات وقواعد الموظف الذكي"
        icon={SettingsIcon}
        accentBg="bg-settings"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Restaurant profile */}
        <SettingsCard title="ملف المطعم" description="المعلومات الأساسية للمطعم" icon={Store} accentBg="bg-branches">
          <SettingsRow label="اسم المطعم" value={RESTAURANT.name} />
          <SettingsRow label="العملة" value={`الريال السعودي (${RESTAURANT.currency})`} />
          <SettingsRow label="عدد الفروع" value="3 فروع" />
          <SettingsRow label="المنطقة الزمنية" value="توقيت الرياض (GMT+3)" />
        </SettingsCard>

        {/* WhatsApp connection */}
        <SettingsCard title="ربط واتساب" description="حالة الاتصال بواتساب للأعمال" icon={MessageCircle} accentBg="bg-conversations">
          <SettingsRow label="الحالة" value={<span className="font-semibold text-conversations">متصل (تجريبي)</span>} />
          <SettingsRow label="الرقم" value="+966 50 123 4567" />
          <SettingsRow label="الردود التلقائية" value={<Toggle checked />} />
          <p className="text-xs text-slate-400">* تكامل واتساب الفعلي سيتم في مرحلة لاحقة.</p>
        </SettingsCard>

        {/* Payment provider */}
        <SettingsCard title="بوابة الدفع" description="مزود خدمة الدفع وروابط الدفع" icon={CreditCard} accentBg="bg-promotions">
          <SettingsRow label="المزود" value="غير مفعّل (تجريبي)" />
          <SettingsRow label="مدى" value={<Toggle checked />} />
          <SettingsRow label="آبل باي" value={<Toggle checked />} />
          <SettingsRow label="البطاقات الائتمانية" value={<Toggle checked={false} />} />
          <p className="text-xs text-slate-400">* تكامل الدفع الفعلي سيتم في مرحلة لاحقة.</p>
        </SettingsCard>

        {/* AI tone settings */}
        <SettingsCard title="إعدادات نبرة الذكاء" description="كيف يتحدث الموظف الذكي مع العملاء" icon={Bot} accentBg="bg-brain">
          <SettingsRow label="الأسلوب" value="ودود ومحترف" />
          <SettingsRow label="اللهجة" value="سعودية خفيفة" />
          <SettingsRow label="استخدام الإيموجي" value={<Toggle checked />} />
          <SettingsRow label="اقتراح أصناف إضافية" value={<Toggle checked />} />
        </SettingsCard>

        {/* Human takeover rules */}
        <SettingsCard title="قواعد التدخل البشري" description="متى يتم تحويل المحادثة لموظف" icon={Hand} accentBg="bg-kitchen">
          <SettingsRow label="تحويل عند الشكاوى" value={<Toggle checked />} />
          <SettingsRow label="تحويل عند انخفاض الثقة (<50%)" value={<Toggle checked />} />
          <SettingsRow label="تحويل عند طلب العميل" value={<Toggle checked />} />
          <SettingsRow label="تحويل خارج أوقات العمل" value={<Toggle checked={false} />} />
        </SettingsCard>

        {/* Language settings */}
        <SettingsCard title="إعدادات اللغة" description="لغة الواجهة والردود" icon={Languages} accentBg="bg-settings">
          <SettingsRow label="لغة الواجهة" value="العربية (RTL)" />
          <SettingsRow label="لغة الردود الافتراضية" value="العربية" />
          <SettingsRow label="الرد بلغة العميل تلقائياً" value={<Toggle checked />} />
        </SettingsCard>
      </div>
    </div>
  );
}
