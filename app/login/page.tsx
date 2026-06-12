"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { Phone, Mail, Loader2, ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";

type Method = "phone" | "email";
type Step = "request" | "verify";

// Phone OTP needs an SMS provider (Twilio / MessageBird) that is not yet
// configured — it's deferred to the onboarding sprint per DEPLOYMENT.md. Until
// then we hide the الجوال tab entirely so we never show a tab that fails (F3:
// no false affordances). Flip NEXT_PUBLIC_PHONE_OTP_ENABLED=true once SMS is live.
const PHONE_OTP_ENABLED = process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === "true";

// Brand terracotta CTA — matches the landing-page primary button (#b5502e).
// Used inline (as the landing page does) so the shared Tailwind theme stays
// untouched. Replaces the old WhatsApp-green (`conversations`) button styling.
const BRAND_CTA = "#b5502e";

const METHODS: { v: Method; label: string; icon: typeof Mail }[] = [
  ...(PHONE_OTP_ENABLED ? [{ v: "phone" as Method, label: "الجوال", icon: Phone }] : []),
  { v: "email" as Method, label: "البريد", icon: Mail },
];

// Supabase auth errors come back in English; surface a short, friendly Arabic
// message instead of leaking raw provider strings to the user.
function friendlyAuthError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("phone") || m.includes("sms") || m.includes("provider")) {
    return "تسجيل الدخول عبر الجوال غير متاح حالياً، فضلاً استخدم البريد الإلكتروني.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "حاولت كثيراً خلال وقت قصير، انتظر دقيقة ثم أعد المحاولة.";
  }
  if (m.includes("invalid") || m.includes("expired") || m.includes("token") || m.includes("otp")) {
    return "الرمز غير صحيح أو انتهت صلاحيته، اطلب رمزاً جديداً.";
  }
  return "تعذّر إتمام العملية، تأكد من البيانات وحاول مرة أخرى.";
}

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [method, setMethod] = useState<Method>("email");
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const supabase = createClient();

  async function sendCode() {
    if (!supabase || !identifier.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    const value = identifier.trim();
    const { error } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone: value })
        : await supabase.auth.signInWithOtp({ email: value });
    setLoading(false);
    if (error) return setError(friendlyAuthError(error.message));
    setStep("verify");
    setInfo(method === "phone" ? "أرسلنا رمزاً إلى جوالك" : "أرسلنا رمزاً إلى بريدك");
  }

  async function verifyCode() {
    if (!supabase || !code.trim()) return;
    setLoading(true);
    setError(null);
    const value = identifier.trim();
    const { error } =
      method === "phone"
        ? await supabase.auth.verifyOtp({ phone: value, token: code.trim(), type: "sms" })
        : await supabase.auth.verifyOtp({ email: value, token: code.trim(), type: "email" });
    setLoading(false);
    if (error) return setError(friendlyAuthError(error.message));
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="MaitreAI" width={56} height={56} className="h-14 w-14" />
          <h1 className="text-xl font-bold text-slate-900">MaitreAI</h1>
          <p className="text-sm text-slate-500">
            مساعد تشغيل ومبيعات للمطاعم — يدير الطلبات، المحادثات، الدفع، والعروض من مكان واحد.
          </p>
        </div>

        <div className="card p-6">
          {!configured ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-slate-700">الوضع التجريبي</p>
              <p className="text-sm text-slate-500">
                لم يتم ربط Supabase بعد، لذا تسجيل الدخول غير مفعّل. التطبيق يعمل حالياً
                بالبيانات التجريبية المحلية.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                style={{ backgroundColor: BRAND_CTA }}
              >
                الدخول للوضع التجريبي <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* Method toggle — only shown when more than one method is live.
                  With phone OTP deferred, email is the sole method and the
                  toggle is hidden entirely (no dead/disabled tab). */}
              {METHODS.length > 1 && (
                <div className="mb-4 inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {METHODS.map((o) => (
                    <button
                      key={o.v}
                      onClick={() => {
                        setMethod(o.v);
                        setStep("request");
                        setError(null);
                      }}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                        method === o.v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                      )}
                    >
                      <o.icon className="h-4 w-4" /> {o.label}
                    </button>
                  ))}
                </div>
              )}

              {step === "request" ? (
                <div className="space-y-3">
                  <input
                    dir="ltr"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={method === "phone" ? "+9665XXXXXXXX" : "you@example.com"}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#b5502e] focus:ring-2 focus:ring-[#b5502e]/10"
                  />
                  <button
                    onClick={sendCode}
                    disabled={loading || !identifier.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-40"
                    style={{ backgroundColor: BRAND_CTA }}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} إرسال رمز الدخول
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="______"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-[#b5502e] focus:ring-2 focus:ring-[#b5502e]/10"
                  />
                  <button
                    onClick={verifyCode}
                    disabled={loading || !code.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-40"
                    style={{ backgroundColor: BRAND_CTA }}
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد وتسجيل الدخول
                  </button>
                  <button
                    onClick={() => {
                      setStep("request");
                      setCode("");
                      setError(null);
                    }}
                    className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
                  >
                    تغيير {method === "phone" ? "الرقم" : "البريد"}
                  </button>
                </div>
              )}

              {info && <p className="mt-3 text-center text-xs text-emerald-600">{info}</p>}
              {error && <p className="mt-3 text-center text-xs text-rose-500">{error}</p>}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          بالدخول أنت توافق على الشروط وسياسة الخصوصية
        </p>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
}
