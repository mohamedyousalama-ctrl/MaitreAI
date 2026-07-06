"use client";

// ============================================================================
// console_v2 item 13 — Team & Roles. "Who can do what — every action stamped."
//
//  • ROLES + MEMBERS — REAL. The roster comes from the shared useMembersStore
//    (GET /api/members, names resolved server-side). Role change (PATCH
//    /api/members/[id], last-manager guard) and invite (POST /api/team/invite) are
//    wired AND now audited — the attribution law is enforced end to end (this PR adds
//    the audit emission the routes were missing). Manager-only writes.
//  • COMMAND CHANNEL — the staff-WhatsApp control (WO-2). The command VOCABULARY is a
//    real, static reference (the deterministic handler already runs on the webhook),
//    but the authorized-numbers list + command log have NO console read route yet →
//    GATHERING, never faked.
//  • DELIVERY MODULE — a separate, flag-OFF module (0031), deprecated from the V1
//    console → rendered dimmed SOON.
//  • ATTRIBUTED ACTIVITY — every action is logged to audit_events, but there's no
//    console read route yet → GATHERING.
//
// RED = safety only (role pills are gold/blue identity hues). XSS: dictionary text
// nodes + <Bdi> only.
// ============================================================================

import { useState } from "react";
import { Crown, HardHat, MessageSquare, Truck, Activity, UserPlus } from "lucide-react";
import { TruthChip } from "@/components/console-v2";
import { useMembersStore, type TeamMember } from "@/lib/members-store";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi } from "@/components/kivo";

const CMD_KEYS: DictKey[] = ["tm.cmd.status", "tm.cmd.pause", "tm.cmd.resume", "tm.cmd.86", "tm.cmd.restore"];
const CMD_TRIGGER: Record<string, string> = {
  "tm.cmd.status": "الحالة", "tm.cmd.pause": "وقف كريم", "tm.cmd.resume": "شغّل كريم", "tm.cmd.86": "86 [صنف]", "tm.cmd.restore": "رجّع [صنف]",
};

