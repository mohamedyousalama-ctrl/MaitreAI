// ============================================================================
// Kivo — public landing page (root, public). Replaces the old MaitreAI marketing
// page with the Kivo landing design, pixel-faithful to "Kivo - Landing.dc.html".
// Public (no login wall) so visitors + platform reviewers see a real page. CTAs
// route to the real app on the SAME domain: ابدأ/ابدأ مع كريم → /onboarding,
// دخول → /login, اللوحة/شوف لوحة الرؤى → /insights (middleware bounces an
// unauthenticated visitor from /insights to /login).
//
// SiteFooter (City Baker LLC legal entity) is kept BELOW the Kivo brand footer —
// Meta verification depends on that legal block, so it isn't dropped. See PR note.
// Kivo design system: emerald, RTL, IBM Plex Sans Arabic (.kv-console font base).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Kivo — خلّي طلباتك ماشية",
  description:
    "كريم بيرد على عملاءك على واتساب باللهجة المصرية، بياخد الطلب ويقفله — وإنت بتوصّل وتحتفظ بالعمولة اللي كانت بتروح للوسطاء.",
};

// motion-✓ logo mark (reused at several sizes)
function Mark({ w = 23, h = 19, sw = 10, op = true }: { w?: number; h?: number; sw?: number; op?: boolean }) {
  return (
    <svg width={w} height={h} viewBox="0 0 80 64" fill="none" aria-hidden>
      <path d="M12 34 L27 50 L52 14" stroke="#fff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 12 H68" stroke="#fff" strokeWidth={sw * 0.7} strokeLinecap="round" />
      {op && <path d="M55 21 H70" stroke="#fff" strokeWidth={sw * 0.7} strokeLinecap="round" opacity=".6" />}
      {op && <path d="M60 30 H71" stroke="#fff" strokeWidth={sw * 0.7} strokeLinecap="round" opacity=".35" />}
    </svg>
  );
}

