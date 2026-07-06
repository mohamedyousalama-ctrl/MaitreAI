"use client";

// ============================================================================
// MaitreAI — WO-LOGIN-CLEANUP — the multi-membership NO_TENANT screen, fixed.
// Before: a signed-in user with MORE THAN ONE restaurant hit resolveTenant()'s
// "multiple, none selected → null" branch and saw «مفيش مطعم مرتبط بالحساب ده» +
// "open from the dedicated restaurant link" — which is WRONG: the account HAS
// restaurants, and most have no dedicated link. That was a dead end.
//
// After: this renders the actual workspace choices (the same list /c/select shows,
// from /api/session/memberships). Picking one writes ACTIVE_RESTAURANT_COOKIE and
// reloads → resolveTenant returns that tenant → the console loads. It works
// regardless of the console_v2 (/c) flag because it lives in the OLD console shell.
//
// Honest edges: 0 memberships → the real "no restaurant linked" message + a route to
// onboarding (this account genuinely has none); a load error → an honest retry line.
// Names render through <Bdi>, never interpolated. Egyptian register (old console).
// ============================================================================

import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { Bdi } from "@/components/kivo";
import { setActiveRestaurantCookie } from "@/lib/db/tenant";

interface Membership {
  restaurantId: string;
  role: string;
  name: string;
}

export function TenantPicker() {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/session/memberships")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { memberships?: Membership[] }) => { if (alive) setMemberships(d.memberships ?? []); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  function pick(m: Membership) {
    setActiveRestaurantCookie(m.restaurantId);
    window.location.reload(); // SSR + client both rehydrate against the selection.
  }

  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", height: "100vh", background: "var(--kv-bg-console)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ background: "var(--kv-card)", borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,.18)", border: "1px solid var(--kv-border)", padding: "28px 26px" }}>
          {error ? (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>تعذّر تحميل مطاعمك</h1>
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 10, lineHeight: 1.8 }}>حدّث الصفحة وحاول تاني. لو المشكلة مستمرة كلّم الدعم.</p>
            </>
          ) : memberships === null ? (
            <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0 }}>جارٍ تحميل مطاعمك…</p>
          ) : memberships.length === 0 ? (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>مفيش مطعم مرتبط بالحساب ده</h1>
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 10, lineHeight: 1.8 }}>اطلب من مدير المطعم إنه يضيفك، أو ابدأ إعداد مطعم جديد.</p>
              <a href="/onboarding" style={{ display: "inline-block", marginTop: 16, height: 40, lineHeight: "40px", padding: "0 18px", borderRadius: 12, background: "var(--kv-grad-brand)", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
                ابدأ إعداد مطعم
              </a>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".07em", color: "var(--kv-primary)", margin: 0 }}>اختار مساحة العمل</p>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--kv-text)", margin: "6px 0 0" }}>أي مطعم؟</h1>
              <p style={{ fontSize: 13, color: "var(--kv-muted)", marginTop: 8, lineHeight: 1.8 }}>عندك أكتر من مطعم. اختار اللي هتشتغل عليه دلوقتي — كيفو ما بيفترضش افتراضي.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {memberships.map((m) => (
                  <button key={m.restaurantId} onClick={() => pick(m)} style={cardStyle}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--kv-primary-tint)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, color: "var(--kv-deep)" }}>
                      <Bdi>{m.name.slice(0, 1)}</Bdi>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                      <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <Bdi>{m.name}</Bdi>
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--kv-faint)", marginTop: 2 }}>
                        {m.role === "manager" ? "مدير" : "موظف"}
                      </span>
                    </span>
                    <Store size={17} color="var(--kv-muted)" style={{ flex: "none" }} />
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--kv-faint)", marginTop: 16, lineHeight: 1.7, textAlign: "center" }}>ما بتتفتحش مساحة تلقائي. إنت اللي بتختار دايمًا.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "12px 14px", borderRadius: 14, border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", cursor: "pointer", fontFamily: "inherit",
};
