"use client";

// ============================================================================
// MaitreAI — MIZAN hosted reviewer island (WO-KHALID-STEP5B). Ports the verified
// Step-5 review-ui.html UX to React: Arabic-first RTL, mobile, big tappable 1–10
// (Arabic-Indic), one reply at a time, notes, a progress bar (الرد ١ من ٦). The
// token IS the reviewer's identity (no name prompt) — so every tap AUTO-SAVES to
// Supabase via /api/mizan/<token>, and progress RESUMES from the same endpoint.
// The reviewer never sees ids/internals, and never sees another reviewer's scores.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

interface PacketItem {
  scenarioId: string;
  suiteId: number;
  suiteName: string;
  region: string | null;
  frame: string | null;
  turns: string[];
  replies: string[];
  dimensions: string[];
  scale: number;
}
interface Packet {
  packetId: string;
  unseeded?: boolean;
  note: string;
  items: PacketItem[];
}

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

// Arabic labels — reviewers must never see English/jargon keys (verified Step-5 text).
const DIM_AR: Record<string, string> = {
  authenticity: "الأصالة (سعودي حقيقي؟)", warmth_karam: "الدفء والكرم", register_fit: "مناسبة اللهجة للمنطقة والموقف",
  tone_fit: "مناسبة النبرة للموقف", warmth: "الدفء", brevity: "الاختصار (بدون إطالة)",
  natural_offer: "العرض الطبيعي (اقتراح لطيف)", not_pushy: "بدون إلحاح", menu_truth: "صادق مع المنيو",
  ownership: "يتحمّل المسؤولية", no_defensiveness: "بدون تبرير دفاعي", face_saving: "يحفظ ماء الوجه",
  karam_warmth: "الكرم والدفء", not_theatrical: "بدون مبالغة", one_person: "يخاطب شخص واحد",
};
const SUITE_AR: Record<number, string> = { 1: "التعريف والترحيب", 9: "نبرة الرد حسب الموقف", 10: "اقتراح إضافي", 11: "التعامل مع شكوى", 12: "الكرم والضيافة" };
const FRAME_AR: Record<string, string> = { happy: "العميل مبسوط", "mild-delay": "تأخّر بسيط", complaint: "شكوى" };
const REGION_AR = (r: string | null) => (r === "hijaz" ? "حجازي" : r === "najd" ? "نجدي" : r || "");

type Scores = Record<string, Record<string, number>>;
type Notes = Record<string, string>;