export default function TeamPage() {
  const t = useT();
  const members = useMembersStore((s) => s.members);
  const loaded = useMembersStore((s) => s.loaded);
  const loadMembers = useMembersStore((s) => s.loadMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<TeamMember | null>(null);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("tm.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("tm.sub")}</p>
        </div>
        <button onClick={() => setInviteOpen(true)} style={primaryBtn}><UserPlus size={14} /> {t("tm.invite")}</button>
      </div>

      {/* Attribution doctrine */}
      <div style={{ border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", background: "var(--kv-card-soft)", padding: "12px 16px", fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.85 }}>✋ {t("tm.intro")}</div>

      {/* ROLE cards */}
      <SectionLabel>{t("tm.sec.roles")}</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        <RoleCard icon={<Crown size={16} />} accent="#c58b1f" title={t("tm.role.mgr")} sub={t("tm.role.mgr.sub")} perms={t("tm.role.mgr.perms")} count={members.filter((m) => m.role === "manager").length} />
        <RoleCard icon={<HardHat size={16} />} accent="#3f7fe0" title={t("tm.role.op")} sub={t("tm.role.op.sub")} perms={t("tm.role.op.perms")} count={members.filter((m) => m.role === "operation").length} />
      </div>

      {/* MEMBERS — real roster. */}
      <SectionLabel>{t("tm.sec.members")}</SectionLabel>
      {members.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!loaded && <TruthChip state="gathering" />}
          <span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("tm.member.empty")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {members.map((m) => <MemberRow key={m.id} m={m} onChangeRole={() => setRoleTarget(m)} />)}
        </div>
      )}

      {/* COMMAND CHANNEL — vocab real (static); numbers + log GATHERING (no read route). */}
      <SectionLabel icon={<MessageSquare size={13} />}>{t("tm.sec.command")}</SectionLabel>
      <section style={card}>
        <p style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.7, margin: "0 0 12px" }}>{t("tm.cmd.note")}</p>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--kv-faint)", marginBottom: 8 }}>{t("tm.cmd.vocab")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {CMD_KEYS.map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-sm)", padding: "7px 11px" }}>
              <span dir="rtl" style={{ fontSize: 11.5, fontWeight: 800, color: "var(--kv-text)" }}>{CMD_TRIGGER[k]}</span>
              <span style={{ fontSize: 10.5, color: "var(--kv-faint)" }}>{t(k)}</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TruthChip state="gathering" />
          <span style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("tm.cmd.gathering")}</span>
        </div>
      </section>

      {/* DELIVERY MODULE — dimmed SOON. */}
      <SectionLabel icon={<Truck size={13} />}>{t("tm.sec.delivery")}</SectionLabel>
      <section style={{ ...card, borderStyle: "dashed", opacity: 0.72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--kv-faint)", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-pill)", padding: "3px 9px" }}>{t("tm.delivery.flagoff")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-muted)" }}>{t("tm.delivery.title")}</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.7, margin: 0 }}>{t("tm.delivery.body")}</p>
      </section>

      {/* ATTRIBUTED ACTIVITY — GATHERING (no audit read route). */}
      <SectionLabel icon={<Activity size={13} />}>{t("tm.sec.activity")}</SectionLabel>
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TruthChip state="gathering" />
          <span style={{ fontSize: 12, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("tm.activity.gathering")}</span>
        </div>
      </section>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onDone={loadMembers} />}
      {roleTarget && <RoleModal member={roleTarget} onClose={() => setRoleTarget(null)} onDone={loadMembers} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function MemberRow({ m, onChangeRole }: { m: TeamMember; onChangeRole: () => void }) {
  const t = useT();
  const isMgr = m.role === "manager";
  const since = (() => { try { return new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } })();
  return (
    <div style={rowStyle}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--kv-card)", border: "1px solid var(--kv-border)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, color: "var(--kv-deep)" }}><Bdi>{(m.name || "?").slice(0, 1)}</Bdi></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{m.name}</Bdi></div>
        <div style={{ fontSize: 11, color: "var(--kv-faint)", marginTop: 2 }} dir="ltr">
          {m.email ? <span>{m.email}</span> : null}{m.email && since ? " · " : null}{since ? <span>{t("tm.member.since")} {since}</span> : null}
        </div>
      </div>
      <button onClick={onChangeRole} style={ghostBtn}>{t("tm.member.changeRole")}</button>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: isMgr ? "#c58b1f" : "#3f7fe0", background: isMgr ? "rgba(197,139,31,.14)" : "rgba(63,127,224,.14)", borderRadius: "var(--kv-r-pill)", padding: "4px 11px", whiteSpace: "nowrap" }}>
        {t(isMgr ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}
      </span>
    </div>
  );
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operation" | "manager">("operation");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr(t("tm.inv.badEmail")); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/team/invite", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), role }) });
      if (r.status === 409) { setErr(t("tm.inv.dup")); return; }
      if (!r.ok) { setErr(t("tm.inv.error")); return; }
      await onDone(); onClose();
    } catch { setErr(t("tm.inv.error")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={t("tm.inv.title")} sub={t("tm.inv.sub")} onClose={onClose}>
      <Field label={t("tm.inv.email")}><input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" placeholder="name@example.com" style={input} /></Field>
      <Field label={t("tm.inv.role")}>
        <div style={{ display: "flex", gap: 8 }}>
          <RolePick active={role === "operation"} onClick={() => setRole("operation")}>{t("tm.role.op")}</RolePick>
          <RolePick active={role === "manager"} onClick={() => setRole("manager")}>{t("tm.role.mgr")}</RolePick>
        </div>
      </Field>
      <div style={auditBox}>{t("tm.inv.audit")}</div>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={send} disabled={busy} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{t("tm.inv.send")}</button>
        <button onClick={onClose} disabled={busy} style={ghostBtn}>{t("tm.cancel")}</button>
      </div>
    </Modal>
  );
}

