"use client";

// ============================================================================
// MaitreAI — MIZAN hosted reviewer island (WO-KHALID-STEP5B + WO-MIZAN-VOICE).
// Arabic-first RTL, mobile. Reviewers read Khalid's captured reply AND hear its
// production-voice rendering, then score text + voice (1–10 Arabic-Indic). Every tap
// AUTO-SAVES to Supabase via /api/mizan/<token>; progress RESUMES from the same route.
// A final voice_compare item plays one greeting in 3 candidate voices (labeled
// صوت ١/٢/٣, shuffled per reviewer) for the "which sounds most Saudi?" pick. Each reply
// item also offers an OPTIONAL mic recording of the reviewer's own pronunciation.
// The reviewer never sees ids/internals, and never sees another reviewer's data.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  audioUrl?: string | null;
  kind?: string;
  prompt?: string;
  compareText?: string;
  voiceClips?: string[];
}
interface Packet {
  packetId: string;
  unseeded?: boolean;
  note: string;
  items: PacketItem[];
}

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

const DIM_AR: Record<string, string> = {
  authenticity: "الأصالة (سعودي حقيقي؟)", warmth_karam: "الدفء والكرم", register_fit: "مناسبة اللهجة للمنطقة والموقف",
  tone_fit: "مناسبة النبرة للموقف", warmth: "الدفء", brevity: "الاختصار (بدون إطالة)",
  natural_offer: "العرض الطبيعي (اقتراح لطيف)", not_pushy: "بدون إلحاح", menu_truth: "صادق مع المنيو",
  ownership: "يتحمّل المسؤولية", no_defensiveness: "بدون تبرير دفاعي", face_saving: "يحفظ ماء الوجه",
  karam_warmth: "الكرم والدفء", not_theatrical: "بدون مبالغة", one_person: "يخاطب شخص واحد",
  spoken_dialect: "النطق واللهجة المنطوقة (الصوت)",
};
const SUITE_AR: Record<number, string> = { 1: "التعريف والترحيب", 9: "نبرة الرد حسب الموقف", 10: "اقتراح إضافي", 11: "التعامل مع شكوى", 12: "الكرم والضيافة" };
const FRAME_AR: Record<string, string> = { happy: "العميل مبسوط", "mild-delay": "تأخّر بسيط", complaint: "شكوى" };
const REGION_AR = (r: string | null) => (r === "hijaz" ? "حجازي" : r === "najd" ? "نجدي" : r || "");

// Deterministic per-reviewer permutation of [0,1,2] from the token — display order is
// counterbalanced, but the mapping is stable across resume and reproducible.
function seededPerm(token: string): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  return perms[h % 6];
}

type Scores = Record<string, Record<string, number>>;
type Notes = Record<string, string>;

