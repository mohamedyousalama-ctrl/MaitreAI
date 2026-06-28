"use client";

// ============================================================================
// Kivo — الرئيسية (Home / Control). The operator's landing/router, at /dashboard
// inside (console) — REPLACES the old (main)/dashboard terracotta page (deleted).
// Post-login lands here (LoginForm + auth/callback both target /dashboard).
//
// Answers: is Karim working? what needs me now? today's pulse? — then links into
// every page. Router + status board, not deep analytics (that's Insights).
//
// TRUTH-SYSTEM: every signal is a real read or honest-empty — never fabricated.
//  • Agent status   ← /api/settings/ops (agent_mode live/paused/setup)   LIVE
//  • Interventions  ← countEscalations(conversations)                     LIVE (0 = calm)
//  • Safety holds   ← conversations[].isSafetyHold (real spine flag)      LIVE or none
//  • Orders to act  ← order-store (pending confirmation/payment)          LIVE
//  • Today's pulse  ← order.createdAt / conversation message epoch        LIVE or gathering
//  • Complete setup ← WhatsApp configured + menu published + ops ok        LIVE (conditional)
// Safety holds carry the EXACT "operational hint, not a guarantee" framing.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessagesSquare,
  ClipboardList,
  LineChart,
  Users,
  Settings as SettingsIcon,
  ShieldAlert,
  AlertTriangle,
  Bell,
  ArrowLeft,
  Rocket,
  CheckCircle2,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useConsoleOps } from "@/lib/console-ops-store";
import { countEscalations } from "@/lib/escalation";
import { useRiseIn, StatePill } from "@/components/kivo";
import type { Conversation, OrderStatusKey } from "@/lib/types";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

// orders awaiting an operator decision: not yet confirmed / not yet paid
const NEEDS_ACTION: OrderStatusKey[] = ["pending_confirmation", "pending_payment"];

// a conversation's activity time = latest message epoch, when the data carries it
function convTime(c: Conversation): number | undefined {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const ms = c.messages[i].createdAtMs;
    if (ms) return ms;
  }
  return undefined;
}

type AgentState = "loading" | "live" | "paused" | "setup";
type Wa = { configured: boolean };

async function getJson<T>(url: string): Promise<{ ok: boolean; data: T | null }> {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return { ok: false, data: null };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, data: null };
  }
}

