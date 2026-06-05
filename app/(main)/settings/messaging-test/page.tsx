"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { TextField, TextAreaField, SelectField } from "@/components/ui/FormControls";
import { OutboundLogList, InboundLogList } from "@/components/messaging/MessageLogList";
import { useConversationEngine } from "@/lib/ai/useConversationEngine";
import { useMessageLogStore } from "@/lib/messaging/message-log-store";
import { useHasHydrated } from "@/lib/store";
import { ACTIVE_CHANNELS, CHANNEL_LABELS } from "@/lib/messaging/types";
import type { ChannelKey } from "@/lib/messaging/types";
import { MessageCircle, Send, ArrowRight, Trash2 } from "lucide-react";

const CHANNEL_OPTS = ACTIVE_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }));

export default function MessagingTestPage() {
  const hydrated = useHasHydrated();
  const { simulateInbound } = useConversationEngine();
  const outbound = useMessageLogStore((s) => s.outbound);
  const inbound = useMessageLogStore((s) => s.inbound);
  const clearLog = useMessageLogStore((s) => s.clear);

  const [channel, setChannel] = useState<ChannelKey>("whatsapp");
  const [phone, setPhone] = useState("+966 50 000 0000");
  const [name, setName] = useState("عميل تجريبي");
  const [text, setText] = useState("السلام عليكم، أبغى أطلب برجر كلاسيك");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSend = phone.trim().length > 0 && text.trim().length > 0;

  const onSimulate = () => {
    if (!canSend) return;
    const convId = simulateInbound({ channel, phone, name, text });
    if (convId) {
      setSentTo(convId);
      setText("");
    }
  };

  return (
    <div>
      <PageHeader
        title="محاكي الرسائل"
        subtitle="حاكِ رسالة واردة من عميل واختبر رد الموظف الذكي محلياً"
        icon={MessageCircle}
        accentBg="bg-conversations"
        actions={
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <ArrowRight className="h-4 w-4" /> رجوع للإعدادات
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Inbound simulator form */}
        <SettingsCard
          title="محاكاة رسالة واردة"
          description="تنشئ/تجد المحادثة، تشغّل محرك الذكاء المحلي، وتسجّل الرد في سجل الصادر"
          icon={Send}
          accentBg="bg-conversations"
        >
          <SelectField
            label="القناة"
            value={channel}
            onChange={(v) => setChannel(v as ChannelKey)}
            options={CHANNEL_OPTS}
            hint="القنوات المفعّلة حالياً فقط (واتساب نشط، البقية لاحقاً)"
          />
          <TextField label="رقم العميل" value={phone} onChange={setPhone} placeholder="+9665..." />
          <TextField label="اسم العميل" value={name} onChange={setName} placeholder="اختياري" />
          <TextAreaField label="نص الرسالة" value={text} onChange={setText} rows={3} />
          <button
            onClick={onSimulate}
            disabled={!canSend}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" /> محاكاة الإرسال
          </button>
          {sentTo && (
            <Link
              href="/conversations"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-conversations/30 bg-conversations/5 px-4 py-2.5 text-sm font-semibold text-conversations hover:bg-conversations/10"
            >
              فتح المحادثات لرؤية الرد →
            </Link>
          )}
          <p className="text-xs text-slate-400">
            * لا يتم إرسال أي رسالة فعلية عبر الشبكة في الوضع التجريبي.
          </p>
        </SettingsCard>

        {/* Live logs */}
        <div className="space-y-5">
          {!hydrated ? (
            <div className="card h-48 animate-pulse bg-slate-50" />
          ) : (
            <>
              <SettingsCard title="سجل الوارد" description="الرسائل التي تم حقنها محلياً" accentBg="bg-customers">
                <InboundLogList entries={inbound} />
              </SettingsCard>
              <SettingsCard title="سجل الصادر" description="رسائل الموظف الذكي عبر القناة" accentBg="bg-orders">
                <div className="flex justify-end">
                  <button
                    onClick={clearLog}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> مسح السجل
                  </button>
                </div>
                <OutboundLogList entries={outbound} />
              </SettingsCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
