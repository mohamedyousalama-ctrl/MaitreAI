"use client";

// ============================================================================
// Kivo — معالج الإعداد (Onboarding Wizard). SPEC 07. Replaces the placeholder
// stub. 5 functional steps, each driving its REAL existing onboarding endpoint.
// No Kivo mockup existed — built from the Kivo design system (emerald, RTL, IBM
// Plex Sans Arabic, cards/pills/StatePill) and the patterns of the 6 console pages.
//
// TRUTH-SYSTEM: a step shows "complete" ONLY when its real API succeeded — never
// optimistic. WhatsApp shows an honest "not available yet" + skip when Meta isn't
// configured deployment-side (never fake success). Go-live reflects the server's
// real checklist + 422 gate — the UI never claims "live" unless POST returned
// activated. Errors are Arabic-friendly.
//
// Scope: wizard front-end + calls to EXISTING onboarding APIs only.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowLeft, Plus, Trash2, MessageCircle, PartyPopper } from "lucide-react";
import { StatePill } from "@/components/kivo";
import { sanitizeDecimalInput, toArabicDigits as toAr } from "@/lib/util/arabic-digits";

// Public Meta app id — only present once the deployment-level Meta integration is
// configured. Absent ⇒ WhatsApp Embedded Signup isn't available yet (honest gate).
const META_APP_ID = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID || "";

type Dialect = "egyptian" | "saudi";
const DIALECTS: { v: Dialect; label: string }[] = [
  { v: "egyptian", label: "مصري" },
  { v: "saudi", label: "سعودي" },
];
const TZ_FOR: Record<Dialect, { timezone: string; currency: string; country: string }> = {
  egyptian: { timezone: "Africa/Cairo", currency: "ج.م", country: "EG" },
  saudi: { timezone: "Asia/Riyadh", currency: "ر.س", country: "SA" },
};

const STEPS = ["الأساسيات", "واتساب", "المنيو", "الإعدادات", "التشغيل"];

async function api(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const r = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    try { data = await r.json(); } catch { /* no body */ }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// Arabic-friendly error from a failed response.
function errMsg(status: number, data: any): string {
  if (status === 0) return "في مشكلة في الاتصال، جرّب تاني.";
  if (status === 503 || data?.error === "not_configured") return "الخدمة مش متاحة دلوقتي (وضع تجريبي / الباك مش متظبّط).";
  if (status === 401) return "محتاج تسجيل دخول الأول.";
  if (status === 403) return "محتاج صلاحية مدير للخطوة دي.";
  if (status === 422 && Array.isArray(data?.errors)) return `راجع البيانات: ${data.errors.slice(0, 2).join(" · ")}`;
  if (data?.detail) return String(data.detail);
  return "معرفناش نكمّل، جرّب تاني.";
}

const RID_KEY = "kv-onboard-rid";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [dialect, setDialect] = useState<Dialect>("egyptian");
  // real completion flags — set ONLY on real API success
  const [done, setDone] = useState({ basics: false, menu: false, hours: false });
  const [waState, setWaState] = useState<"connected" | "skipped" | "unavailable" | null>(null);

  useEffect(() => {
    const rid = typeof window !== "undefined" ? localStorage.getItem(RID_KEY) : null;
    if (rid) { setRestaurantId(rid); setDone((d) => ({ ...d, basics: true })); }
  }, []);

  const saveRid = useCallback((rid: string) => {
    setRestaurantId(rid);
    try { localStorage.setItem(RID_KEY, rid); } catch { /* ignore */ }
  }, []);

  return (
    <main
      className="kv-console kv-scroll"
      dir="rtl"
      lang="ar"
      style={{ minHeight: "100vh", padding: "40px 24px 70px", display: "flex", justifyContent: "center", background: "var(--kv-bg-login)" }}
    >
      <div style={{ width: 860, maxWidth: "100%" }}>
        {/* brand + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--kv-grad-brand)", display: "grid", placeItems: "center", flex: "none", boxShadow: "0 14px 26px -14px rgba(10,138,95,.8)" }}>
            <svg width="24" height="19" viewBox="0 0 80 64" fill="none"><path d="M12 34 L27 50 L52 14" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /><path d="M50 12 H68" stroke="#fff" strokeWidth="7" strokeLinecap="round" /><path d="M55 21 H70" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".6" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>إعداد Kivo</div>
            <div style={{ fontSize: 12, color: "var(--kv-muted)", fontWeight: 600, marginTop: 2 }}>٥ خطوات وكريم يبقى شغّال على مطعمك.</div>
          </div>
        </div>

        {/* stepper — completion is real */}
        <Stepper step={step} done={done} waState={waState} />

        {/* card */}
        <div style={{ marginTop: 18, borderRadius: 20, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-card)", padding: "26px 28px" }}>
          {step === 1 && <StepBasics dialect={dialect} setDialect={setDialect} restaurantId={restaurantId} onDone={(rid) => { saveRid(rid); setDone((d) => ({ ...d, basics: true })); setStep(2); }} />}
          {step === 2 && <StepWhatsApp restaurantId={restaurantId} waState={waState} onConnected={() => { setWaState("connected"); setStep(3); }} onSkip={() => { setWaState("skipped"); setStep(3); }} onUnavailable={() => setWaState("unavailable")} />}
          {step === 3 && <StepMenu restaurantId={restaurantId} onDone={() => { setDone((d) => ({ ...d, menu: true })); setStep(4); }} />}
          {step === 4 && <StepConfig restaurantId={restaurantId} dialect={dialect} hoursDone={done.hours} onHours={() => setDone((d) => ({ ...d, hours: true }))} onNext={() => setStep(5)} />}
          {step === 5 && <StepGoLive restaurantId={restaurantId} goToStep={setStep} />}
        </div>

        {/* nav */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} style={{ height: 38, padding: "0 16px", borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: step === 1 ? "default" : "pointer", opacity: step === 1 ? 0.5 : 1 }}>السابق</button>
          <span style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 700, alignSelf: "center" }}>خطوة {toAr(step)} من {toAr(5)}</span>
        </div>
      </div>
    </main>
  );
}

