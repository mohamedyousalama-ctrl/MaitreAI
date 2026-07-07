"use client";

// ============================================================================
// console_v2 item 4 — Login (pages/11-login-auth.html). Two states on one route:
//   REQUEST → enter email, "Send sign-in code" (Supabase signInWithOtp)
//   VERIFY  → enter the 6-digit code from the email → verifyOtp → land on `next`
//
// Mechanic note (faithful-but-honest, mirroring the old LoginForm): the repo's auth
// is EMAIL ONE-TIME CODE (signInWithOtp → verifyOtp) — the email delivers a 6-digit
// code, so the UI is code entry, not a magic-link dead-end. No password field (the
// repo has none — it would be a false affordance) and NO Google SSO button (that
// provider is cancelled — a dead OAuth button is worse UX than none). `next` (a safe
// same-origin path) threads the deep-link target through to the post-verify redirect.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only a same-origin relative path is honored as a post-login destination (a
// crafted ?next=//evil.com must never become an open redirect). Mirrors the guard
// in the sign-out route.
function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : null;
}

type Step = "request" | "verify";

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const configured = isSupabaseConfigured();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Deep-link return target (P3): a user bounced from /c/settings lands back there,
  // not just /c. Read client-side (no Suspense needed for useSearchParams).
  const [next, setNext] = useState("/c");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = safeNext(params.get("next"));
    if (n && n.startsWith("/c")) setNext(n);
    // The auth callback bounces a failed /c exchange here with ?error=auth (P3).
    if (params.get("error") === "auth") setError(t("auth.err.generic"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined;

  function mapError(message: string): string {
    const m = (message || "").toLowerCase();
    if (m.includes("rate") || m.includes("too many") || m.includes("limit")) return t("auth.err.rate");
    return t("auth.err.generic");
  }

  async function sendCode() {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return setError(t("auth.err.email"));
    if (!supabase) {
      // Demo/unconfigured: no real auth backend — jump straight to the gate so the
      // flow is explorable locally (the authed layout is permissive in demo mode).
      return router.push(next);
    }
    setLoading(true);
    setError(null);
    // The project's email template delivers a 6-digit OTP code. We ALSO pass
    // emailRedirectTo so a clicked magic link (if the template includes one) still
    // lands on /auth/callback?next=<next> — but the primary path is code entry below.
    const { error } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: redirectTo } });
    setLoading(false);
    if (error) return setError(mapError(error.message));
    setCode("");
    setStep("verify");
  }

  async function verifyCode() {
    const value = email.trim();
    if (!code.trim()) return setError(t("auth.err.code"));
    if (!supabase) return router.push(next);
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: value, token: code.trim(), type: "email" });
    setLoading(false);
    if (error) return setError(t("auth.err.code"));
    // Session cookie is set; land on the resolved destination (deep-link or /c).
    router.push(next);
    router.refresh();
  }

  return (
    <div className="kvx" style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 424, position: "relative" }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: "radial-gradient(circle at 32% 28%,#3fd39b,#0E9F6E 62%,#0a6e4c)", display: "grid", placeItems: "center", boxShadow: "0 14px 30px -12px rgba(14,159,110,.75)" }}>
              <KivoMark size={31} tone="white" title="Kivo" />
            </div>
          </div>

          {step === "request" ? (
            <>
              <Eyebrow>{t("auth.signIn.eyebrow")}</Eyebrow>
              <Title>{t("auth.signIn.title")}</Title>
              <Sub>{t("auth.signIn.sub")}</Sub>

              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", margin: "18px 0 7px" }}>
                {t("auth.field.email")}
              </label>
              <input
                type="email"
                inputMode="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="you@example.com"
                style={inputStyle}
              />
              {error && <ErrorLine>{error}</ErrorLine>}
              <PrimaryButton onClick={sendCode} disabled={loading}>
                <Mail size={17} strokeWidth={2.3} />
                {t("auth.send")}
                <ArrowRight size={16} strokeWidth={2.6} style={{ transform: "scaleX(var(--kv-dir-x,1))" }} />
              </PrimaryButton>
              {!configured && (
                <p style={{ fontSize: 11, color: "var(--kv-faint)", textAlign: "center", marginTop: 12 }}>
                  demo mode — no auth backend configured
                </p>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "rgba(46,204,154,.14)", border: "1px solid rgba(46,204,154,.32)", display: "grid", placeItems: "center" }}>
                  <Mail size={28} strokeWidth={2.2} color="var(--teal)" />
                </div>
              </div>
              <Eyebrow>{t("auth.sent.eyebrow")}</Eyebrow>
              <Title>{t("auth.verify.title")}</Title>
              <Sub>
                {t("auth.verify.sub")}{" "}
                <Bdi><strong style={{ color: "var(--txt)" }}>{email}</strong></Bdi>
              </Sub>
              <p style={{ fontSize: 12, color: "var(--kv-faint)", textAlign: "center", marginTop: 6 }}>{t("auth.sent.expiry")}</p>

              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", margin: "18px 0 7px" }}>
                {t("auth.verify.label")}
              </label>
              <input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                placeholder={t("auth.verify.placeholder")}
                style={{ ...inputStyle, fontSize: 18, fontWeight: 800, letterSpacing: "0.4em", textAlign: "center" }}
              />
              {error && <ErrorLine>{error}</ErrorLine>}
              <PrimaryButton onClick={verifyCode} disabled={loading}>
                {t("auth.verify.confirm")}
                <ArrowRight size={16} strokeWidth={2.6} />
              </PrimaryButton>

              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, fontSize: 12.5, color: "var(--kv-muted)" }}>
                <span>{t("auth.sent.noLink")}</span>
                <button onClick={sendCode} style={linkBtnStyle}>{t("auth.sent.resend")}</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button onClick={() => { setStep("request"); setCode(""); setError(null); }} style={{ ...linkBtnStyle, color: "var(--kv-faint)" }}>
                  {t("auth.sent.diffAccount")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Misty-slate aurora — the same page ground as the console shell (.kvx-page).
const pageStyle: React.CSSProperties = {
  minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
  color: "var(--txt)", fontFamily: "var(--kvx-font-ar)",
  background: "#3a4149",
  backgroundImage:
    "radial-gradient(1200px 800px at 75% 10%,rgba(120,140,165,.5),transparent 60%)," +
    "radial-gradient(1000px 700px at 10% 90%,rgba(70,80,95,.55),transparent 55%)," +
    "radial-gradient(700px 500px at 45% 45%,rgba(150,160,175,.22),transparent 60%)," +
    "linear-gradient(160deg,#4a525d 0%,#2e343d 55%,#232830 100%)",
};

// Dark-glass card — the console device material, with a baked-in top brand glow so
// it always sits behind the content (no absolute-sibling stacking surprises).
const cardStyle: React.CSSProperties = {
  position: "relative", overflow: "hidden", padding: "34px 30px", borderRadius: 24,
  background:
    "radial-gradient(460px 150px at 50% 0,rgba(46,204,154,.14),transparent 70%)," +
    "rgba(18,22,30,.66)",
  backdropFilter: "blur(34px) saturate(1.25)",
  WebkitBackdropFilter: "blur(34px) saturate(1.25)",
  border: "1px solid rgba(255,255,255,.14)",
  boxShadow: "0 46px 130px rgba(15,20,30,.55),0 0 0 6px rgba(255,255,255,.05)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1.5px solid var(--stroke)",
  background: "var(--inset2)",
  padding: "0 14px",
  fontSize: 14,
  fontFamily: "var(--kvx-font-ar)",
  color: "var(--txt)",
  outline: "none",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: "var(--teal)", textAlign: "center", margin: 0 }}>{children}</p>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <h1 style={{ fontSize: 23, fontWeight: 800, color: "var(--txt)", textAlign: "center", margin: "6px 0 0" }}>{children}</h1>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", lineHeight: 1.7, margin: "8px 0 0" }}>{children}</p>;
}
function ErrorLine({ children }: { children: React.ReactNode }) {
  // Auth errors are operational, never a safety event → amber, never red.
  return <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)", margin: "8px 2px 0" }}>{children}</p>;
}
function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 48, marginTop: 16, borderRadius: 12, border: 0,
        background: "linear-gradient(135deg,#3fd39b,#0E9F6E)", color: "#062018", fontFamily: "var(--kvx-font-ar)", fontSize: 14.5, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, boxShadow: "0 14px 30px -14px rgba(14,159,110,.8)",
      }}
    >
      {children}
    </button>
  );
}
const linkBtnStyle: React.CSSProperties = {
  border: 0, background: "transparent", color: "var(--teal)", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 0,
};
