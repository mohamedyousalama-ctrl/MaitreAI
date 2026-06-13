"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SettingsCard, SettingsRow } from "@/components/ui/SettingsCard";
import { useMessageLogStore } from "@/lib/messaging/message-log-store";
import { useHasHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";
import { MessageCircle, Copy, Check, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

interface WhatsAppStatus {
  channel: string;
  configured: boolean;
  mode: "connected" | "not_configured" | "test";
  checks: {
    accessToken: boolean;
    phoneNumberId: boolean;
    verifyToken: boolean;
    appSecret: boolean;
  };
}

const MODE_META: Record<WhatsAppStatus["mode"], { label: string; cls: string }> = {
  connected: { label: "متصل", cls: "text-emerald-600" },
  test: { label: "وضع تجريبي", cls: "text-sky-600" },
  not_configured: { label: "غير مُهيأ", cls: "text-amber-600" },
};

function Yes() {
  return <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />;
}
function No() {
  return <XCircle className="inline h-4 w-4 text-slate-300" />;
}

export function WhatsAppStatusCard() {
  const hydrated = useHasHydrated();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const lastInbound = useMessageLogStore((s) => s.inbound[0]);
  const lastOutbound = useMessageLogStore((s) => s.outbound[0]);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
    fetch("/api/channels/whatsapp/status")
      .then((r) => r.json())
      .then((d: WhatsAppStatus) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const mode = status ? MODE_META[status.mode] : { label: "...", cls: "text-slate-400" };

  return (
    <SettingsCard
      title="ربط واتساب"
      description="حالة الاتصال بواتساب للأعمال (WhatsApp Cloud API)"
      icon={MessageCircle}
      accentBg="bg-conversations"
    >
      <SettingsRow label="الحالة" value={<span className={cn("font-semibold", mode.cls)}>{mode.label}</span>} />
      <SettingsRow label="رمز الوصول (Access Token)" value={status?.checks.accessToken ? <Yes /> : <No />} />
      <SettingsRow label="معرّف رقم الهاتف (Phone Number ID)" value={status?.checks.phoneNumberId ? <Yes /> : <No />} />
      <SettingsRow label="رمز التحقق (Verify Token)" value={status?.checks.verifyToken ? <Yes /> : <No />} />
      <SettingsRow label="السر (App Secret)" value={status?.checks.appSecret ? <Yes /> : <No />} />

      {/* Webhook URL + copy */}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-700">رابط الـ Webhook</p>
        <div className="flex items-center gap-2">
          <code
            dir="ltr"
            className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            {webhookUrl || "..."}
          </code>
          <button
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "تم النسخ" : "نسخ"}
          </button>
        </div>
      </div>

      {/* Last test activity */}
      <SettingsRow
        label="آخر رسالة واردة (اختبار)"
        value={hydrated && lastInbound ? <span className="truncate">{lastInbound.text}</span> : "—"}
      />
      <SettingsRow
        label="آخر رسالة صادرة (اختبار)"
        value={hydrated && lastOutbound ? <span className="truncate">{lastOutbound.text}</span> : "—"}
      />

      <Link
        href="/settings/messaging-test"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <ExternalLink className="h-4 w-4" /> فتح محاكي الرسائل
      </Link>

      <p className="text-xs text-slate-400">
        * لا يُعرض رمز الوصول أبداً. الإرسال الفعلي يتطلب ضبط متغيرات البيئة (الوضع التجريبي حالياً).
      </p>
    </SettingsCard>
  );
}