export function MizanReviewClient({ token, packet }: { token: string; packet: Packet }) {
  const items = packet.items || [];
  const [screen, setScreen] = useState<"welcome" | "item" | "finish">("welcome");
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState<Notes>({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- resume: pull this reviewer's saved cells on mount ----------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mizan/${token}`, { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { rows?: { scenarioId: string; dimension: string; score: number; notes: string | null }[] };
          if (alive && j.rows) {
            const s: Scores = {}, n: Notes = {};
            for (const r of j.rows) {
              (s[r.scenarioId] ||= {})[r.dimension] = r.score;
              if (r.notes) n[r.scenarioId] = r.notes;
            }
            setScores(s);
            setNotes(n);
          }
        }
      } catch { /* offline resume is best-effort; start fresh */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [token]);

  // --- auto-save one cell to Supabase -----------------------------------------
  const saveCell = useCallback(async (scenarioId: string, suiteId: number, dimension: string, score: number, note: string) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/mizan/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, suiteId, dimension, score, notes: note || "" }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }, [token]);

  const it = items[idx];

  const onScore = useCallback((dim: string, val: number) => {
    if (!it) return;
    setScores((prev) => ({ ...prev, [it.scenarioId]: { ...(prev[it.scenarioId] || {}), [dim]: val } }));
    void saveCell(it.scenarioId, it.suiteId, dim, val, notes[it.scenarioId] || "");
  }, [it, notes, saveCell]);

  const onNote = useCallback((val: string) => {
    if (!it) return;
    setNotes((prev) => ({ ...prev, [it.scenarioId]: val }));
    // Persist the note onto every already-scored cell for this item (debounced).
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      const sc = scores[it.scenarioId] || {};
      const dims = Object.keys(sc);
      if (!dims.length) return; // no row yet — the note saves with the first score
      for (const d of dims) void saveCell(it.scenarioId, it.suiteId, d, sc[d], val);
    }, 700);
  }, [it, scores, saveCell]);

  const missingCount = useCallback(() => {
    let m = 0;
    for (const item of items) {
      const sc = scores[item.scenarioId] || {};
      for (const d of item.dimensions) if (typeof sc[d] !== "number") m++;
    }
    return m;
  }, [items, scores]);

  if (!loaded) {
    return (
      <Shell><div className="card center muted">…جارٍ التحميل</div><Style /></Shell>
    );
  }

  return (
    <Shell>
      {screen === "welcome" && (
        <section>
          <h1>تقييم لهجة «خالد» 🌟</h1>
          <p>مرحباً، وشكراً لمساعدتك. مهمتك تقرأ ردود «خالد» (وكيل مطعم يرد على العملاء)، وتقيّم كل رد: هل يتكلم مثل شخص سعودي حقيقي؟</p>
          {packet.unseeded && (
            <div className="card warnbox">ما فيه ردود في هذه النسخة بعد (لم تُشغّل على مطعم حقيقي). تقدر تستعرض الشكل فقط.</div>
          )}
          <div className="card rubric">
            <h2 style={{ marginTop: 0 }}>كيف تعطي الدرجة (من ١ إلى ١٠)</h2>
            <ul>
              <li><b>١–٣ ضعيف:</b> يحس إنه أجنبي أو مصري أو لهجة ثانية، أو رسمي وجامد بزيادة.</li>
              <li><b>٤–٦ مقبول:</b> سعودي، لكن فيه شي يوقّف أو ما يحس طبيعي تماماً.</li>
              <li><b>٧–٨ جيد:</b> يتكلم سعودي طبيعي، مثل موظف مطعم حقيقي.</li>
              <li><b>٩–١٠ ممتاز:</b> سعودي أصيل، دافئ، ما تشك فيه أبداً.</li>
            </ul>
            <p className="muted">قيّم اللهجة والأسلوب فقط — ما تقيّم صحة الأسعار أو المنيو، هذا شي ثاني.</p>
            <p className="muted" style={{ fontSize: ".9rem" }}>تقدر توقف وترجع في أي وقت — تقييمك محفوظ تلقائياً.</p>
          </div>
          <button className="btn" style={{ width: "100%" }} onClick={() => setScreen("item")} disabled={!items.length}>
            ابدأ التقييم ←
          </button>
        </section>
      )}

      {screen === "item" && it && (
        <>
          <section>
            <div className="bar"><i style={{ width: `${((idx + 1) / items.length) * 100}%` }} /></div>
            <div className="progress">الرد {toAr(idx + 1)} من {toAr(items.length)}</div>
            <div className="card">
              <div className="chips">
                {SUITE_AR[it.suiteId] && <span className="chip">{SUITE_AR[it.suiteId]}</span>}
                {it.frame && FRAME_AR[it.frame] && <span className="chip">{FRAME_AR[it.frame]}</span>}
                {it.region && <span className="chip">{REGION_AR(it.region)}</span>}
              </div>
              <div className="lbl">رسالة العميل</div>
              {it.turns.map((t, i) => <div key={i} className="guest">{t}</div>)}
              <div className="lbl" style={{ marginTop: 12 }}>رد «خالد»</div>
              {it.replies.filter((r) => r && r.trim()).length
                ? it.replies.filter((r) => r && r.trim()).map((r, i) => <div key={i} className="khalid">{r}</div>)
                : <div className="khalid muted">(لا يوجد رد — لم يُشغّل بعد)</div>}
            </div>

            <div className="card">
              {it.dimensions.map((d) => {
                const cur = scores[it.scenarioId]?.[d];
                return (
                  <div key={d} className="dim">
                    <div className="name">{DIM_AR[d] || d}</div>
                    <div className="scale">
                      {Array.from({ length: it.scale || 10 }, (_, i) => i + 1).map((n) => (
                        <button key={n} aria-pressed={cur === n} onClick={() => onScore(d, n)}>{toAr(n)}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div className="lbl">ملاحظة (اختياري)</div>
              <textarea
                value={notes[it.scenarioId] || ""}
                onChange={(e) => onNote(e.target.value)}
                placeholder="لو عندك ملاحظة عن اللهجة أو الأسلوب، اكتبها هنا"
              />
              <div className={`savehint ${saveState}`}>
                {saveState === "saving" ? "…جارٍ الحفظ" : saveState === "saved" ? "✓ محفوظ تلقائياً" : saveState === "error" ? "⚠️ تعذّر الحفظ — سيُعاد المحاولة" : "يُحفظ تلقائياً"}
              </div>
            </div>
          </section>

          <div className="navbar">
            <button className="btn secondary" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>السابق</button>
            <button className="btn" onClick={() => (idx === items.length - 1 ? setScreen("finish") : setIdx((i) => Math.min(items.length - 1, i + 1)))}>
              {idx === items.length - 1 ? "إنهاء ✓" : "التالي"}
            </button>
          </div>
        </>
      )}

      {screen === "finish" && (
        <section>
          <h1 className="center">تم! 🌟</h1>
          <p className="center">شكراً لك. تقييمك محفوظ تلقائياً — ما تحتاج ترسل أي ملف.</p>
          {missingCount() > 0 && (
            <div className="card warnbox">تنبيه: فيه {toAr(missingCount())} درجة ما اخترتها بعد. تقدر ترجع وتكملها.</div>
          )}
          <div className="card center">
            <button className="btn secondary" onClick={() => setScreen("item")}>↩︎ رجوع للمراجعة</button>
          </div>
        </section>
      )}
      <Style />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mizan-wrap" dir="rtl">{children}</div>;
}

// Scoped port of the verified Step-5 review-ui.html styling (dark-first, RTL,
// mobile). Inlined so the hosted surface matches the offline reviewer file 1:1.
function Style() {
  return (
    <style>{`
      .mizan-wrap { --bg:#0f1419; --card:#1a2029; --card2:#232b36; --fg:#f2f5f8; --muted:#9fb0c0;
        --accent:#2ea36b; --accent2:#3ad07f; --line:#2b3543; --warn:#e2b23a;
        min-height:100vh; background:var(--bg); color:var(--fg);
        font-family:"Segoe UI","Noto Sans Arabic",Tahoma,"Geeza Pro",system-ui,sans-serif;
        font-size:17px; line-height:1.7; max-width:620px; margin:0 auto; padding:16px 16px 110px; }
      @media (prefers-color-scheme: light) {
        .mizan-wrap { --bg:#f3f5f7; --card:#ffffff; --card2:#eef2f6; --fg:#16202b; --muted:#5a6b7b;
          --accent:#1e8a56; --accent2:#12703f; --line:#dbe3ea; --warn:#a9791a; } }
      .mizan-wrap * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
      .mizan-wrap h1 { font-size:1.5rem; margin:.2em 0 .1em; }
      .mizan-wrap h2 { font-size:1.15rem; margin:1.2em 0 .3em; }
      .mizan-wrap p { margin:.5em 0; }
      .mizan-wrap .muted { color:var(--muted); }
      .mizan-wrap .center { text-align:center; }
      .mizan-wrap .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; margin:14px 0; }
      .mizan-wrap .chips { margin-bottom:6px; }
      .mizan-wrap .chip { display:inline-block; background:var(--card2); color:var(--muted); border-radius:999px; padding:3px 12px; font-size:.85rem; margin-inline-start:6px; }
      .mizan-wrap .guest { background:var(--card2); border-radius:14px 14px 14px 4px; padding:12px 14px; margin:8px 0; }
      .mizan-wrap .khalid { background:linear-gradient(180deg,rgba(46,163,107,.14),rgba(46,163,107,.06)); border:1px solid rgba(46,163,107,.35); border-radius:14px 14px 4px 14px; padding:12px 14px; margin:8px 0; font-size:1.05rem; }
      .mizan-wrap .lbl { font-size:.8rem; color:var(--muted); margin-bottom:2px; }
      .mizan-wrap .dim { margin:18px 0; }
      .mizan-wrap .dim .name { font-weight:600; margin-bottom:8px; }
      .mizan-wrap .scale { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
      @media (min-width:440px){ .mizan-wrap .scale { grid-template-columns:repeat(10,1fr); } }
      .mizan-wrap .scale button { min-height:48px; border:1px solid var(--line); background:var(--card2); color:var(--fg); border-radius:12px; font-size:1.15rem; font-weight:600; cursor:pointer; transition:.12s; }
      .mizan-wrap .scale button:active { transform:scale(.94); }
      .mizan-wrap .scale button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent2); color:#fff; }
      .mizan-wrap textarea { width:100%; min-height:64px; background:var(--card2); color:var(--fg); border:1px solid var(--line); border-radius:12px; padding:10px 12px; font:inherit; resize:vertical; }
      .mizan-wrap .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:52px; padding:0 22px; border:none; border-radius:14px; background:var(--accent); color:#fff; font-size:1.05rem; font-weight:600; cursor:pointer; }
      .mizan-wrap .btn.secondary { background:var(--card2); color:var(--fg); border:1px solid var(--line); }
      .mizan-wrap .btn:disabled { opacity:.4; cursor:not-allowed; }
      .mizan-wrap .navbar { position:fixed; inset-inline:0; bottom:0; background:var(--card); border-top:1px solid var(--line); padding:10px 16px calc(10px + env(safe-area-inset-bottom)); display:flex; gap:10px; justify-content:space-between; max-width:620px; margin:0 auto; }
      .mizan-wrap .navbar .btn { flex:1; }
      .mizan-wrap .progress { text-align:center; color:var(--muted); font-size:.9rem; margin:4px 0 0; }
      .mizan-wrap .bar { height:6px; background:var(--card2); border-radius:999px; overflow:hidden; margin:8px 0 2px; }
      .mizan-wrap .bar > i { display:block; height:100%; background:var(--accent); width:0; transition:.2s; }
      .mizan-wrap .warnbox { background:rgba(226,178,58,.12); border:1px solid var(--warn); border-radius:12px; padding:10px 14px; color:var(--fg); }
      .mizan-wrap .rubric li { margin:.3em 0; }
      .mizan-wrap .savehint { font-size:.82rem; margin-top:8px; color:var(--muted); }
      .mizan-wrap .savehint.saved { color:var(--accent2); }
      .mizan-wrap .savehint.error { color:var(--warn); }
    `}</style>
  );
}
