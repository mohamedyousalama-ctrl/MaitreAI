"use client";

// ============================================================================
// Kivo — Login brand-panel animation. Three self-playing Karim chat scenes that
// play in sequence (A → B → C) and loop, replacing the login panel's static
// marketing block. Ported from the design-tool references (Kivo Scene A/B/C)
// but RE-IMPLEMENTED as CSS-only animation — transforms + opacity, no JS timers,
// no support.js runtime. Same technique as the landing hero: a shared phone
// frame whose message track auto-pans behind masked edges; scenes cross-fade on
// one 30s master timeline.
//
//   Scene A — objection handled («ده غالي» → Karim offers the mid size, closes)
//   Scene B — order changed mid-stream, the live recap total recalculates
//   Scene C — an indecisive customer is guided to a choice
//
// All dialogue is the real Egyptian copy from the scene files. RTL, IBM Plex
// Sans Arabic (the app's --font-arabic). prefers-reduced-motion freezes it to a
// single static scene-A frame with no looping/motion.
// ============================================================================

import type { CSSProperties } from "react";

const TOTAL = "30s";

const CSS = `
.lsc, .lsc * { box-sizing: border-box; }
@keyframes lscType { 0%,80%,100%{transform:translateY(0);opacity:.35} 40%{transform:translateY(-4px);opacity:1} }
/* scene cross-fades — three ~9.3s visible windows on a 30s master loop */
@keyframes lscFadeA { 0%{opacity:0} 2%{opacity:1} 31%{opacity:1} 33.3%{opacity:0} 100%{opacity:0} }
@keyframes lscFadeB { 0%,33.3%{opacity:0} 35.3%{opacity:1} 64.5%{opacity:1} 66.7%{opacity:0} 100%{opacity:0} }
@keyframes lscFadeC { 0%,66.7%{opacity:0} 68.7%{opacity:1} 98%{opacity:1} 99.6%{opacity:0} 100%{opacity:0} }
/* per-scene auto-pan (each pans only inside its own window; --pan set inline) */
@keyframes lscPanA { 0%,4%{transform:translateY(0)} 31%,100%{transform:translateY(var(--pan))} }
@keyframes lscPanB { 0%,37%{transform:translateY(0)} 63%,100%{transform:translateY(var(--pan))} }
@keyframes lscPanC { 0%,70.7%{transform:translateY(0)} 98%,100%{transform:translateY(var(--pan))} }
/* Scene-B live recap update — fires mid-B (~50% = 15s): qty 2→3, juice out,
   brownie in, total 100→130. "الحساب دايماً مظبوط". */
@keyframes lscOut50 { 0%,49%{opacity:1} 51%,100%{opacity:0} }
@keyframes lscIn50 { 0%,49%{opacity:0} 51.5%,100%{opacity:1} }
@keyframes lscCollapse50 { 0%,49%{max-height:46px;opacity:1} 52%,100%{max-height:0;opacity:0} }
@keyframes lscExpand50 { 0%,49.5%{max-height:0;opacity:0} 53%,100%{max-height:46px;opacity:1} }

.lsc-scene{position:absolute;inset:0;opacity:0}
.lsc-scene.a{animation:lscFadeA ${TOTAL} linear infinite}
.lsc-scene.b{animation:lscFadeB ${TOTAL} linear infinite}
.lsc-scene.c{animation:lscFadeC ${TOTAL} linear infinite}
.lsc-track{position:absolute;inset-inline:0;top:0;padding:14px 13px 16px;display:flex;flex-direction:column}
.lsc-track.a{animation:lscPanA ${TOTAL} linear infinite}
.lsc-track.b{animation:lscPanB ${TOTAL} linear infinite}
.lsc-track.c{animation:lscPanC ${TOTAL} linear infinite}
.lsc-type i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#0e9f6e;animation:lscType 1.2s ease-in-out infinite}
.lsc-type i:nth-child(2){animation-delay:.18s}
.lsc-type i:nth-child(3){animation-delay:.36s}
.lsc-cap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:9px;opacity:0}
.lsc-cap.a{animation:lscFadeA ${TOTAL} linear infinite}
.lsc-cap.b{animation:lscFadeB ${TOTAL} linear infinite}
.lsc-cap.c{animation:lscFadeC ${TOTAL} linear infinite}
.lsc-out50{animation:lscOut50 ${TOTAL} linear infinite}
.lsc-in50{animation:lscIn50 ${TOTAL} linear infinite}
.lsc-collapse50{animation:lscCollapse50 ${TOTAL} linear infinite;overflow:hidden}
.lsc-expand50{animation:lscExpand50 ${TOTAL} linear infinite;overflow:hidden}
@media (prefers-reduced-motion: reduce){
  /* Keep the gentle 3-scene cross-fade (opacity rotation is low-motion, not
     translation/parallax) so all three scenes still play and loop. Disable the
     heavy motion only: the track pan, the typing bounce, and the recap's
     slide/collapse — the recap shows its FINAL state (juice gone, brownie in,
     total 130) without movement. */
  .lsc-track,.lsc-type i,.lsc-out50,.lsc-in50,.lsc-collapse50,.lsc-expand50{animation:none!important}
  .lsc-track.a,.lsc-track.b,.lsc-track.c{transform:translateY(0)}
  .lsc-out50{opacity:0}.lsc-in50{opacity:1}
  .lsc-collapse50{max-height:0;opacity:0}.lsc-expand50{max-height:46px;opacity:1}
}
`;

