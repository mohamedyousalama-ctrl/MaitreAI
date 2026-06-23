"use client";

// ============================================================================
// Kivo — Login form (client). SPEC 01, pixel-faithful to `Kivo - Login.dc.html`.
//
// Truth-state decisions (SPEC 01 §4, confirmed with Mohamed):
//  • Eyebrow is the neutral brand «منصّة Kivo» — NEVER a tenant name pre-auth
//    (the mockup's «سمَّاش هاوس» was fabricated; we can't know the tenant yet).
//  • Email placeholder is a generic example, not a real tenant.
//  • Credential mechanic uses the REPO'S EXISTING auth = email OTP
//    (signInWithOtp / verifyOtp). The mockup's password field + «نسيت كلمة
//    السر؟» are NOT built: the repo has no password auth, no reset flow, and
//    users have no passwords — a password box would be a false affordance.
//    So the password row becomes the real two-step code flow, Kivo-styled.
//  • On success: existing session is set; redirect to /orders (Home not built).
//    Tenant resolution is handled by the existing session + middleware path —
//    not re-implemented here (spine untouched).
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useRiseIn } from "@/components/kivo";

type Step = "request" | "verify";

// Supabase auth errors come back in English; surface short, friendly Arabic
// (SPEC 01 §3) instead of leaking raw provider codes.
function friendlyAuthError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "حاولت كتير في وقت قصير، استنى دقيقة وجرّب تاني.";
  }
  if (m.includes("invalid") || m.includes("expired") || m.includes("token") || m.includes("otp")) {
    return "الرمز غلط أو خلصت صلاحيته، اطلب رمز جديد.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed")) {
    return "في مشكلة في الاتصال، اطمئن على النت وجرّب تاني.";
  }
  if (m.includes("not allowed") || m.includes("disabled") || m.includes("locked")) {
    return "الحساب ده مش متاح حالياً، كلّم الدعم.";
  }
  return "معرفناش نكمّل، اتأكد من البيانات وجرّب تاني.";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const supabase = createClient();
  const rise = useRiseIn(0);

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode() {
    if (!supabase) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      return setError("اكتب بريد إلكتروني صحيح.");
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    // TODO: bind `remember` to Supabase session persistence (storage strategy);
    // the JS client persists by default, so this is a stored preference for now.
    const { error } = await supabase.auth.signInWithOtp({ email: value });
    setLoading(false);
    if (error) return setError(friendlyAuthError(error.message));
    setStep("verify");
    setInfo("بعتنا رمز الدخول على بريدك.");
  }

  async function verifyCode() {
    if (!supabase) return;
    const value = email.trim();
    if (!code.trim()) return setError("اكتب رمز الدخول.");
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: value,
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) return setError(friendlyAuthError(error.message));
    // Existing session is now set; existing middleware resolves the tenant.
    // TODO: redirect to /home once built.
    router.push("/orders");
    router.refresh();
  }

  // Mockup hex kept where it is field-specific (not a named token).
  const fieldShell: React.CSSProperties = {
    marginTop: 7,
    height: 46,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    borderRadius: 13,
    border: "1px solid #e2eae6",
    background: "#f7faf9",
  };
  const fieldInput: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border: 0,
    outline: "none",
    background: "transparent",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    color: "#0f2a20",
  };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--kv-muted)" };

  return (
    <>
      {/* Scoped responsive floor — stack the two columns on narrow screens.
          Kept inside the component (raw <style>) so no global file is touched. */}
      <style>{`
        @media (max-width:760px){
          .kv-login-card{grid-template-columns:1fr !important}
          .kv-login-brand{padding:32px 28px !important}
          .kv-login-form{padding:32px 26px !important}
        }
      `}</style>

      <div
        className="kv-login-card"
        style={{
          ...rise.style,
          width: 980,
          maxWidth: "100%",
          display: "grid",
          gridTemplateColumns: "1.05fr 1fr",
          borderRadius: 26,
          overflow: "hidden",
          background: "#fff",
          boxShadow:
            "0 60px 130px -50px rgba(13,52,38,.5), 0 10px 30px -18px rgba(13,52,38,.3)",
          border: "1px solid rgba(255,255,255,.7)",
        }}
      >
        {/* ── BRAND PANEL (first column → right side in RTL) ── */}
        <div
          className="kv-login-brand"
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "42px 40px",
            background: "var(--kv-grad-brand-deep)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(420px 300px at 80% 0%,rgba(255,255,255,.16),transparent 64%),radial-gradient(360px 320px at 0% 100%,rgba(0,0,0,.16),transparent 60%)",
              pointerEvents: "none",
            }}
          />
          <svg
            viewBox="0 0 200 200"
            aria-hidden
            style={{ position: "absolute", insetInlineStart: -30, top: 40, width: 240, height: 240, opacity: 0.14, pointerEvents: "none" }}
          >
            <path d="M20 120 L70 165 L150 40" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M140 30 H188" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
            <path d="M150 52 H192" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
          </svg>

          {/* logo row */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,.16)",
                border: "1px solid rgba(255,255,255,.25)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.3)",
              }}
            >
              <svg width="27" height="22" viewBox="0 0 80 64" fill="none">
                <path d="M12 34 L27 50 L52 14" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M50 12 H68" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
                <path d="M55 21 H70" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".6" />
                <path d="M60 30 H71" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".35" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>Kivo</div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>خلّي طلباتك ماشية</div>
            </div>
          </div>

          {/* lower block */}
          <div style={{ position: "relative", marginTop: "auto" }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4, margin: 0 }}>
              شغّل وكيلك على واتساب،
              <br />
              واحتفظ بهامشك.
            </h2>
            <p style={{ fontSize: 12.5, opacity: 0.88, fontWeight: 600, lineHeight: 1.7, margin: "14px 0 0", maxWidth: 320 }}>
              كريم بيرد على عملاءك، بياخد الطلب، ويقفله — وإنت بتوصّل. كل طلب من غير عمولة التطبيقات.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 24 }}>
              {[
                "طلبات أكتر من نفس المحادثات",
                "أرقام حقيقية بس — مفيش تخمين",
                "تستلم أي محادثة في ثانية",
              ].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", flex: "none" }}>
                    <svg width="12" height="9" viewBox="0 0 80 64" fill="none">
                      <path d="M14 34 L28 50 L52 16" stroke="#fff" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FORM PANEL (second column → left side in RTL) ── */}
        <div className="kv-login-form" style={{ padding: "42px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-deep)" }}>منصّة Kivo</div>
          <h1 style={{ fontSize: 25, fontWeight: 800, margin: "9px 0 0" }}>أهلاً بيك تاني</h1>
          <p style={{ fontSize: 12, color: "var(--kv-faint)", fontWeight: 600, margin: "6px 0 0" }}>
            سجّل دخولك عشان تكمّل شغل كريم.
          </p>

          {!configured ? (
            // Honest fallback: when Supabase isn't wired, login can't work — say so.
            <div
              style={{
                marginTop: 24,
                borderRadius: 13,
                border: "1px solid var(--kv-border)",
                background: "var(--kv-card-soft)",
                padding: "16px 18px",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--kv-muted)",
                lineHeight: 1.7,
              }}
            >
              تسجيل الدخول مش مفعّل في الوضع التجريبي — Supabase لسه مش متظبّط.
            </div>
          ) : (
            <>
              {/* Email field (real input) */}
              <div style={{ marginTop: 26 }}>
                <label htmlFor="kv-email" style={label}>
                  البريد الإلكتروني
                </label>
                <div style={fieldShell}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 6h16v12H4z" stroke="#9aa8a0" strokeWidth="1.7" />
                    <path d="m4 7 8 6 8-6" stroke="#9aa8a0" strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                  <input
                    id="kv-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    placeholder="owner@restaurant.com"
                    value={email}
                    disabled={step === "verify"}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && step === "request" && sendCode()}
                    style={fieldInput}
                  />
                </div>
              </div>

              {step === "request" ? (
                <>
                  {/* Remember me (real toggle) */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={remember}
                    onClick={() => setRemember((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 15,
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        display: "grid",
                        placeItems: "center",
                        background: remember ? "var(--kv-primary)" : "#fff",
                        border: remember ? "0" : "1px solid #cdd9d2",
                      }}
                    >
                      {remember && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="m5 12 4 4 10-10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--kv-muted)" }}>افتكرني على الجهاز ده</span>
                  </button>

                  <PrimaryButton loading={loading} onClick={sendCode} label="تسجيل الدخول" />
                </>
              ) : (
                <>
                  {/* Code field (real input) — the OTP step */}
                  <div style={{ marginTop: 15 }}>
                    <label htmlFor="kv-code" style={label}>
                      رمز الدخول
                    </label>
                    <div style={fieldShell}>
                      <input
                        id="kv-code"
                        dir="ltr"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="______"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                        style={{ ...fieldInput, fontSize: 16, fontWeight: 800, letterSpacing: "0.4em", textAlign: "center" }}
                      />
                    </div>
                  </div>

                  <PrimaryButton loading={loading} onClick={verifyCode} label="تأكيد الدخول" />

                  <button
                    type="button"
                    onClick={() => {
                      setStep("request");
                      setCode("");
                      setError(null);
                      setInfo(null);
                    }}
                    style={{ marginTop: 12, border: 0, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "var(--kv-faint)" }}
                  >
                    تغيير البريد
                  </button>
                </>
              )}

              {info && <p style={{ margin: "12px 0 0", fontSize: 11.5, fontWeight: 700, color: "var(--kv-deep)" }}>{info}</p>}
              {error && <p style={{ margin: "12px 0 0", fontSize: 11.5, fontWeight: 700, color: "var(--kv-red)" }}>{error}</p>}
            </>
          )}

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--kv-border)" }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#aab6ae" }}>أو</span>
            <div style={{ flex: 1, height: 1, background: "var(--kv-border)" }} />
          </div>

          {/* New-restaurant card → onboarding (Settings) */}
          <div
            style={{
              borderRadius: 13,
              border: "1px dashed rgba(14,159,110,.32)",
              background: "rgba(14,159,110,.05)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center", flex: "none" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="#0a8a5f" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>مطعمك لسه جديد على Kivo؟</div>
              <div style={{ fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>
                ابدأ الإعداد — اربط واتساب واسحب المنيو وكريم يشتغل.
              </div>
            </div>
            <Link
              href="/settings"
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 10,
                background: "#fff",
                border: "1px solid #d3e8df",
                color: "var(--kv-deep)",
                fontSize: 11.5,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                flex: "none",
              }}
            >
              ابدأ
            </Link>
          </div>

          <div style={{ textAlign: "center", fontSize: 10, color: "#aab6ae", fontWeight: 600, marginTop: 20 }}>
            بتسجيل الدخول إنت موافق على شروط استخدام Kivo
          </div>
        </div>
      </div>
    </>
  );
}

function PrimaryButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      style={{
        marginTop: 22,
        height: 48,
        border: 0,
        borderRadius: 13,
        background: "var(--kv-grad-brand)",
        color: "#fff",
        fontSize: 13.5,
        fontWeight: 800,
        fontFamily: "inherit",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.7 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        boxShadow: "0 18px 32px -16px rgba(14,159,110,.7)",
      }}
    >
      {label}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 12h13M11 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
