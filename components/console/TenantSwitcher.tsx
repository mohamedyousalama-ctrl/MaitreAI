"use client";

// ============================================================================
// MaitreAI — WO-LOGIN-CLEANUP — old-console tenant switcher (topbar).
// A signed-in user with more than one restaurant needs a way to move between them
// without clearing cookies by hand. This dropdown lists the user's memberships
// (via the existing /api/session/memberships, which is keyed on the USER, pre-tenant)
// and — on selection — writes ACTIVE_RESTAURANT_COOKIE and reloads. resolveTenant
// already honors that cookie (host pin still wins where present), so nothing in the
// resolution path changes; this only gives the user a way to SET the selection.
//
// Renders NOTHING for a single-membership user (no switch to make) and while loading
// — it must never add chrome it can't justify. All names render through <Bdi> (never
// interpolated into an Arabic string). Egyptian register to match the old console.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Store } from "lucide-react";
import { Bdi } from "@/components/kivo";
import { ACTIVE_RESTAURANT_COOKIE, setActiveRestaurantCookie } from "@/lib/db/tenant";

interface Membership {
  restaurantId: string;
  role: string;
  name: string;
}

function currentActiveRid(): string | null {
  if (typeof document === "undefined") return null;
  const raw = (document.cookie.match(new RegExp(`(?:^|;\\s*)${ACTIVE_RESTAURANT_COOKIE}=([^;]+)`)) ?? [])[1];
  return raw ? decodeURIComponent(raw) : null;
}

export function TenantSwitcher() {
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [open, setOpen] = useState(false);
  const [activeRid, setActiveRid] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveRid(currentActiveRid());
    let alive = true;
    fetch("/api/session/memberships")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { memberships?: Membership[] }) => { if (alive) setMemberships(d.memberships ?? []); })
      .catch(() => { if (alive) setMemberships([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Only worth showing when there's an actual choice to make.
  if (!memberships || memberships.length < 2) return null;

  const current = memberships.find((m) => m.restaurantId === activeRid) ?? null;

  function pick(m: Membership) {
    if (m.restaurantId === activeRid) { setOpen(false); return; }
    setActiveRestaurantCookie(m.restaurantId);
    // Full reload so BOTH the server resolver (SSR) and the client stores rehydrate
    // against the new selection — never a half-switched console.
    window.location.reload();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="بدّل المطعم"
        style={{ height: 34, maxWidth: 200, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 99, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-text)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
      >
        <Store size={14} color="var(--kv-muted)" style={{ flex: "none" }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? <Bdi>{current.name}</Bdi> : "اختار المطعم"}
        </span>
        <ChevronDown size={14} color="var(--kv-muted)" style={{ flex: "none" }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{ position: "absolute", insetInlineEnd: 0, top: 42, width: 260, maxHeight: 360, overflowY: "auto", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: 14, boxShadow: "0 18px 50px rgba(0,0,0,.22)", padding: 8, zIndex: 40 }}
        >
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".06em", color: "var(--kv-faint)", padding: "4px 8px 8px" }}>المطاعم بتاعتك</div>
          {memberships.map((m) => {
            const isCurrent = m.restaurantId === activeRid;
            return (
              <button
                key={m.restaurantId}
                role="option"
                aria-selected={isCurrent}
                onClick={() => pick(m)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "start", padding: "9px 8px", borderRadius: 10, border: 0, background: isCurrent ? "var(--kv-primary-tint)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--kv-card-soft)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, fontSize: 12, color: "var(--kv-deep)" }}>
                  <Bdi>{m.name.slice(0, 1)}</Bdi>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Bdi>{m.name}</Bdi>
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)", marginTop: 1 }}>
                    {m.role === "manager" ? "مدير" : "موظف"}
                  </span>
                </span>
                {isCurrent && <Check size={15} color="var(--kv-primary)" style={{ flex: "none" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
