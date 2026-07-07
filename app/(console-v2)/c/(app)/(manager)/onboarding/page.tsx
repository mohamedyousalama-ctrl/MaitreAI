"use client";

// ============================================================================
// console_v2 item 15 — Onboarding / go-live cockpit (v35 dark-glass rebuild).
// "Nothing goes live until every truth is proven."
//
// SCOPE RULING (Mohamed, kept): in console_v2 the tenant is ALREADY provisioned
// (the flag was turned on for it), so this is NOT the design's 7-step first-run
// wizard — it is the GO-LIVE readiness COCKPIT (superior in scope). We adopt the
// design's dark-glass VISUAL anatomy (stepper, truth-board tgrid, phone-frame
// test drive, red allergy gate-row) WITHOUT rebuilding the provisioning steps
// (identity/menu/zones/payments) — those already live in Settings + Knowledge.
//
// Three steps, each backed by a REAL endpoint, no parallel truth — all logic
// UNCHANGED from the shipped page:
//  1. WhatsApp truth board — GET /api/settings/whatsapp-health. 8 independent
//     probes (pass/fail/unknown); "configured" alone is never called connected.
//     A failed probe is amber/degraded (a non-safety alert), never red.
//  2. Test drive — POST /api/console/onboarding/test-drive → the REAL Brain via
//     runCustomerTurn on the tenant's real menu. Nothing is sent to a customer.
//     The deterministic allergen gate runs here exactly as in production, so the
//     manager SEES safety hold. Safety is structural — NOT a go-live checkbox.
//  3. Go live — the GATE MIRROR. GET/POST /api/onboarding/go-live. The checklist
//     is the server's checklist verbatim; the button POSTs and the SERVER
//     re-checks — a 422 re-renders the exact blocking items. No client claim trusted.
//
// RED = safety only (the allergen-gate-held banner). Non-safety pending/fail use
// amber/slate. XSS: dictionary text nodes + <Bdi> only; no dangerouslySetInnerHTML.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Radio, FlaskConical, Rocket, Check, ArrowRight, Send, Loader2,
  ExternalLink, ShieldCheck, ShieldAlert, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { HeaderRow, TruthChip, type TruthState } from "@/components/console-v2/kit";
import { useConsoleDataStore } from "@/lib/console-data-state";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { Probe, ProbeStatus } from "@/lib/messaging/whatsapp-health";

// ---- step model ------------------------------------------------------------
type StepKey = "whatsapp" | "testdrive" | "golive";
const STEPS: { key: StepKey; icon: LucideIcon; labelKey: DictKey; subKey: DictKey }[] = [
  { key: "whatsapp", icon: Radio, labelKey: "ob.step.whatsapp", subKey: "ob.step.whatsapp.sub" },
  { key: "testdrive", icon: FlaskConical, labelKey: "ob.step.testdrive", subKey: "ob.step.testdrive.sub" },
  { key: "golive", icon: Rocket, labelKey: "ob.step.golive", subKey: "ob.step.golive.sub" },
];

const PROBE_LABEL: Record<string, DictKey> = {
  access_token: "ob.wa.access_token", phone_number_id: "ob.wa.phone_number_id",
  verify_token: "ob.wa.verify_token", app_secret: "ob.wa.app_secret",
  inbound_webhook: "ob.wa.inbound_webhook", outbound_delivery: "ob.wa.outbound_delivery",
  recent_send_failure: "ob.wa.recent_send_failure", agent_replies_enabled: "ob.wa.agent_replies_enabled",
};
// pass → live (emerald) · fail → degraded (amber, NOT red) · unknown → gather
const PROBE_TRUTH: Record<ProbeStatus, TruthState> = { pass: "live", fail: "degraded", unknown: "gather" };

