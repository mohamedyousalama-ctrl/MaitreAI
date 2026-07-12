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
  MessageSquare, Building2, Clock3, Power, Rocket, Pencil,
  Check, AlertTriangle, Clock, Lock, Printer, CreditCard, MapPin,
} from "lucide-react";
import { HeaderRow, PageGrid, MiniModal, TruthChip, type TruthState, type Tier } from "@/components/console-v2/kit";
import { useConsoleOps } from "@/lib/console-ops-store";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { Probe, ProbeStatus, WhatsAppProbeId } from "@/lib/messaging/whatsapp-health";
import { parsePrinterConfig, PRINT_WIDTHS, type PrinterConfig, type PrintWidth } from "@/lib/print/printer-config";
import { connectQz, listQzPrinters, type QzStatus } from "@/lib/print/qz-client";
import ZoneMapEditor from "@/components/console-v2/delivery/ZoneMapEditor";

// Canon §2 hexes — proven=emerald, failing=amber (alarm, NOT red), unobserved=slate.
// Dark-legible probe tones — proven=emerald, failing=amber (alarm, NOT red),
// unobserved=slate. fg brightened for the dark glass surface.
const PROBE_TONE: Record<ProbeStatus, { fg: string; bg: string }> = {
  pass: { fg: "#8ce8cc", bg: "rgba(46,204,154,.12)" },
  fail: { fg: "#ffcf8d", bg: "rgba(232,180,90,.16)" },
  unknown: { fg: "var(--dim)", bg: "rgba(255,255,255,.05)" },
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

  // Canonical console_v2 grid: 84px rail (shell) | 348px context | 1fr hero.
  // CONTEXT = who-you-are + the emergency control (the design's identity column).
  // HERO = the operational truth surfaces (truth board, hours, payments, flags,
  // printer) + the go-live gate. Content is UNCHANGED; only the layout moves from
  // full-width to rail+context+hero.
  const context = (
    <>
      <Identity identity={identity} onSaved={load} />
      <Emergency />
    </>
  );
  const hero = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ gridColumn: "1 / -1" }}><TruthBoard health={health} onReload={load} /></div>
      <Hours hours={hours} />
      <PspCredentials pspFlagOn={flags?.flags ? flags.flags.psp_payments === true : null} onFlagChanged={load} />
      <QzPrinter qzFlagOn={flags?.flags ? flags.flags.qz_print === true : null} onFlagChanged={load} />
      <div style={{ gridColumn: "1 / -1" }}><DeliveryZones /></div>
      <div style={{ gridColumn: "1 / -1" }}><GoLiveGate health={health} /></div>
    </div>
  );

  return (
    <>
      <HeaderRow title={t("set.title")} jobLine={t("set.sub")} />
      <PageGrid context={context} hero={hero} />
    </>
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
          <TruthChip state="gather" />
        ) : rollup === "fail" ? (
          <TruthChip state="degraded" />
        ) : rollup === "unknown" ? (
          <TruthChip state="gather" />
        ) : (
          <span style={{ ...pill, ...PROBE_TONE.pass }}>
            <Check size={12} strokeWidth={3} /> {proven}/{probes.length} {t("set.probe.pass")}
          </span>
        )}
      </SectionHead>

      {probes.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 0" }}>
          <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{t("set.loadError")}</span>
          <button onClick={() => void onReload()} style={retryBtn}>↻ {t("set.retry")}</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 6 }}>
          {probes.map((p) => (
            <div key={p.id} style={probeRow}>
              <ProbeGlyph status={p.status} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)", flex: 1 }}>{t(PROBE_LABEL[p.id])}</span>
              <span style={{ ...pill, ...PROBE_TONE[p.status], fontSize: 9.5 }}>{t(PROBE_STATUS_LABEL[p.status])}</span>
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

  // Compact test-console module — a distinct bordered block so the test surface
  // reads as intentional, not empty space.
  return (
    <div style={{ marginTop: 12, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "11px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={to} onChange={(e) => setTo(e.target.value)} dir="ltr"
          placeholder={t("set.wa.roundtripTo")}
          style={{ height: 34, flex: 1, minWidth: 150, borderRadius: 10, border: "1px solid var(--stroke2)", background: "var(--inset)", padding: "0 11px", fontSize: 12.5, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)" }}
        />
        <button onClick={run} disabled={busy || disabled} style={{ ...primaryBtn, opacity: busy || disabled ? 0.5 : 1 }}>{t("set.wa.roundtrip")}</button>
      </div>
      <span style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.55 }}>{t("set.wa.roundtripSub")}</span>
      {msg && <span style={{ fontSize: 12, fontWeight: 700, color: msg.tone === "ok" ? "#8ce8cc" : "#ffcf8d" }}>{t(msg.key)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curated capability switch — the ONLY console flag control. The raw feature-flag
// board (English keys, delete affordances, every non-safety flag) was removed: it
// leaked infra flags a manager could brick the tenant with (e.g. console_v2) and
// showed safety keys that must never be a console surface. This is its replacement
// — a single labelled ON/OFF for ONE named operator capability, folded into that
// capability's own card. It flips ONLY psp_payments / qz_print; the server route's
// allowlist (lib/settings/safety-flags) rejects anything else with 403, so this
// component can never be pointed at an infra or safety flag. Audited server-side.
// ---------------------------------------------------------------------------
// `on` is TRI-STATE: null = the flags load hasn't resolved (or failed). We must NOT
// coerce an unknown flag to OFF — an actually-enabled capability would render an OFF
// switch, and a click would POST enabled:true instead of disabling it. So until the
// real state is known the switch is disabled (never actionable on a guess).
function CapabilitySwitch({ flag, on, label, onChanged }: { flag: string; on: boolean | null; label: string; onChanged: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const isOn = on === true;
  const unknown = on === null;

  async function flip() {
    if (busy || unknown) return;
    setBusy(true); setErr(false);
    try {
      const r = await fetch("/api/settings/flags", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flag, enabled: !isOn }),
      });
      if (!r.ok) { setErr(true); return; }
      await onChanged(); // re-read the real stored state (never trust the optimistic flip)
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || unknown;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {err && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)" }}>{t("set.flags.error")}</span>}
      <button
        type="button" role="switch" aria-checked={isOn} aria-label={label} disabled={disabled} onClick={flip}
        style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0, position: "relative", background: isOn ? "rgba(14,159,110,.5)" : "rgba(255,255,255,.14)", flex: "0 0 auto" }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: isOn ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: isOn ? "var(--teal)" : "#8b97a8", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "inset-inline-start .15s" }} />
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
          <TruthChip state="gather" />
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function toggle() {
    if (busy || !loaded) return;
    setBusy(true); setErr(false);
    const res = await setAssistant(!assistantOn);
    if (!res.ok) setErr(true);
    setBusy(false);
  }
  // Pausing (stopping the agent) asks for confirmation first — prevents an
  // accidental stop. Resuming is restorative and needs no gate.
  function onButton() {
    if (busy || !loaded) return;
    if (assistantOn) setConfirmOpen(true);
    else void toggle();
  }
  async function confirmStop() {
    setConfirmOpen(false);
    await toggle();
  }

  return (
    <section style={{ ...card, background: "rgba(232,180,90,.06)", border: "1px solid rgba(232,180,90,.35)" }}>
      <SectionHead icon={<Power size={16} />} title={t("set.emergency.title")} sub={t("set.emergency.sub")} tone="#b9822a" />
      <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.7, margin: "0 0 12px" }}>{t("set.emergency.body")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onButton} disabled={busy || !loaded} style={{ ...amberBtn, opacity: busy || !loaded ? 0.5 : 1 }}>
          {assistantOn ? t("set.emergency.pause") : t("set.emergency.resume")}
        </button>
        <span style={{ fontSize: 12, fontWeight: 800, color: assistantOn ? "var(--dim)" : "#ffcf8d" }}>
          {!loaded ? "…" : assistantOn ? t("set.emergency.active") : t("set.emergency.paused")}
        </span>
      </div>
      {err && <span style={{ fontSize: 12, fontWeight: 700, color: "#ffcf8d", marginTop: 8, display: "block" }}>{t("set.emergency.error")}</span>}

      {/* Confirm-stop modal — AMBER (operational), NOT red. Prevents accidental stops. */}
      <MiniModal open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(232,180,90,.16)", color: "#ffcf8d", display: "grid", placeItems: "center", flex: "none" }}><Power size={16} /></span>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", margin: 0 }}>{t("set.emergency.confirmTitle")}</h2>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7, margin: "0 0 16px" }}>{t("set.emergency.confirmBody")}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void confirmStop()} disabled={busy} style={{ ...amberBtn, flex: 1, opacity: busy ? 0.5 : 1 }}>{t("set.emergency.confirmYes")}</button>
          <button onClick={() => setConfirmOpen(false)} disabled={busy} style={ghostBtn}>{t("set.emergency.confirmNo")}</button>
        </div>
      </MiniModal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delivery zones (WO-DELIVERY-D1) — opens the reusable map editor (draw circular
// zones: center + radius + fee + ETA + branch). Same component the Onboarding
// «التشغيل» step mounts. The pin→zone→branch ROUTING it feeds is gated behind
// delivery_geo_routing (default off); drawing zones here is always available.
// ---------------------------------------------------------------------------
function DeliveryZones() {
  const [open, setOpen] = useState(false);
  return (
    <section style={card}>
      <SectionHead icon={<MapPin size={16} />} title="التوصيل — مناطق التوصيل" tier="green" />
      <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7, margin: "0 0 14px" }}>
        ارسم مناطق التوصيل على الخريطة (مركز + نصف قطر) وحدد رسوم التوصيل ومدة التوصيل والفرع لكل منطقة.
      </p>
      <button
        onClick={() => setOpen(true)}
        style={{ height: 40, padding: "0 18px", borderRadius: 12, border: "1px solid var(--stroke)", background: "var(--gold, #e0b53a)", color: "#0b0f16", fontSize: 12.5, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}
      >
        <MapPin size={15} /> افتح محرر المناطق
      </button>
      <ZoneMapEditor open={open} onClose={() => setOpen(false)} />
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
  // Only the WhatsApp check is wired to a real rollup; the rest are SOON.
  const waTone: RowTone = rollup === "pass" ? "ready" : rollup === "fail" ? "action" : "pending";

  return (
    <section style={card}>
      <SectionHead icon={<Rocket size={16} />} title={t("set.gate.title")} tier="green" />
      <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.7, margin: "0 0 14px" }}>{t("set.gate.note")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <GateRow tone={waTone} label={t("set.gate.wa")} exp={t("set.gate.wa.exp")}>
          {rollup == null ? <TruthChip state="gather" />
            : rollup === "pass" ? <span style={{ ...pill, ...PROBE_TONE.pass }}><Check size={12} strokeWidth={3} /> {t("set.probe.pass")}</span>
            : rollup === "fail" ? <TruthChip state="degraded" />
            : <TruthChip state="gather" />}
        </GateRow>
        {/* Not wired — rendered SOON, never a fabricated «passed / 47 items / 25 zones».
            The allergy row carries the SAFETY tone (it is a safety gate), but its
            console surface is honestly SOON. */}
        <GateRow tone="safety" label={t("set.gate.allergy")} exp={t("set.gate.allergy.exp")}><TruthChip state="soon" /></GateRow>
        <GateRow tone="pending" label={t("set.gate.menu")} exp={t("set.gate.menu.exp")}><TruthChip state="soon" /></GateRow>
        <GateRow tone="pending" label={t("set.gate.zones")} exp={t("set.gate.zones.exp")}><TruthChip state="soon" /></GateRow>
      </div>
      {/* The safety line — verbatim. Red is a SAFETY use here (the allergy gate). */}
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 14, padding: "11px 13px", background: "rgba(255,107,94,.06)", border: "1px solid rgba(255,107,94,.28)", borderRadius: 12 }}>
        <AlertTriangle size={15} style={{ color: "#ffb3a8", flex: "none", marginTop: 1 }} />
        <p style={{ fontSize: 11.5, color: "#ffb3a8", lineHeight: 1.7, margin: 0, fontWeight: 700 }}>{t("set.gate.warn")}</p>
      </div>
    </section>
  );
}

type RowTone = "ready" | "action" | "pending" | "safety";
// Status-color discipline: green=ready · amber=needs-action · slate=pending ·
// red=safety-only (the allergy gate). Never a new palette.
const ROW_TONE: Record<RowTone, { fg: string; bg: string; icon: React.ReactNode }> = {
  ready: { fg: "#8ce8cc", bg: "rgba(46,204,154,.14)", icon: <Check size={13} strokeWidth={3} /> },
  action: { fg: "#ffcf8d", bg: "rgba(232,180,90,.16)", icon: <AlertTriangle size={13} strokeWidth={2.5} /> },
  pending: { fg: "var(--dim)", bg: "rgba(255,255,255,.06)", icon: <Clock size={13} strokeWidth={2.5} /> },
  safety: { fg: "#ffb3a8", bg: "rgba(255,107,94,.12)", icon: <Lock size={12} strokeWidth={2.6} /> },
};
function GateRow({ tone, label, exp, children }: { tone: RowTone; label: string; exp: string; children: React.ReactNode }) {
  const c = ROW_TONE[tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "10px 13px" }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, background: c.bg, color: c.fg, display: "grid", placeItems: "center", flex: "none" }}>{c.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--txt)" }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1, lineHeight: 1.5 }}>{exp}</div>
      </div>
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
const QZ_CONN_STATE: Record<QzStatus, TruthState> = { connected: "live", disconnected: "gather", error: "degraded" };
const QZ_CONN_LABEL: Record<QzStatus, DictKey> = {
  connected: "set.printer.conn.connected",
  disconnected: "set.printer.conn.notproven",
  error: "set.printer.conn.failed",
};