function RoleModal({ member, onClose, onDone }: { member: TeamMember; onClose: () => void; onDone: () => Promise<void> }) {
  const t = useT();
  const target: "manager" | "operation" = member.role === "manager" ? "operation" : "manager";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/members/${member.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: target }) });
      if (r.status === 409) { setErr(t("tm.rl.lastManager")); return; }
      if (!r.ok) { setErr(t("tm.rl.error")); return; }
      await onDone(); onClose();
    } catch { setErr(t("tm.rl.error")); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={t("tm.rl.title")} sub={t("tm.rl.sub")} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "12px 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-text)", flex: 1 }}><Bdi>{member.name}</Bdi></span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--kv-faint)" }}>{t(member.role === "manager" ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}</span>
        <span style={{ color: "var(--kv-faint)" }}>→</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#0A8A5F" }}>{t(target === "manager" ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}</span>
      </div>
      {target === "manager" && <div style={{ ...auditBox, background: "rgba(232,180,90,.10)", borderColor: "rgba(232,180,90,.35)", color: "#b9822a" }}>{t("tm.rl.warnMgr")}</div>}
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{t("tm.rl.save")}</button>
        <button onClick={onClose} disabled={busy} style={ghostBtn}>{t("tm.cancel")}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function RoleCard({ icon, accent, title, sub, perms, count }: { icon: React.ReactNode; accent: string; title: string; sub: string; perms: string; count: number }) {
  const t = useT();
  return (
    <div style={{ ...card, borderTop: `3px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={{ color: accent, display: "inline-flex" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)" }}>{title}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>· {sub}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: accent }}>{count}</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--kv-muted)", lineHeight: 1.7, margin: 0 }}>{perms}</p>
    </div>
  );
}
function Modal({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(10,14,20,.55)", display: "grid", placeItems: "center", zIndex: 90, padding: 20 }}>
      <div style={{ width: "min(440px,94vw)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)", boxShadow: "0 30px 90px rgba(0,0,0,.4)", padding: "18px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--kv-text)", margin: 0, flex: 1 }}>{title}</h2>
            <button onClick={onClose} aria-label={t("tm.cancel")} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: "center" }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--kv-faint)", margin: "4px 0 0", lineHeight: 1.6 }}>{sub}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-muted)" }}>{label}</span>{children}</label>;
}
function RolePick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ flex: 1, height: 36, borderRadius: "var(--kv-r-md-sm)", border: active ? 0 : "1px solid var(--kv-border)", background: active ? "var(--kv-grad-brand)" : "var(--kv-card-soft)", color: active ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{children}</button>;
}
function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 0" }}>
      {icon && <span style={{ color: "var(--kv-faint)", display: "inline-flex" }}>{icon}</span>}
      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".08em", color: "var(--kv-faint)" }}>{children}</span>
    </div>
  );
}
const card: React.CSSProperties = {
  background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)",
  boxShadow: "var(--kv-shadow-card)", padding: "16px 18px",
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, background: "var(--kv-card)",
  border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md-lg)", padding: "11px 14px", boxShadow: "var(--kv-shadow-card)",
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: "var(--kv-r-md-sm)",
  border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontFamily: "var(--kv-font)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "0 0 auto",
};
const input: React.CSSProperties = {
  height: 38, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", padding: "0 11px", fontSize: 13, fontFamily: "var(--kv-font)", color: "var(--kv-text)",
};
const auditBox: React.CSSProperties = {
  fontSize: 11.5, color: "var(--kv-muted)", background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)",
  borderRadius: "var(--kv-r-md)", padding: "10px 12px", lineHeight: 1.6, marginTop: 4,
};
const errStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--kv-amber)", marginTop: 10 };
