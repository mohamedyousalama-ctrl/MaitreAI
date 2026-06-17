"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsCard, SettingsRow, Toggle } from "@/components/ui/SettingsCard";
import { TextField, SelectField, TextAreaField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WhatsAppStatusCard } from "@/components/messaging/WhatsAppStatusCard";
import { PrintSettingsCard } from "@/components/settings/PrintSettingsCard";
import { TaxSettingsCard } from "@/components/settings/TaxSettingsCard";
import { OutboundLogList } from "@/components/messaging/MessageLogList";
import { useMessageLogStore } from "@/lib/messaging/message-log-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import type { AiEmojiUsage, AiLanguage, AiPersonality, AiResponseLength } from "@/lib/types";
import {
  Settings as SettingsIcon,
  Store,
  MessageCircle,
  CreditCard,
  Bot,
  Hand,
  Languages,
  RotateCcw,
} from "lucide-react";

const PERSONALITY_OPTS: { value: AiPersonality; label: string }[] = [
  { value: "formal", label: "رسمي" },
  { value: "friendly", label: "ودود" },
  { value: "premium", label: "راقٍ" },
  { value: "fastfood", label: "وجبات سريعة" },
  { value: "luxury", label: "فاخر" },
];
const LENGTH_OPTS: { value: AiResponseLength; label: string }[] = [
  { value: "short", label: "قصيرة" },
  { value: "medium", label: "متوسطة" },
  { value: "detailed", label: "مفصلة" },
];
const EMOJI_OPTS: { value: AiEmojiUsage; label: string }[] = [
  { value: "none", label: "بدون" },
  { value: "minimal", label: "قليل" },
  { value: "normal", label: "عادي" },
];
const LANG_OPTS: { value: AiLanguage; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
  { value: "bilingual", label: "ثنائي اللغة" },
];

