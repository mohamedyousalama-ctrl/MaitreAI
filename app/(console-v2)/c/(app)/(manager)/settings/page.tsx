"use client";

// ============================================================================
// console_v2 item 8 — Settings. The preflight room (v2 spec, pages/07-settings.html).
//
// LAWS honored here:
//  • R2 TRUTH BOARD: WhatsApp health is EIGHT independent probes (GET
//    /api/settings/whatsapp-health), rendered tri-state — proven / failing / not
//    observed yet. "configured" alone is never called connected; a probe that
//    can't be proven renders «not observed yet», never a fabricated green.
//  • RED = SAFETY ONLY: a failing probe / a paused agent is an ALARM → amber, never
//    red. The only red identity color on the whole console is a safety-hold state.
//  • LOCKED SAFETY FLAGS: the two safety flags render locked ON, non-flippable — the
//    exact mirror of the server guard (POST /api/settings/flags 403s on any safety
//    flag, from any role). The console is simply not a surface that can turn them off.
//  • EVERY MUTATION IS AUDITED: flag flips, identity edits, and the round-trip test
//    all go through the R4 audited routes; the pause goes through the shared ops
//    store (manager gate stays server-side).
//  • XSS: every string is a text node from the dictionary — no dangerouslySetInnerHTML.
//  • GO-LIVE GATE: only the checks we can actually prove are live (the WhatsApp
//    rollup). The allergy-hint / menu / zones checks are NOT wired yet → rendered
//    SOON, never a fabricated «47 items / 25 zones / passed».
// ============================================================================

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MessageSquare, Flag, Building2, Clock3, Power, Rocket, Pencil,
  Check, AlertTriangle, Clock, Lock, Printer, CreditCard,
} from "lucide-react";
import { TruthChip, type TruthState } from "@/components/console-v2";
import { useConsoleOps } from "@/lib/console-ops-store";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { Probe, ProbeStatus, WhatsAppProbeId } from "@/lib/messaging/whatsapp-health";
import { parsePrinterConfig, PRINT_WIDTHS, type PrinterConfig, type PrintWidth } from "@/lib/print/printer-config";
import { connectQz, listQzPrinters, type QzStatus } from "@/lib/print/qz-client";

// Canon §2 hexes — proven=emerald, failing=amber (alarm, NOT red), unobserved=slate.
const PROBE_TONE: Record<ProbeStatus, { fg: string; bg: string }> = {
  pass: { fg: "#0A8A5F", bg: "rgba(14,159,110,.13)" },
  fail: { fg: "#b9822a", bg: "rgba(232,180,90,.18)" },
  unknown: { fg: "#5b6b7a", bg: "rgba(154,167,184,.16)" },
};
const PROBE_LABEL: Record<WhatsAppProbeId, DictKey> = {
  access_token: "set.wa.access_token",
  phone_number_id: "set.wa.phone_number_id",
  verify_token: "set.wa.verify_token",
  app_secret: "set.wa.app_secret",
  inbound_webhook: "set.wa.inbound_webhook",
  outbound_delivery: "set.wa.outbound_delivery",
  recent_send_failure: "set.wa.recent_send_failure",
  agent_replies_enabled: "set.wa.agent_replies_enabled",
};
const PROBE_STATUS_LABEL: Record<ProbeStatus, DictKey> = {
  pass: "set.probe.pass",
  fail: "set.probe.fail",
  unknown: "set.probe.unknown",
};
const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_LABEL: Record<string, DictKey> = {
  sunday: "set.day.sunday", monday: "set.day.monday", tuesday: "set.day.tuesday",
  wednesday: "set.day.wednesday", thursday: "set.day.thursday", friday: "set.day.friday", saturday: "set.day.saturday",
};
const SAFETY_DESC: Record<string, DictKey> = {
  deterministic_allergen_safety: "set.flags.desc.deterministic_allergen_safety",
  allergen_symptom_detection: "set.flags.desc.allergen_symptom_detection",
};

