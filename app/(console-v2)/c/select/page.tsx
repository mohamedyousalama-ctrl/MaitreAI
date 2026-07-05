"use client";

// ============================================================================
// console_v2 item 4 — «CHOOSE A WORKSPACE» (pages/11-login-auth.html). The tenant
// gate rendered: R1's resolveTenant() returns null when a user has multiple
// memberships and none is chosen — this page is that null made visible. Kivo NEVER
// guesses a default. The user picks explicitly; picking writes the active-restaurant
// cookie (which the server re-validates via resolveTenant, so a tampered cookie is
// rejected) and lands the user role-aware (manager → Live Shift w/ full rail;
// operator → the floor). 0 memberships → honest-empty. 1 → auto-forward.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ACTIVE_RESTAURANT_COOKIE } from "@/lib/db/tenant";
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

  useEffect(() => {
    let alive = true;
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

  function pick(m: Membership) {
    chooseWorkspace(m.restaurantId);
    router.replace("/c"); // /c does the role-aware landing (server-resolved role).
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--kv-bg-login)", padding: 24 }}>
      <div className="kv-console" style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ background: "var(--kv-card)", borderRadius: "var(--kv-r-lg-xl)", boxShadow: "var(--kv-shadow-login)", padding: "30px 28px" }}>
          <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: "var(--kv-primary)", margin: 0 }}>{t("auth.gate.eyebrow")}</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "6px 0 0" }}>{t("auth.gate.title")}</h1>

          {error ? (
            <p style={{ fontSize: 13, color: "var(--kv-red)", marginTop: 12 }}>{t("auth.err.generic")}</p>
          ) : memberships === null ? (
            <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 14 }}>{t("auth.loading")}</p>
          ) : memberships.length === 0 ? (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{t("auth.gate.empty")}</p>
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 8, lineHeight: 1.7 }}>{t("auth.gate.emptySub")}</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 10, lineHeight: 1.7 }}>{t("auth.gate.sub")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {memberships.map((m) => {
                  const isManager = m.role === "manager";
                  return (
                    <button key={m.restaurantId} onClick={() => pick(m)} style={cardStyle}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--kv-primary-tint)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, color: "var(--kv-deep)" }}>
                        <Bdi>{m.name.slice(0, 1)}</Bdi>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Bdi>{m.name}</Bdi>
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--kv-faint)", marginTop: 2 }}>
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
              <p style={{ fontSize: 11.5, color: "var(--kv-faint)", marginTop: 16, lineHeight: 1.7, textAlign: "center" }}>{t("auth.gate.noDefault")}</p>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 18 }}>
            <form action="/auth/signout?next=/c/login" method="post">
              <button type="submit" style={{ border: 0, background: "transparent", color: "var(--kv-faint)", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
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

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "12px 14px", borderRadius: "var(--kv-r-md-lg)", border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", cursor: "pointer", fontFamily: "var(--kv-font)",
};
const roleBadge: React.CSSProperties = { fontSize: 9, fontWeight: 900, borderRadius: 7, padding: "5px 9px", letterSpacing: ".05em", flex: "none" };
const roleMgr: React.CSSProperties = { color: "#231a00", background: "linear-gradient(135deg,#ffe37a,#ffcf4d)" };
const roleOp: React.CSSProperties = { color: "#03203a", background: "linear-gradient(135deg,#8fd0ff,#6db8f7)" };
