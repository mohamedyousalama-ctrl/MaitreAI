"use client";

// ============================================================================
// console_v2 item 13 — Team & Roles (v35 dark-glass rebuild). "Who can do what —
// every action stamped." Presentation rebuilt onto the shared kit; all data +
// mutations UNCHANGED from the shipped page.
//
//  • ROLES + MEMBERS — REAL. Roster from the shared useMembersStore (GET
//    /api/members). Role change (PATCH /api/members/[id], last-manager guard) and
//    invite (POST /api/team/invite) are wired AND audited (attribution law).
//    Manager-only writes. Per-member ACTIVITY STATS (actions/chats) have no read
//    route yet → rendered as the designed stat slots in GATHERING, never faked.
//  • COMMAND CHANNEL — the command VOCABULARY is a real static reference (the
//    deterministic handler runs on the webhook), but the authorized-numbers list +
//    command log have NO console read route → GATHERING, never fabricated rows.
//  • DELIVERY MODULE — flag-OFF (0031), deprecated from the V1 console (Scope Law) →
//    dimmed COMING-SOON. Ruling 2A: TWO role cards (Manager + Operator), NO Driver
//    card — delivery is out of scope.
//  • ATTRIBUTED ACTIVITY — every action is logged to audit_events, but there's no
//    console read route yet → GATHERING.
//
// RED = safety only (role pills are gold/blue identity hues, never red). XSS:
// dictionary text nodes + <Bdi> only.
// ============================================================================

import { useState } from "react";
import { Crown, HardHat, MessageSquare, Truck, Activity, UserPlus } from "lucide-react";
import { HeaderRow, SectionHeader, TruthChip, MiniModal, Toasts, pushToast } from "@/components/console-v2/kit";
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
    <>
      <HeaderRow
        title={t("tm.title")}
        jobLine={t("tm.sub")}
        right={<button onClick={() => setInviteOpen(true)} style={primaryBtn}><UserPlus size={14} /> {t("tm.invite")}</button>}
      />
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
        {/* Attribution doctrine */}
        <div style={doctrine}>✋ {t("tm.intro")}</div>

        {/* ROLE cards — TWO only (Scope Law: no Driver). */}
        <SectionHeader tier="gold" icon={<Crown size={15} />} title={t("tm.sec.roles")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          <RoleCard tier="gold" icon={<Crown size={16} />} title={t("tm.role.mgr")} sub={t("tm.role.mgr.sub")} perms={t("tm.role.mgr.perms")} count={members.filter((m) => m.role === "manager").length} />
          <RoleCard tier="blue" icon={<HardHat size={16} />} title={t("tm.role.op")} sub={t("tm.role.op.sub")} perms={t("tm.role.op.perms")} count={members.filter((m) => m.role === "operation").length} />
        </div>

        {/* MEMBERS — real roster; per-member stats GATHERING. */}
        <SectionHeader tier="blue" icon={<UserPlus size={15} />} title={t("tm.sec.members")} right={members.length > 0 ? <TruthChip state="gather" label={t("tm.stat.actions")} /> : undefined} />
        {members.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!loaded && <TruthChip state="gather" />}
            <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{t("tm.member.empty")}</span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {members.map((m) => <MemberRow key={m.id} m={m} onChangeRole={() => setRoleTarget(m)} />)}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.6, padding: "0 2px" }}>{t("tm.stat.gather")}</div>
          </>
        )}

        {/* COMMAND CHANNEL — vocab real (static); numbers + log GATHERING. */}
        <SectionHeader tier="blue" icon={<MessageSquare size={15} />} title={t("tm.sec.command")} />
        <section style={card}>
          <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.7, margin: "0 0 12px" }}>{t("tm.cmd.note")}</p>
          <div style={subLabel}>{t("tm.cmd.vocab")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {CMD_KEYS.map((k) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 11, padding: "7px 11px" }}>
                <span dir="rtl" style={{ fontSize: 11.5, fontWeight: 800, color: "#a9d4ff" }}>{CMD_TRIGGER[k]}</span>
                <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{t(k)}</span>
              </span>
            ))}
          </div>
          <div style={{ ...subLabel, display: "flex", alignItems: "center", gap: 8 }}>{t("tm.cmd.authed")} <TruthChip state="gather" /></div>
          <div style={{ ...subLabel, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>{t("tm.cmd.log")} <TruthChip state="gather" /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6 }}>{t("tm.cmd.gathering")}</span>
          </div>
        </section>

        {/* DELIVERY MODULE — dimmed COMING-SOON (Scope Law). */}
        <SectionHeader tier="coral" icon={<Truck size={15} />} title={t("tm.sec.delivery")} />
        <section style={{ ...card, borderStyle: "dashed", opacity: 0.62 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--faint)", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 99, padding: "3px 9px" }}>{t("tm.delivery.flagoff")}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--dim)" }}>{t("tm.delivery.title")}</span>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.7, margin: 0 }}>{t("tm.delivery.body")}</p>
        </section>

        {/* ATTRIBUTED ACTIVITY — GATHERING (no audit read route). */}
        <SectionHeader tier="green" icon={<Activity size={15} />} title={t("tm.sec.activity")} right={<TruthChip state="gather" />} />
        <section style={card}>
          <span style={{ fontSize: 12, color: "var(--faint)", lineHeight: 1.6 }}>{t("tm.activity.gathering")}</span>
        </section>

        {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onDone={loadMembers} />}
        {roleTarget && <RoleModal member={roleTarget} onClose={() => setRoleTarget(null)} onDone={loadMembers} />}
      </div>
      <Toasts />
    </>
  );
}