interface HealthResp { probes?: Probe[]; rollup?: ProbeStatus }
interface FlagsResp { flags?: Record<string, unknown>; safety?: string[] }
interface IdentityResp { name?: string | null; agentPersonaName?: string | null; timezone?: string | null }
type DayHours = { open?: string; close?: string; closed?: boolean };
interface HoursResp { hours?: Record<string, DayHours> }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const t = useT();
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [flags, setFlags] = useState<FlagsResp | null>(null);
  const [identity, setIdentity] = useState<IdentityResp | null>(null);
  const [hours, setHours] = useState<HoursResp | null>(null);

  const load = useCallback(async () => {
    const [h, f, i, hr] = await Promise.all([
      getJson<HealthResp>("/api/settings/whatsapp-health"),
      getJson<FlagsResp>("/api/settings/flags"),
      getJson<IdentityResp>("/api/settings/identity"),
      getJson<HoursResp>("/api/settings/hours"),
    ]);
    setHealth(h); setFlags(f); setIdentity(i); setHours(hr);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 6px" }}>{t("set.title")}</h1>
        <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: 0, lineHeight: 1.7 }}>{t("set.sub")}</p>
      </div>

      <TruthBoard health={health} onReload={load} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18, alignItems: "start" }}>
        <FeatureFlags flags={flags} onChanged={load} />
        <Identity identity={identity} onSaved={load} />
        <Hours hours={hours} />
        <PspCredentials pspFlagOn={flags?.flags?.psp_payments === true} />
        <QzPrinter qzFlagOn={flags?.flags?.qz_print === true} />
        <Emergency />
      </div>

      <GoLiveGate health={health} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// R2 — the WhatsApp truth board. Eight independent probes, tri-state.
// ---------------------------------------------------------------------------
function TruthBoard({ health, onReload }: { health: HealthResp | null; onReload: () => Promise<void> }) {
  const t = useT();
  const probes = health?.probes ?? [];
  const rollup: ProbeStatus | null = health?.rollup ?? null;
  const proven = probes.filter((p) => p.status === "pass").length;

  return (
    <section style={card}>
      <SectionHead icon={<MessageSquare size={16} />} title={t("set.wa.title")} sub={t("set.wa.sub")}>
        {/* Headline rollup — never a green while a red exists (rollUpProbes law). */}
        {probes.length === 0 ? (
          <TruthChip state="gathering" />
        ) : rollup === "fail" ? (
          <TruthChip state="degraded" />
        ) : rollup === "unknown" ? (
          <TruthChip state="gathering" />
        ) : (
          <span style={{ ...pill, ...PROBE_TONE.pass }}>
            <Check size={12} strokeWidth={3} /> {proven}/{probes.length} {t("set.probe.pass")}
          </span>
        )}
      </SectionHead>

      {probes.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
          <span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("set.loadError")}</span>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 8 }}>
          {probes.map((p) => (
            <div key={p.id} style={probeRow}>
              <ProbeGlyph status={p.status} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", flex: 1 }}>{t(PROBE_LABEL[p.id])}</span>
              <span style={{ ...pill, ...PROBE_TONE[p.status], fontSize: 10 }}>{t(PROBE_STATUS_LABEL[p.status])}</span>
            </div>
          ))}
        </div>
      )}

      <RoundTrip onDone={onReload} disabled={probes.length === 0} />
    </section>
  );
}

function ProbeGlyph({ status }: { status: ProbeStatus }) {
  const tone = PROBE_TONE[status];
  return (
    <span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: tone.bg, color: tone.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
      {status === "pass" ? <Check size={13} strokeWidth={3} /> : status === "fail" ? <AlertTriangle size={13} strokeWidth={2.5} /> : <Clock size={13} strokeWidth={2.5} />}
    </span>
  );
}