function QzPrinter({ qzFlagOn, onFlagChanged }: { qzFlagOn: boolean | null; onFlagChanged: () => Promise<void> }) {
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

  // Re-fetch whenever the qz_print flag changes (the manager flips it via this
  // card's own CapabilitySwitch) — the server route is the authority on
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
        <CapabilitySwitch flag="qz_print" on={qzFlagOn} label={t("set.printer.title")} onChanged={onFlagChanged} />
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

function PspCredentials({ pspFlagOn, onFlagChanged }: { pspFlagOn: boolean | null; onFlagChanged: () => Promise<void> }) {
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
        {enabled ? <TruthChip state={configured ? "live" : "gather"} label={t(configured ? "set.psp.configured" : "set.psp.notconfigured")} /> : null}
        <CapabilitySwitch flag="psp_payments" on={pspFlagOn} label={t("set.psp.title")} onChanged={onFlagChanged} />
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

// Section-header anatomy matching the kit: 30px gradient icon-badge (dark ink) +
// title + sub + optional right-aligned content. `tone` (amber, Emergency) picks
// the coral badge; otherwise the badge is the neutral glass gradient.
const SEC_GRAD: Record<Tier, string> = {
  gold: "var(--g-gold)", green: "var(--g-green)", blue: "var(--g-blue)", coral: "var(--g-coral)", violet: "var(--g-violet)",
};
function SectionHead({ icon, title, sub, tone, tier = "blue", children }: { icon: React.ReactNode; title: string; sub?: string; tone?: string; tier?: Tier; children?: React.ReactNode }) {
  const grad = tone ? SEC_GRAD.coral : SEC_GRAD[tier];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: grad, color: "var(--ink)", display: "grid", placeItems: "center", flex: "none" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--txt)", margin: 0 }}>{title}</h2>
        {sub && <p style={{ fontSize: 10, color: "var(--faint)", margin: "2px 0 0", lineHeight: 1.5, textTransform: "uppercase", letterSpacing: ".05em" }}>{sub}</p>}
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
  background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 18,
  backdropFilter: "blur(12px)", padding: "18px 20px",
};
const pill: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99,
  fontFamily: "var(--kvx-font-ui)", fontSize: 11, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap",
};
const probeRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, background: "var(--inset2)",
  border: "1px solid var(--stroke)", borderRadius: 12, padding: "9px 12px",
};
const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: 12, border: 0,
  background: "linear-gradient(135deg,#12b57e,#0E9F6E)", color: "#fff", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const amberBtn: React.CSSProperties = {
  height: 36, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(232,180,90,.5)",
  background: "rgba(232,180,90,.14)", color: "#ffcf8d", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 12,
  border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.05)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
// Retry CTA — makes an honest load-failed state actionable (re-runs the fetch).
const retryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: 999,
  border: "1px solid rgba(75,139,255,.4)", background: "rgba(75,139,255,.1)", color: "#a9d4ff", fontFamily: "var(--kvx-font-ar)",
  fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const input: React.CSSProperties = {
  height: 36, borderRadius: 12, border: "1px solid var(--stroke2)",
  background: "var(--inset2)", padding: "0 11px", fontSize: 13, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)",
};
