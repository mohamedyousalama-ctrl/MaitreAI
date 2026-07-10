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
  ExternalLink, ShieldCheck, ShieldAlert, MessageCircle, RotateCw,
  AlertTriangle, MapPin, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { HeaderRow, TruthChip, type TruthState } from "@/components/console-v2/kit";
import ZoneMapEditor from "@/components/console-v2/delivery/ZoneMapEditor";
import { FbSdkLoader } from "@/components/console-v2/FbSdkLoader";
import { KivoMark } from "@/components/brand/KivoLogo";
import { useConsoleDataStore } from "@/lib/console-data-state";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import type { Probe, ProbeStatus } from "@/lib/messaging/whatsapp-health";
import AllergyCoverageMeter from "@/components/console-v2/AllergyCoverageMeter";

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

// Public Meta credentials for Embedded Signup — present ONLY once Mohamed has set
// up the Meta app deployment-side. App ID is public-ish; the App SECRET stays
// server-side (WHATSAPP_APP_SECRET) and is never read here. Either blank ⇒ the
// connect card degrades honestly to a SOON "not configured yet" state.
const META_APP_ID = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID || "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || "";

export default function OnboardingPage() {
  const t = useT();
  const [step, setStep] = useState(0);
  const cur = STEPS[step].key;

  return (
    <>
      <HeaderRow title={t("ob.title")} jobLine={t("ob.subtitle")} />

      {/* Design layout: 290px vertical stepper RAIL + 1fr STAGE (content unchanged). */}
      <div style={{ display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 16, alignItems: "start", paddingTop: 4 }}>
        {/* LEFT — the 290px stepper rail (brand + vertical steps + doctrine footer). */}
        <aside style={railPanel}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: "radial-gradient(circle at 32% 28%,#3fd39b,#0E9F6E 62%,#0a6e4c)", display: "grid", placeItems: "center", flex: "none", boxShadow: "0 6px 20px rgba(14,159,110,.5)" }}>
              <KivoMark size={22} tone="white" title="Kivo" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)" }}>Kivo</div>
              <div style={{ fontSize: 9, color: "var(--faint)", fontWeight: 600, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("ob.subtitle")}</div>
            </div>
          </div>

          <div style={{ fontSize: 9, letterSpacing: ".14em", fontWeight: 800, color: "var(--faint)", textTransform: "uppercase", margin: "22px 0 12px" }}>{t("ob.setup")}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const state: "done" | "on" | "todo" = i < step ? "done" : i === step ? "on" : "todo";
              return (
                <button key={s.key} type="button" onClick={() => setStep(i)} style={stepRow(state)}>
                  {/* connector to the previous dot — emerald once the step above is reached */}
                  {i > 0 && <span aria-hidden style={{ position: "absolute", top: -6, insetInlineStart: 24, width: 2, height: 12, borderRadius: 2, background: i <= step ? "var(--teal)" : "var(--stroke)" }} />}
                  <span style={stepDot(state)}>{state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                  <span style={{ minWidth: 0, textAlign: "start" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: state === "todo" ? "var(--dim)" : "var(--txt)" }}>
                      <Icon size={13} strokeWidth={2.2} />{t(s.labelKey)}
                    </span>
                    <span style={{ display: "block", fontSize: 9, color: "var(--faint)", marginTop: 2 }}>{t(s.subKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Doctrine footer — the safety line (no test, no live). */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--stroke)", fontSize: 9.5, color: "var(--faint)", lineHeight: 1.7 }}>{t("ob.railFoot")}</div>
        </aside>

        {/* RIGHT — the 1fr stage (progress bar + active step content + footer nav). */}
        <div style={stagePanel}>
          <div style={{ height: 3, background: "rgba(255,255,255,.07)" }}>
            <div style={{ height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`, background: "linear-gradient(90deg,#12b57e,#3fd39b)", transition: "width .4s cubic-bezier(.2,.9,.3,1)" }} />
          </div>

          <div style={{ padding: "24px 26px 6px" }}>
            {cur === "whatsapp" && <WhatsAppStep />}
            {cur === "testdrive" && <><TestDriveStep /><AllergyCoverageMeter /></>}
            {cur === "golive" && <GoLiveStep />}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 26px", borderTop: "1px solid var(--stroke)", marginTop: 10 }}>
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
      </div>
    </>
  );
}

const navBtn: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 800, borderRadius: 12, padding: "11px 22px", cursor: "pointer",
  fontFamily: "var(--kvx-font-ar)", border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.05)", color: "var(--dim)",
};
const navPrimary: React.CSSProperties = { border: 0, background: "linear-gradient(135deg,#12b57e,#0E9F6E)", color: "#fff" };

// 290px stepper rail + 1fr stage — the design's onboarding anatomy (12-onboarding.html).
const railPanel: React.CSSProperties = {
  display: "flex", flexDirection: "column", minHeight: 380,
  background: "rgba(10,14,20,.4)", border: "1px solid var(--stroke)", borderRadius: 18, padding: "20px 18px", backdropFilter: "blur(12px)",
};
const stagePanel: React.CSSProperties = {
  display: "flex", flexDirection: "column", overflow: "hidden",
  background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 18, backdropFilter: "blur(12px)",
};
function stepRow(state: "done" | "on" | "todo"): React.CSSProperties {
  return {
    position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 13,
    cursor: "pointer", textAlign: "start", fontFamily: "var(--kvx-font-ar)",
    border: state === "on" ? "1px solid rgba(14,159,110,.34)" : "1px solid transparent",
    background: state === "on" ? "rgba(14,159,110,.12)" : "transparent",
  };
}
function stepDot(state: "done" | "on" | "todo"): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center",
    fontSize: 11.5, fontWeight: 800, fontFamily: "var(--kvx-font-ui)",
    background: state === "todo" ? "rgba(255,255,255,.07)" : "linear-gradient(135deg,#3fd39b,#0E9F6E)",
    border: state === "todo" ? "1px solid var(--stroke)" : "1px solid transparent",
    color: state === "todo" ? "var(--dim)" : "#fff",
    boxShadow: state === "on" ? "0 4px 12px rgba(14,159,110,.5)" : "none",
  };
}

// ---------------------------------------------------------------------------
// Step 1 — WhatsApp truth board
// ---------------------------------------------------------------------------
function WhatsAppStep() {
  const t = useT();
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [rollup, setRollup] = useState<ProbeStatus | null>(null);
  const [err, setErr] = useState(false);

  // Extracted so the Embedded Signup card can re-pull the truth board after a
  // successful connect — the board (not the client) remains the source of truth.
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/whatsapp-health");
      const j = await res.json();
      if (!res.ok || !Array.isArray(j.probes)) { setErr(true); return; }
      setErr(false);
      setProbes(j.probes as Probe[]);
      setRollup((j.rollup as ProbeStatus) ?? null);
    } catch { setErr(true); }
  }, []);

  useEffect(() => { void loadHealth(); }, [loadHealth]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <StepHead kicker="ob.wa.kicker" h="ob.wa.h" sub="ob.wa.sub" />

      {/* Embedded Signup — the client-side connect action (Meta popup → backend). */}
      <EmbeddedSignupCard onConnected={loadHealth} />

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
// Embedded Signup card — the CLIENT-side piece. Loads Meta's SDK on this step
// only, runs FB.login() with the Embedded Signup config_id, captures the auth
// code + phone/waba ids, and POSTs them to the EXISTING backend route
// (/api/onboarding/embedded-signup). Honest per-widget truth:
//   connected → LIVE · failure/cancel → DEGRADED (amber, NOT red) + retry ·
//   unconfigured (env missing) → SOON "not configured yet" (never a broken popup).
// SDK-flow logic ported from feat/embedded-signup-frontend; the backend is the
// contract — body { restaurantId, code, phoneNumberId, wabaId }.
// ---------------------------------------------------------------------------
type SdkState = "loading" | "ready" | "error";
type ConnectUi = "idle" | "connecting" | "connected" | "error";

function EmbeddedSignupCard({ onConnected }: { onConnected?: () => void }) {
  const t = useT();
  const rid = useConsoleDataStore((s) => s.tenantId);
  const configured = !!(META_APP_ID && META_CONFIG_ID);

  const [sdkState, setSdkState] = useState<SdkState>(configured ? "loading" : "error");
  const [ui, setUi] = useState<ConnectUi>("idle");
  const [errKey, setErrKey] = useState<DictKey | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const handleSdkReady = useCallback(() => setSdkState("ready"), []);
  const handleSdkError = useCallback(() => setSdkState("error"), []);

  // Real Embedded Signup launch. The auth code comes from FB.login()'s
  // authResponse; the phone/waba ids arrive via Meta's postMessage BEFORE the
  // login callback resolves — so we register the message listener first.
  const connect = useCallback(async () => {
    if (!configured) return;
    if (!rid) { setUi("error"); setErrKey("ob.wa.es.noTenant"); return; }
    if (sdkState !== "ready" || !window.FB) { setUi("error"); setErrKey("ob.wa.es.sdkError"); return; }

    setUi("connecting");
    setErrKey(null);

    let phoneNumberId: string | null = null;
    let wabaId: string | null = null;

    // ⚠️  Meta sends WA_EMBEDDED_SIGNUP with { data: { phone_number_id, waba_id } }
    //     on FINISH. Verify this shape on first live test — Meta changes it silently.
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (payload.event === "FINISH") {
          phoneNumberId = payload.data?.phone_number_id ?? null;
          wabaId = payload.data?.waba_id ?? null;
        }
      } catch { /* non-JSON / unrelated message — ignore */ }
    };
    window.addEventListener("message", messageHandler);

    try {
      const auth = await new Promise<{ authResponse?: { code?: string } | null }>((resolve) =>
        window.FB!.login(resolve, {
          config_id: META_CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          scope: "whatsapp_business_management,whatsapp_business_messaging",
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: "3", // ⚠️  verify this value is current against Meta docs
          },
        }),
      );
      window.removeEventListener("message", messageHandler);

      const code = auth?.authResponse?.code;
      if (!code) { setUi("error"); setErrKey("ob.wa.es.cancelled"); return; }
      if (!phoneNumberId || !wabaId) { setUi("error"); setErrKey("ob.wa.es.noPhone"); return; }

      const res = await fetch("/api/onboarding/embedded-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ restaurantId: rid, code, phoneNumberId, wabaId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.configured) { setUi("error"); setErrKey("ob.wa.es.failed"); return; }

      setUi("connected");
      onConnected?.();
    } catch {
      window.removeEventListener("message", messageHandler);
      setUi("error");
      setErrKey("ob.wa.es.failed");
    }
  }, [configured, rid, sdkState, onConnected]);

  const retry = useCallback(() => {
    setErrKey(null);
    setUi("idle");
    if (sdkState === "error") { setSdkState("loading"); setReloadNonce((n) => n + 1); }
  }, [sdkState]);

  // ── Unconfigured: honest SOON degrade — no broken popup. ──
  if (!configured) {
    return (
      <div style={esCard}>
        <div style={esIconWrap}><MessageCircle size={20} style={{ color: "#8ce8cc" }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={esRow}>
            <span style={esTitle}>{t("ob.wa.es.soonH")}</span>
            <TruthChip state="soon" />
          </div>
          <div style={esSub}>{t("ob.wa.es.soonB")}</div>
        </div>
      </div>
    );
  }

  const sdkLoading = sdkState === "loading";
  const connecting = ui === "connecting";
  const busy = connecting || sdkLoading;

  return (
    <div style={esCard}>
      {/* Load Meta's SDK on THIS step only (never global). Keyed so retry remounts. */}
      <FbSdkLoader key={reloadNonce} appId={META_APP_ID} onReady={handleSdkReady} onError={handleSdkError} />

      <div style={esIconWrap}>
        {ui === "connected"
          ? <Check size={20} strokeWidth={3} style={{ color: "#8ce8cc" }} />
          : <MessageCircle size={20} style={{ color: "#8ce8cc" }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={esRow}>
          <span style={esTitle}>{ui === "connected" ? t("ob.wa.es.connectedH") : t("ob.wa.es.title")}</span>
          {ui === "connected" && <TruthChip state="live" />}
          {ui === "error" && <TruthChip state="degraded" />}
        </div>
        <div style={esSub}>{ui === "connected" ? t("ob.wa.es.connectedB") : t("ob.wa.es.sub")}</div>

        {/* Honest amber error line (never red) + retry. */}
        {ui === "error" && errKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "#e8b45a" }}>
            <AlertTriangle size={14} /> {t(errKey)}
          </div>
        )}

        {ui !== "connected" && (
          <button
            type="button"
            onClick={() => (ui === "error" ? retry() : void connect())}
            disabled={busy}
            style={{
              ...navBtn, ...navPrimary, marginTop: 12, opacity: busy ? 0.6 : 1,
              cursor: busy ? "not-allowed" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {busy && <Loader2 size={14} className="kv-spin" />}
            {ui === "error"
              ? (<><RotateCw size={14} /> {t("ob.wa.es.retry")}</>)
              : connecting ? t("ob.wa.es.connecting")
              : sdkLoading ? t("ob.wa.es.loadingSdk")
              : t("ob.wa.es.connect")}
          </button>
        )}
      </div>
    </div>
  );
}

const esCard: React.CSSProperties = {
  display: "flex", gap: 13, padding: "16px 18px", borderRadius: 15,
  background: "rgba(14,159,110,.08)", border: "1px solid rgba(14,159,110,.3)",
};
const esIconWrap: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 12, flex: "none", display: "grid", placeItems: "center",
  background: "rgba(14,159,110,.15)", border: "1px solid rgba(14,159,110,.3)",
};
const esRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const esTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--txt)" };
const esSub: React.CSSProperties = { fontSize: 11.5, color: "var(--dim)", lineHeight: 1.6, marginTop: 4 };

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
  // WO-DELIVERY-D1 — the delivery-zone map editor, mounted in the التشغيل step.
  const [zoneOpen, setZoneOpen] = useState(false);

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

      {/* WO-DELIVERY-D1 — draw delivery zones on the map (same reusable editor as
          Settings→التوصيل). Optional here; routing behind delivery_geo_routing. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 12, background: "var(--inset2)", border: "1px solid var(--stroke)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(224,181,58,.16)", color: "var(--gold, #e0b53a)", display: "grid", placeItems: "center", flex: "none" }}><MapPin size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--txt)" }}>مناطق التوصيل على الخريطة</div>
            <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1 }}>ارسم كل منطقة (مركز + نصف قطر) وحدد رسومها ومدتها وفرعها.</div>
          </div>
        </div>
        <button onClick={() => setZoneOpen(true)} style={{ height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: "var(--gold, #e0b53a)", color: "#0b0f16", fontSize: 12, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", flex: "none" }}>افتح المحرر</button>
      </div>
      <ZoneMapEditor open={zoneOpen} onClose={() => setZoneOpen(false)} />

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