function Stepper({ step, done, waState }: { step: number; done: { basics: boolean; menu: boolean; hours: boolean }; waState: string | null }) {
  const complete = [done.basics, waState === "connected", done.menu, done.hours, false];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const isDone = complete[i];
        const isCurrent = step === n;
        const color = isDone ? "var(--kv-primary)" : isCurrent ? "var(--kv-deep)" : "var(--kv-faint)";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, color: isDone || isCurrent ? "#fff" : "var(--kv-faint)", background: isDone ? "var(--kv-primary)" : isCurrent ? "var(--kv-deep)" : "transparent", border: isDone || isCurrent ? "0" : "1.5px solid #d8e0db" }}>
                {isDone ? <Check size={14} strokeWidth={3} /> : toAr(n)}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color, whiteSpace: "nowrap" }}>{label}{i === 1 && waState === "skipped" ? " (متخطّاة)" : ""}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: 99, background: isDone ? "var(--kv-primary)" : "var(--kv-border)" }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── shared atoms ──
function H({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12, color: "var(--kv-muted)", fontWeight: 600, margin: "5px 0 0", lineHeight: 1.6 }}>{sub}</p>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "var(--kv-muted)", marginBottom: 6 }}>{children}</label>;
}
const inputStyle: React.CSSProperties = { width: "100%", height: 44, border: "1px solid #e2eae6", borderRadius: 12, background: "#f7faf9", padding: "0 13px", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "var(--kv-text)", outline: "none" };
function PrimaryBtn({ children, onClick, loading, disabled }: { children: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  const off = loading || disabled;
  return (
    <button onClick={onClick} disabled={off} style={{ height: 46, padding: "0 22px", border: 0, borderRadius: 12, background: off ? "#cdd9d2" : "var(--kv-grad-brand)", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: off ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: off ? "none" : "0 14px 26px -16px rgba(14,159,110,.7)" }}>
      {loading ? "بنشتغل…" : children}{!loading && <ArrowLeft size={16} />}
    </button>
  );
}
function ErrLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 700, color: "var(--kv-red)" }}>{msg}</div>;
}
function NoRid() {
  return <div style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-red)" }}>ابدأ من خطوة الأساسيات الأول.</div>;
}

