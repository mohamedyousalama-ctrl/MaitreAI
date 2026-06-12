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
    if (error) return setError(error.message);
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
    if (error) return setError(error.message);
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
          <img src="/logo-mark.svg" alt="MaitreAi" width={56} height={56} className="h-14 w-14" />
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                الدخول للوضع التجريبي <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* Method toggle */}
              <div className="mb-4 inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
                {([
                  { v: "phone", label: "الجوال", icon: Phone },
                  { v: "email", label: "البريد", icon: Mail },
                ] as const).map((o) => (
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

              {step === "request" ? (
                <div className="space-y-3">
                  <input
                    dir="ltr"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={method === "phone" ? "+9665XXXXXXXX" : "you@example.com"}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-conversations focus:ring-2 focus:ring-conversations/10"
                  />
                  <button
                    onClick={sendCode}
                    disabled={loading || !identifier.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-conversations focus:ring-2 focus:ring-conversations/10"
                  />
                  <button
                    onClick={verifyCode}
                    disabled={loading || !code.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-conversations px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
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