export default function SettingsPage() {
  const hydrated = useHasHydrated();
  const profile = useRestaurantStore((s) => s.profile);
  const updateProfile = useRestaurantStore((s) => s.updateProfile);
  const aiTone = useRestaurantStore((s) => s.aiTone);
  const updateAiTone = useRestaurantStore((s) => s.updateAiTone);
  const resetAll = useRestaurantStore((s) => s.resetAll);
  const outbound = useMessageLogStore((s) => s.outbound);

  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div>
      {/* الفروع + مناطق التوصيل folded into الإعدادات (Amendment 04 §M2) */}
      <a
        href="/branches"
        className="mb-4 flex items-center justify-between rounded-xl border border-[#e4d8c8] bg-white px-4 py-3 text-sm font-semibold text-[#2a211b] hover:bg-[#faf6ef]"
      >
        <span className="flex flex-col">
          إدارة الفروع ومناطق التوصيل
          <span className="text-xs font-normal text-[#9b8b7c]">الفروع وكل منطقة توصيل تابعة لها في مكان واحد</span>
        </span>
        <span className="text-xs text-[#9b8b7c]">الفروع ومناطق التوصيل ←</span>
      </a>
      <PageHeader
        title="الإعدادات"
        subtitle="إعداد المطعم والتكاملات وقواعد الموظف الذكي"
        icon={SettingsIcon}
        accentBg="bg-settings"
        actions={
          <button
            onClick={() => setResetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" /> استعادة الافتراضي
          </button>
        }
      />

      {!hydrated ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-64 animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Restaurant profile — editable */}
          <SettingsCard title="ملف المطعم" description="المعلومات الأساسية للمطعم (تُحفظ تلقائياً)" icon={Store} accentBg="bg-branches">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="اسم المطعم" value={profile.name} onChange={(v) => updateProfile({ name: v })} />
              <TextField label="رابط الشعار" value={profile.logoUrl} onChange={(v) => updateProfile({ logoUrl: v })} placeholder="https://..." />
              <TextField label="الهاتف" value={profile.phone} onChange={(v) => updateProfile({ phone: v })} />
              <TextField label="البريد الإلكتروني" value={profile.email} onChange={(v) => updateProfile({ email: v })} />
              <TextField label="العملة" value={profile.currency} onChange={(v) => updateProfile({ currency: v })} />
              <TextField label="اللغة الافتراضية" value={profile.defaultLanguage} onChange={(v) => updateProfile({ defaultLanguage: v })} />
              <TextField label="المنطقة الزمنية" value={profile.timezone} onChange={(v) => updateProfile({ timezone: v })} />
              <TextField label="نوع النشاط" value={profile.businessType} onChange={(v) => updateProfile({ businessType: v })} />
            </div>
          </SettingsCard>

          {/* AI tone — editable */}
          <SettingsCard title="إعدادات نبرة الذكاء" description="كيف يتحدث الموظف الذكي مع العملاء" icon={Bot} accentBg="bg-brain">
            <div className="space-y-4">
              <SelectField
                label="الشخصية"
                value={aiTone.personality}
                onChange={(v) => updateAiTone({ personality: v })}
                options={PERSONALITY_OPTS}
              />
              <StatusSelector
                label="طول الرد"
                value={aiTone.responseLength}
                onChange={(v) => updateAiTone({ responseLength: v as AiResponseLength })}
                options={LENGTH_OPTS}
              />
              <StatusSelector
                label="استخدام الإيموجي"
                value={aiTone.emojiUsage}
                onChange={(v) => updateAiTone({ emojiUsage: v as AiEmojiUsage })}
                options={EMOJI_OPTS}
              />
              <StatusSelector
                label="اللغة"
                value={aiTone.language}
                onChange={(v) => updateAiTone({ language: v as AiLanguage })}
                options={LANG_OPTS}
              />
              <TextAreaField label="رسالة الترحيب" value={aiTone.greeting} onChange={(v) => updateAiTone({ greeting: v })} rows={2} />
            </div>
          </SettingsCard>

          {/* WhatsApp connection — live status (Sprint 6) */}
          <WhatsAppStatusCard />

          {/* Print settings — auto-print + paper width (S9-5 / §O #5) */}
          <PrintSettingsCard />

          {/* Tax / VAT — inclusive (default) vs added (Sprint 10) */}
          <TaxSettingsCard />

          {/* Payment provider — placeholder */}
          <SettingsCard title="بوابة الدفع" description="مزود خدمة الدفع وروابط الدفع" icon={CreditCard} accentBg="bg-promotions">
            <SettingsRow label="المزود" value="غير مفعّل (تجريبي)" />
            <SettingsRow label="مدى" value={<Toggle checked />} />
            <SettingsRow label="آبل باي" value={<Toggle checked />} />
            <SettingsRow label="البطاقات الائتمانية" value={<Toggle checked={false} />} />
            <p className="text-xs text-slate-400">* تكامل الدفع الفعلي سيتم في مرحلة لاحقة.</p>
          </SettingsCard>

          {/* Human takeover rules — placeholder */}
          <SettingsCard title="قواعد التدخل البشري" description="متى يتم تحويل المحادثة لموظف" icon={Hand} accentBg="bg-kitchen">
            <SettingsRow label="تحويل عند الشكاوى" value={<Toggle checked />} />
            <SettingsRow label="تحويل عند انخفاض الثقة (<50%)" value={<Toggle checked />} />
            <SettingsRow label="تحويل عند طلب العميل" value={<Toggle checked />} />
            <SettingsRow label="تحويل خارج أوقات العمل" value={<Toggle checked={false} />} />
          </SettingsCard>

          {/* Language settings — placeholder */}
          <SettingsCard title="إعدادات اللغة" description="لغة الواجهة والردود" icon={Languages} accentBg="bg-settings">
            <SettingsRow label="لغة الواجهة" value="العربية (RTL)" />
            <SettingsRow label="لغة الردود الافتراضية" value={profile.defaultLanguage} />
            <SettingsRow label="الرد بلغة العميل تلقائياً" value={<Toggle checked />} />
          </SettingsCard>

          {/* Outbound message log (Sprint 6) */}
          <SettingsCard
            title="سجل الرسائل الصادرة"
            description="آخر الرسائل المرسلة عبر القنوات (محاكاة محلية)"
            icon={MessageCircle}
            accentBg="bg-orders"
          >
            <OutboundLogList entries={outbound.slice(0, 6)} />
          </SettingsCard>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="استعادة الإعدادات الافتراضية"
        message="سيتم مسح كل تعديلاتك المحلية والعودة لبيانات المطعم الافتراضية."
        confirmLabel="استعادة"
        onConfirm={() => {
          resetAll();
          setResetOpen(false);
        }}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
