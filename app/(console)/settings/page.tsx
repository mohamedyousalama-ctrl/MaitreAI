"use client";

// ============================================================================
// Kivo — الربط والإعدادات (Settings). SPEC 06. Inside <ConsoleLayout>.
//
// The page's whole promise: "nothing shown as connected when it isn't." Every
// control is wired to its REAL route or labeled coming-soon — never fake.
//  • Karim on/off + status      ← /api/settings/ops (agent_mode)            LIVE
//  • WhatsApp connection         ← /api/settings/whatsapp (configured flag)  LIVE/honest-not-connected
//  • Tone/dialect                ← /api/onboarding/config/persona            LIVE (display)
//  • COD                         ← /api/settings/payment (cod_enabled)       LIVE; wallet/instapay/card COMING
//  • Menu source                 ← real published menu counts (store)        LIVE read-only
//  • Safety rules                = real shipped guarantees (display)
//  • Plan/tier                   = honest (no client read exposes tier — flagged)
//  • configure-by-chat           = COMING-SOON
//
// Honest gaps (flagged for review): WhatsApp last-in/out timestamps are NOT in
// the API → rendered «غير متاح». Escalation-timeout has no real field → stepper
// disabled + TODO. Tier isn't client-readable → no fabricated «Standard» badge.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, ShieldCheck, CreditCard, FileText, Sparkles, Bot } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useRiseIn, StatePill } from "@/components/kivo";

type Ops = { isOpen: boolean; assistantOn: boolean };
type Wa = { phoneNumberId: string; verifyToken: string; configured: boolean };
type Pay = { cod_enabled: boolean; vodafone_cash: { enabled: boolean; number: string } };
type Persona = { dialect: string; agentPersonaName: string | null };
type Health = { lastInboundAt: string | null; lastOutboundAt: string | null; lastFailedOutboundAt: string | null; lastFailedReason: string | null };

const DIALECT_AR: Record<string, string> = { saudi: "سعودي", egyptian: "مصري" };

