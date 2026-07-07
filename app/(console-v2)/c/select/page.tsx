"use client";

// ============================================================================
// console_v2 item 4 — «CHOOSE A WORKSPACE» (pages/11-login-auth.html). The tenant
// gate rendered: R1's resolveTenant() returns null when a user has multiple
// memberships and none is chosen — this page is that null made visible. Kivo NEVER
// guesses a default. The user picks explicitly; picking writes the active-restaurant
// cookie (which the server re-validates via resolveTenant, so a tampered cookie is
// rejected) and lands the user role-aware (manager → Live Shift w/ full rail;
// operator → the floor). 0 memberships → honest-empty. 1 → auto-forward.
//
// WO-UI-FIX-5: reskinned to the dark-glass canon (matching /c/login) — this is a
// standalone, chromeless, pre-tenant route OUTSIDE the .kvx app group, so it opts
// into the dark token scope with its own `className="kvx"` wrapper (same pattern as
// /c/login). PRESENTATION ONLY — all routing/auth logic is byte-identical: the
// memberships fetch, the 1-membership auto-forward, chooseWorkspace(), pick(), and
// the sign-out form are unchanged. Auth errors use AMBER (operational), never red.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { ACTIVE_RESTAURANT_COOKIE } from "@/lib/db/tenant";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";

interface Membership {
  restaurantId: string;
  role: string;
  name: string;
}

function chooseWorkspace(rid: string) {
  // Non-httpOnly (the browser tenant resolver reads it): 30-day, path=/, SameSite=Lax.
  document.cookie = `${ACTIVE_RESTAURANT_COOKIE}=${encodeURIComponent(rid)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export default function SelectWorkspacePage() {
  const t = useT();
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState(false);

  // Auth/routing logic UNCHANGED — only wrapped in a callback so the error state can
  // re-run the exact same fetch (retry). The 1-membership auto-forward is preserved.
  const load = useCallback((): (() => void) => {
    let alive = true;
    setError(false);
    setMemberships(null);
    fetch("/api/session/memberships")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { memberships: Membership[] }) => {
        if (!alive) return;
        const list = d.memberships ?? [];
        // Exactly one → no choice to make; forward (server still gates). /c does
        // the role-aware landing.
        if (list.length === 1) {
          chooseWorkspace(list[0].restaurantId);
          router.replace("/c");
          return;
        }
        setMemberships(list);
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [router]);

  useEffect(() => load(), [load]);

  function pick(m: Membership) {
    chooseWorkspace(m.restaurantId);
    router.replace("/c"); // /c does the role-aware landing (server-resolved role).
  }

  return (
    <div className="kvx" style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 448, position: "relative" }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "radial-gradient(circle at 32% 28%,#3fd39b,#0E9F6E 62%,#0a6e4c)", display: "grid", placeItems: "center", boxShadow: "0 14px 30px -12px rgba(14,159,110,.75)" }}>
              <KivoMark size={28} tone="white" title="Kivo" />
            </div>
          </div>

          <Eyebrow>{t("auth.gate.eyebrow")}</Eyebrow>
          <Title>{t("auth.gate.title")}</Title>

          {error ? (
            // Auth error is operational → AMBER, never red. Retry re-runs the fetch;
            // sign-out (below) is the always-present escape hatch.
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)", lineHeight: 1.7, margin: 0 }}>{t("auth.err.generic")}</p>
              <button onClick={() => load()} style={{ ...retryBtn, margin: "14px auto 0" }}>
                <RotateCcw size={14} strokeWidth={2.4} /> {t("auth.retry")}
              </button>
            </div>
          ) : memberships === null ? (
            // Loading — a workspace-list SHELL (dark skeleton), not a bare line.
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
              {[0, 1].map((i) => <div key={i} className="kv-skeleton" style={{ height: 66, borderRadius: 16 }} />)}
              <p style={{ fontSize: 12.5, color: "var(--dim)", textAlign: "center", marginTop: 2 }}>{t("auth.loading")}</p>
            </div>
          ) : memberships.length === 0 ? (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)", margin: 0 }}>{t("auth.gate.empty")}</p>
              <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 8, lineHeight: 1.7 }}>{t("auth.gate.emptySub")}</p>
            </div>
          ) : (
            <>
              <Sub>{t("auth.gate.sub")}</Sub>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {memberships.map((m) => {
                  const isManager = m.role === "manager";
                  return (
                    <button key={m.restaurantId} onClick={() => pick(m)} style={cardBtn}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--inset2)", border: "1px solid var(--stroke)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, color: "#5fe0b0" }}>
                        <Bdi>{m.name.slice(0, 1)}</Bdi>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Bdi>{m.name}</Bdi>
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--faint)", marginTop: 2 }}>
                          {isManager ? t("auth.lands.shift") : t("auth.lands.floor")}
                        </span>
                      </span>
                      <span style={{ ...roleBadge, ...(isManager ? roleMgr : roleOp) }}>
                        {isManager ? t("role.manager") : t("role.operator")}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 16, lineHeight: 1.7, textAlign: "center" }}>{t("auth.gate.noDefault")}</p>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--stroke)" }}>
            <form action="/auth/signout?next=/c/login" method="post">
              <button type="submit" style={{ border: 0, background: "transparent", color: "var(--faint)", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ArrowLeft size={14} strokeWidth={2.6} />
                {t("action.signOut")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// Misty-slate aurora — the same page ground as /c/login and the console shell.
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

// Dark-glass card — the console device material, matching /c/login.
const cardStyle: React.CSSProperties = {
  position: "relative", overflow: "hidden", padding: "30px 28px", borderRadius: 24,
  background:
    "radial-gradient(460px 150px at 50% 0,rgba(46,204,154,.14),transparent 70%)," +
    "rgba(18,22,30,.66)",
  backdropFilter: "blur(34px) saturate(1.25)",
  WebkitBackdropFilter: "blur(34px) saturate(1.25)",
  border: "1px solid rgba(255,255,255,.14)",
  boxShadow: "0 46px 130px rgba(15,20,30,.55),0 0 0 6px rgba(255,255,255,.05)",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: "var(--teal)", textAlign: "center", margin: 0 }}>{children}</p>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--txt)", textAlign: "center", margin: "6px 0 0" }}>{children}</h1>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", lineHeight: 1.7, margin: "8px 0 0" }}>{children}</p>;
}

const cardBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "12px 14px", borderRadius: 16, border: "1px solid var(--stroke)",
  background: "var(--inset)", cursor: "pointer", fontFamily: "var(--kvx-font-ar)",
};
const retryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 999,
  border: "1px solid rgba(232,180,90,.45)", background: "rgba(232,180,90,.12)", color: "#ffcf8d",
  fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer",
};
const roleBadge: React.CSSProperties = { fontSize: 9, fontWeight: 900, borderRadius: 7, padding: "5px 9px", letterSpacing: ".05em", flex: "none", color: "var(--ink)" };
const roleMgr: React.CSSProperties = { background: "var(--g-gold)" };
const roleOp: React.CSSProperties = { background: "var(--g-blue)" };