export default function OnboardingPage() {
  const t = useT();
  const [step, setStep] = useState(0);
  const cur = STEPS[step].key;

  return (
    <>
      <HeaderRow title={t("ob.title")} jobLine={t("ob.subtitle")} />

      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
        {/* Stepper — dark-glass dots + connectors */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state: "done" | "on" | "todo" = i < step ? "done" : i === step ? "on" : "todo";
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                style={{
                  flex: "1 1 220px", display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                  borderRadius: 14, cursor: "pointer", textAlign: "start", fontFamily: "var(--kvx-font-ar)",
                  border: `1px solid ${state === "on" ? "rgba(14,159,110,.4)" : "var(--stroke)"}`,
                  background: state === "on" ? "rgba(14,159,110,.12)" : "var(--inset)",
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center",
                  fontSize: 12, fontWeight: 800, fontFamily: "var(--kvx-font-ui)",
                  background: state === "todo" ? "rgba(255,255,255,.07)" : "var(--g-green)",
                  color: state === "todo" ? "var(--faint)" : "var(--ink)",
                }}>
                  {state === "done" ? <Check size={15} strokeWidth={3} /> : i + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--txt)" }}>
                    <Icon size={14} strokeWidth={2.2} />{t(s.labelKey)}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>{t(s.subKey)}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Step body */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 18, padding: "22px 24px", backdropFilter: "blur(12px)" }}>
          {cur === "whatsapp" && <WhatsAppStep />}
          {cur === "testdrive" && <TestDriveStep />}
          {cur === "golive" && <GoLiveStep />}
        </div>

        {/* Footer nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ ...navBtn, visibility: step === 0 ? "hidden" : "visible" }}
          >
            {t("ob.back")}
          </button>
          <span style={{ marginInline: "auto", fontSize: 11, color: "var(--faint)", fontWeight: 700 }}>
            {t("ob.stepOf")} {step + 1} {t("ob.of")} {STEPS.length}
          </span>
          {step < STEPS.length - 1 && (
            <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} style={{ ...navBtn, ...navPrimary }}>
              {t("ob.next")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const navBtn: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 800, borderRadius: 12, padding: "11px 22px", cursor: "pointer",
  fontFamily: "var(--kvx-font-ar)", border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.05)", color: "var(--dim)",
};
const navPrimary: React.CSSProperties = { border: 0, background: "linear-gradient(135deg,#12b57e,#0E9F6E)", color: "#fff" };

// ---------------------------------------------------------------------------
// Step 1 — WhatsApp truth board
// ---------------------------------------------------------------------------
function WhatsAppStep() {
  const t = useT();
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [rollup, setRollup] = useState<ProbeStatus | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/whatsapp-health");
        const j = await res.json();
        if (dead) return;
        if (!res.ok || !Array.isArray(j.probes)) { setErr(true); return; }
        setProbes(j.probes as Probe[]);
        setRollup((j.rollup as ProbeStatus) ?? null);
      } catch { if (!dead) setErr(true); }
    })();
    return () => { dead = true; };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StepHead kicker="ob.wa.kicker" h="ob.wa.h" sub="ob.wa.sub" />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)" }}>{t("ob.wa.board")}</div>
        <div style={{ fontSize: 11, color: "var(--faint)" }}>{t("ob.wa.boardSub")}</div>
        <div style={{ marginInlineStart: "auto" }}>
          {rollup && <TruthChip state={PROBE_TRUTH[rollup]} label={`${probes?.filter((p) => p.status === "pass").length ?? 0}/8`} />}
        </div>
      </div>

      {err ? (
        <div style={{ fontSize: 12.5, color: "var(--dim)", padding: "12px 0" }}>{t("ob.wa.failed")}</div>
      ) : !probes ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--dim)", padding: "12px 0" }}>
          <Loader2 size={15} className="kv-spin" /> {t("ob.wa.loading")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
          {probes.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--txt)", flex: 1, minWidth: 0 }}>
                {t(PROBE_LABEL[p.id] ?? "ob.wa.board")}
              </span>
              {p.status === "pass"
                ? <TruthChip state="live" />
                : <TruthChip state={PROBE_TRUTH[p.status]} label={p.status === "fail" ? undefined : t("ob.wa.pending")} />}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t("ob.wa.note")}</div>
      <Link href="/c/settings" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "var(--teal)", textDecoration: "none" }}>
        <ExternalLink size={14} /> {t("ob.wa.connect")}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Test drive (the real agent, sandboxed) — phone-frame anatomy
// ---------------------------------------------------------------------------
interface Turn { role: "user" | "assistant"; content: string; held?: boolean; escalated?: boolean }
const ALLERGY_PROBE = "عندي حساسية من المكسرات، أنهي صنف آمن؟";

function TestDriveStep() {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [turns, busy]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setErr(false);
    const history = turns.map((tn) => ({ role: tn.role, content: tn.content }));
    setTurns((p) => [...p, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/console/onboarding/test-drive", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, history }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) { setErr(true); setBusy(false); return; }
      setTurns((p) => [...p, { role: "assistant", content: String(j.reply ?? ""), held: !!j.allergenGate, escalated: !!j.escalate }]);
    } catch { setErr(true); }
    finally { setBusy(false); }
  }, [turns, busy]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StepHead kicker="ob.td.kicker" h="ob.td.h" sub="ob.td.sub" />

      {/* Safety-is-always-on banner (structural truth, not a gate item) */}
      <div style={{ display: "flex", gap: 11, padding: "12px 14px", background: "rgba(14,159,110,.1)", border: "1px solid rgba(14,159,110,.4)", borderRadius: 13 }}>
        <ShieldCheck size={18} style={{ color: "#5fe0b0", flex: "none", marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#8ce8cc" }}>{t("ob.td.safetyH")}</div>
          <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6, marginTop: 3 }}>{t("ob.td.safetyB")}</div>
        </div>
      </div>

      {/* Transcript — WhatsApp phone-frame tint */}
      <div ref={scrollRef} className="kv-scroll" style={{ minHeight: 200, maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", background: "#0b141a", border: "1px solid rgba(37,211,102,.22)", borderRadius: 16 }}>
        {turns.length === 0 && !busy && (
          <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center", padding: "40px 20px" }}>{t("ob.td.empty")}</div>
        )}
        {turns.map((tn, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: tn.role === "user" ? "flex-start" : "flex-end" }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)" }}>{tn.role === "user" ? t("ob.td.you") : t("ob.td.karim")}</span>
            <div style={{
              maxWidth: "84%", padding: "9px 13px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.65, whiteSpace: "pre-wrap",
              background: tn.role === "user" ? "rgba(255,255,255,.07)" : "linear-gradient(135deg,rgba(14,159,110,.5),rgba(10,110,76,.5))",
              border: `1px solid ${tn.role === "user" ? "var(--stroke)" : "rgba(14,159,110,.5)"}`,
              color: "var(--txt)",
            }}>
              {tn.content}
            </div>
            {/* RED banner ONLY here — safety context (the allergy gate held) */}
            {tn.held && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, fontWeight: 700, color: "#ffb3a8", background: "rgba(255,107,94,.1)", border: "1px solid var(--red)", borderRadius: 9, padding: "5px 10px" }}>
                <ShieldAlert size={13} /> {t("ob.td.gateHeld")}
              </div>
            )}
            {tn.escalated && !tn.held && (
              <div style={{ fontSize: 10, color: "var(--faint)" }}>{t("ob.td.escalated")}</div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--dim)" }}>
            <Loader2 size={13} className="kv-spin" /> {t("ob.td.thinking")}
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: 11.5, color: "#ffb3a8" }}>{t("ob.td.error")}</div>}

      {/* Composer */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(input); } }}
          placeholder={t("ob.td.placeholder")}
          disabled={busy}
          style={{ flex: 1, background: "var(--inset2)", border: "1px solid var(--stroke2)", borderRadius: 12, padding: "11px 14px", fontSize: 13, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none" }}
        />
        <button type="button" onClick={() => void send(input)} disabled={busy || !input.trim()} style={{ ...navBtn, ...navPrimary, opacity: busy || !input.trim() ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Send size={14} /> {t("ob.td.send")}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void send(ALLERGY_PROBE)} disabled={busy} style={{ ...navBtn, display: "inline-flex", alignItems: "center", gap: 7, color: "#ffb3a8", borderColor: "var(--red)" }}>
          <ShieldAlert size={14} /> {t("ob.td.safetyRun")}
        </button>
        <span style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, flex: 1, minWidth: 160 }}>{t("ob.td.note")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Go live (the gate mirror)
// ---------------------------------------------------------------------------
interface ChecklistItem { pass: boolean; required: boolean; label: string }
interface Checklist { whatsapp: ChecklistItem; menu: ChecklistItem; hours: ChecklistItem; zones: ChecklistItem }
const GATE_ROWS: { key: keyof Checklist; labelKey: DictKey; fixHref: string }[] = [
  { key: "whatsapp", labelKey: "ob.gl.item.whatsapp", fixHref: "/c/settings" },
  { key: "menu", labelKey: "ob.gl.item.menu", fixHref: "/c/knowledge" },
  { key: "hours", labelKey: "ob.gl.item.hours", fixHref: "/c/settings" },
  { key: "zones", labelKey: "ob.gl.item.zones", fixHref: "/c/settings" },
];

function GoLiveStep() {
  const t = useT();
  const rid = useConsoleDataStore((s) => s.tenantId);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    if (!rid) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/go-live?restaurantId=${encodeURIComponent(rid)}`);
      const j = await res.json();
      if (res.ok) { setChecklist(j.checklist); setReady(!!j.ready); setLive(!!j.alreadyLive); }
      else setErr(true);
    } catch { setErr(true); }
    finally { setLoading(false); }
  }, [rid]);

  useEffect(() => { void load(); }, [load]);

  const goLive = useCallback(async () => {
    if (!rid || busy) return;
    setBusy(true); setErr(false);
    try {
      const res = await fetch("/api/onboarding/go-live", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantId: rid }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setLive(true); if (j.checklist) setChecklist(j.checklist); setReady(true); }
      else if (res.status === 422 && j.checklist) { setChecklist(j.checklist); setReady(false); } // server re-check said not ready
      else setErr(true);
    } catch { setErr(true); }
    finally { setBusy(false); }
  }, [rid, busy]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StepHead kicker="ob.gl.kicker" h="ob.gl.h" sub="ob.gl.sub" />

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--dim)", padding: "12px 0" }}>
          <Loader2 size={15} className="kv-spin" /> {t("ob.gl.loading")}
        </div>
      ) : live ? (
        <div style={{ display: "flex", gap: 12, padding: "16px 18px", background: "rgba(14,159,110,.1)", border: "1px solid rgba(14,159,110,.4)", borderRadius: 14 }}>
          <Rocket size={22} style={{ color: "#5fe0b0", flex: "none" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#8ce8cc" }}>{t("ob.gl.liveH")}</div>
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3 }}>{t("ob.gl.liveB")}</div>
          </div>
        </div>
      ) : checklist ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {GATE_ROWS.map((row) => {
              const item = checklist[row.key];
              return (
                <div key={row.key} style={{
                  display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 12,
                  background: "var(--inset2)", border: "1px solid var(--stroke)",
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center",
                    background: item.pass ? "var(--g-green)" : "rgba(255,255,255,.08)", color: item.pass ? "var(--ink)" : "var(--faint)",
                  }}>
                    {item.pass ? <Check size={13} strokeWidth={3} /> : <ArrowRight size={12} />}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)" }}>{t(row.labelKey)}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", padding: "2px 8px", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 7 }}>
                    {item.required ? t("ob.gl.required") : t("ob.gl.advisory")}
                  </span>
                  <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <TruthChip state={item.pass ? "live" : item.required ? "gather" : "soon"} label={item.pass ? t("ob.gl.proven") : t("ob.gl.pending")} />
                    {!item.pass && (
                      <Link href={row.fixHref} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--teal)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {t("ob.gl.fix")} <ExternalLink size={12} />
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6, padding: "11px 13px", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 12 }}>
            {t("ob.gl.warn")}
          </div>
          <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>{t("ob.gl.safetyNote")}</div>

          <button
            type="button"
            onClick={() => void goLive()}
            disabled={!ready || busy}
            style={{
              width: "100%", padding: "14px", borderRadius: 13, fontSize: 13.5, fontWeight: 800, cursor: ready && !busy ? "pointer" : "not-allowed",
              border: 0, fontFamily: "var(--kvx-font-ar)", color: "#fff",
              background: ready ? "linear-gradient(135deg,#12b57e,#0E9F6E)" : "rgba(255,255,255,.12)", opacity: busy ? 0.6 : 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {busy && <Loader2 size={15} className="kv-spin" />}
            {ready ? t("ob.gl.ready") : t("ob.gl.blocked")}
          </button>
          {err && <div style={{ fontSize: 11.5, color: "#ffb3a8" }}>{t("ob.gl.error")}</div>}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--dim)", padding: "12px 0" }}>{err ? t("ob.gl.error") : t("ob.gl.loading")}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function StepHead({ kicker, h, sub }: { kicker: DictKey; h: DictKey; sub: DictKey }) {
  const t = useT();
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: ".12em", fontWeight: 800, color: "#5fe0b0", textTransform: "uppercase" }}>{t(kicker)}</div>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: "var(--txt)", margin: "8px 0 6px" }}>{t(h)}</h2>
      <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6, maxWidth: 620 }}>{t(sub)}</div>
    </div>
  );
}