const Arrow = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h13M11 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const card: React.CSSProperties = { borderRadius: 20, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 22px 50px -38px rgba(16,60,44,.4)", padding: "26px 24px", position: "relative" };
const featCard: React.CSSProperties = { borderRadius: 18, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 18px 44px -36px rgba(16,60,44,.36)", padding: "22px 22px" };
const iconChip: React.CSSProperties = { width: 50, height: 50, borderRadius: 15, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" };
const featChip: React.CSSProperties = { width: 42, height: 42, borderRadius: 12, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" };
const pill = (light?: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 8, height: 26, padding: "0 13px", borderRadius: 99, background: light ? "rgba(255,255,255,.12)" : "rgba(14,159,110,.1)", color: light ? "#34c79c" : "#0a8a5f", fontSize: 11.5, fontWeight: 800 });
const navLink: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.82)", textDecoration: "none" };

const SCOPED_CSS = `
.kv-land h1,.kv-land h2,.kv-land h3{margin:0}
@keyframes kvFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes kvPulseL{0%,100%{box-shadow:0 0 0 0 rgba(52,199,156,.5)}50%{box-shadow:0 0 0 8px rgba(52,199,156,0)}}
@keyframes kvRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.kv-land .kvFloat{animation:kvFloat 6s ease-in-out infinite}
.kv-land .kvDot{animation:kvPulseL 1.9s infinite}
.kv-land [data-rise]{animation:kvRise .7s cubic-bezier(.2,.8,.2,1) backwards}
.kv-land .cta:hover{filter:brightness(.96);transform:translateY(-1px)}
.kv-land a.nl:hover{color:#fff}
@media (prefers-reduced-motion: reduce){.kv-land .kvFloat,.kv-land .kvDot,.kv-land [data-rise]{animation:none}}
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
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)" }}><Mark /></div>
            <div style={{ fontSize: 23, fontWeight: 800 }}>Kivo</div>
          </div>
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

          {/* WhatsApp demo phone */}
          <div data-rise style={{ display: "flex", justifyContent: "center" }}>
            <div className="kvFloat" style={{ width: 308, borderRadius: 40, background: "#0b1f18", padding: 11, boxShadow: "0 50px 100px -40px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)" }}>
              <div style={{ borderRadius: 31, overflow: "hidden", background: "#e7ded5" }}>
                <div style={{ background: "#0a8a5f", padding: "13px 14px", display: "flex", alignItems: "center", gap: 11, color: "#fff" }}>
                  <div style={{ width: 13 }} />
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}><Mark w={19} h={15} sw={11} op={false} /></div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 800 }}>كريم · سمَّاش هاوس</div><div style={{ fontSize: 9.5, opacity: .85, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ef0c4" }} />بيكتب…</div></div>
                </div>
                <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 9, background: "linear-gradient(180deg,#ece5db,#e3dacd)", minHeight: 420 }}>
                  <div style={{ alignSelf: "center", fontSize: 8.5, fontWeight: 700, color: "#7a8378", background: "rgba(255,255,255,.6)", padding: "3px 10px", borderRadius: 8 }}>النهارده ٨:٠٤ م</div>
                  <Bubble side="out">مساء الخير، عايز أطلب أكل لـ٤ أفراد</Bubble>
                  <Bubble side="in">مساء النور 🌙 كومبو العيلة بيكفي ٤، فيه ٤ ساندويتشات + بطاطس كبير + ٤ مشروبات بـ٢٢٠ ج.م. أجهّزهولك؟</Bubble>
                  <Bubble side="out">تمام، بس واحد منهم مايعرفش يأكل مكسرات</Bubble>
                  <Bubble side="in">حاضر، هكتب على الطلب «بدون مكسرات» وهبلّغ المطبخ. العنوان نفس آخر مرة في المهندسين؟</Bubble>
                  <Bubble side="out">أيوة نفس العنوان 👍</Bubble>
                  <Bubble side="in" wide>
                    <div style={{ fontWeight: 800, color: "#0a8a5f", marginBottom: 4 }}>طلبك اتأكّد ✓</div>
                    كومبو العيلة · بدون مكسرات<br />٢٢٠ ج.م + توصيل ٢٠ = <b>٢٤٠ ج.م</b><br />دفع عند الاستلام · هيوصلك خلال ٣٥ دقيقة 🛵
                  </Bubble>
                </div>
              </div>
            </div>
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
          <div style={{ display: "grid", placeItems: "center" }}><Mark w={44} h={35} /></div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}><Mark w={18} h={15} sw={11} op={false} /></div><div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Kivo</div></div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>خلّي طلباتك ماشية</span>
          <div style={{ marginInlineStart: "auto", display: "flex", gap: 22, fontSize: 12, fontWeight: 700 }}>
            <a href="#how" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>إزاي بيشتغل</a>
            <Link href="/insights" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>اللوحة</Link>
            <Link href="/login" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>دخول</Link>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "14px 32px", textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>© ٢٠٢٦ Kivo · كل الطلبات على واتساب، من غير عمولة وسطاء</div>
      </footer>

      {/* Legal entity (City Baker LLC) — kept for Meta verification; see PR note. */}
      <SiteFooter />
    </div>
  );
}

// ── pieces ──
function Stat({ big, label }: { big: string; label: string }) {
  return <div><div className="kv-num" style={{ fontSize: 24, fontWeight: 800 }}>{big}</div><div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.7)", marginTop: 2 }}>{label}</div></div>;
}
const Sep = () => <div style={{ width: 1, height: 34, background: "rgba(255,255,255,.18)" }} />;

function Bubble({ side, wide, children }: { side: "in" | "out"; wide?: boolean; children: React.ReactNode }) {
  const out = side === "out";
  return (
    <div style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: wide ? "86%" : out ? "80%" : "82%" }}>
      <div style={{ background: out ? "#d6fdd0" : "#fff", borderRadius: out ? "11px 11px 4px 11px" : "11px 11px 11px 4px", padding: "8px 11px", fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, boxShadow: "0 1px 1px rgba(0,0,0,.08)" }}>{children}</div>
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