function RoundTrip({ onDone, disabled }: { onDone: () => Promise<void>; disabled: boolean }) {
  const t = useT();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ key: DictKey; tone: "ok" | "amber" } | null>(null);

  async function run() {
    if (busy) return;
    if (!to.trim()) { setMsg({ key: "set.wa.roundtripNeedsNumber", tone: "amber" }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/settings/whatsapp-health/roundtrip", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const body = (await r.json().catch(() => ({}))) as { status?: string };
      if (r.ok && body.status === "sent") setMsg({ key: "set.wa.roundtripSent", tone: "ok" });
      else if (r.ok && body.status === "skipped") setMsg({ key: "set.wa.roundtripSkipped", tone: "amber" });
      else setMsg({ key: "set.wa.roundtripFailed", tone: "amber" });
      await onDone(); // refresh the board with the new truth
    } catch {
      setMsg({ key: "set.wa.roundtripFailed", tone: "amber" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={to} onChange={(e) => setTo(e.target.value)} dir="ltr"
          placeholder={t("set.wa.roundtripTo")}
          style={{ height: 34, width: 200, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: "0 10px", fontSize: 12.5, fontFamily: "var(--kv-font)", color: "var(--kv-text)" }}
        />
        <button onClick={run} disabled={busy || disabled} style={{ ...primaryBtn, opacity: busy || disabled ? 0.5 : 1 }}>{t("set.wa.roundtrip")}</button>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("set.wa.roundtripSub")}</span>
      {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.tone === "ok" ? "var(--kv-deep)" : "var(--kv-amber)" }}>{t(msg.key)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// R4 — feature flags. Safety locked (server-mirrored); per-tenant flippable, audited.
// ---------------------------------------------------------------------------
function FeatureFlags({ flags, onChanged }: { flags: FlagsResp | null; onChanged: () => Promise<void> }) {
  const t = useT();
  const safety = flags?.safety ?? [];
  const all = flags?.flags ?? {};
  // Tenant (flippable) flags = everything that isn't a safety flag.
  const tenantKeys = Object.keys(all).filter((k) => !safety.includes(k)).sort();

  // Couldn't load (no tenant / 503) — say so honestly, don't render an empty board.
  if (!flags) {
    return (
      <section style={card}>
        <SectionHead icon={<Flag size={16} />} title={t("set.flags.title")} sub={t("set.flags.sub")} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TruthChip state="gathering" />
          <span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("set.loadError")}</span>
        </div>
      </section>
    );
  }

  return (
    <section style={card}>
      <SectionHead icon={<Flag size={16} />} title={t("set.flags.title")} sub={t("set.flags.sub")} />

      {/* SAFETY — locked ON, not flippable (mirror of the server 403 guard). */}
      <div style={subHead}>{t("set.flags.safetyHeader")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {safety.map((f) => (
          <div key={f} style={flagRow}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-text)", fontFamily: "var(--kv-mono, monospace)" }}>{f}</div>
              {SAFETY_DESC[f] && <div style={{ fontSize: 11, color: "var(--kv-faint)", marginTop: 2 }}>{t(SAFETY_DESC[f])}</div>}
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#b9822a", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Lock size={11} strokeWidth={2.6} /> {t("set.flags.alwaysOn")}
            </span>
          </div>
        ))}
      </div>

      {/* PER-TENANT — flippable, audited. */}
      <div style={subHead}>{t("set.flags.tenantHeader")}</div>
      {tenantKeys.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--kv-faint)", padding: "6px 2px" }}>{t("set.flags.empty")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tenantKeys.map((f) => (
            <FlagToggle key={f} flag={f} on={all[f] === true} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function FlagToggle({ flag, on, onChanged }: { flag: string; on: boolean; onChanged: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [saved, setSaved] = useState(false);

  async function flip() {
    if (busy) return;
    setBusy(true); setErr(false); setSaved(false);
    try {
      const r = await fetch("/api/settings/flags", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flag, enabled: !on }),
      });
      if (!r.ok) { setErr(true); return; }
      setSaved(true);
      await onChanged(); // re-read the real stored state (never trust the optimistic flip)
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={flagRow}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-text)", fontFamily: "var(--kv-mono, monospace)" }}>{flag}</div>
        {err && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-amber)", marginTop: 2 }}>{t("set.flags.error")}</div>}
        {saved && !err && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-deep)", marginTop: 2 }}>{t("set.flags.saved")}</div>}
      </div>
      <button
        type="button" role="switch" aria-checked={on} aria-label={flag} disabled={busy} onClick={flip}
        style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1, padding: 0, position: "relative", background: on ? "var(--kv-primary)" : "#cdd9d2", flex: "0 0 auto" }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "inset-inline-start .15s" }} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// R4 — tenant identity. Read + audited inline edit.
// ---------------------------------------------------------------------------
function Identity({ identity, onSaved }: { identity: IdentityResp | null; onSaved: () => Promise<void> }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [tz, setTz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [saved, setSaved] = useState(false);

  function begin() {
    setName(identity?.name ?? "");
    setPersona(identity?.agentPersonaName ?? "");
    setTz(identity?.timezone ?? "");
    setErr(false); setSaved(false); setEditing(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true); setErr(false);
    try {
      const r = await fetch("/api/settings/identity", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, agentPersonaName: persona, timezone: tz }),
      });
      if (!r.ok) { setErr(true); return; }
      setSaved(true); setEditing(false);
      await onSaved();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={card}>
      <SectionHead icon={<Building2 size={16} />} title={t("set.id.title")} sub={t("set.id.sub")}>
        {!editing && (
          <button onClick={begin} style={ghostBtn}><Pencil size={13} /> {t("set.id.edit")}</button>
        )}
      </SectionHead>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label={t("set.id.name")}><input value={name} onChange={(e) => setName(e.target.value)} style={input} /></Field>
          <Field label={t("set.id.persona")}><input value={persona} onChange={(e) => setPersona(e.target.value)} style={input} /></Field>
          <Field label={t("set.id.timezone")}><input value={tz} onChange={(e) => setTz(e.target.value)} dir="ltr" placeholder="Asia/Riyadh" style={input} /></Field>
          {err && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-amber)" }}>{t("set.id.error")}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{t("set.id.save")}</button>
            <button onClick={() => setEditing(false)} disabled={busy} style={ghostBtn}>{t("set.id.cancel")}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <ReadRow label={t("set.id.name")} value={identity?.name} bdi />
          <ReadRow label={t("set.id.persona")} value={identity?.agentPersonaName} bdi />
          <ReadRow label={t("set.id.timezone")} value={identity?.timezone} ltr />
          {saved && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--kv-deep)", marginTop: 6 }}>{t("set.id.saved")}</span>}
        </div>
      )}
    </section>
  );
}

