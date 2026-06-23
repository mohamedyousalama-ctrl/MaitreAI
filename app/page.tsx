// ============================================================================
// Kivo — public landing page (root, public). Replaces the old MaitreAI marketing
// page with the Kivo landing design, pixel-faithful to "Kivo - Landing.dc.html".
// Public (no login wall) so visitors + platform reviewers see a real page. CTAs
// route to the real app on the SAME domain: ابدأ/ابدأ مع كريم → /onboarding,
// دخول → /login, اللوحة/شوف لوحة الرؤى → /insights (middleware bounces an
// unauthenticated visitor from /insights to /login).
//
// Kivo design system: emerald, RTL, IBM Plex Sans Arabic (.kv-console font base).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { KivoMark, KivoWordmark } from "@/components/brand/KivoLogo";

export const metadata: Metadata = {
  title: "Kivo — خلّي طلباتك ماشية",
  description:
    "كريم بيرد على عملاءك على واتساب باللهجة المصرية، بياخد الطلب ويقفله — وإنت بتوصّل وتحتفظ بالعمولة اللي كانت بتروح للوسطاء.",
};

const Arrow = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h13M11 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const card: React.CSSProperties = { borderRadius: 20, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 22px 50px -38px rgba(16,60,44,.4)", padding: "26px 24px", position: "relative" };
const featCard: React.CSSProperties = { borderRadius: 18, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 18px 44px -36px rgba(16,60,44,.36)", padding: "22px 22px" };
const iconChip: React.CSSProperties = { width: 50, height: 50, borderRadius: 15, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" };
const featChip: React.CSSProperties = { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" };
const pill = (light?: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 8, height: 26, padding: "0 13px", borderRadius: 99, background: light ? "rgba(255,255,255,.12)" : "rgba(14,159,110,.1)", color: light ? "#34c79c" : "#0a8a5f", fontSize: 11.5, fontWeight: 800 });
const navLink: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.82)", textDecoration: "none" };

// @import must lead the stylesheet. Sora powers the "Kivo" wordmark (mark-as-v);
// it degrades to the Arabic/system face if the font can't load.
const SCOPED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&display=swap');
.kv-land h1,.kv-land h2,.kv-land h3{margin:0}
@keyframes kvFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes kvPulseL{0%,100%{box-shadow:0 0 0 0 rgba(52,199,156,.5)}50%{box-shadow:0 0 0 8px rgba(52,199,156,0)}}
@keyframes kvRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
/* Hero demo — ported from "Kivo Hero - Karim" (CSS-only; transforms+opacity). */
@keyframes kvType{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}
@keyframes kvPan{0%,6%{transform:translateY(0)}80%,100%{transform:translateY(var(--kv-pan,-480px))}}
@keyframes kvChatFade{0%{opacity:0}5%,82%{opacity:1}88%,100%{opacity:0}}
@keyframes kvLogoIn{0%,85%{opacity:0;transform:translate(-50%,-50%) translateY(10px) scale(.97)}89%,96%{opacity:1;transform:translate(-50%,-50%) translateY(0) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) translateY(-6px) scale(1)}}
.kv-land .kvFloat{animation:kvFloat 6s ease-in-out infinite}
.kv-land .kvDot{animation:kvPulseL 1.9s infinite}
.kv-land [data-rise]{animation:kvRise .7s cubic-bezier(.2,.8,.2,1) backwards}
.kv-land .kvChat{animation:kvChatFade 26s ease-in-out infinite}
.kv-land .kvTrack{animation:kvPan 26s linear infinite}
.kv-land .kvLogoFrame{animation:kvLogoIn 26s ease-in-out infinite}
.kv-land .kvType i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#0e9f6e;animation:kvType 1.2s ease-in-out infinite}
.kv-land .kvType i:nth-child(2){animation-delay:.18s}
.kv-land .kvType i:nth-child(3){animation-delay:.36s}
.kv-land .cta:hover{filter:brightness(.96);transform:translateY(-1px)}
.kv-land a.nl:hover{color:#fff}
@media (prefers-reduced-motion: reduce){
  .kv-land .kvFloat,.kv-land .kvDot,.kv-land [data-rise],.kv-land .kvChat,.kv-land .kvTrack,.kv-land .kvType i{animation:none}
  .kv-land .kvTrack{transform:translateY(0)}
  .kv-land .kvChat{opacity:1}
  .kv-land .kvLogoFrame{display:none}
}
@media (max-width:880px){.kv-land .heroGrid,.kv-land .valGrid{grid-template-columns:1fr !important}.kv-land .trio,.kv-land .proofGrid{grid-template-columns:1fr 1fr !important}}
`;

export default function Home() {
  return (
    <div className="kv-console kv-land" dir="rtl" lang="ar" style={{ background: "#eef5f1", color: "#0f2a20" }}>
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      {/* ===== HERO ===== */}
      <section style={{ position: "relative", overflow: "hidden", color: "#fff", background: "radial-gradient(900px 600px at 82% -6%,rgba(31,181,133,.32),transparent 58%),radial-gradient(800px 700px at 6% 110%,rgba(10,138,95,.4),transparent 60%),linear-gradient(155deg,#0c4d38,#0a3a2a 60%,#072a1e)" }}>
        <svg viewBox="0 0 400 300" aria-hidden style={{ position: "absolute", insetInlineStart: -40, bottom: -30, width: 460, height: 340, opacity: 0.08, pointerEvents: "none" }}><path d="M30 200 L110 270 L250 70" stroke="#fff" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none" /><path d="M240 56 H360" stroke="#fff" strokeWidth="15" strokeLinecap="round" /><path d="M262 96 H372" stroke="#fff" strokeWidth="15" strokeLinecap="round" /></svg>

        {/* nav */}
        <nav style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "22px 32px", display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/" aria-label="Kivo" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <KivoWordmark size={28} ink="#fff" />
          </Link>
          <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 26 }}>
            <a className="nl" href="#how" style={navLink}>إزاي بيشتغل</a>
            <a className="nl" href="#value" style={navLink}>القيمة</a>
            <a className="nl" href="#proof" style={navLink}>الأرقام</a>
            <Link className="nl" href="/login" style={navLink}>دخول</Link>
            <Link href="/onboarding" className="cta" style={{ height: 40, padding: "0 18px", borderRadius: 11, background: "#fff", color: "#0a8a5f", fontSize: 13, fontWeight: 800, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>ابدأ مجاناً</Link>
          </div>
        </nav>

        {/* hero body */}
        <div className="heroGrid" style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "48px 32px 96px", display: "grid", gridTemplateColumns: "1.08fr .92fr", gap: 48, alignItems: "center" }}>
          <div data-rise>
            <div style={{ ...pill(true), background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "#fff", height: 30, fontWeight: 700 }}>
              <span className="kvDot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#34c79c" }} />وكيل واتساب بالمصري · لمطاعمك
            </div>
            <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.18, margin: "22px 0 0" }}>خلّي طلباتك<br />ماشية — من غير<br /><span style={{ color: "#34c79c" }}>عمولة التطبيقات</span>.</h1>
            <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,.85)", lineHeight: 1.75, margin: "22px 0 0", maxWidth: 480 }}>عملاءك بيطلبوا على واتساب، وكريم بيرد عليهم باللهجة المصرية، بياخد الطلب ويقفله. إنت بتوصّل وتحتفظ بالـ ٣٠٪ اللي كانت بتروح للوسطاء.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 30 }}>
              <Link href="/onboarding" className="cta" style={{ height: 52, padding: "0 26px", borderRadius: 14, background: "#fff", color: "#0a8a5f", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", boxShadow: "0 20px 40px -18px rgba(0,0,0,.5)" }}>ابدأ مع كريم<Arrow /></Link>
              <a href="#how" style={{ height: 52, padding: "0 22px", borderRadius: 14, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", color: "#fff", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none" }}>شوف إزاي بيشتغل</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 32 }}>
              <Stat big="~٣٠٪" label="هامش بترجّعه" />
              <Sep />
              <Stat big="١١ث" label="متوسط رد كريم" />
              <Sep />
              <Stat big="واتساب" label="القناة اللي عندها العميل" />
            </div>
          </div>

          {/* WhatsApp demo phone — animated (ported from "Kivo Hero - Karim") */}
          <div data-rise style={{ display: "flex", justifyContent: "center" }}>
            <HeroDemo />
          </div>
        </div>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden style={{ display: "block", width: "100%", height: 64 }}><path d="M0 80 L0 38 C 240 4 480 4 720 36 C 960 68 1200 68 1440 30 L1440 80 Z" fill="#eef5f1" /></svg>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 32px 20px" }}>
        <div data-rise style={{ textAlign: "center" }}>
          <div style={pill()}>إزاي بيشتغل</div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: "14px 0 0" }}>ثلاث خطوات، وكريم بيمشي الباقي</h2>
          <p style={{ fontSize: 14.5, color: "#5b6b64", fontWeight: 600, margin: "10px 0 0" }}>من أول رسالة لحد ما الطلب يوصل — كله على واتساب، ومن غير تطبيق وسيط.</p>
        </div>
        <div className="trio" data-rise style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 34 }}>
          <HowCard n="٠١" title="العميل بيكلّم كريم" body="بيبعت رسالة عادية على رقم واتساب مطعمك. كريم بيرد باللهجة المصرية، بيفهم الطلب ويرشّح ويجاوب على الأسئلة." icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.5A8 8 0 1 1 20 11.5Z" stroke="#0a8a5f" strokeWidth="1.8" strokeLinejoin="round" /></svg>} />
          <HowCard n="٠٢" title="كريم بيقفل الطلب" body="بيأكّد الأصناف والعنوان، بيحسب الإجمالي من نظامك (مش بيخترع سعر)، ويسجّل الطلب جاهز للمطبخ — وبيحوّل للفريق لو محتاج تدخّل." icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 7h12l-1 13H7L6 7Z" stroke="#0a8a5f" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 7a3 3 0 0 1 6 0" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
          <HowCard n="٠٣" title="إنت بتوصّل وتكسب أكتر" body="الطلب بيوصلك في الداشبورد بحالته. بتوصّله بنفسك أو بمندوبك، وبتحتفظ بكامل قيمة الطلب — من غير عمولة وسيط." icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 13h11V6H3zM14 9h4l3 3v1h-7z" stroke="#0a8a5f" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="7" cy="17" r="2" stroke="#0a8a5f" strokeWidth="1.8" /><circle cx="17" cy="17" r="2" stroke="#0a8a5f" strokeWidth="1.8" /></svg>} />
        </div>
      </section>

      {/* ===== VALUE / MARGIN ===== */}
      <section id="value" style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 32px" }}>
        <div className="valGrid" data-rise style={{ borderRadius: 26, overflow: "hidden", background: "linear-gradient(155deg,#0c4d38,#0a3a2a)", color: "#fff", display: "grid", gridTemplateColumns: "1fr 1fr", boxShadow: "0 40px 90px -50px rgba(10,58,42,.8)" }}>
          <div style={{ padding: "40px 40px" }}>
            <div style={pill(true)}>القيمة الحقيقية</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.3, margin: "18px 0 0" }}>كل طلب يكمل عند كريم،<br />يفضل معاك بالكامل.</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,.82)", fontWeight: 600, lineHeight: 1.75, margin: "16px 0 0", maxWidth: 400 }}>تطبيقات التوصيل بتاخد حوالي ٣٠٪ من كل طلب. مع كريم العميل بيطلب منك مباشرة على واتساب، فالعمولة دي بتفضل في جيبك.</p>
            <Link href="/insights" className="cta" style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 46, padding: "0 22px", borderRadius: 13, background: "#fff", color: "#0a8a5f", fontSize: 14, fontWeight: 800, textDecoration: "none", marginTop: 26 }}>شوف لوحة الرؤى<Arrow /></Link>
          </div>
          <div style={{ padding: "40px 40px", background: "rgba(0,0,0,.16)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.8)", marginBottom: 16 }}>على طلب بـ ٢٤٠ ج.م</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,.78)" }}>عن طريق التطبيقات</span><span style={{ fontSize: 12.5, fontWeight: 800, color: "#f3b3a3" }}>يوصلك ١٦٨ ج.م</span></div>
              <div style={{ height: 30, borderRadius: 10, background: "rgba(255,255,255,.1)", overflow: "hidden", display: "flex" }}><div style={{ width: "70%", background: "rgba(255,255,255,.5)" }} /><div style={{ width: "30%", background: "repeating-linear-gradient(45deg,rgba(243,179,163,.85),rgba(243,179,163,.85) 7px,rgba(243,179,163,.5) 7px,rgba(243,179,163,.5) 14px)" }} /></div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: "#7ef0c4" }}>مع كريم</span><span style={{ fontSize: 12.5, fontWeight: 800, color: "#7ef0c4" }}>يفضل معاك ٢٤٠ ج.م</span></div>
              <div style={{ height: 30, borderRadius: 10, background: "rgba(255,255,255,.1)", overflow: "hidden" }}><div style={{ height: "100%", width: "100%", background: "linear-gradient(90deg,#0E9F6E,#34c79c)" }} /></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, padding: "14px 16px", borderRadius: 14, background: "rgba(52,199,156,.12)", border: "1px solid rgba(52,199,156,.3)" }}><div style={{ fontSize: 30, fontWeight: 800, color: "#7ef0c4" }}>+٧٢</div><div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>ج.م إضافية تفضل معاك في كل طلب زي ده</div></div>
          </div>
        </div>

        {/* feature trio */}
        <div className="trio" data-rise style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 20 }}>
          <Feat title="بيرد في ثواني، ٢٤/٧" body="مفيش عميل بيستنى. كريم بيرد على طول في أي وقت، فمفيش طلب بيضيع لإنه اتأخر." icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0a8a5f" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" /></svg>} />
          <Feat title="أرقام حقيقية بس" body="Kivo مبيعرضش رقم مخترع. كل مقياس يا حقيقي، يا «بنجمع بيانات»، يا «قريباً». بتثق في اللوحة لإنها صادقة." icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3 4 6v6c0 4 3 6.5 8 9 5-2.5 8-5 8-9V6l-8-3Z" stroke="#0a8a5f" strokeWidth="1.8" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
          <Feat title="تستلم في أي لحظة" body="لو محادثة محتاجة لمسة بشرية، تستلمها بضغطة وترجّعها لكريم لما تخلص. التحكّم دايماً في إيدك." icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 4v9m0 0 4-4m-4 4-4-4M5 19h14" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
        </div>
      </section>

      {/* ===== PROOF (illustrative metrics + honest disclaimer) ===== */}
      <section id="proof" style={{ background: "linear-gradient(180deg,#eef5f1,#e3ede8)" }}>
        <div data-rise style={{ maxWidth: 1180, margin: "0 auto", padding: "46px 32px", textAlign: "center" }}>
          <div style={pill()}>الأرقام اللي بتشوفها</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: "14px 0 0" }}>كله مبني على شغل كريم الفعلي</h2>
          <div className="proofGrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18, marginTop: 32 }}>
            <Proof n="٣٨٪" label="محادثة بتتحوّل لطلب" />
            <Proof n="١٦٠" label="طلب يقفله كريم أسبوعياً" />
            <Proof n="٢٧٪" label="محادثات بينقذها قبل ما تضيع" />
            <Proof n="١١ث" label="متوسط زمن الرد" />
          </div>
          <div style={{ fontSize: 11.5, color: "#8a988f", fontWeight: 600, marginTop: 18 }}>* أرقام توضيحية لمطعم نموذجي. مطعمك بيبدأ في وضع «بنجمع بيانات» وبتظهر أرقامه الحقيقية أول ما يكفي الحجم.</div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 32px 60px" }}>
        <div data-rise style={{ position: "relative", overflow: "hidden", borderRadius: 26, background: "radial-gradient(700px 400px at 85% 0%,rgba(52,199,156,.3),transparent 60%),linear-gradient(150deg,#0c9468,#0a7a55 60%,#0a5f44)", color: "#fff", padding: "48px 44px", textAlign: "center", boxShadow: "0 40px 90px -50px rgba(10,138,95,.8)" }}>
          <div style={{ display: "grid", placeItems: "center" }}><KivoMark size={50} tone="white" title="Kivo" /></div>
          <h2 style={{ fontSize: 34, fontWeight: 800, margin: "18px 0 0" }}>خلّي كريم يرد على عميلك الجاي</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,.85)", fontWeight: 600, margin: "12px auto 0", maxWidth: 440, lineHeight: 1.7 }}>اربط واتساب، اسحب المنيو، وكريم يبدأ يشتغل. من غير عمولة وسطاء، ومن غير أرقام وهمية.</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 28 }}>
            <Link href="/onboarding" className="cta" style={{ height: 52, padding: "0 28px", borderRadius: 14, background: "#fff", color: "#0a8a5f", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", boxShadow: "0 20px 40px -18px rgba(0,0,0,.4)" }}>ابدأ مجاناً<Arrow /></Link>
            <a href="#how" style={{ height: 52, padding: "0 24px", borderRadius: 14, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.24)", color: "#fff", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>اعرف أكتر</a>
          </div>
        </div>
      </section>

      {/* ===== KIVO FOOTER ===== */}
      <footer style={{ background: "#072a1e", color: "rgba(255,255,255,.7)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 32px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}><KivoMark size={20} tone="white" sheen={false} title="Kivo" /></div><KivoWordmark size={18} ink="#fff" /></div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>خلّي طلباتك ماشية</span>
          <div style={{ marginInlineStart: "auto", display: "flex", gap: 22, fontSize: 12, fontWeight: 700 }}>
            <a href="#how" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>إزاي بيشتغل</a>
            <Link href="/insights" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>اللوحة</Link>
            <Link href="/login" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>دخول</Link>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "14px 32px", textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>© ٢٠٢٦ Kivo · كل الطلبات على واتساب، من غير عمولة وسطاء</div>
      </footer>
    </div>
  );
}

// ── pieces ──
function Stat({ big, label }: { big: string; label: string }) {
  return <div><div className="kv-num" style={{ fontSize: 24, fontWeight: 800 }}>{big}</div><div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{label}</div></div>;
}
const Sep = () => <div style={{ width: 1, height: 34, background: "rgba(255,255,255,.18)" }} />;

// ── animated hero demo (ported from "Kivo Hero - Karim") ──────────────────
// A self-playing WhatsApp conversation with Karim: greeting → order → recap →
// an honest "delivery not available" decline → a safety hand-off on a hinted
// allergy → close, resolving to the Kivo wordmark. Pure CSS (transforms +
// opacity only): the message track auto-pans, edge masks hide the scroll seam,
// and the loop closes on the brand wordmark. No JS timers — see SCOPED_CSS.
// prefers-reduced-motion freezes it to a static, fully-visible frame.
function HeroDemo() {
  return (
    <div className="kvFloat" style={{ width: 312, borderRadius: 40, background: "#0b1f18", padding: 11, boxShadow: "0 50px 100px -40px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)" }}>
      <div style={{ borderRadius: 31, overflow: "hidden", background: "#f6faf8" }}>
        {/* header */}
        <div style={{ background: "#0a8a5f", padding: "13px 14px", display: "flex", alignItems: "center", gap: 11, color: "#fff", direction: "rtl" }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", flex: "none" }}>
            <KivoMark size={20} tone="white" sheen={false} title="" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>كريم · حلواني الدار</div>
            <div style={{ fontSize: 10, opacity: .9, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ef0c4" }} />متّصل</div>
          </div>
        </div>

        {/* body — fixed window, masked edges, auto-panning track */}
        <div
          style={{
            position: "relative",
            height: 430,
            overflow: "hidden",
            background: "linear-gradient(180deg,#f1f6f3,#e8efea)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 9%, #000 90%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, transparent 0, #000 9%, #000 90%, transparent 100%)",
          }}
        >
          <div className="kvChat" style={{ position: "absolute", inset: 0 }}>
            <div className="kvTrack" style={{ position: "absolute", insetInlineStart: 0, insetInlineEnd: 0, top: 0, padding: "16px 13px 22px", display: "flex", flexDirection: "column", "--kv-pan": "-470px" } as React.CSSProperties}>
              <DStamp>النهارده ٨:٠٤ م</DStamp>
              <DOut>السلام عليكم</DOut>
              <DIn name>وعليكم السلام ومرحباً! 😊 معاك كريم من حلواني الدار. تحب تطلب إيه النهارده؟</DIn>
              <DOut>عايز اتنين كيكة شوكولاتة وعصير برتقان</DOut>
              <DIn>تمام! اتنين كيكة الشوكولاتة الغنية وعصير برتقان طازة 🍫🍊</DIn>
              <DRecap />
              <DIn>ده طلبك لحد دلوقتي — تحب نكمّل؟</DIn>
              <DOut>توصلوا لـ مدينة النصر؟</DOut>
              <DIn>للأسف التوصيل لسه مش متاح لمدينة النصر دلوقتي 🙏 بس تقدر تستلم من الفرع، أو نشوفلك أقرب منطقة نوصّلها.</DIn>
              <DChip>التوصيل غير متاح لمدينة النصر</DChip>
              <DOut>تمام هستلم. بس أنا بتعب لو اكلت بندق</DOut>
              <DIn>حفاظاً على سلامتك، هوصّلك بزميل من الفريق يساعدك تختار الأصناف الآمنة ليك 🙏</DIn>
              <DChip solid>بنوصّلك بزميل من الفريق</DChip>
            </div>
            {/* pinned typing indicator */}
            <div style={{ position: "absolute", insetInlineEnd: 14, bottom: 14, direction: "rtl" }}>
              <div className="kvType" style={{ display: "flex", alignItems: "center", gap: 5, padding: "11px 14px", borderRadius: "7px 18px 18px 18px", background: "#fff", border: "1px solid #ebf2ee", boxShadow: "0 2px 7px rgba(13,42,32,.05)" }}>
                <i /><i /><i />
              </div>
            </div>
          </div>
          {/* closing brand frame */}
          <div className="kvLogoFrame" style={{ position: "absolute", left: "50%", top: "50%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "none" }}>
            <KivoWordmark size={46} ink="#0e1f18" />
            <span style={{ fontFamily: "'Sora', var(--font-arabic), system-ui, sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: "#0a8a5f" }}>Keep Every Order Moving</span>
          </div>
        </div>

        {/* input bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#fff", borderTop: "1px solid #eef3f0", direction: "rtl" }}>
          <div style={{ flex: 1, height: 36, borderRadius: 18, background: "#f1f5f3", display: "flex", alignItems: "center", padding: "0 15px" }}><span style={{ fontSize: 12.5, color: "#9bafa5" }}>اكتب رسالة…</span></div>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(150deg,#13b07a,#0a8a5f)", display: "grid", placeItems: "center", flex: "none" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 13 21 3M21 3l-6.5 18-3.5-8-8-3.5L21 3z" /></svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function DStamp({ children }: { children: React.ReactNode }) {
  return <div style={{ alignSelf: "center", fontSize: 9.5, fontWeight: 700, color: "#7a8378", background: "rgba(255,255,255,.7)", padding: "3px 10px", borderRadius: 8, marginBottom: 13 }}>{children}</div>;
}
function DOut({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 13, direction: "rtl" }}>
      <div style={{ maxWidth: "80%", padding: "9px 13px", borderRadius: "18px 7px 18px 18px", background: "#dcf1e7", color: "#0a3a29", fontSize: 13.5, lineHeight: 1.55, textAlign: "right" }}>{children}</div>
    </div>
  );
}
function DIn({ children, name }: { children: React.ReactNode; name?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 13, direction: "rtl" }}>
      {name && <span style={{ fontSize: 10, color: "#0a8a5f", fontWeight: 700, margin: "0 6px 4px 0" }}>كريم</span>}
      <div style={{ maxWidth: "84%", padding: "9px 13px", borderRadius: "7px 18px 18px 18px", background: "#fff", color: "#10231b", fontSize: 13.5, lineHeight: 1.6, border: "1px solid #ebf2ee", boxShadow: "0 2px 7px rgba(13,42,32,.05)", textAlign: "right" }}>{children}</div>
    </div>
  );
}
function DChip({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 13, direction: "rtl" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", borderRadius: 11, background: solid ? "#e4f4ec" : "#eef4f1", border: solid ? "1px solid #cfe6d9" : "1px dashed #bcdccd" }}>
        {solid ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a8a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5b8a76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
        )}
        <span style={{ fontSize: 12, color: solid ? "#0a8a5f" : "#5b7568", fontWeight: solid ? 700 : 600 }}>{children}</span>
      </div>
    </div>
  );
}
function DRecap() {
  const row = (label: string, qty: string, price: string, top?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: top ? "1px solid #f1f5f3" : undefined }}>
      <span style={{ fontSize: 12.5, color: "#2c4339" }}>{label} <span style={{ color: "#7c9088" }}>{qty}</span></span>
      <span style={{ fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>{price}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 13, direction: "rtl" }}>
      <div style={{ width: "86%", background: "#fff", border: "1px solid #e4efe9", borderRadius: 16, boxShadow: "0 8px 22px rgba(13,42,32,.07)", overflow: "hidden" }}>
        <div style={{ padding: "11px 15px", borderBottom: "1px solid #eef3f0", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: "#0e9f6e" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#10231b" }}>طلبك</span>
        </div>
        <div style={{ padding: "4px 15px 11px" }}>
          {row("كيكة الشوكولاتة الغنية", "×٢", "١٧٠ ج.م")}
          {row("عصير برتقان طازة", "×١", "٤٠ ج.م", true)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 2px", borderTop: "1px solid #e4efe9", marginTop: 2 }}>
            <span style={{ fontSize: 13, color: "#0a8a5f", fontWeight: 800 }}>الإجمالي</span>
            <span style={{ fontSize: 14, color: "#0a8a5f", fontWeight: 800 }}>٢١٠ ج.م</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HowCard({ n, title, body, icon }: { n: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ position: "absolute", top: 20, insetInlineStart: 22, fontSize: 34, fontWeight: 800, color: "rgba(14,159,110,.12)" }}>{n}</div>
      <div style={iconChip}>{icon}</div>
      <h3 style={{ fontSize: 17, fontWeight: 800, margin: "18px 0 0" }}>{title}</h3>
      <p style={{ fontSize: 13, color: "#5b6b64", fontWeight: 600, lineHeight: 1.7, margin: "9px 0 0" }}>{body}</p>
    </div>
  );
}
function Feat({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div style={featCard}>
      <div style={featChip}>{icon}</div>
      <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: "15px 0 0" }}>{title}</h3>
      <p style={{ fontSize: 12.5, color: "#5b6b64", fontWeight: 600, lineHeight: 1.65, margin: "8px 0 0" }}>{body}</p>
    </div>
  );
}
function Proof({ n, label }: { n: string; label: string }) {
  return <div style={{ borderRadius: 18, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 18px 44px -36px rgba(16,60,44,.34)", padding: "24px 18px" }}><div style={{ fontSize: 34, fontWeight: 800, color: "#0E9F6E" }}>{n}</div><div style={{ fontSize: 12, color: "#5b6b64", fontWeight: 700, marginTop: 6 }}>{label}</div></div>;
}