// ── Step 1: basics → provision-tenant ──
function StepBasics({ dialect, setDialect, restaurantId, onDone }: { dialect: Dialect; setDialect: (d: Dialect) => void; restaurantId: string | null; onDone: (rid: string) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setErr("اكتب اسم المطعم.");
    setLoading(true); setErr(null);
    const tz = TZ_FOR[dialect];
    const r = await api("POST", "/api/onboarding/provision-tenant", { name: name.trim(), dialect, ...tz });
    setLoading(false);
    if (!r.ok || !r.data?.restaurantId) return setErr(errMsg(r.status, r.data));
    onDone(r.data.restaurantId);
  };

  return (
    <div>
      <H title="أساسيات المطعم" sub="نبدأ بإنشاء مطعمك على Kivo (هيتعمل في وضع الإعداد لحد ما تشغّله في آخر خطوة)." />
      {restaurantId && <div style={{ marginBottom: 14, fontSize: 11.5, fontWeight: 700, color: "var(--kv-deep)" }}>✓ المطعم اتعمل بالفعل — تقدر تكمّل أو تعدّل.</div>}
      <div style={{ marginBottom: 14 }}>
        <Label>اسم المطعم</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: بلبن - المهندسين" style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <Label>لهجة كريم</Label>
          <div style={{ display: "flex", gap: 8 }}>
            {DIALECTS.map((d) => (
              <button key={d.v} onClick={() => setDialect(d.v)} style={{ flex: 1, height: 44, borderRadius: 12, fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: dialect === d.v ? "0" : "1px solid var(--kv-border)", background: dialect === d.v ? "var(--kv-primary)" : "var(--kv-card)", color: dialect === d.v ? "#fff" : "var(--kv-muted)" }}>{d.label}</button>
            ))}
          </div>
        </div>
        <div>
          <Label>المنطقة الزمنية</Label>
          <div style={{ ...inputStyle, display: "flex", alignItems: "center", color: "var(--kv-muted)" }}>{TZ_FOR[dialect].timezone} · {TZ_FOR[dialect].currency}</div>
        </div>
      </div>
      <ErrLine msg={err} />
      <div style={{ marginTop: 20 }}><PrimaryBtn onClick={submit} loading={loading}>{restaurantId ? "تحديث ومتابعة" : "إنشاء المطعم"}</PrimaryBtn></div>
    </div>
  );
}

