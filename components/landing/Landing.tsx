"use client";

// ============================================================================
// getkivo.io — the public Kivo landing (WO-C4-LANDING). Emerald identity, Arabic
// default with an English toggle, and an Egypt↔KSA country toggle that only swaps
// FACTS (currency + payment methods). Structure + messaging + claim discipline per
// docs/product/LANDING_BRIEF.md (§1/§3/§5). Mobile-first, static-fast (no heavy
// media; the hero demo is pure CSS). Honest-proof rule: no fabricated metrics —
// social proof we don't have carries the [بيانات حقيقية مطلوبة] placeholder.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { KivoMark, KivoWordmark } from "@/components/brand/KivoLogo";
import { IntroReveal } from "@/components/brand/IntroReveal";
import { HeroDemo } from "./HeroDemo";
import { COPY, FACTS, CONTACT_LINK, NEEDS_REAL_DATA, type Lang, type Country } from "./copy";

const SCOPED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&display=swap');
.kv-land h1,.kv-land h2,.kv-land h3{margin:0}
@keyframes kvFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes kvPulseL{0%,100%{box-shadow:0 0 0 0 rgba(52,199,156,.5)}50%{box-shadow:0 0 0 8px rgba(52,199,156,0)}}
@keyframes kvRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
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
@media (max-width:880px){
  .kv-land .heroGrid,.kv-land .valGrid{grid-template-columns:1fr !important}
  .kv-land .trio,.kv-land .brainGrid,.kv-land .problemGrid{grid-template-columns:1fr !important}
  .kv-land .navlinks{display:none !important}
  .kv-land .heroH1{font-size:38px !important}
}
`;

const Arrow = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h13M11 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const card: React.CSSProperties = { borderRadius: 20, background: "#fff", border: "1px solid #e3efe9", boxShadow: "0 22px 50px -38px rgba(16,60,44,.4)", padding: "24px 22px", position: "relative" };
const pill = (light?: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 8, height: 28, padding: "0 14px", borderRadius: 99, background: light ? "rgba(255,255,255,.12)" : "rgba(14,159,110,.1)", color: light ? "#eafff6" : "#0a8a5f", fontSize: 11.5, fontWeight: 800 });
const navLink: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.82)", textDecoration: "none" };
const toggleBtn = (on: boolean): React.CSSProperties => ({ height: 28, padding: "0 11px", borderRadius: 8, border: "1px solid rgba(255,255,255,.22)", background: on ? "#fff" : "transparent", color: on ? "#0a8a5f" : "rgba(255,255,255,.85)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });

export function Landing() {
  const [lang, setLang] = useState<Lang>("ar");
  const [country, setCountry] = useState<Country>("eg");
  const c = COPY[lang];
  const f = FACTS[country];
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="kv-console kv-land" dir={dir} lang={lang} style={{ background: "#eef5f1", color: "#0f2a20" }}>
      <IntroReveal />
      <style dangerouslySetInnerHTML={{ __html: SCOPED_CSS }} />

      {/* ===== HERO ===== */}
      <section style={{ position: "relative", overflow: "hidden", color: "#fff", background: "radial-gradient(900px 600px at 82% -6%,rgba(31,181,133,.32),transparent 58%),radial-gradient(800px 700px at 6% 110%,rgba(10,138,95,.4),transparent 60%),linear-gradient(155deg,#0c4d38,#0a3a2a 60%,#072a1e)" }}>
        <nav style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "20px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/" aria-label="Kivo" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}><KivoWordmark size={28} ink="#fff" /></Link>
          <div className="navlinks" style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 22 }}>
            <a className="nl" href="#how" style={navLink}>{c.nav.how}</a>
            <a className="nl" href="#brain" style={navLink}>{c.nav.brain}</a>
            <a className="nl" href="#safety" style={navLink}>{c.nav.safety}</a>
          </div>
          {/* language + country toggles */}
          <div style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} style={toggleBtn(false)} aria-label="language">{c.langToggle}</button>
            <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 10, background: "rgba(255,255,255,.08)" }}>
              <button onClick={() => setCountry("eg")} style={toggleBtn(country === "eg")}>{c.countryToggle.eg}</button>
              <button onClick={() => setCountry("ksa")} style={toggleBtn(country === "ksa")}>{c.countryToggle.ksa}</button>
            </div>
            <a href={CONTACT_LINK} className="cta" style={{ height: 38, padding: "0 15px", borderRadius: 10, background: "#fff", color: "#0a8a5f", fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{c.nav.start}</a>
          </div>
        </nav>

        <div className="heroGrid" style={{ position: "relative", maxWidth: 1180, margin: "0 auto", padding: "40px 24px 88px", display: "grid", gridTemplateColumns: "1.08fr .92fr", gap: 44, alignItems: "center" }}>
          <div data-rise>
            <div style={{ ...pill(true), border: "1px solid rgba(255,255,255,.2)", height: 30, fontWeight: 700 }}>
              <span className="kvDot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#34c79c" }} />{c.hero.badge}
            </div>
            <h1 className="heroH1" style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.2, margin: "20px 0 0" }}>
              {c.hero.h1.map((line, i) => <span key={i}>{i === c.hero.h1.length - 1 ? <span style={{ color: "#34c79c" }}>{line}</span> : line}<br /></span>)}
            </h1>
            <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,.85)", lineHeight: 1.75, margin: "20px 0 0", maxWidth: 500 }}>{c.hero.wedge}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
              <a href={CONTACT_LINK} className="cta" style={{ height: 52, padding: "0 24px", borderRadius: 14, background: "#fff", color: "#0a8a5f", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", boxShadow: "0 20px 40px -18px rgba(0,0,0,.5)" }}>{c.hero.ctaPrimary}<Arrow /></a>
            </div>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7ef0c4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 4 6v6c0 4 3 6.5 8 9 5-2.5 8-5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
              {c.hero.trust}
            </p>
          </div>
          <div data-rise style={{ display: "flex", justifyContent: "center" }}><HeroDemo /></div>
        </div>
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden style={{ display: "block", width: "100%", height: 60 }}><path d="M0 80 L0 38 C 240 4 480 4 720 36 C 960 68 1200 68 1440 30 L1440 80 Z" fill="#eef5f1" /></svg>
      </section>

      {/* ===== PROBLEM STRIP ===== */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 24px 8px" }}>
        <div data-rise style={{ textAlign: "center" }}>
          <div style={pill()}>{c.problem.kicker}</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: "12px 0 0" }}>{c.problem.title}</h2>
        </div>
        <div className="problemGrid" data-rise style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 26 }}>
          {c.problem.items.map((p, i) => (
            <div key={i} style={{ ...card, borderColor: "#f0d9cf" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#c0492f" }}>{p.stat}</div>
              <p style={{ fontSize: 13, color: "#5b6b64", fontWeight: 600, lineHeight: 1.7, margin: "8px 0 0" }}>{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 20px" }}>
        <div data-rise style={{ textAlign: "center" }}>
          <div style={pill()}>{c.how.kicker}</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 0" }}>{c.how.title}</h2>
          <p style={{ fontSize: 14.5, color: "#5b6b64", fontWeight: 600, margin: "10px 0 0" }}>{c.how.sub}</p>
        </div>
        <div className="trio" data-rise style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 30 }}>
          {c.how.steps.map((s) => (
            <div key={s.n} style={card}>
              <div style={{ position: "absolute", top: 18, insetInlineStart: 20, fontSize: 32, fontWeight: 800, color: "rgba(14,159,110,.12)" }}>{s.n}</div>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.5A8 8 0 1 1 20 11.5Z" /></svg>
              </div>
              <h3 style={{ fontSize: 16.5, fontWeight: 800, margin: "16px 0 0" }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: "#5b6b64", fontWeight: 600, lineHeight: 1.7, margin: "8px 0 0" }}>{s.body}</p>
            </div>
          ))}
        </div>
        {/* console illustration (UI mock, not fabricated data) */}
        <div data-rise style={{ marginTop: 22, borderRadius: 20, overflow: "hidden", border: "1px solid #e3efe9", background: "#fff", boxShadow: "0 30px 70px -50px rgba(16,60,44,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#f4f9f6", borderBottom: "1px solid #e6efea" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#0e9f6e" }} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0f2a20" }}>{c.how.consoleCap}</span>
          </div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {["#١٠٠٤", "#١٠٠٥", "#١٠٠٦"].map((no, i) => (
              <div key={i} style={{ borderRadius: 12, border: "1px solid #e6efea", padding: 12, background: "#fbfdfc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{no}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? "#0a8a5f" : "#8a6a14", background: i === 0 ? "rgba(14,159,110,.12)" : "rgba(216,151,43,.14)", padding: "2px 8px", borderRadius: 99 }}>{i === 0 ? (lang === "ar" ? "جديد" : "New") : (lang === "ar" ? "قيد التنفيذ" : "In progress")}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "#5b6b64", marginTop: 8, lineHeight: 1.6 }}>{lang === "ar" ? "٣ أصناف · توصيل" : "3 items · delivery"}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0a8a5f", marginTop: 8 }}>{f.sampleOrder} {f.currency[lang]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BEYOND THE CHATBOT (brain) ===== */}
      <section id="brain" style={{ background: "linear-gradient(180deg,#eef5f1,#e6efea)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 24px" }}>
          <div data-rise style={{ textAlign: "center" }}>
            <div style={pill()}>{c.brain.kicker}</div>
            <h2 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 0" }}>{c.brain.title}</h2>
            <p style={{ fontSize: 14.5, color: "#5b6b64", fontWeight: 600, margin: "10px 0 0" }}>{c.brain.sub}</p>
          </div>
          <div className="brainGrid" data-rise style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 30 }}>
            {c.brain.items.map((b, i) => (
              <div key={i} style={{ ...card, boxShadow: "0 16px 40px -34px rgba(16,60,44,.34)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(150deg,#d6f4ea,#bdebda)", display: "grid", placeItems: "center" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0a8a5f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                </div>
                <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: "14px 0 0" }}>{b.title}</h3>
                <p style={{ fontSize: 12.5, color: "#5b6b64", fontWeight: 600, lineHeight: 1.65, margin: "7px 0 0" }}>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SAFETY & TRUST ===== */}
      <section id="safety" style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 24px" }}>
        <div data-rise style={{ borderRadius: 26, overflow: "hidden", background: "linear-gradient(155deg,#0c4d38,#0a3a2a)", color: "#fff", padding: "40px 40px", boxShadow: "0 40px 90px -50px rgba(10,58,42,.8)" }}>
          <div style={pill(true)}>{c.safety.kicker}</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: "16px 0 0" }}>{c.safety.title}</h2>
          <p style={{ fontSize: 14.5, color: "rgba(255,255,255,.82)", fontWeight: 600, lineHeight: 1.7, margin: "12px 0 0", maxWidth: 560 }}>{c.safety.body}</p>
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            {c.safety.points.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 14, background: "rgba(52,199,156,.1)", border: "1px solid rgba(52,199,156,.28)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7ef0c4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }} aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.92)", lineHeight: 1.6 }}>{p}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{f.pay[lang]}</div>
        </div>
      </section>

      {/* ===== PROOF (honest — no fabricated metrics) ===== */}
      <section style={{ background: "linear-gradient(180deg,#eef5f1,#e3ede8)" }}>
        <div data-rise style={{ maxWidth: 900, margin: "0 auto", padding: "46px 24px", textAlign: "center" }}>
          <div style={pill()}>{c.proof.kicker}</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: "12px 0 0" }}>{c.proof.title}</h2>
          <p style={{ fontSize: 15, color: "#0f3a2a", fontWeight: 700, margin: "14px 0 0" }}>{c.proof.neutral}</p>
          {/* Honest placeholder — a named client story is not published until real + permitted. */}
          <div style={{ marginTop: 22, borderRadius: 18, border: "1px dashed #b9d4c7", background: "#fff", padding: "22px 20px", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#5b6b64" }}>{c.proof.metricLabel}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#c0492f", fontFamily: "'Sora',var(--font-arabic),system-ui" }}>{NEEDS_REAL_DATA[lang]}</span>
          </div>
          <p style={{ fontSize: 12, color: "#8a988f", fontWeight: 600, marginTop: 18, maxWidth: 560, marginInline: "auto", lineHeight: 1.6 }}>{c.proof.disclaimer}</p>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 56px" }}>
        <div data-rise style={{ position: "relative", overflow: "hidden", borderRadius: 26, background: "radial-gradient(700px 400px at 85% 0%,rgba(52,199,156,.3),transparent 60%),linear-gradient(150deg,#0c9468,#0a7a55 60%,#0a5f44)", color: "#fff", padding: "46px 40px", textAlign: "center", boxShadow: "0 40px 90px -50px rgba(10,138,95,.8)" }}>
          <div style={{ display: "grid", placeItems: "center" }}><KivoMark size={50} tone="white" title="Kivo" /></div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: "16px 0 0" }}>{c.cta.title}</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,.85)", fontWeight: 600, margin: "12px auto 0", maxWidth: 460, lineHeight: 1.7 }}>{c.cta.body}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 26, flexWrap: "wrap" }}>
            <a href={CONTACT_LINK} className="cta" style={{ height: 52, padding: "0 26px", borderRadius: 14, background: "#fff", color: "#0a8a5f", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", boxShadow: "0 20px 40px -18px rgba(0,0,0,.4)" }}>{c.cta.primary}<Arrow /></a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER (legal + City Baker LLC) ===== */}
      <footer style={{ background: "#072a1e", color: "rgba(255,255,255,.7)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "30px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}><KivoMark size={20} tone="white" sheen={false} title="Kivo" /></div>
            <KivoWordmark size={18} ink="#fff" />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>{c.footer.tagline}</span>
          <div style={{ marginInlineStart: "auto", display: "flex", gap: 20, fontSize: 12, fontWeight: 700, flexWrap: "wrap" }}>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>{c.footer.links.privacy}</Link>
            <Link href="/terms" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>{c.footer.links.terms}</Link>
            <Link href="/data-deletion" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>{c.footer.links.dataDeletion}</Link>
            <Link href="/contact" style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>{c.footer.links.contact}</Link>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "14px 24px", textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
          © ٢٠٢٦ {c.footer.legal} · Kivo · {c.footer.rights}
        </div>
      </footer>
    </div>
  );
}
