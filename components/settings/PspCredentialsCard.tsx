"use client";

// ============================================================================
// Kivo (KSA) — PSP (Moyasar) credentials card. Mirrors WhatsAppCredentialsCard:
// a manager enters the tenant's OWN Moyasar keys without Vercel access. The
// publishable key is shown/editable; the Secret Key + Webhook Secret are
// WRITE-ONLY — never fetched back (the card only knows they EXIST via a boolean)
// and a blank field leaves the saved value untouched. All reads/writes go
// through /api/settings/psp (service role); this component never sees a secret.
//
// When the `psp_payments` flag is OFF (every tenant today), the route reports
// `enabled:false` and the card renders an honest "not enabled" state.
// ============================================================================

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { cn } from "@/lib/utils";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";

interface PspSettings {
  enabled: boolean;
  provider: string | null;
  publishableKey: string;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  configured: boolean;
}

const FIELD_CLS =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-conversations";

export function PspCredentialsCard() {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("moyasar");
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState(""); // write-only (blank = keep)
  const [webhookSecret, setWebhookSecret] = useState(""); // write-only (blank = keep)
  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/psp")
      .then((r) => r.json())
      .then((d: PspSettings & { error?: string }) => {
        if (d.error) return;
        setEnabled(!!d.enabled);
        if (d.provider) setProvider(d.provider);
        setPublishableKey(d.publishableKey ?? "");
        setHasSecretKey(!!d.hasSecretKey);
        setHasWebhookSecret(!!d.hasWebhookSecret);
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
      const res = await fetch("/api/settings/psp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          publishableKey,
          // Only send secrets when the user typed something; blank = keep existing.
          ...(secretKey.trim() ? { secretKey } : {}),
          ...(webhookSecret.trim() ? { webhookSecret } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; configured?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setErr(
          d.error === "forbidden"
            ? "هذا الإجراء متاح للمدير فقط."
            : d.error === "psp_disabled"
              ? "ميزة الدفع عبر مزوّد غير مفعّلة لهذا المطعم."
              : "تعذّر الحفظ، حاول مرة أخرى."
        );
        return;
      }
      if (secretKey.trim()) setHasSecretKey(true);
      if (webhookSecret.trim()) setHasWebhookSecret(true);
      setSecretKey("");
      setWebhookSecret("");
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
      title="بيانات مزوّد الدفع (Moyasar)"
      description="أدخل مفاتيح Moyasar لمطعمك لتفعيل الدفع الإلكتروني عبر صفحة دفع مستضافة"
      icon={CreditCard}
      accentBg="bg-conversations"
    >
      {!enabled ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-500">
          ميزة الدفع عبر مزوّد غير مفعّلة لهذا المطعم.
        </div>
      ) : (
        <>
          {/* Status */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            {configured ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-600">مُهيأ — جاهز لإنشاء روابط الدفع</span>
              </>
            ) : (
              <span className="text-sm font-semibold text-amber-600">غير مُهيأ — أكمل الحقول المطلوبة واحفظ</span>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <label className="block text-xs text-slate-500">
              المزوّد (Provider)
              <select dir="ltr" value={provider} onChange={(e) => setProvider(e.target.value)} className={FIELD_CLS}>
                <option value="moyasar">Moyasar</option>
              </select>
            </label>

            <label className="block text-xs text-slate-500">
              المفتاح المنشور (Publishable Key) — ‎pk_‎، غير سري
              <input dir="ltr" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} placeholder="pk_live_..." className={FIELD_CLS} />
            </label>

            <label className="block text-xs text-slate-500">
              المفتاح السري (Secret Key) — ‎sk_‎، سري، يُحفظ مشفّراً ولا يُعرض
              <input
                dir="ltr"
                type="password"
                autoComplete="off"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={hasSecretKey ? "•••••• محفوظ — اتركه فارغاً للإبقاء عليه" : "ألصق المفتاح السري"}
                className={FIELD_CLS}
              />
            </label>

            <label className="block text-xs text-slate-500">
              سر الـ Webhook — سري، يُحفظ مشفّراً ولا يُعرض
              <input
                dir="ltr"
                type="password"
                autoComplete="off"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={hasWebhookSecret ? "•••••• محفوظ — اتركه فارغاً للإبقاء عليه" : "ألصق سر الـ Webhook"}
                className={FIELD_CLS}
              />
            </label>

            <button
              onClick={save}
              disabled={!loaded || saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "جارٍ الحفظ..." : "حفظ بيانات المزوّد"}
            </button>

            {savedMsg && <p className={cn("text-center text-xs font-semibold text-emerald-600")}>{savedMsg}</p>}
            {err && <p className="text-center text-xs font-semibold text-rose-500">{err}</p>}

            <p className="text-xs text-slate-400">
              * المفاتيح السرية تُحفظ مشفّرة على الخادم ولا تُعرض مجدداً. الحفظ متاح للمدير فقط.
            </p>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