export default function HomePage() {
  const hydrated = useHasHydrated();
  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);
  const profileName = useRestaurantStore((s) => s.profile.name);
  const menuItems = useRestaurantStore((s) => s.menuItems);

  // LIVE0 L1 — Karim active + open/closed from the SHARED ops store (DB-backed +
  // realtime), so this banner stays in sync with the sidebar toggle same-page and
  // reflects another operator's change live (was an independent mount-time fetch).
  const assistantOn = useConsoleOps((s) => s.assistantOn);
  const isOpen = useConsoleOps((s) => s.isOpen);
  const opsLoaded = useConsoleOps((s) => s.loaded);
  const [wa, setWa] = useState<{ loaded: boolean; ok: boolean; v: Wa | null }>({ loaded: false, ok: false, v: null });

  const rHead = useRiseIn(0);
  const rBanner = useRiseIn(1);
  const rNeeds = useRiseIn(2);
  const rPulse = useRiseIn(3);
  const rLinks = useRiseIn(4);

  useEffect(() => {
    let alive = true;
    getJson<Wa>("/api/settings/whatsapp").then((r) => alive && setWa({ loaded: true, ok: r.ok, v: r.data }));
    return () => { alive = false; };
  }, []);

  // agent status (live / paused) — from the shared store. "setup" (ops backend
  // unreachable) is no longer a banner sub-state; genuine onboarding gaps are
  // surfaced by setupIncomplete (WhatsApp + menu) below, unchanged.
  const agent: AgentState = !opsLoaded ? "loading" : assistantOn ? "live" : "paused";

  // "needs you now" — real counts only
  const escalations = hydrated ? countEscalations(conversations) : 0;
  const safetyHolds = hydrated ? conversations.filter((c) => c.isSafetyHold).length : 0;
  // UI4 — exclude staff-marked test orders from the real "needs action" + pulse counts.
  const ordersToAction = hydrated ? orders.filter((o) => !o.isTest && NEEDS_ACTION.includes(o.orderStatus)).length : 0;
  const needsTotal = escalations + safetyHolds + ordersToAction;

  // today's pulse — real reads, gathering when timestamps absent
  const pulse = useMemo(() => {
    if (!hydrated) return { ready: false, ordersToday: 0, completedToday: 0, convosToday: 0, convosKnown: false };
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const startOfToday = d.getTime();
    const ordersToday = orders.filter((o) => !o.isTest && o.createdAt >= startOfToday).length;
    const completedToday = orders.filter((o) => !o.isTest && o.orderStatus === "delivered" && o.createdAt >= startOfToday).length;
    const convosKnown = conversations.some((c) => convTime(c) != null);
    const convosToday = convosKnown ? conversations.filter((c) => { const tm = convTime(c); return tm != null && tm >= startOfToday; }).length : 0;
    return { ready: true, ordersToday, completedToday, convosToday, convosKnown };
  }, [hydrated, orders, conversations]);

  // onboarding completeness — same real signals settings uses (no fragile rid plumbing)
  const waConnected = wa.ok && !!wa.v?.configured;
  const menuReady = hydrated && menuItems.length > 0;
  const setupIncomplete = (wa.loaded && !waConnected) || (hydrated && !menuReady);

  const greeting = hydrated && profileName ? profileName : "Kivo";

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* HEADER */}
      <header style={{ ...rHead.style }}>
        <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>الرئيسية</span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 0" }}>أهلاً، {greeting} 👋</h1>
        <p style={{ fontSize: 12.5, color: "var(--kv-muted)", fontWeight: 600, margin: "6px 0 0", maxWidth: 560, lineHeight: 1.6 }}>
          نظرة سريعة على شغل كريم: حالته دلوقتي، اللي محتاج منك تدخّل، ونبض النهارده — ومنها تروح لأي صفحة.
        </p>
      </header>

      {/* AGENT STATUS BANNER */}
      <section style={{ ...rBanner.style }}>
        <AgentBanner state={agent} isOpen={isOpen} />
      </section>

      {/* NEEDS YOU NOW */}
      <section style={{ ...rNeeds.style }}>
        <SectionTitle title="محتاج منك دلوقتي" sub="القرارات اللي مستنياك — كل واحد بيوديك لمكان ما تتصرّف فيه" />
        {needsTotal === 0 ? (
          <CalmEmpty />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(248px,1fr))", gap: 12 }}>
            {safetyHolds > 0 && (
              <NeedCard tone="danger" icon={ShieldAlert} count={safetyHolds} title="تنبيه سلامة في محادثات" body="ده تنبيه تشغيلي للفريق — مش ضمان سلامة. راجعها فوراً وأكّد المكوّنات بنفسك قبل أي تأكيد." href="/conversations" cta="راجع المحادثات" />
            )}
            {escalations > 0 && (
              <NeedCard tone="warn" icon={Bell} count={escalations} title="محادثات محتاجة تدخّل" body="كريم حوّلها للفريق أو فيها حاجة محتاجة قرار بشري. استلمها وكمّل مع العميل." href="/conversations" cta="افتح المحادثات" />
            )}
            {ordersToAction > 0 && (
              <NeedCard tone="info" icon={ClipboardList} count={ordersToAction} title="طلبات محتاجة متابعة" body="طلبات لسه مستنية تأكيد أو دفع. اتأكّد منها عشان تكمّل للمطبخ." href="/orders" cta="افتح الطلبات" />
            )}
          </div>
        )}
      </section>

      {/* TODAY'S PULSE */}
      <section style={{ ...rPulse.style }}>
        <SectionTitle title="نبض النهارده" sub="أرقام سريعة من شغل كريم النهارده — التفاصيل الكاملة في الرؤى" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <PulseTile label="طلبات النهارده" value={pulse.ready ? toAr(pulse.ordersToday) : "…"} icon={ClipboardList} />
          <PulseTile label="محادثات النهارده" value={pulse.ready && pulse.convosKnown ? toAr(pulse.convosToday) : "—"} icon={MessagesSquare} gathering={pulse.ready && !pulse.convosKnown} />
          <PulseTile label="طلبات اكتملت النهارده" value={pulse.ready ? toAr(pulse.completedToday) : "…"} icon={CheckCircle2} accent />
        </div>
      </section>

      {/* QUICK LINKS */}
      <section style={{ ...rLinks.style }}>
        <SectionTitle title="روح لأي صفحة" sub="كل أدوات كريم في مكان واحد" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {setupIncomplete && (
            <Link href="/onboarding" style={{ textDecoration: "none", color: "inherit", gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 16, border: "1.5px dashed rgba(14,159,110,.4)", background: "repeating-linear-gradient(135deg,rgba(14,159,110,.04),rgba(14,159,110,.04) 12px,transparent 12px,transparent 24px),var(--kv-card)", padding: "16px 18px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: "var(--kv-grad-brand)", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Rocket size={22} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--kv-deep)" }}>أكمل إعداد كريم</div>
                  <div style={{ fontSize: 11.5, color: "var(--kv-muted)", fontWeight: 600, marginTop: 4, lineHeight: 1.55 }}>لسه في خطوات ناقصة قبل ما كريم يشتغل بالكامل — اربط واتساب، انشر المنيو، وفعّله.</div>
                </div>
                <ArrowLeft size={18} style={{ flex: "none", color: "var(--kv-deep)" }} />
              </div>
            </Link>
          )}
          <QuickLink href="/conversations" icon={MessagesSquare} title="المحادثات" sub="كل محادثات كريم والتدخّلات" badge={escalations} />
          <QuickLink href="/orders" icon={ClipboardList} title="الطلبات" sub="طلبات كريم وحالتها" badge={ordersToAction} />
          <QuickLink href="/insights" icon={LineChart} title="الرؤى" sub="تحليل أعمق لشغل كريم" />
          <QuickLink href="/customers" icon={Users} title="العملاء" sub="عملاء كريم وذاكرته عنهم" />
          <QuickLink href="/settings" icon={SettingsIcon} title="الربط والإعدادات" sub="اربط كريم وتحكّم فيه" />
        </div>
      </section>
    </div>
  );
}