// ---------------------------------------------------------------------------
function MemberRow({ m, onChangeRole }: { m: TeamMember; onChangeRole: () => void }) {
  const t = useT();
  const isMgr = m.role === "manager";
  const since = (() => { try { return new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; } })();
  return (
    <div style={rowStyle}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--inset2)", border: "1px solid var(--stroke)", display: "grid", placeItems: "center", flex: "none", fontWeight: 900, color: "#5fe0b0" }}><Bdi>{(m.name || "?").slice(0, 1)}</Bdi></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{m.name}</Bdi></div>
        <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }} dir="ltr">
          {m.email ? <span>{m.email}</span> : null}{m.email && since ? " · " : null}{since ? <span>{t("tm.member.since")} {since}</span> : null}
        </div>
      </div>
      {/* Per-member stats — GATHERING (no read route), designed slots not faked. */}
      <div style={{ display: "flex", gap: 14, flex: "none" }}>
        <StatSlot label={t("tm.stat.actions")} />
        <StatSlot label={t("tm.stat.chats")} />
      </div>
      <button onClick={onChangeRole} style={ghostBtn}>{t("tm.member.changeRole")}</button>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: isMgr ? "var(--gold)" : "#a9d4ff", background: isMgr ? "rgba(255,212,126,.14)" : "rgba(75,139,255,.14)", borderRadius: 99, padding: "4px 11px", whiteSpace: "nowrap" }}>
        {t(isMgr ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}
      </span>
    </div>
  );
}

