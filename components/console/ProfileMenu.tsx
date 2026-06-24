"use client";

// ============================================================================
// Kivo console — profile menu + logout. The topbar avatar becomes a button that
// opens a small dropdown showing the signed-in user's name/email and a
// «تسجيل الخروج» item. Sign-out reuses the existing supabase.auth.signOut()
// flow (same as components/layout/SignOutButton) → /login. Kivo tokens, RTL,
// closes on outside-click / Escape. In demo mode (no Supabase session) the menu
// still opens but shows an honest "no session" note instead of a dead logout.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MENU_CSS = `
@keyframes kvProfSpin{to{transform:rotate(360deg)}}
.kv-prof-spin{animation:kvProfSpin .8s linear infinite}
.kv-prof-out{transition:background .12s}
.kv-prof-out:hover:not(:disabled){background:rgba(214,45,33,.08)}
.kv-prof-avatar{transition:box-shadow .12s}
`;

export function ProfileMenu() {
  const router = useRouter();
  const supabase = createClient();
  const ref = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; initial: string }>({ name: "", email: "", initial: "؟" });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const email = data.user?.email ?? "";
        const name = (data.user?.user_metadata?.name as string | undefined) ?? "";
        const base = (name || email).trim();
        setUser({ name, email, initial: base.charAt(0).toUpperCase() || "؟" });
      })
      .catch(() => {});
    // supabase client is stable per render via createClient(); run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside-click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    if (!supabase || loading) return;
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = user.name || (user.email ? user.email.split("@")[0] : "المستخدم");

  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <style dangerouslySetInnerHTML={{ __html: MENU_CSS }} />
      <button
        type="button"
        className="kv-prof-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="قائمة الحساب"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: "var(--kv-grad-brand)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          display: "grid",
          placeItems: "center",
          border: 0,
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: open ? "0 0 0 3px rgba(14,159,110,.28)" : "none",
        }}
      >
        {user.initial}
      </button>

      {open && (
        <div
          role="menu"
          dir="rtl"
          style={{
            position: "absolute",
            insetInlineEnd: 0,
            top: "calc(100% + 8px)",
            width: 244,
            background: "var(--kv-card)",
            border: "1px solid var(--kv-border)",
            borderRadius: 14,
            boxShadow: "0 22px 54px -26px rgba(16,60,44,.45)",
            overflow: "hidden",
            zIndex: 50,
            fontFamily: "inherit",
          }}
        >
          {/* identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: "1px solid var(--kv-border)" }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--kv-grad-brand)", color: "#fff", fontSize: 14, fontWeight: 800, display: "grid", placeItems: "center", flex: "none" }}>
              {user.initial}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
              {user.email && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--kv-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "ltr", textAlign: "right" }}>{user.email}</div>
              )}
            </div>
          </div>

          {/* logout (or honest demo-mode note) */}
          {supabase ? (
            <button
              type="button"
              role="menuitem"
              className="kv-prof-out"
              onClick={signOut}
              disabled={loading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                border: 0,
                background: "transparent",
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--kv-red)",
                textAlign: "start",
              }}
            >
              {loading ? <Loader2 size={16} className="kv-prof-spin" /> : <LogOut size={16} />}
              {loading ? "جاري الخروج…" : "تسجيل الخروج"}
            </button>
          ) : (
            <div style={{ padding: "12px 14px", fontSize: 11.5, fontWeight: 600, color: "var(--kv-faint)", lineHeight: 1.5 }}>
              وضع تجريبي — مفيش جلسة لتسجيل الخروج.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