// ── message atoms (RTL: customer = green on the right, Karim = white on left) ──
function Out({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 11, direction: "rtl" }}>
      <div style={{ maxWidth: "82%", padding: "8px 12px", borderRadius: "16px 6px 16px 16px", background: "#dcf1e7", color: "#0a3a29", fontSize: 13, lineHeight: 1.5, textAlign: "right" }}>{children}</div>
    </div>
  );
}
function In({ children, name, close }: { children: React.ReactNode; name?: boolean; close?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 11, direction: "rtl" }}>
      {name && <span style={{ fontSize: 9.5, color: "#0a8a5f", fontWeight: 700, margin: "0 6px 4px 0" }}>كريم</span>}
      <div style={{ maxWidth: "86%", padding: "8px 12px", borderRadius: "6px 16px 16px 16px", background: close ? "#e4f4ec" : "#fff", color: close ? "#0a6e4c" : "#10231b", fontSize: 13, lineHeight: 1.6, border: `1px solid ${close ? "#cfe6d9" : "#ebf2ee"}`, boxShadow: "0 2px 7px rgba(13,42,32,.05)", textAlign: "right" }}>{children}</div>
    </div>
  );
}
const cardShell: CSSProperties = { width: "88%", background: "#fff", border: "1px solid #e4efe9", borderRadius: 14, boxShadow: "0 8px 22px rgba(13,42,32,.07)", overflow: "hidden" };
const cardHead: CSSProperties = { padding: "10px 13px", borderBottom: "1px solid #eef3f0", display: "flex", alignItems: "center", gap: 8 };
const cardDot: CSSProperties = { width: 6, height: 6, borderRadius: 2, background: "#0e9f6e", flex: "none" };