// ── Step 2: WhatsApp → embedded-signup (honest gate) ──
function StepWhatsApp({ restaurantId, waState, onConnected, onSkip, onUnavailable }: { restaurantId: string | null; waState: string | null; onConnected: () => void; onSkip: () => void; onUnavailable: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Real Embedded Signup launch — only possible when Meta is configured deployment-side.
  const connect = async () => {
    if (!restaurantId) return;
    setErr(null);
    const w = window as any;
    if (!META_APP_ID || !w.FB) { onUnavailable(); return; }
    setLoading(true);
    try {
      const auth: any = await new Promise((res) => w.FB.login((r: any) => res(r), { scope: "whatsapp_business_management,whatsapp_business_messaging", extras: { feature: "whatsapp_embedded_signup" } }));
      const code = auth?.authResponse?.code;
      // phoneNumberId/wabaId arrive via the ES message channel in the real flow;
      // we forward whatever Meta returned. The route validates + 400s if missing.
      if (!code) { setLoading(false); return setErr("اتلغى الربط قبل ما يكمّل."); }
      const r = await api("POST", "/api/onboarding/embedded-signup", { restaurantId, code, phoneNumberId: auth?.phoneNumberId, wabaId: auth?.wabaId });
      setLoading(false);
      if (r.status === 503 || r.data?.error === "not_configured") { onUnavailable(); return; }
      if (!r.ok || !r.data?.configured) return setErr(errMsg(r.status, r.data));
      onConnected();
    } catch {
      setLoading(false); onUnavailable();
    }
  };

  const unavailable = !META_APP_ID || waState === "unavailable";

  return (
    <div>
      <H title="ربط واتساب الرسمي" sub="كريم بيرد على عملاءك من رقم واتساب الرسمي بتاعك. الربط بيتم عبر Meta." />
      {!restaurantId ? <NoRid /> : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, background: "var(--kv-card-soft)", border: "1px solid var(--kv-border)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center", flex: "none" }}><MessageCircle size={22} color="#0a8a5f" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>ربط واتساب عبر Meta</div>
              <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, marginTop: 2 }}>
                {waState === "connected" ? "متصل ✓" : unavailable ? "محتاج إعداد من جهة Meta" : "هيفتح نافذة Meta للربط"}
              </div>
            </div>
            {unavailable ? <StatePill state="coming" label="لسه مش متاح" /> : waState === "connected" ? <StatePill state="live" label="متصل" /> : null}
          </div>

          {unavailable && (
            <div style={{ marginTop: 14, borderRadius: 13, border: "1px dashed rgba(100,116,139,.35)", background: "rgba(100,116,139,.05)", padding: "13px 15px", fontSize: 11.5, color: "var(--kv-slate)", fontWeight: 600, lineHeight: 1.6 }}>
              ربط واتساب لسه مش متاح على النشر ده (محتاج إعداد Meta + مراجعة التطبيق). تقدر تكمّل باقي الخطوات دلوقتي وتربط واتساب بعدين — بس التشغيل النهائي مش هيتم من غيره.
            </div>
          )}

          <ErrLine msg={err} />

          <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
            {!unavailable && <PrimaryBtn onClick={connect} loading={loading}>اربط واتساب</PrimaryBtn>}
            <button onClick={onSkip} style={{ height: 46, padding: "0 18px", borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>تخطّى دلوقتي</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 3: menu → ingest → publish ──
type ItemForm = { name: string; price: string; description: string; allergens: string };
type CatForm = { name: string; items: ItemForm[] };
const emptyItem = (): ItemForm => ({ name: "", price: "", description: "", allergens: "" });

function StepMenu({ restaurantId, onDone }: { restaurantId: string | null; onDone: () => void }) {
  const [cats, setCats] = useState<CatForm[]>([{ name: "", items: [emptyItem()] }]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const setCat = (ci: number, patch: Partial<CatForm>) => setCats((c) => c.map((x, i) => (i === ci ? { ...x, ...patch } : x)));
  const setItem = (ci: number, ii: number, patch: Partial<ItemForm>) => setCats((c) => c.map((x, i) => i !== ci ? x : { ...x, items: x.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }));

  const publish = async () => {
    if (!restaurantId) return;
    // Price MUST be a real positive number — never coerce a blank/zero to 0 and
    // publish it silently (the fee-bug class). Arabic-Indic input was already
    // normalized to ASCII on entry (sanitizeDecimalInput), so Number() is safe here.
    for (const c of cats) {
      if (!c.name.trim()) continue;
      for (const it of c.items) {
        if (!it.name.trim()) continue;
        const price = Number(it.price);
        if (!it.price.trim() || !Number.isFinite(price) || price <= 0) {
          return setErr("اكتب سعرًا صحيحًا أكبر من صفر لكل صنف قبل النشر.");
        }
      }
    }
    const payload = {
      categories: cats
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          items: c.items.filter((it) => it.name.trim()).map((it) => ({
            name: it.name.trim(),
            price: Number(it.price),
            description: it.description.trim() || undefined,
            allergens: it.allergens.trim() ? it.allergens.split(/[،,]/).map((s) => s.trim()).filter(Boolean) : undefined,
          })),
        })),
    };
    if (!payload.categories.length || !payload.categories.some((c) => c.items.length)) return setErr("ضيف قسم واحد على الأقل وفيه صنف.");
    setLoading(true); setErr(null); setWarn(null);
    const ing = await api("POST", "/api/onboarding/menu/ingest", { restaurantId, menu: payload });
    if (!ing.ok || !ing.data?.draftId) { setLoading(false); return setErr(errMsg(ing.status, ing.data)); }
    const pub = await api("POST", "/api/onboarding/menu/publish", { restaurantId, draftId: ing.data.draftId });
    setLoading(false);
    if (!pub.ok) return setErr(errMsg(pub.status, pub.data));
    if (pub.data?.itemsPreviouslyUnavailable > 0) {
      setWarn(`تنبيه: النشر رجّع توفّر كل الأصناف — ${toAr(pub.data.itemsPreviouslyUnavailable)} صنف كانوا موقوفين بقوا متاحين. راجعهم.`);
      setTimeout(onDone, 1800);
      return;
    }
    onDone();
  };

  return (
    <div>
      <H title="حمّل المنيو" sub="اكتب الأقسام والأصناف. كريم بيتبع المنيو ده كمصدر حقيقة — الأسعار من هنا، مش من كلامه." />
      {!restaurantId ? <NoRid /> : (
        <>
          <div className="kv-scroll" style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 380, overflowY: "auto" }}>
            {cats.map((c, ci) => (
              <div key={ci} style={{ borderRadius: 14, border: "1px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <input value={c.name} onChange={(e) => setCat(ci, { name: e.target.value })} placeholder={`اسم القسم ${toAr(ci + 1)} (مثال: برجر)`} style={{ ...inputStyle, height: 40, fontWeight: 800 }} />
                  {cats.length > 1 && <button onClick={() => setCats((x) => x.filter((_, i) => i !== ci))} aria-label="حذف القسم" style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid var(--kv-border)", background: "#fff", color: "var(--kv-red)", flex: "none", cursor: "pointer" }}><Trash2 size={15} /></button>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {c.items.map((it, ii) => (
                    <div key={ii} style={{ display: "grid", gridTemplateColumns: "1.4fr 70px 1.4fr 28px", gap: 7 }}>
                      <input value={it.name} onChange={(e) => setItem(ci, ii, { name: e.target.value })} placeholder="اسم الصنف" style={{ ...inputStyle, height: 38, fontSize: 12 }} />
                      <input value={toAr(it.price)} onChange={(e) => setItem(ci, ii, { price: sanitizeDecimalInput(e.target.value) })} inputMode="decimal" placeholder="السعر" style={{ ...inputStyle, height: 38, fontSize: 12, textAlign: "center" }} />
                      <input value={it.allergens} onChange={(e) => setItem(ci, ii, { allergens: e.target.value })} placeholder="حساسية (اختياري)" style={{ ...inputStyle, height: 38, fontSize: 12 }} />
                      {c.items.length > 1 ? <button onClick={() => setCat(ci, { items: c.items.filter((_, j) => j !== ii) })} aria-label="حذف الصنف" style={{ width: 28, height: 38, borderRadius: 9, border: "1px solid var(--kv-border)", background: "#fff", color: "var(--kv-faint)", cursor: "pointer" }}><Trash2 size={13} /></button> : <span />}
                    </div>
                  ))}
                </div>
                <button onClick={() => setCat(ci, { items: [...c.items, emptyItem()] })} style={{ marginTop: 9, fontSize: 11, fontWeight: 800, color: "var(--kv-deep)", background: "transparent", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Plus size={13} /> صنف</button>
              </div>
            ))}
          </div>
          <button onClick={() => setCats((c) => [...c, { name: "", items: [emptyItem()] }])} style={{ marginTop: 12, height: 38, padding: "0 14px", borderRadius: 11, border: "1px dashed var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-deep)", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> أضف قسم</button>
          {warn && <div style={{ marginTop: 12, borderRadius: 11, border: "1px solid rgba(201,138,31,.3)", background: "rgba(201,138,31,.08)", padding: "10px 12px", fontSize: 11, color: "#9a6a14", fontWeight: 700, lineHeight: 1.5 }}>{warn}</div>}
          <ErrLine msg={err} />
          <div style={{ marginTop: 18 }}><PrimaryBtn onClick={publish} loading={loading}>احفظ وانشر المنيو</PrimaryBtn></div>
        </>
      )}
    </div>
  );
}

// ── Step 4: config hours (required) + persona (optional) ──
const DAYS = [["sat", "السبت"], ["sun", "الحد"], ["mon", "الاتنين"], ["tue", "التلات"], ["wed", "الأربع"], ["thu", "الخميس"], ["fri", "الجمعة"]] as const;
type DayState = { open: boolean; from: string; to: string };

function StepConfig({ restaurantId, dialect, hoursDone, onHours, onNext }: { restaurantId: string | null; dialect: Dialect; hoursDone: boolean; onHours: () => void; onNext: () => void }) {
  const [days, setDays] = useState<Record<string, DayState>>(() => Object.fromEntries(DAYS.map(([k]) => [k, { open: true, from: "10:00", to: "23:00" }])));
  const [savingH, setSavingH] = useState(false);
  const [errH, setErrH] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [savingP, setSavingP] = useState(false);
  const [pOk, setPOk] = useState(false);

  const saveHours = async () => {
    if (!restaurantId) return;
    const hours: Record<string, unknown> = {};
    for (const [k] of DAYS) { const d = days[k]; hours[k] = d.open ? { open: d.from, close: d.to } : { closed: true }; }
    setSavingH(true); setErrH(null);
    const r = await api("PUT", "/api/onboarding/config/hours", { hours });
    setSavingH(false);
    if (!r.ok) return setErrH(errMsg(r.status, r.data));
    onHours();
  };
  const savePersona = async () => {
    if (!restaurantId || !persona.trim()) return;
    setSavingP(true);
    const r = await api("PUT", "/api/onboarding/config/persona", { agentPersonaName: persona.trim(), dialect });
    setSavingP(false);
    setPOk(r.ok);
  };

  return (
    <div>
      <H title="الإعدادات" sub="مواعيد العمل مطلوبة للتشغيل. اللهجة والاسم اختياريين (الاستلام لوحده مظبوط)." />
      {!restaurantId ? <NoRid /> : (
        <>
          {/* hours (required) */}
          <div style={{ borderRadius: 14, border: "1px solid var(--kv-border)", padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>مواعيد العمل</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "#9a6a14", background: "rgba(201,138,31,.16)", borderRadius: 99, padding: "2px 8px" }}>مطلوب</span>
              {hoursDone && <span style={{ marginInlineStart: "auto", fontSize: 11, fontWeight: 800, color: "var(--kv-deep)" }}>محفوظ ✓</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {DAYS.map(([k, lbl]) => {
                const d = days[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => setDays((s) => ({ ...s, [k]: { ...s[k], open: !s[k].open } }))} style={{ width: 64, height: 30, borderRadius: 8, fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer", border: d.open ? "0" : "1px solid var(--kv-border)", background: d.open ? "rgba(14,159,110,.12)" : "var(--kv-card)", color: d.open ? "#0a8a5f" : "var(--kv-faint)" }}>{lbl}</button>
                    {d.open ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="time" value={d.from} onChange={(e) => setDays((s) => ({ ...s, [k]: { ...s[k], from: e.target.value } }))} style={{ ...inputStyle, height: 30, width: 110, fontSize: 12 }} />
                        <span style={{ color: "var(--kv-faint)" }}>—</span>
                        <input type="time" value={d.to} onChange={(e) => setDays((s) => ({ ...s, [k]: { ...s[k], to: e.target.value } }))} style={{ ...inputStyle, height: 30, width: 110, fontSize: 12 }} />
                      </div>
                    ) : <span style={{ fontSize: 11.5, color: "var(--kv-faint)", fontWeight: 700 }}>مقفول</span>}
                  </div>
                );
              })}
            </div>
            <ErrLine msg={errH} />
            <button onClick={saveHours} disabled={savingH} style={{ marginTop: 12, height: 38, padding: "0 16px", borderRadius: 11, border: 0, background: "var(--kv-primary)", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{savingH ? "بنحفظ…" : "احفظ المواعيد"}</button>
          </div>

          {/* persona (optional) */}
          <div style={{ borderRadius: 14, border: "1px solid var(--kv-border)", padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>شخصية كريم <span style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)" }}>(اختياري)</span></div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="اسم الوكيل (مثال: كريم)" style={inputStyle} />
              <button onClick={savePersona} disabled={savingP || !persona.trim()} style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: persona.trim() ? "pointer" : "default", flex: "none" }}>{savingP ? "…" : pOk ? "محفوظ ✓" : "احفظ"}</button>
            </div>
          </div>

          <PrimaryBtn onClick={onNext} disabled={!hoursDone}>{hoursDone ? "للتشغيل" : "احفظ المواعيد الأول"}</PrimaryBtn>
        </>
      )}
    </div>
  );
}

// ── Step 5: go-live (real checklist + gate) ──
type ChecklistItem = { pass: boolean; required: boolean; label: string };
type Checklist = { whatsapp: ChecklistItem; menu: ChecklistItem; hours: ChecklistItem; allergyTestDrive: ChecklistItem; zones: ChecklistItem };
// allergyTestDrive has no step in THIS public wizard (the test-drive lives in the
// console cockpit), so it maps to no «أكمل» jump — the row is shown for visibility
// with its real server state; the «أكمل» button is only rendered where a step exists.
const STEP_FOR: Record<string, number> = { whatsapp: 2, menu: 3, hours: 4, zones: 4 };

function StepGoLive({ restaurantId, goToStep }: { restaurantId: string | null; goToStep: (n: number) => void }) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restaurantId) { setLoading(false); return; }
    setLoading(true); setErr(null);
    const r = await api("GET", `/api/onboarding/go-live?restaurantId=${encodeURIComponent(restaurantId)}`);
    setLoading(false);
    if (!r.ok) return setErr(errMsg(r.status, r.data));
    setChecklist(r.data?.checklist ?? null);
    if (r.data?.alreadyLive) setLive(true);
  }, [restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const goLive = async () => {
    if (!restaurantId) return;
    setActivating(true); setErr(null);
    const r = await api("POST", "/api/onboarding/go-live", { restaurantId });
    setActivating(false);
    if (r.status === 422) { setChecklist(r.data?.checklist ?? checklist); setErr("لسه في حاجة ناقصة قبل التشغيل — راجع القائمة تحت."); return; }
    if (!r.ok) return setErr(errMsg(r.status, r.data));
    if (r.data?.activated || r.data?.alreadyLive) setLive(true);
  };

  if (!restaurantId) return <NoRid />;
  if (live) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--kv-grad-brand)", display: "grid", placeItems: "center", margin: "0 auto 16px", boxShadow: "0 16px 30px -16px rgba(10,138,95,.7)" }}><PartyPopper size={30} color="#fff" /></div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>كريم بقى شغّال! 🎉</h2>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "8px 0 18px" }}>مطعمك دلوقتي مباشر على Kivo. كريم بيستقبل ويرد على واتساب.</p>
        <Link href="/orders" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 46, padding: "0 22px", borderRadius: 12, background: "var(--kv-grad-brand)", color: "#fff", fontSize: 13.5, fontWeight: 800, textDecoration: "none", boxShadow: "0 14px 26px -16px rgba(14,159,110,.7)" }}>افتح لوحة الطلبات <ArrowLeft size={16} /></Link>
      </div>
    );
  }

  const items = checklist ? (["whatsapp", "menu", "hours", "allergyTestDrive", "zones"] as const).map((k) => ({ key: k, ...checklist[k] })) : [];

  return (
    <div>
      <H title="التشغيل" sub="دي قائمة الجاهزية الحقيقية من السيرفر. زر التشغيل بيتأكّد من السيرفر تاني، ومبيشغّلش غير لو كل المطلوب تمام." />
      {loading ? <div style={{ fontSize: 12, color: "var(--kv-faint)", fontWeight: 600 }}>بنحمّل القائمة…</div> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {items.map((it) => (
              <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--kv-border)", background: it.pass ? "rgba(14,159,110,.06)" : "var(--kv-card-soft)" }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: it.pass ? "var(--kv-primary)" : "transparent", border: it.pass ? "0" : "1.5px solid #d8e0db" }}>
                  {it.pass && <Check size={14} color="#fff" strokeWidth={3} />}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{it.label}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, marginInlineStart: 8, color: it.required ? "#9a6a14" : "var(--kv-faint)" }}>{it.required ? "مطلوب" : "اختياري"}</span>
                </div>
                {!it.pass && STEP_FOR[it.key] != null && <button onClick={() => goToStep(STEP_FOR[it.key])} style={{ height: 30, padding: "0 12px", borderRadius: 9, border: "1px solid var(--kv-border)", background: "#fff", color: "var(--kv-deep)", fontSize: 11, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>أكمل</button>}
              </div>
            ))}
          </div>
          <ErrLine msg={err} />
          <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
            <PrimaryBtn onClick={goLive} loading={activating}>شغّل كريم</PrimaryBtn>
            <button onClick={refresh} style={{ height: 46, padding: "0 16px", borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>تحديث القائمة</button>
          </div>
        </>
      )}
    </div>
  );
}