// Q4 — recent-activity window: WhatsApp counts as "actively flowing" if there's an
// inbound or outbound within the last 24h. Used to gate the «بيستقبل ويرد فعلياً»
// claim so it can never contradict the WhatsApp-connection card.
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Honest relative time: «من ٣ دقائق» / «من ساعتين» / «من ٣ أيام»; null → «لا يوجد». */
function relAr(iso: string | null): string {
  if (!iso) return "لا يوجد";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "الآن";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `من ${toAr(m)} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `من ${toAr(h)} ساعة`;
  const d = Math.floor(h / 24);
  return `من ${toAr(d)} يوم`;
}

async function getJson<T>(url: string): Promise<{ ok: boolean; data: T | null }> {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return { ok: false, data: null };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, data: null };
  }
}

export default function SettingsPage() {
  const hydrated = useHasHydrated();
  const menuItems = useRestaurantStore((s) => s.menuItems);

  const [ops, setOps] = useState<{ loaded: boolean; ok: boolean; v: Ops | null }>({ loaded: false, ok: false, v: null });
  const [wa, setWa] = useState<{ loaded: boolean; ok: boolean; v: Wa | null }>({ loaded: false, ok: false, v: null });
  const [pay, setPay] = useState<{ loaded: boolean; ok: boolean; v: Pay | null }>({ loaded: false, ok: false, v: null });
  const [persona, setPersona] = useState<{ loaded: boolean; ok: boolean; v: Persona | null }>({ loaded: false, ok: false, v: null });
  const [health, setHealth] = useState<{ loaded: boolean; ok: boolean; v: Health | null }>({ loaded: false, ok: false, v: null });
  const [busy, setBusy] = useState(false);
  const [vcDraft, setVcDraft] = useState<{ enabled: boolean; number: string } | null>(null);
  const [vcSaving, setVcSaving] = useState(false);
  const [vcError, setVcError] = useState<string | null>(null);

  const rHead = useRiseIn(0); const rStrip = useRiseIn(1); const rWork = useRiseIn(2);

  useEffect(() => {
    let alive = true;
    getJson<Ops>("/api/settings/ops").then((r) => alive && setOps({ loaded: true, ok: r.ok, v: r.data }));
    getJson<Wa>("/api/settings/whatsapp").then((r) => alive && setWa({ loaded: true, ok: r.ok, v: r.data }));
    getJson<Pay>("/api/settings/payment").then((r) => {
      if (!alive) return;
      setPay({ loaded: true, ok: r.ok, v: r.data });
      if (r.ok && r.data?.vodafone_cash) {
        setVcDraft({ enabled: r.data.vodafone_cash.enabled, number: r.data.vodafone_cash.number ?? "" });
      }
    });
    getJson<Persona>("/api/onboarding/config/persona").then((r) => alive && setPersona({ loaded: true, ok: r.ok, v: r.data }));
    getJson<Health>("/api/settings/whatsapp-health").then((r) => alive && setHealth({ loaded: true, ok: r.ok, v: r.data }));
    return () => { alive = false; };
  }, []);

  const assistantOn = ops.v?.assistantOn ?? false;
  const waConnected = wa.ok && !!wa.v?.configured;
  // Q4 — real WhatsApp activity recency from the messages table. "Recent" = an
  // inbound or outbound within the last 24h. Gates the «بيستقبل ويرد فعلياً» claim.
  const lastActivityIso =
    [health.v?.lastInboundAt, health.v?.lastOutboundAt].filter(Boolean).sort().slice(-1)[0] ?? null;
  const recentActivity = !!lastActivityIso && Date.now() - new Date(lastActivityIso).getTime() < ACTIVITY_WINDOW_MS;
  const codEnabled = pay.v?.cod_enabled ?? false;
  const dialect = persona.v?.dialect ? (DIALECT_AR[persona.v.dialect] ?? persona.v.dialect) : null;

  const activeItems = hydrated ? menuItems.filter((m) => m.available).length : 0;
  const categories = hydrated ? new Set(menuItems.map((m) => m.category)).size : 0;
  const menuReady = hydrated && menuItems.length > 0;

  // setup alerts = real not-connected signals (no fabrication)
  const alerts = [!waConnected, ops.loaded && !ops.ok].filter(Boolean).length;

  // toggles → POST real routes; optimistic, reverts on failure
  async function toggleKarim() {
    if (!ops.ok || busy) return;
    const next = !assistantOn;
    setBusy(true);
    setOps((s) => ({ ...s, v: s.v ? { ...s.v, assistantOn: next } : s.v }));
    const r = await fetch("/api/settings/ops", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assistantOn: next }) });
    if (!r.ok) setOps((s) => ({ ...s, v: s.v ? { ...s.v, assistantOn: !next } : s.v }));
    setBusy(false);
  }
  async function saveVodafoneCash() {
    if (!vcDraft || vcSaving || !pay.ok) return;
    if (vcDraft.enabled && !vcDraft.number.trim()) {
      setVcError("أدخل رقم فودافون كاش قبل التفعيل");
      return;
    }
    setVcError(null);
    setVcSaving(true);
    const r = await fetch("/api/settings/payment", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vodafone_cash: { enabled: vcDraft.enabled, number: vcDraft.number.trim() } }),
    });
    if (!r.ok) {
      setVcError("حصل خطأ — حاول تاني");
    } else {
      const data = (await r.json()) as Pay;
      setPay((s) => ({ ...s, v: data }));
      setVcDraft({ enabled: data.vodafone_cash.enabled, number: data.vodafone_cash.number ?? "" });
    }
    setVcSaving(false);
  }

  async function toggleCod() {
    if (!pay.ok || busy) return;
    const next = !codEnabled;
    setBusy(true);
    setPay((s) => ({ ...s, v: s.v ? { ...s.v, cod_enabled: next } : s.v }));
    const r = await fetch("/api/settings/payment", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cod_enabled: next }) });
    if (!r.ok) setPay((s) => ({ ...s, v: s.v ? { ...s.v, cod_enabled: !next } : s.v }));
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* HEADER */}
      <header style={{ ...rHead.style }}>
        <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>حالات صادقة · مفيش مفاتيح وهمية</span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0" }}>الربط والإعدادات</h1>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0", maxWidth: 560, lineHeight: 1.6 }}>
          اربط كريم بأنظمتك وتحكّم فيه. كل إعداد هنا يا بيشتغل فعلاً يا واضح إنه لسه قريّب — مفيش حاجة بتتعرض كأنها متصلة وهي لأ.
        </p>
      </header>

      {/* STATUS STRIP */}
      <section style={{ ...rStrip.style, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {/* Q4 — reconcile with the WhatsApp card: never claim «بيستقبل ويرد فعلياً»
            unless WhatsApp is connected AND there's recent real WhatsApp activity. */}
        <StatTile dot={ops.ok ? (assistantOn ? "green" : "grey") : "grey"} label="حالة كريم" value={!ops.loaded ? "…" : !ops.ok ? "غير مهيّأ" : assistantOn ? "مباشر" : "متوقف"} sub={!ops.ok ? "محتاج ربط الباك" : !assistantOn ? "متوقف" : !waConnected ? "شغّال — لكن واتساب مش متصل" : recentActivity ? "بيستقبل ويرد فعلياً" : "شغّال — مفيش نشاط واتساب حديث"} valueColor={ops.ok && assistantOn ? "var(--kv-deep)" : undefined} />
        <StatTile dot={waConnected ? "green" : "grey"} label="واتساب" value={!wa.loaded ? "…" : waConnected ? "متصل" : "غير متصل"} sub={waConnected ? "القناة الوحيدة المتاحة دلوقتي" : "محتاج ربط"} />
        <StatTile dot={menuReady ? "green" : "grey"} label="المنيو المنشور" value={menuReady ? toAr(activeItems) : "—"} sub={menuReady ? `${toAr(activeItems)} صنف نشط · ${toAr(categories)} أقسام` : "لسه مفيش منيو"} />
        <StatTile dot={alerts === 0 ? "green" : "amber"} label="تنبيهات إعداد" value={toAr(alerts)} sub={alerts === 0 ? "كله متظبّط" : "محتاج إكمال ربط"} />
      </section>

      {/* WORKSPACE */}
      <section style={{ ...rWork.style, display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {/* WhatsApp */}
          <Card>
            <Row icon={<MessageCircle size={20} color="#0a8a5f" />} title="ربط واتساب الرسمي" sub={waConnected && wa.v?.phoneNumberId ? `معرّف الرقم: ${wa.v.phoneNumberId}` : "اربط رقم واتساب الرسمي عشان كريم يرد"}>
              {waConnected ? (
                <span style={{ height: 24, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.12)", color: "#0a8a5f", fontSize: 10, fontWeight: 800 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0E9F6E" }} />متصل
                </span>
              ) : (
                <Link href="/onboarding" style={{ height: 28, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10, background: "var(--kv-primary)", color: "#fff", fontSize: 10.5, fontWeight: 800, textDecoration: "none" }}>اربط واتساب</Link>
              )}
            </Row>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginTop: 14 }}>
              {/* Q4 — real health facts derived from messages (WhatsApp channel). */}
              <MiniStat title="آخر استقبال" value={!health.loaded ? "…" : relAr(health.v?.lastInboundAt ?? null)} />
              <MiniStat title="آخر إرسال" value={!health.loaded ? "…" : relAr(health.v?.lastOutboundAt ?? null)} />
              {health.loaded && health.v?.lastFailedOutboundAt && (
                <MiniStat title="آخر فشل إرسال" value={relAr(health.v.lastFailedOutboundAt)} valueColor="var(--kv-red)" />
              )}
              <MiniStat title="Webhook" value={waConnected && wa.v?.verifyToken ? "مهيّأ" : "—"} valueColor={waConnected ? "#0a8a5f" : undefined} />
            </div>
          </Card>

          {/* Agent control */}
          <Card>
            <Row icon={<Bot size={20} color="#0a8a5f" />} title="تحكّم كريم" sub="شغّل/أوقف الوكيل وحدّد سلوك التصعيد" />
            <ToggleRow title="كريم شغّال" sub={ops.ok ? "بيرد على العملاء على واتساب" : "محتاج ربط الباك عشان يتفعّل"} on={assistantOn} disabled={!ops.ok || busy} onToggle={toggleKarim} />
            {/* escalation timeout: no real field exists yet → disabled + TODO (don't fake) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #eef2f0" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>مهلة التصعيد للفريق</div>
                <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>لسه مفيش إعداد حقيقي للمهلة — هيتفعّل قريّب</div>
              </div>
              {/* TODO: wire to a real escalation-timeout field when it exists */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.45 }}>
                <Stepper sign="−" /><span style={{ fontSize: 13, fontWeight: 800, minWidth: 54, textAlign: "center" }}>—</span><Stepper sign="+" />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>لهجة كريم</div>
                <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>صوت الوكيل في المحادثة</div>
              </div>
              <span style={{ height: 32, display: "inline-flex", alignItems: "center", padding: "0 13px", borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)", fontSize: 11.5, fontWeight: 800, color: dialect ? "var(--kv-text)" : "var(--kv-faint)" }}>
                {persona.loaded ? (dialect ?? "غير محدّد") : "…"}
              </span>
            </div>
          </Card>

          {/* Menu source (read-only) */}
          <Card>
            <Row icon={<FileText size={19} color="#51637a" />} iconBg="linear-gradient(150deg,#e7edf3,#cfd9e4)" title="مصدر المنيو والمعرفة" sub="متسحوب من نظامك — كريم بيتبعه كمصدر حقيقة، مش بيعدّله">
              <span style={{ height: 24, display: "inline-flex", alignItems: "center", padding: "0 11px", borderRadius: 99, background: "rgba(100,116,139,.12)", color: "#51637a", fontSize: 10, fontWeight: 800 }}>قراءة فقط</span>
            </Row>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginTop: 14 }}>
              <MiniBig value={menuReady ? toAr(activeItems) : "—"} label="صنف نشط" />
              <MiniBig value={menuReady ? toAr(categories) : "—"} label="أقسام" />
              <MiniBig value={menuReady ? "محدّث" : "—"} label="الحالة" valueColor={menuReady ? "#0a8a5f" : undefined} />
            </div>
          </Card>

          {/* Payments */}
          <Card>
            <Row icon={<CreditCard size={19} color="#0a8a5f" />} title="طرق الدفع" sub="الدفع عند الاستلام شغّال · فودافون كاش متاح" />
            <ToggleRow title="الدفع عند الاستلام (COD)" on={codEnabled} disabled={!pay.ok || busy} onToggle={toggleCod} />
            {/* Vodafone Cash — functional */}
            <div style={{ padding: "11px 0", borderBottom: "1px solid #eef2f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>فودافون كاش</div>
                  <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>تحويل فوري على رقم محدد</div>
                </div>
                <button
                  type="button" role="switch" aria-checked={vcDraft?.enabled ?? false} aria-label="فودافون كاش"
                  disabled={!pay.ok || vcSaving}
                  onClick={() => setVcDraft((d) => d ? { ...d, enabled: !d.enabled } : d)}
                  style={{ width: 46, height: 26, borderRadius: 99, border: 0, padding: 0, position: "relative", flex: "none",
                    cursor: (!pay.ok || vcSaving) ? "default" : "pointer", opacity: (!pay.ok || vcSaving) ? 0.55 : 1,
                    background: vcDraft?.enabled ? "var(--kv-primary)" : "#cdd9d2", transition: "background .15s" }}>
                  <span style={{ position: "absolute", top: 3, insetInlineStart: vcDraft?.enabled ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 5px rgba(0,0,0,.2)", transition: "inset-inline-start .15s" }} />
                </button>
              </div>
              <div style={{ marginTop: 10 }}>
                <input
                  type="tel" dir="ltr" placeholder="رقم فودافون كاش (مثلاً 01007636312)"
                  value={vcDraft?.number ?? ""}
                  disabled={!pay.ok || vcSaving}
                  onChange={(e) => { setVcDraft((d) => d ? { ...d, number: e.target.value } : d); setVcError(null); }}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 9,
                    border: `1px solid ${vcError ? "#e53e3e" : "var(--kv-border)"}`,
                    background: "var(--kv-card-soft)", fontSize: 12.5, fontWeight: 700,
                    color: "var(--kv-text)", boxSizing: "border-box" as const }}
                />
                {vcError && <div style={{ fontSize: 10, color: "#e53e3e", fontWeight: 700, marginTop: 4 }}>{vcError}</div>}
                <button
                  type="button" onClick={saveVodafoneCash} disabled={!pay.ok || vcSaving}
                  style={{ marginTop: 8, height: 30, padding: "0 14px", borderRadius: 9, border: 0,
                    background: "var(--kv-primary)", color: "#fff", fontSize: 11.5, fontWeight: 800,
                    cursor: (!pay.ok || vcSaving) ? "default" : "pointer", opacity: (!pay.ok || vcSaving) ? 0.55 : 1 }}>
                  {vcSaving ? "جاري الحفظ…" : "حفظ"}
                </button>
              </div>
            </div>
            {/* Remaining coming-soon payment methods */}
            {(["إنستاباي", "كارت ائتمان"] as const).map((m, i) => (
              <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 1 ? "1px solid #eef2f0" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--kv-faint)" }}>{m}</span>
                  <StatePill state="coming" />
                </div>
                <span aria-disabled style={{ width: 46, height: 26, borderRadius: 99, background: "#e3e8eb", position: "relative", flex: "none" }}>
                  <span style={{ position: "absolute", insetInlineEnd: 3, top: 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 4px rgba(0,0,0,.12)" }} />
                </span>
              </div>
            ))}
          </Card>

          {/* configure by chat — COMING SOON */}
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1.5px dashed rgba(100,116,139,.35)", background: "repeating-linear-gradient(135deg,rgba(100,116,139,.035),rgba(100,116,139,.035) 12px,transparent 12px,transparent 24px),#fbfcfc", padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(100,116,139,.1)", color: "#6b7a88", display: "grid", placeItems: "center", flex: "none" }}><Sparkles size={22} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#51637a" }}>ظبّط كريم بالمحادثة</div>
                <StatePill state="coming" label="قريباً · على خريطة الطريق" />
              </div>
              <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, marginTop: 5, lineHeight: 1.55 }}>هتقدر تغيّر إعدادات كريم وتضيف معلومات بمحادثة عادية — والكلام ده بيتحوّل لبيانات تلقائياً.</div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {/* connection health — real per-row status */}
          <div style={{ borderRadius: 16, background: "var(--kv-grad-brand-deep)", color: "#fff", boxShadow: "0 20px 44px -30px rgba(10,138,95,.7)", padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="kv-pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>صحة الربط</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 14 }}>{waConnected && menuReady ? "سليم" : "محتاج إكمال"}</div>
            <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600, marginTop: 4, lineHeight: 1.55 }}>
              {waConnected && menuReady ? "كل القنوات والأنظمة المتصلة شغّالة، والوضع مباشر." : "في حاجة لسه محتاجة ربط — شوف التفاصيل تحت."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              <HealthRow label="واتساب" ok={waConnected} okText="متصل" badText="غير متصل" />
              <HealthRow label="مزامنة المنيو" ok={menuReady} okText="محدّثة" badText="لسه فاضية" />
              <HealthRow label="إيقاف الرد بعد التصعيد" ok okText="مفعّل" badText="" />
            </div>
          </div>

          {/* safety rules — real shipped guarantees (display) */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 13 }}>قواعد الأمان</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <SafetyRule title="مبيخترعش أسعار" body="الإجمالي من منيو Kivo المنشور وقواعد التسعير، مش من كلام النموذج." />
              <SafetyRule title="مبيأكّدش الدفع" body="الدفع عند الاستلام بيتحصّل وقت التسليم بس." />
              <SafetyRule title="بيسكت بعد التصعيد" body="لما يحوّل للفريق، مبيكمّلش رد لوحده." />
            </div>
          </Card>

          {/* plan/tier — tier isn't exposed via an existing client read → honest, no fake «Standard» */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>الباقة</div>
              <span style={{ height: 22, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 99, background: "rgba(100,116,139,.12)", color: "#51637a", fontSize: 10, fontWeight: 800 }}>باقتك</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, marginTop: 9, lineHeight: 1.6 }}>
              ذكاء المحادثة وذاكرة العميل متاحين. حلقة التعلّم وميزات Pro المتقدّمة لسه مقفولة لحد الترقية. (اسم الباقة بيتقري من الباك — لسه مش متاح كـ read.)
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

const AR = "٠١٢٣٤٥٦٧٨٩";
function toAr(n: number | string) { return String(n).replace(/[0-9]/g, (d) => AR[+d]); }

// ── atoms ──
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "0 16px 40px -34px rgba(16,60,44,.3)", padding: "18px 20px" }}>{children}</div>;
}
function Row({ icon, iconBg, title, sub, children }: { icon: React.ReactNode; iconBg?: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 13, background: iconBg ?? "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center", flex: "none" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}
function StatTile({ dot, label, value, sub, valueColor }: { dot: "green" | "grey" | "amber"; label: string; value: string; sub: string; valueColor?: string }) {
  const color = dot === "green" ? "#0E9F6E" : dot === "amber" ? "#D8972B" : "#aab6ae";
  return (
    <div style={{ borderRadius: 14, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span className={dot === "green" ? "kv-pulse" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8, color: valueColor }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 600, marginTop: 3 }}>{sub}</div>
    </div>
  );
}
function MiniStat({ title, value, valueColor }: { title: string; value: string; valueColor?: string }) {
  return (
    <div style={{ borderRadius: 11, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 9.5, color: valueColor ?? "var(--kv-faint)", fontWeight: valueColor ? 700 : 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function MiniBig({ value, label, valueColor }: { value: string; label: string; valueColor?: string }) {
  return (
    <div style={{ borderRadius: 11, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)", padding: "10px 12px" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: valueColor }}>{value}</div>
      <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Stepper({ sign }: { sign: string }) {
  return <span style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid var(--kv-border)", background: "var(--kv-card)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800, color: "var(--kv-muted)" }}>{sign}</span>;
}
function ToggleRow({ title, sub, on, disabled, onToggle }: { title: string; sub?: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #eef2f0" }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      </div>
      <button
        type="button" role="switch" aria-checked={on} aria-label={title} disabled={disabled} onClick={onToggle}
        style={{ width: 46, height: 26, borderRadius: 99, border: 0, padding: 0, position: "relative", flex: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, background: on ? "var(--kv-primary)" : "#cdd9d2", transition: "background .15s" }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 5px rgba(0,0,0,.2)", transition: "inset-inline-start .15s" }} />
      </button>
    </div>
  );
}
function HealthRow({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ opacity: 0.9 }}>{label}</span>
      <span>{ok ? `${okText} ✓` : badText}</span>
    </div>
  );
}
function SafetyRule({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
      <ShieldCheck size={16} color="#0a8a5f" style={{ marginTop: 1, flex: "none" }} />
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}