export function LoginScenes() {
  return (
    <div className="lsc" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* phone frame (shared chrome; only the message track swaps per scene) */}
      <div style={{ width: 286, borderRadius: 34, background: "#0b1f18", padding: 9, boxShadow: "0 40px 80px -36px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)" }}>
        <div style={{ borderRadius: 27, overflow: "hidden", background: "#f6faf8" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: "#fff", borderBottom: "1px solid #eef3f0", direction: "rtl" }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: "linear-gradient(150deg,#13b07a,#0a6e4c)", display: "grid", placeItems: "center", flex: "none" }}>
              <svg width="17" height="17" viewBox="0 0 100 100" style={{ overflow: "visible" }} aria-hidden><path d="M22 52 L43 73 L80 28" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#10231b" }}>كريم</div>
              <div style={{ fontSize: 10, color: "#7c9088" }}>حلواني الدار</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#19c489", boxShadow: "0 0 0 3px rgba(25,196,137,.18)" }} />
              <span style={{ fontSize: 10, color: "#0a8a5f", fontWeight: 500 }}>متّصل</span>
            </div>
          </div>

          {/* body — masked window holding the three cross-fading scenes */}
          <div style={{ position: "relative", height: 336, overflow: "hidden", background: "linear-gradient(180deg,#f3f8f5,#e9f0eb)", WebkitMaskImage: "linear-gradient(to bottom,transparent 0,#000 8%,#000 93%,transparent 100%)", maskImage: "linear-gradient(to bottom,transparent 0,#000 8%,#000 93%,transparent 100%)" }}>

            {/* ── SCENE A — objection ── */}
            <div className="lsc-scene a">
              <div className="lsc-track a" style={{ "--pan": "-300px" } as CSSProperties}>
                <Out>عايز التورتة الكبيرة</Out>
                <In name>اختيار جميل! تورتة الدار الكبيرة بـ ٢٢٠ ج.م 🍰</In>
                <Out>بس ده غالي شوية</Out>
                <In>أفهمك تماماً 🙏 لو تحب، فيه التورتة الوسط بـ ١٤٥ ج.م — نفس الطعم وتكفي ٤ أشخاص. تحب أرشّحلك إيه؟</In>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 11, direction: "rtl" }}>
                  <div style={cardShell}>
                    <div style={cardHead}><span style={cardDot} /><span style={{ fontSize: 12, fontWeight: 700, color: "#10231b" }}>اختار اللي يناسبك</span></div>
                    <div style={{ padding: "8px 11px 11px", display: "flex", flexDirection: "column", gap: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", borderRadius: 10, background: "#e9f6f0", border: "1px solid #b9e2cf" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12.5, color: "#0a3a29", fontWeight: 700 }}>التورتة الوسط</span><span style={{ fontSize: 10.5, color: "#5b8a76" }}>نفس الطعم · تكفي ٤</span></span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}><span style={{ fontSize: 13.5, color: "#0a8a5f", fontWeight: 800 }}>١٤٥ ج.م</span><span style={{ fontSize: 9, color: "#0a8a5f", background: "#cfeadd", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>مُرشّح</span></span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", borderRadius: 10, background: "#f6faf8", border: "1px solid #eef3f0" }}>
                        <span style={{ fontSize: 12.5, color: "#2c4339", fontWeight: 600 }}>التورتة الكبيرة</span>
                        <span style={{ fontSize: 12.5, color: "#10231b", fontWeight: 700 }}>٢٢٠ ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>
                <Out>تمام هاخد الوسط</Out>
                <In close>ذوق رفيع 😋 ضفتهالك — تحب تكمّل؟</In>
              </div>
              <Typing />
            </div>

            {/* ── SCENE B — order changed, live total ── */}
            <div className="lsc-scene b">
              <div className="lsc-track b" style={{ "--pan": "-300px" } as CSSProperties}>
                <Out>عايز اتنين كوكيز وعصير ليمون</Out>
                <In name>تمام! اتنين كوكيز الدار وعصير ليمون 🍪🍋</In>
                {/* live recap card (updates mid-scene) */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 11, direction: "rtl" }}>
                  <div style={cardShell}>
                    <div style={cardHead}>
                      <span style={cardDot} /><span style={{ fontSize: 12, fontWeight: 700, color: "#10231b" }}>طلبك</span>
                      <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700, color: "#0a8a5f" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#19c489" }} />بيتحدّث</span>
                    </div>
                    <div style={{ padding: "3px 13px 9px" }}>
                      {/* cookies row — qty 2 → 3 */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                        <span style={{ fontSize: 12.5, color: "#2c4339" }}>كوكيز الدار <span style={{ color: "#7c9088" }}>×<Swap a="٢" b="٣" /></span></span>
                        <span style={{ position: "relative", display: "inline-block", minWidth: 58, height: "1.3em", textAlign: "left" }}>
                          <span className="lsc-out50" style={{ position: "absolute", insetInlineStart: 0, top: 0, fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>٧٠ ج.م</span>
                          <span className="lsc-in50" style={{ position: "absolute", insetInlineStart: 0, top: 0, opacity: 0, fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>١٠٥ ج.م</span>
                        </span>
                      </div>
                      {/* juice row — collapses out */}
                      <div className="lsc-collapse50">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f1f5f3" }}>
                          <span style={{ fontSize: 12.5, color: "#2c4339" }}>عصير ليمون <span style={{ color: "#7c9088" }}>×١</span></span>
                          <span style={{ fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>٣٠ ج.م</span>
                        </div>
                      </div>
                      {/* brownie row — expands in */}
                      <div className="lsc-expand50">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f1f5f3" }}>
                          <span style={{ fontSize: 12.5, color: "#2c4339" }}>براوني الدار <span style={{ color: "#7c9088" }}>×١</span></span>
                          <span style={{ fontSize: 12.5, color: "#10231b", fontWeight: 600 }}>٢٥ ج.م</span>
                        </div>
                      </div>
                      {/* total — 100 → 130 */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0 2px", borderTop: "1px solid #e4efe9", marginTop: 2 }}>
                        <span style={{ fontSize: 13, color: "#0a8a5f", fontWeight: 700 }}>الإجمالي</span>
                        <span style={{ position: "relative", display: "inline-block", minWidth: 72, height: "1.4em", textAlign: "left" }}>
                          <span className="lsc-out50" style={{ position: "absolute", insetInlineStart: 0, top: 0, fontSize: 14, color: "#0a8a5f", fontWeight: 800 }}>١٠٠ ج.م</span>
                          <span className="lsc-in50" style={{ position: "absolute", insetInlineStart: 0, top: 0, opacity: 0, fontSize: 14, color: "#0a8a5f", fontWeight: 800 }}>١٣٠ ج.م</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <Out>لا خليهم تلاتة كوكيز، وألغي العصير</Out>
                <In>اتعدّل ✅ تلاتة كوكيز الدار، والعصير اتشال.</In>
                <Out>وزود قطعة براوني</Out>
                <In close>ده طلبك النهائي: ٣ كوكيز + ١ براوني = ١٣٠ ج.م. أأكّده؟</In>
              </div>
              <Typing />
            </div>

            {/* ── SCENE C — indecisive ── */}
            <div className="lsc-scene c">
              <div className="lsc-track c" style={{ "--pan": "-250px" } as CSSProperties}>
                <Out>مش عارف اطلب ايه 😅</Out>
                <In name>ولا يهمك، أنا معاك 😊 تحب حاجة تشبع، ولا حاجة خفيفة مع القهوة؟</In>
                <Out>حاجة خفيفة</Out>
                <In>تمام! أرشّحلك تشيز كيك الدار — خفيفة ومش تقيلة، وبتمشي حلو مع القهوة ☕🍰</In>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 11, direction: "rtl" }}>
                  <div style={cardShell}>
                    <div style={cardHead}><span style={cardDot} /><span style={{ fontSize: 12, fontWeight: 700, color: "#10231b" }}>ترشيح كريم</span></div>
                    <div style={{ padding: "11px 13px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <span style={{ width: 38, height: 38, borderRadius: 11, background: "#f3e7d6", display: "grid", placeItems: "center", fontSize: 20 }}>🍰</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 13, color: "#0a3a29", fontWeight: 700 }}>تشيز كيك الدار</span><span style={{ fontSize: 10.5, color: "#5b8a76" }}>خفيفة · تمشي مع القهوة</span></span>
                      </div>
                      <span style={{ fontSize: 14.5, color: "#0a8a5f", fontWeight: 800 }}>٩٥ ج.م</span>
                    </div>
                  </div>
                </div>
                <Out>اه حلو</Out>
                <In close>اختيار موفّق 😋 ضفتهالك.</In>
              </div>
              <Typing />
            </div>
          </div>

          {/* input bar (static chrome) */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", background: "#fff", borderTop: "1px solid #eef3f0", direction: "rtl" }}>
            <div style={{ flex: 1, height: 34, borderRadius: 17, background: "#f1f5f3", display: "flex", alignItems: "center", padding: "0 14px" }}><span style={{ fontSize: 12, color: "#9bafa5" }}>اكتب رسالة…</span></div>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(150deg,#13b07a,#0a8a5f)", display: "grid", placeItems: "center", flex: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 13 21 3M21 3l-6.5 18-3.5-8-8-3.5L21 3z" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* rotating caption (one per scene) */}
      <div style={{ position: "relative", height: 22, width: "100%" }}>
        <Caption cls="a">بيفهم، مش بيضغط</Caption>
        <Caption cls="b">الحساب دايماً مظبوط</Caption>
        <Caption cls="c">بيساعد عميلك يختار</Caption>
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="lsc-type" style={{ position: "absolute", insetInlineEnd: 13, bottom: 12, display: "flex", alignItems: "center", gap: 4, padding: "9px 12px", borderRadius: "6px 16px 16px 16px", background: "#fff", border: "1px solid #ebf2ee", boxShadow: "0 2px 7px rgba(13,42,32,.05)", direction: "rtl" }}>
      <i /><i /><i />
    </div>
  );
}

function Swap({ a, b }: { a: string; b: string }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: "0.8em", height: "1.2em", verticalAlign: "-0.22em", overflow: "hidden" }}>
      <span className="lsc-out50" style={{ position: "absolute", insetInlineEnd: 0, top: 0 }}>{a}</span>
      <span className="lsc-in50" style={{ position: "absolute", insetInlineEnd: 0, top: 0, opacity: 0 }}>{b}</span>
    </span>
  );
}

function Caption({ cls, children }: { cls: "a" | "b" | "c"; children: React.ReactNode }) {
  return (
    <div className={`lsc-cap ${cls}`}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7ef0c4", flex: "none" }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.92)" }}>{children}</span>
    </div>
  );
}
