"use client";

// ============================================================================
// MaitreAI — WhatsApp credentials card (Piece 3). Lets a restaurant enter its
// OWN WhatsApp Cloud API credentials (bring-your-own-number) without Vercel
// access. Non-secret fields (phone number id / WABA id / verify token) are shown
// and editable; the Access Token + App Secret are WRITE-ONLY — never fetched back
// to the browser (the card only knows they EXIST via a boolean) and a blank field
// leaves the saved value untouched. All reads/writes go through the server route
// (service role); this component never sees a decrypted secret.
// ============================================================================

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { cn } from "@/lib/utils";
import { MessageCircle, CheckCircle2, Loader2 } from "lucide-react";

interface WaSettings {
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  configured: boolean;
}

const FIELD_CLS =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-conversations";

export function WhatsAppCredentialsCard() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [accessToken, setAccessToken] = useState(""); // write-only (blank = keep)
  const [appSecret, setAppSecret] = useState(""); // write-only (blank = keep)
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasAppSecret, setHasAppSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/whatsapp")
      .then((r) => r.json())
      .then((d: WaSettings & { error?: string }) => {
        if (d.error) return;
        setPhoneNumberId(d.phoneNumberId ?? "");
        setWabaId(d.wabaId ?? "");
        setVerifyToken(d.verifyToken ?? "");
        setHasAccessToken(!!d.hasAccessToken);
        setHasAppSecret(!!d.hasAppSecret);
        setConfigured(!!d.configured);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          wabaId,
          verifyToken,
          // Only send secrets when the user typed something; blank = keep existing.
          ...(accessToken.trim() ? { accessToken } : {}),
          ...(appSecret.trim() ? { appSecret } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; configured?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setErr(d.error === "forbidden" ? "هذا الإجراء متاح للمدير فقط." : "تعذّر الحفظ، حاول مرة أخرى.");
        return;
      }
      // Reflect saved secrets as "exists" and clear the write-only inputs.
      if (accessToken.trim()) setHasAccessToken(true);
      if (appSecret.trim()) setHasAppSecret(true);
      setAccessToken("");
      setAppSecret("");
      setConfigured(!!d.configured);
      setSavedMsg("تم الحفظ");
      setTimeout(() => setSavedMsg(null), 2500);
    } catch {
      setErr("تعذّر الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="بيانات اعتماد واتساب (رقمك الخاص)"
      description="أدخل بيانات WhatsApp Cloud API لمطعمك لتشغيل الردود من رقمك"
      icon={MessageCircle}
      accentBg="bg-conversations"
    >
      {/* Status */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        {configured ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-600">مُهيأ — جاهز لاستقبال الرسائل على رقمك</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-amber-600">غير مُهيأ — أكمل الحقول المطلوبة واحفظ</span>
        )}
      </div>

      <div className="space-y-3 pt-1">
        <label className="block text-xs text-slate-500">
          معرّف رقم الهاتف (Phone Number ID)
          <input dir="ltr" inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" className={FIELD_CLS} />
        </label>

        <label className="block text-xs text-slate-500">
          معرّف حساب الأعمال (WABA ID)
          <input dir="ltr" value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" className={FIELD_CLS} />
        </label>

        <label className="block text-xs text-slate-500">
          رمز التحقق (Verify Token) — ألصقه في إعداد الـ Webhook بمنصة Meta
          <input dir="ltr" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="اختر نصاً سرياً وألصق نفسه في Meta" className={FIELD_CLS} />
        </label>

        <label className="block text-xs text-slate-500">
          رمز الوصول (Access Token) — سري، يُحفظ مشفّراً ولا يُعرض
          <input
            dir="ltr"
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={hasAccessToken ? "•••••• محفوظ — اتركه فارغاً للإبقاء عليه" : "ألصق رمز الوصول"}
            className={FIELD_CLS}
          />
        </label>

        <label className="block text-xs text-slate-500">
          سر التطبيق (App Secret) — سري، يُحفظ مشفّراً ولا يُعرض
          <input
            dir="ltr"
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={hasAppSecret ? "•••••• محفوظ — اتركه فارغاً للإبقاء عليه" : "ألصق سر التطبيق"}
            className={FIELD_CLS}
          />
        </label>

        <button
          onClick={save}
          disabled={!loaded || saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "جارٍ الحفظ..." : "حفظ بيانات واتساب"}
        </button>

        {savedMsg && <p className={cn("text-center text-xs font-semibold text-emerald-600")}>{savedMsg}</p>}
        {err && <p className="text-center text-xs font-semibold text-rose-500">{err}</p>}

        <p className="text-xs text-slate-400">
          * الرموز السرية تُحفظ مشفّرة على الخادم ولا تُعرض مجدداً. الحفظ متاح للمدير فقط.
        </p>
      </div>
    </SettingsCard>
  );
}