function StatSlot({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="kv-skeleton" style={{ width: 26, height: 15, borderRadius: 6, margin: "0 auto 3px" }} />
      <div style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--faint)" }}>{label}</div>
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
      await onDone(); pushToast(t("tm.inv.send"), "ok"); onClose();
    } catch { setErr(t("tm.inv.error")); }
    finally { setBusy(false); }
  }

  return (
    <MiniModal open onClose={onClose}>
      <ModalHead title={t("tm.inv.title")} sub={t("tm.inv.sub")} onClose={onClose} />
      <Field label={t("tm.inv.email")}><input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" placeholder="name@example.com" style={input} /></Field>
      <Field label={t("tm.inv.role")}>
        <div style={{ display: "flex", gap: 8 }}>
          <RolePick active={role === "operation"} onClick={() => setRole("operation")}>{t("tm.role.op")}</RolePick>
          <RolePick active={role === "manager"} onClick={() => setRole("manager")}>{t("tm.role.mgr")}</RolePick>
        </div>
      </Field>
      <div style={auditBox}>🔒 {t("tm.inv.audit")}</div>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={send} disabled={busy} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{t("tm.inv.send")}</button>
        <button onClick={onClose} disabled={busy} style={ghostBtn}>{t("tm.cancel")}</button>
      </div>
    </MiniModal>
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
      await onDone(); pushToast(t("tm.rl.save"), "ok"); onClose();
    } catch { setErr(t("tm.rl.error")); }
    finally { setBusy(false); }
  }

  return (
    <MiniModal open onClose={onClose}>
      <ModalHead title={t("tm.rl.title")} sub={t("tm.rl.sub")} onClose={onClose} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "12px 14px" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)", flex: 1 }}><Bdi>{member.name}</Bdi></span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)" }}>{t(member.role === "manager" ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}</span>
        <span style={{ color: "var(--faint)" }}>→</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#8ce8cc" }}>{t(target === "manager" ? "tm.roleLabel.manager" : "tm.roleLabel.operation")}</span>
      </div>
      {target === "manager" && <div style={{ ...auditBox, background: "rgba(232,180,90,.1)", borderColor: "rgba(232,180,90,.35)", color: "#ffcf8d" }}>⚠ {t("tm.rl.warnMgr")}</div>}
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, flex: 1, justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{t("tm.rl.save")}</button>
        <button onClick={onClose} disabled={busy} style={ghostBtn}>{t("tm.cancel")}</button>
      </div>
    </MiniModal>
  );
}

// ---------------------------------------------------------------------------
const TIER_BADGE: Record<"gold" | "blue", { grad: string; hue: string }> = {
  gold: { grad: "var(--g-gold)", hue: "var(--gold)" },
  blue: { grad: "var(--g-blue)", hue: "#a9d4ff" },
};
function RoleCard({ tier, icon, title, sub, perms, count }: { tier: "gold" | "blue"; icon: React.ReactNode; title: string; sub: string; perms: string; count: number }) {
  const b = TIER_BADGE[tier];
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: b.grad, display: "grid", placeItems: "center", color: "var(--ink)", flex: "none" }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)" }}>{title}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--faint)" }}>· {sub}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 18, fontWeight: 900, color: b.hue, fontFamily: "var(--kvx-font-ui)" }}>{count}</span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.7, margin: 0 }}>{perms}</p>
    </div>
  );
}
function ModalHead({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  const t = useT();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", margin: 0, flex: 1 }}>{title}</h2>
        <button onClick={onClose} aria-label={t("tm.cancel")} style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: "center" }}>✕</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--faint)", margin: "4px 0 0", lineHeight: 1.6 }}>{sub}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, color: "var(--dim)" }}>{label}</span>{children}</label>;
}
function RolePick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ flex: 1, height: 36, borderRadius: 12, border: active ? 0 : "1px solid var(--stroke)", background: active ? "linear-gradient(135deg,#12b57e,#0E9F6E)" : "var(--inset2)", color: active ? "#fff" : "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{children}</button>;
}

const card: React.CSSProperties = {
  background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 18, padding: "16px 18px", backdropFilter: "blur(12px)",
};
const doctrine: React.CSSProperties = {
  border: "1px solid var(--stroke)", borderRadius: 16, background: "var(--inset2)", padding: "12px 16px", fontSize: 12.5, color: "var(--dim)", lineHeight: 1.85,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, background: "var(--inset)",
  border: "1px solid var(--stroke)", borderRadius: 14, padding: "11px 14px",
};
const subLabel: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 900, letterSpacing: ".06em", color: "var(--faint)", marginBottom: 8,
};
const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 12, border: 0,
  background: "linear-gradient(135deg,#12b57e,#0E9F6E)", color: "#fff", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.05)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flex: "0 0 auto",
};
const input: React.CSSProperties = {
  height: 38, borderRadius: 12, border: "1px solid var(--stroke2)",
  background: "var(--inset2)", padding: "0 11px", fontSize: 13, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)",
};
const auditBox: React.CSSProperties = {
  fontSize: 11.5, color: "var(--dim)", background: "var(--inset2)", border: "1px solid var(--stroke)",
  borderRadius: 12, padding: "10px 12px", lineHeight: 1.6, marginTop: 4,
};
const errStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#ffcf8d", marginTop: 10 };