function ReadRow({ label, value, bdi, ltr }: { label: string; value: string | null | undefined; bdi?: boolean; ltr?: boolean }) {
  const t = useT();
  const has = value != null && value !== "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-muted)", flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: has ? "var(--kv-text)" : "var(--kv-faint)" }}>
        {has ? (ltr ? <span dir="ltr">{value}</span> : bdi ? <Bdi>{value}</Bdi> : value) : t("set.id.unset")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// R4 — hours (read). One truth the agent quotes; edit deferred to a later PR.
// ---------------------------------------------------------------------------
function Hours({ hours }: { hours: HoursResp | null }) {
  const t = useT();
  const map = hours?.hours ?? {};
  const days = DAY_ORDER.filter((d) => map[d]);

  return (
    <section style={card}>
      <SectionHead icon={<Clock3 size={16} />} title={t("set.hours.title")} sub={t("set.hours.sub")} />
      {days.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <TruthChip state="gathering" />
          <span style={{ fontSize: 12.5, color: "var(--kv-faint)" }}>{t("set.hours.none")}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {days.map((d) => {
            const h = map[d];
            return (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-muted)", flex: 1 }}>{t(DAY_LABEL[d])}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-text)" }} dir="ltr">
                  {h.closed || !h.open || !h.close ? <span style={{ color: "var(--kv-faint)" }}>{t("set.hours.closed")}</span> : `${h.open} → ${h.close}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Emergency — instant, reversible, audited pause (shared ops store). Amber alarm,
// NEVER red (red = safety-hold only).
// ---------------------------------------------------------------------------
function Emergency() {
  const t = useT();
  // The shared ops store is already initialized (+ subscribed) by DataBootstrap in
  // the app frame; we only read it and post the audited flip — never re-init.
  const assistantOn = useConsoleOps((s) => s.assistantOn);
  const loaded = useConsoleOps((s) => s.loaded);
  const setAssistant = useConsoleOps((s) => s.setAssistant);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function toggle() {
    if (busy || !loaded) return;
    setBusy(true); setErr(false);
    const res = await setAssistant(!assistantOn);
    if (!res.ok) setErr(true);
    setBusy(false);
  }

  return (
    <section style={{ ...card, background: "rgba(232,180,90,.06)", border: "1px solid rgba(232,180,90,.35)" }}>
      <SectionHead icon={<Power size={16} />} title={t("set.emergency.title")} sub={t("set.emergency.sub")} tone="#b9822a" />
      <p style={{ fontSize: 12, color: "var(--kv-muted)", lineHeight: 1.7, margin: "0 0 12px" }}>{t("set.emergency.body")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={toggle} disabled={busy || !loaded} style={{ ...amberBtn, opacity: busy || !loaded ? 0.5 : 1 }}>
          {assistantOn ? t("set.emergency.pause") : t("set.emergency.resume")}
        </button>
        <span style={{ fontSize: 12, fontWeight: 800, color: assistantOn ? "var(--kv-muted)" : "#b9822a" }}>
          {!loaded ? "…" : assistantOn ? t("set.emergency.active") : t("set.emergency.paused")}
        </span>
      </div>
      {err && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-amber)", marginTop: 8, display: "block" }}>{t("set.emergency.error")}</span>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Go-live gate — honest: only the WhatsApp check is wired (real rollup). The
// allergy / menu / zones checks are NOT built → SOON, never a fabricated pass.
// ---------------------------------------------------------------------------
function GoLiveGate({ health }: { health: HealthResp | null }) {
  const t = useT();
  const rollup = health?.rollup ?? null;

  return (
    <section style={card}>
      <SectionHead icon={<Rocket size={16} />} title={t("set.gate.title")} />
      <p style={{ fontSize: 12.5, color: "var(--kv-muted)", lineHeight: 1.7, margin: "0 0 14px" }}>{t("set.gate.note")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <GateRow label={t("set.gate.wa")}>
          {rollup == null ? <TruthChip state="gathering" />
            : rollup === "pass" ? <span style={{ ...pill, ...PROBE_TONE.pass }}><Check size={12} strokeWidth={3} /> {t("set.probe.pass")}</span>
            : rollup === "fail" ? <TruthChip state="degraded" />
            : <TruthChip state="gathering" />}
        </GateRow>
        {/* Not wired — rendered SOON, never a fabricated «passed / 47 items / 25 zones». */}
        <GateRow label={t("set.gate.allergy")}><TruthChip state="soon" /></GateRow>
        <GateRow label={t("set.gate.menu")}><TruthChip state="soon" /></GateRow>
        <GateRow label={t("set.gate.zones")}><TruthChip state="soon" /></GateRow>
      </div>
      <p style={{ fontSize: 11.5, color: "#b9822a", lineHeight: 1.7, margin: "14px 0 0", fontWeight: 700 }}>{t("set.gate.warn")}</p>
    </section>
  );
}

function GateRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "10px 13px" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", flex: 1 }}>{label}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// WO-QZ-PRINT — silent-print config. Flag-gated (qz_print); the route reports
// enabled:false with the flag off. Connection state uses the truth vocabulary:
// connected→LIVE (proven), not-yet→GATHERING (not proven), failed→DEGRADED
// (amber alarm, never red — red is safety only). Browser print is always the
// fallback, so a not-proven connection is never an error state on its own.
// ---------------------------------------------------------------------------
const QZ_CONN_STATE: Record<QzStatus, TruthState> = { connected: "live", disconnected: "gathering", error: "degraded" };
const QZ_CONN_LABEL: Record<QzStatus, DictKey> = {
  connected: "set.printer.conn.connected",
  disconnected: "set.printer.conn.notproven",
  error: "set.printer.conn.failed",
};

function QzPrinter({ qzFlagOn }: { qzFlagOn: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [config, setConfig] = useState<PrinterConfig>({ name: "", width: "80mm", auto_print: false });
  const [printers, setPrinters] = useState<string[]>([]);
  const [conn, setConn] = useState<QzStatus>("disconnected");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Ref holds the latest committed config so rapid successive save() calls derive
  // `next` from current state (not a stale closure) and the POST body is synchronous.
  const configRef = useRef<PrinterConfig>(config);

  // Re-fetch whenever the qz_print flag changes (a manager can flip it in the
  // FeatureFlags card on THIS page) — the server route is the authority on
  // enabled/config, so an off→on flip re-hydrates the card without a reload.
  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    fetch("/api/settings/printer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        // Distinguish a real backend failure (null = non-ok) from a genuinely
        // disabled flag — collapsing both into "off" would lie about the cause.
        if (!d) { setLoadFailed(true); setEnabled(false); return; }
        setEnabled(!!d.enabled);
        if (d.enabled && d.config) { const c = parsePrinterConfig(d.config); setConfig(c); configRef.current = c; }
      })
      .catch(() => { if (alive) { setLoadFailed(true); setEnabled(false); } });
    return () => { alive = false; };
  }, [qzFlagOn]);

  async function scan() {
    setConn("disconnected");
    const s = await connectQz();
    setConn(s);
    if (s === "connected") setPrinters(await listQzPrinters());
  }
  async function save(patch: Partial<PrinterConfig>) {
    const prev = configRef.current;
    const next = { ...configRef.current, ...patch };
    setConfig(next);
    configRef.current = next; // keep the ref current synchronously for the next call
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/settings/printer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next.name, width: next.width, auto_print: next.auto_print }),
      });
      // A non-2xx (flag off, missing column, DB error, non-manager 403) must NOT
      // leave an optimistic config the ticket page won't read — revert + surface it.
      if (!res.ok) { setConfig(prev); configRef.current = prev; setSaveError(true); }
    } catch { setConfig(prev); configRef.current = prev; setSaveError(true); } finally { setSaving(false); }
  }

  if (enabled === null) return null; // loading — render nothing (no fabricated state)

  return (
    <section style={card}>
      <SectionHead icon={<Printer size={16} />} title={t("set.printer.title")} sub={t("set.printer.sub")}>
        {enabled ? <TruthChip state={QZ_CONN_STATE[conn]} label={t(QZ_CONN_LABEL[conn])} /> : null}
      </SectionHead>
      {!enabled ? (
        <p style={{ fontSize: 12.5, color: loadFailed ? "var(--kv-amber)" : "var(--kv-faint)" }}>
          {loadFailed ? t("set.loadError") : t("set.printer.off")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={scan} style={ghostBtn}>{t("set.printer.scan")}</button>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-muted)" }}>
            {t("set.printer.printer")}
            <select value={config.name} onChange={(e) => save({ name: e.target.value })} style={{ ...input, display: "block", marginTop: 6, width: "100%" }}>
              <option value="">{t("set.printer.pick")}</option>
              {config.name && !printers.includes(config.name) ? <option value={config.name}>{config.name}</option> : null}
              {printers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(PRINT_WIDTHS as readonly PrintWidth[]).map((w) => (
              <button key={w} onClick={() => save({ width: w })} aria-pressed={config.width === w}
                style={{ ...pill, cursor: "pointer", border: "1.5px solid var(--kv-border)",
                  background: config.width === w ? "var(--kv-grad-brand)" : "var(--kv-card)",
                  color: config.width === w ? "#fff" : "var(--kv-muted)" }}>
                {t(w === "58mm" ? "set.printer.w58" : "set.printer.w80")}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700, color: "var(--kv-text)", cursor: "pointer" }}>
            <input type="checkbox" checked={config.auto_print} onChange={(e) => save({ auto_print: e.target.checked })} />
            {t("set.printer.autoprint")}
          </label>
          <span style={{ fontSize: 11.5, color: saveError ? "var(--kv-amber)" : "var(--kv-faint)", fontWeight: saveError ? 700 : 400, lineHeight: 1.6 }}>
            {saving ? t("set.printer.saving") : saveError ? t("set.printer.saveError") : t("set.printer.help")}
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// R10 — self-serve merchant journey: the tenant's OWN Moyasar keys. Mirrors the
// WhatsApp-creds discipline: publishable key is editable; secret key + webhook
// secret are WRITE-ONLY (never fetched back; the card only knows they EXIST) and
// a blank field leaves the stored ciphertext untouched. All reads/writes go via
// /api/settings/psp (service role encrypts at rest) — this component never sees a
// secret. Flag-gated on psp_payments; TruthChip shows the «مُهيأ» ready state.
// ---------------------------------------------------------------------------
interface PspResp {
  enabled: boolean; provider: string | null; publishableKey: string;
  hasSecretKey: boolean; hasWebhookSecret: boolean; configured: boolean; error?: string;
}

function PspCredentials({ pspFlagOn }: { pspFlagOn: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState(""); // write-only (blank = keep)
  const [webhookSecret, setWebhookSecret] = useState(""); // write-only (blank = keep)
  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errKey, setErrKey] = useState<DictKey | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    fetch("/api/settings/psp")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PspResp | null) => {
        if (!alive) return;
        if (!d) { setLoadFailed(true); setEnabled(false); return; }
        setEnabled(!!d.enabled);
        setPublishableKey(d.publishableKey ?? "");
        setHasSecretKey(!!d.hasSecretKey);
        setHasWebhookSecret(!!d.hasWebhookSecret);
        setConfigured(!!d.configured);
      })
      .catch(() => { if (alive) { setLoadFailed(true); setEnabled(false); } });
    return () => { alive = false; };
  }, [pspFlagOn]);

  async function save() {
    setSaving(true); setSaved(false); setErrKey(null);
    try {
      const res = await fetch("/api/settings/psp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "moyasar",
          publishableKey,
          ...(secretKey.trim() ? { secretKey } : {}),
          ...(webhookSecret.trim() ? { webhookSecret } : {}),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; configured?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setErrKey(d.error === "forbidden" ? "set.psp.errForbidden" : d.error === "psp_disabled" ? "set.psp.errDisabled" : "set.psp.errGeneric");
        return;
      }
      if (secretKey.trim()) setHasSecretKey(true);
      if (webhookSecret.trim()) setHasWebhookSecret(true);
      setSecretKey(""); setWebhookSecret("");
      setConfigured(!!d.configured);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setErrKey("set.psp.errGeneric");
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  const secretField = (label: DictKey, value: string, set: (v: string) => void, has: boolean, ph: DictKey) => (
    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-muted)" }}>
      {t(label)}
      <input dir="ltr" type="password" autoComplete="off" value={value} onChange={(e) => set(e.target.value)}
        placeholder={has ? t("set.psp.keep") : t(ph)} style={{ ...input, display: "block", marginTop: 6, width: "100%" }} />
    </label>
  );

  return (
    <section style={card}>
      <SectionHead icon={<CreditCard size={16} />} title={t("set.psp.title")} sub={t("set.psp.sub")}>
        {enabled ? <TruthChip state={configured ? "live" : "gathering"} label={t(configured ? "set.psp.configured" : "set.psp.notconfigured")} /> : null}
      </SectionHead>
      {!enabled ? (
        <p style={{ fontSize: 12.5, color: loadFailed ? "var(--kv-amber)" : "var(--kv-faint)" }}>
          {loadFailed ? t("set.loadError") : t("set.psp.off")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-muted)" }}>
            {t("set.psp.pk")}
            <input dir="ltr" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)}
              placeholder={t("set.psp.pastePk")} style={{ ...input, display: "block", marginTop: 6, width: "100%" }} />
          </label>
          {secretField("set.psp.sk", secretKey, setSecretKey, hasSecretKey, "set.psp.pasteSk")}
          {secretField("set.psp.whsec", webhookSecret, setWebhookSecret, hasWebhookSecret, "set.psp.pasteWh")}
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, height: 38, opacity: saving ? 0.6 : 1 }}>
            {saving ? t("set.psp.saving") : t("set.psp.save")}
          </button>
          {saved ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-deep)" }}>{t("set.psp.saved")}</span> : null}
          {errKey ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-amber)" }}>{t(errKey)}</span> : null}
          <span style={{ fontSize: 11.5, color: "var(--kv-faint)", lineHeight: 1.6 }}>{t("set.psp.note")}</span>
        </div>
      )}
    </section>
  );
}

function SectionHead({ icon, title, sub, tone, children }: { icon: React.ReactNode; title: string; sub?: string; tone?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
      <span style={{ color: tone ?? "var(--kv-muted)", display: "inline-flex", marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-text)", margin: 0 }}>{title}</h2>
        {sub && <p style={{ fontSize: 11.5, color: "var(--kv-faint)", margin: "3px 0 0", lineHeight: 1.6 }}>{sub}</p>}
      </div>
      {children && <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-muted)", letterSpacing: ".02em" }}>{label}</span>
      {children}
    </label>
  );
}

const card: React.CSSProperties = {
  background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)",
  boxShadow: "var(--kv-shadow-card)", padding: "18px 20px",
};
const pill: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: "var(--kv-r-pill)",
  fontFamily: "var(--kv-font)", fontSize: 11, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap",
};
const probeRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, background: "var(--kv-card-soft)",
  border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "9px 12px",
};
const flagRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, background: "var(--kv-card-soft)",
  border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-md)", padding: "9px 12px",
};
const subHead: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, letterSpacing: ".08em", color: "var(--kv-faint)", margin: "4px 0 8px",
};
const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const amberBtn: React.CSSProperties = {
  height: 36, padding: "0 16px", borderRadius: "var(--kv-r-md-sm)", border: "1px solid rgba(232,180,90,.5)",
  background: "rgba(232,180,90,.14)", color: "#b9822a", fontFamily: "var(--kv-font)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: "var(--kv-r-md-sm)",
  border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontFamily: "var(--kv-font)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
const input: React.CSSProperties = {
  height: 36, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", padding: "0 11px", fontSize: 13, fontFamily: "var(--kv-font)", color: "var(--kv-text)",
};