function AgentBanner({ state, isOpen }: { state: AgentState; isOpen: boolean }) {
  if (state === "live") {
    return (
      <div style={{ borderRadius: 18, background: "var(--kv-grad-brand-deep)", color: "#fff", boxShadow: "0 22px 50px -32px rgba(10,138,95,.75)", padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,.16)", display: "grid", placeItems: "center", flex: "none" }}><Bot size={24} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span className="kv-pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>كريم شغّال</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.92, fontWeight: 600, marginTop: 5 }}>
            بيستقبل ويرد على عملاءك على واتساب دلوقتي{isOpen ? "" : " · بس المطعم متعلّم كـ مقفول"}.
          </div>
        </div>
        <Link href="/settings" style={{ height: 38, padding: "0 16px", borderRadius: 11, background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", flex: "none" }}>التحكّم<ArrowLeft size={15} /></Link>
      </div>
    );
  }
  if (state === "paused") {
    return (
      <div style={{ borderRadius: 18, background: "#fff8ed", border: "1.5px solid #f4d6a3", padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fdeccb", color: "#b9791a", display: "grid", placeItems: "center", flex: "none" }}><AlertTriangle size={24} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#9a6512" }}>كريم متوقّف مؤقتاً</div>
          <div style={{ fontSize: 12, color: "#8a6a32", fontWeight: 600, marginTop: 5 }}>مش بيرد على العملاء دلوقتي. لو ده مش مقصود، شغّله من الإعدادات عشان مايضيعش أي طلب.</div>
        </div>
        <Link href="/settings" style={{ height: 38, padding: "0 16px", borderRadius: 11, background: "#b9791a", color: "#fff", fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", flex: "none" }}>شغّل كريم<ArrowLeft size={15} /></Link>
      </div>
    );
  }
  if (state === "setup") {
    return (
      <div style={{ borderRadius: 18, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(100,116,139,.12)", color: "#64748b", display: "grid", placeItems: "center", flex: "none" }}><Bot size={24} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>كريم محتاج إعداد</div>
          <div style={{ fontSize: 12, color: "var(--kv-muted)", fontWeight: 600, marginTop: 5 }}>لسه مش مربوط بالكامل، فمش بيرد دلوقتي. كمّل الإعداد عشان يبدأ يشتغل.</div>
        </div>
        <Link href="/onboarding" style={{ height: 38, padding: "0 16px", borderRadius: 11, background: "var(--kv-primary)", color: "#fff", fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", flex: "none" }}>أكمل الإعداد<ArrowLeft size={15} /></Link>
      </div>
    );
  }
  return (
    <div style={{ borderRadius: 18, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "20px 22px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--kv-card-soft)", flex: "none" }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: 140, height: 14, borderRadius: 6, background: "var(--kv-card-soft)" }} />
        <div style={{ width: 240, height: 10, borderRadius: 6, background: "var(--kv-card-soft)", marginTop: 8 }} />
      </div>
    </div>
  );
}

function NeedCard({ tone, icon: Icon, count, title, body, href, cta }: { tone: "danger" | "warn" | "info"; icon: LucideIcon; count: number; title: string; body: string; href: string; cta: string }) {
  const c =
    tone === "danger"
      ? { bg: "#fef3f2", border: "1.5px solid #f6cdc7", chip: "#c4392b", icon: "#c4392b", iconBg: "#fbdad5" }
      : tone === "warn"
      ? { bg: "#fff8ed", border: "1.5px solid #f4d6a3", chip: "#b9791a", icon: "#b9791a", iconBg: "#fdeccb" }
      : { bg: "var(--kv-card)", border: "1px solid var(--kv-border)", chip: "var(--kv-deep)", icon: "#0a8a5f", iconBg: "rgba(14,159,110,.12)" };
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", borderRadius: 16, background: c.bg, border: c.border, padding: "16px 18px", boxShadow: "0 16px 40px -34px rgba(16,60,44,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: c.iconBg, color: c.icon, display: "grid", placeItems: "center", flex: "none" }}><Icon size={19} /></div>
          <span style={{ fontSize: 26, fontWeight: 800, color: c.chip }}>{toAr(count)}</span>
          <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{title}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--kv-muted)", fontWeight: 600, marginTop: 10, lineHeight: 1.6, flex: 1 }}>{body}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: c.chip, marginTop: 12 }}>{cta}<ArrowLeft size={15} /></div>
      </div>
    </Link>
  );
}

function CalmEmpty() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "18px 20px" }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(14,159,110,.12)", color: "#0a8a5f", display: "grid", placeItems: "center", flex: "none" }}><CheckCircle2 size={22} /></div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>مفيش حاجة محتاجة تدخّل دلوقتي 👌</div>
        <div style={{ fontSize: 11.5, color: "var(--kv-muted)", fontWeight: 600, marginTop: 4 }}>كريم ماشي الأمور — مفيش تصعيد ولا تنبيه سلامة ولا طلب مستني.</div>
      </div>
    </div>
  );
}

function PulseTile({ label, value, icon: Icon, accent, gathering }: { label: string; value: string; icon: LucideIcon; accent?: boolean; gathering?: boolean }) {
  return (
    <div style={{ borderRadius: 14, background: "var(--kv-card)", border: "1px solid var(--kv-border)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} color="var(--kv-faint)" />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--kv-faint)" }}>{label}</span>
        {gathering && <span style={{ marginInlineStart: "auto" }}><StatePill state="gathering" /></span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 10, color: accent ? "var(--kv-deep)" : "var(--kv-text)" }}>{value}</div>
      {gathering && <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 3 }}>لسه بنجمع بيانات التوقيت</div>}
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, sub, badge }: { href: string; icon: LucideIcon; title: string; sub: string; badge?: number }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "0 16px 40px -34px rgba(16,60,44,.3)", padding: "16px 18px", height: "100%" }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", color: "#0a8a5f", display: "grid", placeItems: "center", flex: "none" }}><Icon size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{title}</span>
            {!!badge && badge > 0 && (
              <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "var(--kv-red)", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{toAr(badge)}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
        </div>
        <ArrowLeft size={17} style={{ flex: "none", color: "var(--kv-faint)" }} />
      </div>
    </Link>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600, margin: "3px 0 0" }}>{sub}</p>
    </div>
  );
}
