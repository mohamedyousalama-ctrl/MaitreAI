"use client";

// ============================================================================
// UI1 — الفريق (Team) console client. Manager-only (the route is RoleGuard-gated;
// every mutation is also manager-gated server-side). Roster (name / role / member
// since) + role toggle (manager ↔ operation, with the last-manager guard surfaced)
// + staff invite (email + role). Read via GET /api/members; mutate via
// PATCH /api/members/[id] and POST /api/team/invite.
// ============================================================================

import { useState } from "react";
import { UserCog, ShieldCheck, UserRound, Mail, Users } from "lucide-react";
import { runActionOutcome } from "@/lib/console-toast";
import { useRiseIn } from "@/components/kivo";
import { EmptyState } from "@/components/ui/EmptyState";
import { useMembersStore } from "@/lib/members-store";

interface Member { id: string; name: string; email: string | null; role: "manager" | "operation"; createdAt: string }

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (s: string | number) => String(s).replace(/[0-9]/g, (d) => AR[+d]);
function since(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${toAr(d.getFullYear())}/${toAr(String(d.getMonth() + 1).padStart(2, "0"))}/${toAr(String(d.getDate()).padStart(2, "0"))}`;
}
const roleLabel = (r: string) => (r === "manager" ? "مدير" : "موظف");

export function TeamClient() {
  // LIVE0 L5a — roster from the SHARED members store (DB-backed + realtime), so a
  // role change / invite by another manager reflects here live. `load` re-pulls
  // the store; mutations below still hit the gated routes, then refresh.
  const members = useMembersStore((s) => s.members) as Member[];
  const loaded = useMembersStore((s) => s.loaded);
  const load = useMembersStore((s) => s.loadMembers);
  const [busyId, setBusyId] = useState<string | null>(null);
  const head = useRiseIn(0);
  const body = useRiseIn(1);

  const toggleRole = (m: Member) => {
    const next = m.role === "manager" ? "operation" : "manager";
    const verb = next === "manager" ? "ترقية لمدير" : "تحويل لموظف";
    if (!window.confirm(`${verb}: ${m.name}؟`)) return;
    setBusyId(m.id);
    void runActionOutcome("جارٍ تحديث الصلاحية…", async () => {
      const res = await fetch(`/api/members/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: next }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setBusyId(null);
      if (res.ok) { await load(); return { state: "success", message: "تم تحديث الصلاحية" }; }
      if (res.status === 409 && data.error === "last_manager") {
        return { state: "info", message: typeof data.message === "string" ? data.message : "لازم يفضل مدير واحد على الأقل" };
      }
      if (res.status === 403) return { state: "failed", message: "للمدير فقط" };
      return { state: "failed", message: "تعذّر تحديث الصلاحية", retry: false };
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ ...head.style }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>
          <UserCog size={13} /> الفريق
        </span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0" }}>إدارة الفريق</h1>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0" }}>
          أعضاء الفريق وصلاحياتهم. المدير يقدر يدعو أعضاء جدد ويغيّر الصلاحيات — لازم يفضل مدير واحد على الأقل.
        </p>
      </header>

      <section style={{ ...body.style, display: "flex", flexDirection: "column", gap: 16 }}>
        <InviteForm onInvited={load} />

        <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-card)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--kv-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>الأعضاء</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{loaded ? `${toAr(members.length)} عضو` : "…"}</span>
          </div>
          {!loaded ? (
            <div style={{ padding: "40px 18px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 600 }}>بنحمّل…</div>
          ) : members.length === 0 ? (
            // UI4 — actionable empty-state: the invite form is right above; this
            // focuses it so the manager can add the first member in one click.
            <EmptyState
              icon={Users}
              title="مفيش أعضاء لسه"
              description="ادعُ فريقك عشان يشتغلوا على المحادثات والطلبات معاك. كل عضو هيوصله إيميل لتعيين كلمة السر."
              action={
                <button
                  onClick={() => { const el = document.getElementById("team-invite-email"); el?.focus(); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", borderRadius: 10, border: 0, background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
                >
                  <Mail size={15} /> ادعُ أول عضو
                </button>
              }
            />
          ) : (
            members.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--kv-border)" }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", color: "var(--kv-deep)" }}>{m.name.trim().charAt(0) || "ع"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2, direction: "ltr", textAlign: "right" }}>{m.email || "—"} · من {since(m.createdAt)}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 99, background: m.role === "manager" ? "rgba(14,159,110,.12)" : "rgba(100,116,139,.14)", color: m.role === "manager" ? "#0a8a5f" : "#51637a", fontSize: 10, fontWeight: 800 }}>
                  {m.role === "manager" ? <ShieldCheck size={12} /> : <UserRound size={12} />} {roleLabel(m.role)}
                </span>
                <button onClick={() => toggleRole(m)} disabled={busyId === m.id} style={{ height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 11, fontWeight: 800, fontFamily: "inherit", cursor: busyId === m.id ? "default" : "pointer", flex: "none" }}>
                  {m.role === "manager" ? "حوّله لموظف" : "رقّيه لمدير"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "operation">("operation");
  const [busy, setBusy] = useState(false);

  const invite = () => {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    void runActionOutcome("جارٍ إرسال الدعوة…", async () => {
      const res = await fetch("/api/team/invite", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e, role }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setBusy(false);
      if (res.ok) { setEmail(""); onInvited(); return { state: "success", message: "تمت الدعوة — في انتظار قبول العضو" }; }
      if (data.error === "already_member") return { state: "info", message: typeof data.message === "string" ? data.message : "العضو موجود بالفعل" };
      if (data.error === "bad_email") return { state: "failed", message: "البريد غير صحيح" };
      if (res.status === 403) return { state: "failed", message: "للمدير فقط" };
      return { state: "failed", message: "تعذّر إرسال الدعوة" };
    });
  };

  return (
    <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Mail size={15} color="var(--kv-primary)" />
        <span style={{ fontSize: 14, fontWeight: 800 }}>دعوة عضو جديد</span>
      </div>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
        <input
          id="team-invite-email"
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" dir="ltr"
          style={{ flex: 1, minWidth: 220, height: 40, borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", padding: "0 12px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--kv-text)" }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "manager" | "operation")}
          style={{ height: 40, borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", padding: "0 10px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)" }}>
          <option value="operation">موظف</option>
          <option value="manager">مدير</option>
        </select>
        <button onClick={invite} disabled={busy || !email.trim()}
          style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 10, background: busy || !email.trim() ? "var(--kv-card-soft)" : "var(--kv-grad-brand)", color: busy || !email.trim() ? "var(--kv-faint)" : "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: busy || !email.trim() ? "default" : "pointer" }}>
          {busy ? "..." : "ادعُ"}
        </button>
      </div>
      <p style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 9 }}>
        هيتبعت للعضو إيميل دعوة لتعيين كلمة السر. هينضمّ لمطعمك بالصلاحية المختارة بعد قبول الدعوة.
      </p>
    </div>
  );
}
