"use client";

// ============================================================================
// console_v2 item 4 — Login (pages/11-login-auth.html). Two states on one route:
//   SIGN IN          → enter email, "Send sign-in link" (Supabase magic link)
//   CHECK YOUR EMAIL → link sent; resend / use a different account / I opened it
//
// Mechanic note (faithful-but-honest, mirroring the old LoginForm): the design
// says "phone or email", but the repo only has email magic-link auth — a phone
// field would be a false affordance, so this is EMAIL only. The magic link
// redirects through the existing /auth/callback with ?next=/c, which then hits the
// authed gate → workspace picker → role-aware landing. No password, ever.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "request" | "sent";

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const configured = isSupabaseConfigured();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=/c` : undefined;

  function mapError(message: string): string {
    const m = (message || "").toLowerCase();
    if (m.includes("rate") || m.includes("too many") || m.includes("limit")) return t("auth.err.rate");
    return t("auth.err.generic");
  }

  async function sendLink() {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return setError(t("auth.err.email"));
    if (!supabase) {
      // Demo/unconfigured: no real auth backend — jump straight to the gate so the
      // flow is explorable locally (the authed layout is permissive in demo mode).
      return router.push("/c");
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: value, options: { emailRedirectTo: redirectTo } });
    setLoading(false);
    if (error) return setError(mapError(error.message));
    setStep("sent");
  }

  async function googleSso() {
    if (!supabase) return router.push("/c");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setError(mapError(error.message));
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--kv-bg-login)", padding: 24 }}>
      <div className="kv-console" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ background: "var(--kv-card)", borderRadius: "var(--kv-r-lg-xl)", boxShadow: "var(--kv-shadow-login)", padding: "34px 30px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <div style={{ width: 54, height: 54, borderRadius: 17, background: "var(--kv-grad-brand)", display: "grid", placeItems: "center", boxShadow: "0 14px 28px -14px rgba(10,138,95,.85)" }}>
              <KivoMark size={30} tone="white" title="Kivo" />
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
                onKeyDown={(e) => e.key === "Enter" && sendLink()}
                placeholder="you@example.com"
                style={inputStyle}
              />
              {error && <ErrorLine>{error}</ErrorLine>}
              <PrimaryButton onClick={sendLink} disabled={loading}>
                <Mail size={17} strokeWidth={2.3} />
                {t("auth.send")}
                <ArrowRight size={16} strokeWidth={2.6} style={{ transform: "scaleX(var(--kv-dir-x,1))" }} />
              </PrimaryButton>

              <Divider />
              <GhostButton onClick={googleSso} disabled={loading}>{t("auth.sso.google")}</GhostButton>
              {!configured && (
                <p style={{ fontSize: 11, color: "var(--kv-faint)", textAlign: "center", marginTop: 12 }}>
                  demo mode — no auth backend configured
                </p>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: "var(--kv-primary-tint)", display: "grid", placeItems: "center" }}>
                  <Mail size={28} strokeWidth={2.2} color="var(--kv-deep)" />
                </div>
              </div>
              <Eyebrow>{t("auth.sent.eyebrow")}</Eyebrow>
              <Title>{t("auth.sent.title")}</Title>
              <Sub>
                {t("auth.sent.sub")}{" "}
                <Bdi><strong style={{ color: "var(--kv-text)" }}>{email}</strong></Bdi>
              </Sub>
              <p style={{ fontSize: 12, color: "var(--kv-faint)", textAlign: "center", marginTop: 6 }}>{t("auth.sent.expiry")}</p>

              <PrimaryButton onClick={() => router.push("/c")} disabled={false}>
                {t("auth.sent.opened")}
                <ArrowRight size={16} strokeWidth={2.6} />
              </PrimaryButton>

              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, fontSize: 12.5, color: "var(--kv-muted)" }}>
                <span>{t("auth.sent.noLink")}</span>
                <button onClick={sendLink} style={linkBtnStyle}>{t("auth.sent.resend")}</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button onClick={() => { setStep("request"); setError(null); }} style={{ ...linkBtnStyle, color: "var(--kv-faint)" }}>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: "var(--kv-r-md)",
  border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)",
  padding: "0 14px",
  fontSize: 14,
  fontFamily: "var(--kv-font)",
  color: "var(--kv-text)",
  outline: "none",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: "var(--kv-primary)", textAlign: "center", margin: 0 }}>{children}</p>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <h1 style={{ fontSize: 23, fontWeight: 800, color: "var(--kv-text)", textAlign: "center", margin: "6px 0 0" }}>{children}</h1>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "var(--kv-muted)", textAlign: "center", lineHeight: 1.7, margin: "8px 0 0" }}>{children}</p>;
}
function ErrorLine({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-red)", margin: "8px 2px 0" }}>{children}</p>;
}
function Divider() {
  return <div style={{ height: 1, background: "var(--kv-border)", margin: "18px 0" }} />;
}
function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 48, marginTop: 16, borderRadius: "var(--kv-r-md)", border: 0,
        background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)", fontSize: 14.5, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, boxShadow: "var(--kv-shadow-btn)",
      }}
    >
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 46, borderRadius: "var(--kv-r-md)", border: "1.5px solid var(--kv-border)",
        background: "var(--kv-card)", color: "var(--kv-text)", fontFamily: "var(--kv-font)", fontSize: 14, fontWeight: 700,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
const linkBtnStyle: React.CSSProperties = {
  border: 0, background: "transparent", color: "var(--kv-primary)", fontFamily: "var(--kv-font)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 0,
};