export function MizanReviewClient({ token, packet }: { token: string; packet: Packet }) {
  const items = useMemo(() => packet.items || [], [packet.items]);
  const perm = useMemo(() => seededPerm(token), [token]);
  const [screen, setScreen] = useState<"welcome" | "item" | "finish">("welcome");
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState<Notes>({});
  const [recorded, setRecorded] = useState<Record<string, boolean>>({});
  const [localRec, setLocalRec] = useState<Record<string, string>>({});
  const [recActive, setRecActive] = useState<string | null>(null);
  const [micError, setMicError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; scenarioId: string; chunks: BlobPart[] } | null>(null);

  // --- resume: saved scores/notes + which items already have a recording ------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mizan/${token}`, { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { rows?: { scenarioId: string; dimension: string; score: number; notes: string | null }[] };
          if (alive && j.rows) {
            const s: Scores = {}, n: Notes = {};
            for (const r of j.rows) { (s[r.scenarioId] ||= {})[r.dimension] = r.score; if (r.notes) n[r.scenarioId] = r.notes; }
            setScores(s); setNotes(n);
          }
        }
        const rec = await fetch(`/api/mizan/${token}/recording`, { cache: "no-store" });
        if (rec.ok) {
          const j = (await rec.json()) as { recordings?: string[] };
          if (alive && j.recordings) setRecorded(Object.fromEntries(j.recordings.map((s) => [s, true])));
        }
      } catch { /* best-effort resume */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [token]);

  const saveCell = useCallback(async (scenarioId: string, suiteId: number, dimension: string, score: number, note: string) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/mizan/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, suiteId, dimension, score, notes: note || "" }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch { setSaveState("error"); }
  }, [token]);

  const it = items[idx];
  const isCompare = it?.kind === "voice_compare";

  const onScore = useCallback((dim: string, val: number) => {
    if (!it) return;
    setScores((prev) => ({ ...prev, [it.scenarioId]: { ...(prev[it.scenarioId] || {}), [dim]: val } }));
    void saveCell(it.scenarioId, it.suiteId, dim, val, notes[it.scenarioId] || "");
  }, [it, notes, saveCell]);

  const onNote = useCallback((val: string) => {
    if (!it) return;
    setNotes((prev) => ({ ...prev, [it.scenarioId]: val }));
    const sid = it.scenarioId;
    if (noteTimers.current[sid]) clearTimeout(noteTimers.current[sid]);
    noteTimers.current[sid] = setTimeout(() => {
      const sc = scores[sid] || {};
      const dims = Object.keys(sc);
      if (!dims.length) return;
      for (const d of dims) void saveCell(sid, it.suiteId, d, sc[d], val);
    }, 700);
  }, [it, scores, saveCell]);

  useEffect(() => {
    const timers = noteTimers.current;
    return () => { for (const t of Object.values(timers)) clearTimeout(t); };
  }, []);

  // --- optional mic recording (MediaRecorder) ---------------------------------
  const startRec = useCallback(async (scenarioId: string) => {
    setMicError(false);
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || !md.getUserMedia || typeof MediaRecorder === "undefined") { setMicError(true); return; }
    try {
      const stream = await md.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const ctx = { mr, stream, scenarioId, chunks: [] as BlobPart[] };
      mr.ondataavailable = (e) => { if (e.data && e.data.size) ctx.chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(ctx.chunks, { type: mr.mimeType || "audio/webm" });
        setLocalRec((p) => ({ ...p, [scenarioId]: URL.createObjectURL(blob) }));
        try {
          const res = await fetch(`/api/mizan/${token}/recording?scenarioId=${encodeURIComponent(scenarioId)}`, {
            method: "POST", headers: { "Content-Type": blob.type }, body: blob,
          });
          if (res.ok) setRecorded((p) => ({ ...p, [scenarioId]: true }));
        } catch { /* keep local playback; upload can be retried by re-recording */ }
      };
      recRef.current = ctx;
      mr.start();
      setRecActive(scenarioId);
    } catch { setMicError(true); }
  }, [token]);

  const stopRec = useCallback(() => {
    try { recRef.current?.mr.stop(); } catch { /* noop */ }
    recRef.current = null;
    setRecActive(null);
  }, []);

  useEffect(() => () => { try { recRef.current?.mr.stop(); recRef.current?.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ } }, []);

  const missingCount = useCallback(() => {
    let m = 0;
    for (const item of items) {
      const sc = scores[item.scenarioId] || {};
      for (const d of item.dimensions) if (typeof sc[d] !== "number") m++;
    }
    return m;
  }, [items, scores]);

  if (!loaded) return <Shell><div className="card center muted">…جارٍ التحميل</div><Style /></Shell>;

  return (
    <Shell>
      {screen === "welcome" && (
        <section>
          <h1>تقييم «خالد» — نص وصوت 🌟</h1>
          <p>مرحباً، وشكراً لمساعدتك. بتقرأ ردود «خالد» (وكيل مطعم يرد على العملاء)، <b>وتسمع صوته</b>، وتقيّم: هل يتكلم ويُنطق مثل شخص سعودي حقيقي؟</p>
          <div className="card rubric">
            <h2 style={{ marginTop: 0 }}>كيف تعطي الدرجة (من ١ إلى ١٠)</h2>
            <ul>
              <li><b>١–٣ ضعيف:</b> يحس إنه أجنبي أو لهجة ثانية، أو رسمي وجامد بزيادة.</li>
              <li><b>٤–٦ مقبول:</b> سعودي، لكن فيه شي يوقّف أو ما يحس طبيعي تماماً.</li>
              <li><b>٧–٨ جيد:</b> يتكلم/يُنطق سعودي طبيعي، مثل موظف مطعم حقيقي.</li>
              <li><b>٩–١٠ ممتاز:</b> سعودي أصيل، دافئ، ما تشك فيه أبداً.</li>
            </ul>
            <p className="muted">قيّم اللهجة والأسلوب والنطق فقط — لا تقيّم صحة الأسعار أو المنيو.</p>
            <p className="muted" style={{ fontSize: ".9rem" }}>تقدر توقف وترجع في أي وقت — تقييمك محفوظ تلقائياً. التسجيل بصوتك اختياري ويُستخدم فقط لتحسين نطق خالد.</p>
          </div>
          <button className="btn" style={{ width: "100%" }} onClick={() => setScreen("item")} disabled={!items.length}>ابدأ التقييم ←</button>
        </section>
      )}

      {screen === "item" && it && (
        <>
          <section>
            <div className="bar"><i style={{ width: `${((idx + 1) / items.length) * 100}%` }} /></div>
            <div className="progress">{isCompare ? "المقارنة الأخيرة" : <>الرد {toAr(idx + 1)} من {toAr(items.length)}</>}</div>

            {isCompare ? (
              // ░░ 3-voice comparison pick ░░
              <>
                <div className="card">
                  <h2 style={{ marginTop: 0 }}>{it.prompt || "أي صوت يحس سعودي أكثر؟"}</h2>
                  <p className="muted">نفس الكلام بثلاثة أصوات. اسمعهم واختر الأقرب للسعودي الطبيعي.</p>
                  {it.compareText && <div className="khalid">{it.compareText}</div>}
                  {perm.map((canonical, slot) => {
                    const picked = scores[it.scenarioId]?.voice_pick === canonical + 1;
                    return (
                      <div key={slot} className={`voicecard ${picked ? "picked" : ""}`}>
                        <div className="lbl">صوت {toAr(slot + 1)}</div>
                        <audio className="player" controls preload="none" src={it.voiceClips?.[canonical]} />
                        <button className={`btn ${picked ? "" : "secondary"}`} style={{ width: "100%", marginTop: 8 }} onClick={() => onScore("voice_pick", canonical + 1)}>
                          {picked ? "✓ اخترت هذا الصوت" : <>اختر صوت {toAr(slot + 1)}</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <NotesCard value={notes[it.scenarioId] || ""} onChange={onNote} saveState={saveState} />
              </>
            ) : (
              // ░░ normal reply item: text + voice + score + optional recording ░░
              <>
                <div className="card">
                  <div className="chips">
                    {SUITE_AR[it.suiteId] && <span className="chip">{SUITE_AR[it.suiteId]}</span>}
                    {it.frame && FRAME_AR[it.frame] && <span className="chip">{FRAME_AR[it.frame]}</span>}
                    {it.region && <span className="chip">{REGION_AR(it.region)}</span>}
                  </div>
                  <div className="lbl">رسالة العميل</div>
                  {it.turns.map((t, i) => <div key={i} className="guest">{t}</div>)}
                  <div className="lbl" style={{ marginTop: 12 }}>رد «خالد»</div>
                  {it.replies.filter((r) => r && r.trim()).map((r, i) => <div key={i} className="khalid">{r}</div>)}
                  {it.audioUrl && (
                    <>
                      <div className="lbl" style={{ marginTop: 12 }}>🔊 صوت «خالد»</div>
                      <audio className="player" controls preload="none" src={it.audioUrl} />
                    </>
                  )}
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

                {/* Optional reviewer recording — never required to complete the review. */}
                <div className="card">
                  <div className="lbl">🎙️ سجّل بصوتك النطق الصحيح (اختياري)</div>
                  {micError ? (
                    <div className="warnbox">تعذّر الوصول للميكروفون. افتح الرابط في المتصفح (Chrome/Safari) لتسجيل الصوت — التسجيل اختياري وتقدر تكمل بدونه.</div>
                  ) : recActive === it.scenarioId ? (
                    <button className="btn" style={{ width: "100%" }} onClick={stopRec}>⏹️ إيقاف التسجيل</button>
                  ) : (
                    <button className="btn secondary" style={{ width: "100%" }} onClick={() => startRec(it.scenarioId)}>
                      {recorded[it.scenarioId] || localRec[it.scenarioId] ? "🔁 إعادة التسجيل" : "🎙️ ابدأ التسجيل"}
                    </button>
                  )}
                  {(localRec[it.scenarioId] || recorded[it.scenarioId]) && recActive !== it.scenarioId && (
                    <>
                      <div className="lbl" style={{ marginTop: 10 }}>تسجيلك:</div>
                      <audio className="player" controls preload="none" src={localRec[it.scenarioId] || `/api/mizan/${token}/recording?scenarioId=${encodeURIComponent(it.scenarioId)}`} />
                    </>
                  )}
                </div>

                <NotesCard value={notes[it.scenarioId] || ""} onChange={onNote} saveState={saveState} />
              </>
            )}
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
          {missingCount() > 0 && <div className="card warnbox">تنبيه: فيه {toAr(missingCount())} درجة ما اخترتها بعد. تقدر ترجع وتكملها.</div>}
          <div className="card center"><button className="btn secondary" onClick={() => setScreen("item")}>↩︎ رجوع للمراجعة</button></div>
        </section>
      )}
      <Style />
    </Shell>
  );
}

function NotesCard({ value, onChange, saveState }: { value: string; onChange: (v: string) => void; saveState: string }) {
  return (
    <div className="card">
      <div className="lbl">ملاحظات، تصحيحات، أو مثال لما كان المفروض يقوله خالد</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="لو عندك صيغة أفضل، اكتبها هنا" />
      <div className={`savehint ${saveState}`}>
        {saveState === "saving" ? "…جارٍ الحفظ" : saveState === "saved" ? "✓ محفوظ تلقائياً" : saveState === "error" ? "⚠️ تعذّر الحفظ — سيُعاد المحاولة" : "يُحفظ تلقائياً"}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mizan-wrap" dir="rtl">{children}</div>;
}

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
      .mizan-wrap .player { width:100%; margin-top:8px; height:44px; }
      .mizan-wrap .voicecard { background:var(--card2); border:1px solid var(--line); border-radius:14px; padding:12px; margin:12px 0; }
      .mizan-wrap .voicecard.picked { border-color:var(--accent2); box-shadow:0 0 0 2px rgba(46,163,107,.35); }
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
