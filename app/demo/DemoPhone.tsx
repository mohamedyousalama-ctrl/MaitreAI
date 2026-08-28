"use client";

// ============================================================================
// The WhatsApp-style phone. Layout, bubbles, hold-to-record voice notes and the
// call button are modelled on WhatsApp deliberately — that is the interaction
// language a Saudi restaurant owner already speaks, so the demo needs no
// explanation. Meta's branding is NOT copied; a "تجربة" chip sits in the header.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_MAX_AUDIO_BYTES, DEMO_MAX_RECORD_SECONDS } from "@/lib/demo/config";

/** The interactive payload the Brain attaches to a turn — the same shape WhatsApp
 *  renders as a tappable list or button row (lib/ai/tools.ts). The demo dropped this
 *  entirely, which is why «ايش المنيو» produced «اختار من التصنيفات» with no categories
 *  visible: the list was built every turn and thrown away before it reached the screen. */
export type Presentation =
  | { kind: "buttons"; header?: string; buttons: { id: string; title: string }[] }
  | {
      kind: "list";
      button: string;
      header?: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
    };

type Msg = {
  id: number;
  from: "me" | "khalid";
  kind: "text" | "voice";
  text: string;
  /** Tappable options rendered under the bubble, WhatsApp-style. */
  presentation?: Presentation | null;
  /** Voice notes render as a WhatsApp-style player rather than a bubble of text. */
  seconds?: number;
  at: string;
};

const clock = () =>
  new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });

const GREETING =
  "هلا والله، أنا خالد من مطعم الديرة 👋\nوش تحب تطلب اليوم؟ تقدر تكتب لي أو ترسل لي ملاحظة صوتية.";

export default function DemoPhone() {
  // The greeting's timestamp is filled on the client only. Computing it in the
  // initializer renders UTC on the server and Riyadh in the browser, which fails
  // hydration and makes React re-render the entire root — a visible blank-then-repaint
  // on a phone, on the first screen a prospect sees.
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "khalid", kind: "text", text: GREETING, at: "" },
  ]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [slideCancel, setSlideCancel] = useState(false);

  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // CANCEL TOKEN. getUserMedia is awaited, so the permission prompt opens a window
  // where the user has already released the button before `recorder.current` exists.
  // Without this, stopRec no-ops, the recorder then starts, and the MIC STAYS OPEN
  // FOREVER. That is the single most likely first interaction on a public page.
  const wantRec = useRef(false);
  const mounted = useRef(true);
  // The composer swaps to the recording bar the instant recording starts, which
  // UNMOUNTS the mic button — so onPointerUp bound to that button can never fire.
  // Release is therefore listened for on the WINDOW while armed, which also means
  // a release anywhere on the screen still sends, exactly like WhatsApp.
  const pressX = useRef<number | null>(null);
  // startRec's interval needs stopRec, which is declared after it.
  const stopRecRef = useRef<((cancelled?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    setMsgs((prev) => (prev[0] && !prev[0].at ? [{ ...prev[0], at: clock() }, ...prev.slice(1)] : prev));
  }, []);

  // Stick to the bottom on new messages, the way a chat app does.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const push = useCallback((m: Omit<Msg, "id" | "at">) => {
    const msg: Msg = { ...m, id: nextId.current++, at: clock() };
    setMsgs((prev) => [...prev, msg]);
    return msg;
  }, []);

  /** Send a turn to the real Brain and render the reply. */
  const send = useCallback(
    async (text: string, asVoice?: { seconds: number }) => {
      const mine = push({
        from: "me",
        kind: asVoice ? "voice" : "text",
        text,
        seconds: asVoice?.seconds,
      });
      setTyping(true);
      setNotice(null);
      try {
        // History is rebuilt from what is on screen — the server keeps no session.
        const history = msgs
          .filter((m) => m.kind === "text" || m.from === "me")
          .map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: m.text }));
        const res = await fetch("/api/demo/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, history }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean; reply?: string; error?: string; presentation?: Presentation | null;
        };
        if (!res.ok || !data.ok) {
          setNotice(
            data.error === "rate_limited"
              ? "وصلنا الحد الأقصى للتجربة الحين 🙏 جرّب بعد شوي."
              : data.error === "demo_unavailable"
                ? "التجربة موقوفة مؤقتاً 🙏"
                : "صار خلل بسيط 🙏 جرّب مرة ثانية.",
          );
          return;
        }
        push({
          from: "khalid",
          kind: "text",
          text: String(data.reply ?? ""),
          presentation: data.presentation ?? null,
        });
      } catch {
        setNotice("ما قدرنا نوصل للخدمة 🙏 تأكد من الاتصال.");
      } finally {
        setTyping(false);
      }
      void mine;
    },
    [msgs, push],
  );

  const submitText = useCallback(() => {
    const t = draft.trim();
    if (!t || typing) return;
    setDraft("");
    void send(t);
  }, [draft, typing, send]);

  /** A tapped option becomes an ordinary customer message. WhatsApp posts the row id
   *  back through interactive-router; the demo has no such router, so it sends the
   *  visible TITLE — which the Brain understands anyway, because a customer typing
   *  «كبسة لحم» is the case it is built for. */
  const onPick = useCallback((label: string) => {
    if (typing) return;
    void send(label);
  }, [typing, send]);

  // ── hold-to-record, exactly as WhatsApp does it ──────────────────────────
  const startRec = useCallback(async () => {
    if (recording) return;
    if (typing) { setNotice("خلّني أكمّل ردي الأول 🙏"); return; }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setNotice("متصفحك ما يدعم التسجيل هنا 🙏 اكتب لي بدالها.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setNotice("متصفحك ما يدعم تسجيل الصوت 🙏 اكتب لي بدالها.");
      return;
    }
    wantRec.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Released the button (or unmounted) while the permission prompt was open —
      // hand the microphone straight back instead of starting a recording nobody can stop.
      if (!wantRec.current || !mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.start();
      recorder.current = mr;
      setRecording(true);
      setRecSecs(0);
      recTimer.current = setInterval(() => {
        setRecSecs((n) => {
          // AUTO-STOP. STT bills per minute, so the cheapest place to bound the clip is
          // before it is ever uploaded. Also stops a forgotten hold from running forever.
          if (n + 1 >= DEMO_MAX_RECORD_SECONDS) {
            setArmed(false);
            queueMicrotask(() => void stopRecRef.current?.(false));
          }
          return n + 1;
        });
      }, 1000);
    } catch (err) {
      // Always return the microphone, whatever failed after we were granted it.
      stream?.getTracks().forEach((t) => t.stop());
      wantRec.current = false;
      const name = err instanceof Error ? err.name : "";
      setNotice(
        name === "NotAllowedError" || name === "SecurityError"
          ? "ما أعطيتنا إذن المايك 🙏 فعّله من إعدادات المتصفح أو اكتب لي."
          : name === "NotFoundError"
            ? "ما لقينا مايك في جهازك 🙏 اكتب لي بدالها."
            : "ما قدرنا نفتح المايك 🙏 اكتب لي بدالها.",
      );
    }
  }, [recording, typing]);

  const stopRec = useCallback(
    async (cancelled?: boolean) => {
      // Clear the token FIRST — an in-flight startRec must see this even when
      // there is no recorder to stop yet.
      wantRec.current = false;
      const mr = recorder.current;
      if (!mr) return;
      if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
      const seconds = recSecs;
      setRecording(false);
      setRecSecs(0);
      // mr.stop() throws InvalidStateError when the recorder is already inactive
      // (permission revoked mid-recording, track ended). The throw must NOT skip
      // the track teardown below, or the microphone stays live.
      try {
        await new Promise<void>((resolve) => {
          mr.onstop = () => resolve();
          try { mr.stop(); } catch { resolve(); }
        });
      } finally {
        mr.stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
      }
      if (cancelled) return;
      if (seconds < 1) {
        // A tap rather than a hold. Say so — silently dropping it reads as a broken button.
        setNotice("اضغط مطوّلاً على المايك وتكلّم 🎙️");
        return;
      }

      const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
      chunks.current = [];
      if (blob.size > DEMO_MAX_AUDIO_BYTES) {
        // Checked here too: uploading it anyway would consume a durable guard slot
        // just to be told 413, i.e. the visitor burns quota to be told to try again.
        setNotice("المقطع طويل على التجربة 🙏 سجّل أقصر شوي.");
        return;
      }
      setTyping(true);
      setNotice(null);
      try {
        // multipart so the clip carries the on-screen history: without it the voice
        // path was stateless while the typed path was not, and a spoken follow-up
        // («وزيدها لبن») reached Khalid with no memory of what was being ordered.
        const fd = new FormData();
        fd.append("audio", blob, "note.webm");
        fd.append(
          "history",
          JSON.stringify(
            msgs
              .filter((m) => m.kind === "text" || m.from === "me")
              .map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: m.text })),
          ),
        );
        const res = await fetch("/api/demo/voice", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean; transcript?: string; reply?: string; error?: string;
          presentation?: Presentation | null;
        };
        if (!res.ok || !data.ok) {
          setNotice(
            data.error === "stt_unavailable"
              ? "الملاحظات الصوتية مو جاهزة بالتجربة الحين 🙏 اكتب لي بدالها."
              : data.error === "demo_unavailable"
                // The Founder's kill switch. Telling them to "try again" here would
                // be a lie that never resolves.
                ? "التجربة موقوفة مؤقتاً 🙏"
                : data.error === "audio_too_large"
                  ? "المقطع طويل على التجربة 🙏 سجّل أقصر شوي."
                  : data.error === "rate_limited"
                    ? "وصلنا الحد الأقصى للتجربة الحين 🙏"
                    : data.error === "stt_empty"
                      ? "ما سمعنا كلام واضح 🙏 جرّب مرة ثانية."
                      : "ما قدرنا نسمع المقطع 🙏 جرّب مرة ثانية.",
          );
          return;
        }
        // Show the voice note the way WhatsApp does — a player, with what we heard.
        push({ from: "me", kind: "voice", text: String(data.transcript ?? ""), seconds });
        push({
          from: "khalid",
          kind: "text",
          text: String(data.reply ?? ""),
          presentation: data.presentation ?? null,
        });
      } catch {
        setNotice("ما قدرنا نوصل للخدمة 🙏");
      } finally {
        setTyping(false);
      }
    },
    [recSecs, push, msgs],
  );

  useEffect(() => { stopRecRef.current = stopRec; }, [stopRec]);

  // RELEASE-TO-SEND, and slide-left-to-cancel, listened for on the window.
  // Bound here rather than on the mic button because that button is unmounted by
  // the recording swap; this also covers the window while the browser's permission
  // prompt is open, when no recorder exists yet.
  useEffect(() => {
    if (!armed) return;
    const CANCEL_PX = 80; // RTL: dragging LEFT, away from the mic, cancels.
    const move = (e: PointerEvent) => {
      if (pressX.current === null) return;
      setSlideCancel(pressX.current - e.clientX > CANCEL_PX);
    };
    const up = (e: PointerEvent) => {
      const cancelled = pressX.current !== null && pressX.current - e.clientX > CANCEL_PX;
      setArmed(false); setSlideCancel(false); pressX.current = null;
      void stopRec(cancelled);
    };
    const cancel = () => {
      // pointercancel fires on an incoming call, a system gesture, a scroll steal.
      // Without this the microphone stays open on a phone until the visitor notices.
      setArmed(false); setSlideCancel(false); pressX.current = null;
      void stopRec(true);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointermove", move);
    };
  }, [armed, stopRec]);

  // Leaving the page mid-recording must not leave the microphone open.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      wantRec.current = false;
      if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
      const mr = recorder.current;
      if (mr) {
        try { mr.stop(); } catch { /* already inactive */ }
        mr.stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
      }
    };
  }, []);

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={S.stage}>
      <div style={S.phone}>
        {/* ── header ─────────────────────────────────────────────────────── */}
        <div style={S.header}>
          <span style={S.back} aria-hidden>‹</span>
          <div style={S.avatar} aria-hidden>خ</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.name}>
              خالد — مطعم الديرة
              <span style={S.demoChip}>تجربة</span>
            </div>
            <div style={S.presence}>{typing ? "يكتب…" : "متصل الآن"}</div>
          </div>
          <button style={S.iconBtn} onClick={() => setInCall(true)} aria-label="مكالمة صوتية">
            <PhoneIcon />
          </button>
        </div>

        {/* ── conversation ───────────────────────────────────────────────── */}
        <div ref={scrollRef} style={S.thread} dir="rtl">
          <div style={S.dayPill}>اليوم</div>
          <div style={S.disclaimer}>
            تجربة توضيحية — الأسعار والأصناف افتراضية، وما فيه طلب حقيقي أو دفع.
          </div>
          {msgs.map((m) => (
            <Bubble key={m.id} m={m} mmss={mmss} onPick={onPick} />
          ))}
          {typing && (
            <div style={{ ...S.row, justifyContent: "flex-start" }}>
              <div style={{ ...S.bubble, ...S.theirs, ...S.typing }}>
                <Dot /> <Dot d={0.2} /> <Dot d={0.4} />
              </div>
            </div>
          )}
          {notice && <div style={S.notice}>{notice}</div>}
        </div>

        {/* ── composer ───────────────────────────────────────────────────── */}
        <div style={S.composer}>
          {recording ? (
            <div style={S.recBar}>
              <button style={S.trash} onClick={() => void stopRec(true)} aria-label="إلغاء">🗑</button>
              <span style={S.recDot} aria-hidden />
              <span style={S.recTime}>{mmss(recSecs)}</span>
              <span style={{ ...S.recHint, ...(slideCancel ? { color: "#f15c6d", fontWeight: 700 } : null) }}>
                {slideCancel ? "ارفع إصبعك للإلغاء" : "اسحب لليسار للإلغاء — ارفع إصبعك للإرسال"}
              </span>
              <button style={S.sendBtn} onClick={() => void stopRec(false)} aria-label="إرسال">
                <SendIcon />
              </button>
            </div>
          ) : (
            <>
              <div style={S.inputWrap}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitText(); }}
                  placeholder="رسالة"
                  dir="rtl"
                  style={S.input}
                  aria-label="اكتب رسالة"
                />
              </div>
              {draft.trim() ? (
                <button style={S.sendBtn} onClick={submitText} aria-label="إرسال">
                  <SendIcon />
                </button>
              ) : (
                <button
                  style={S.sendBtn}
                  // ONE pointer handler for mouse, touch and pen. Only the PRESS is
                  // bound here — release is on the window (this button unmounts the
                  // moment recording starts), which is also why there is no
                  // onMouseLeave cancel: drifting off a 42px button should not
                  // silently discard what someone just said.
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pressX.current = e.clientX;
                    setArmed(true);
                    void startRec();
                  }}
                  aria-label="اضغط مع الاستمرار للتسجيل"
                >
                  <MicIcon />
                </button>
              )}
            </>
          )}
        </div>

        {inCall && <CallScreen onEnd={() => setInCall(false)} />}
      </div>
      <p style={S.footnote}>
        هذه تجربة من Kivo. خالد يرد فعلياً — نفس المحرّك، نفس قائمة الطعام، نفس فحص الحساسية.
      </p>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function Bubble({
  m, mmss, onPick,
}: { m: Msg; mmss: (s: number) => string; onPick: (label: string) => void }) {
  const mine = m.from === "me";
  return (
    <div style={{ ...S.row, justifyContent: mine ? "flex-end" : "flex-start", flexWrap: "wrap" }}>
      <div style={{ ...S.bubble, ...(mine ? S.mine : S.theirs) }}>
        {m.kind === "voice" ? (
          <div style={S.voice}>
            <span style={S.play} aria-hidden>▶</span>
            <span style={S.wave} aria-hidden>
              {Array.from({ length: 22 }).map((_, i) => (
                <i key={i} style={{ ...S.bar, height: `${5 + ((i * 7) % 13)}px` }} />
              ))}
            </span>
            <span style={S.voiceTime}>{mmss(m.seconds ?? 0)}</span>
          </div>
        ) : null}
        {m.text ? <div style={S.text}>{m.text}</div> : null}
        <div style={S.meta}>
          <span>{m.at}</span>
          {mine && <span style={S.ticks} aria-label="تم التسليم">✓✓</span>}
        </div>
      </div>
      {m.presentation ? <Options p={m.presentation} onPick={onPick} /> : null}
    </div>
  );
}

/** The tappable half of a turn. WhatsApp renders these as a native list sheet or a
 *  button row; here they are chips under the bubble. Tapping sends the row's TITLE as
 *  the next message — the same text a customer would have typed — so the Brain reads it
 *  through its normal path with no demo-only routing. */
function Options({ p, onPick }: { p: Presentation; onPick: (label: string) => void }) {
  const items: { id: string; title: string; description?: string }[] =
    p.kind === "buttons"
      ? p.buttons
      : p.sections.flatMap((sec) => sec.rows);
  if (!items.length) return null;
  return (
    <div style={S.options}>
      {p.kind === "list" && p.button ? <div style={S.optionsHead}>{p.button}</div> : null}
      {items.map((it) => (
        <button key={it.id} style={S.option} onClick={() => onPick(it.title)}>
          <span style={S.optionTitle}>{it.title}</span>
          {it.description ? <span style={S.optionDesc}>{it.description}</span> : null}
        </button>
      ))}
    </div>
  );
}

function CallScreen({ onEnd }: { onEnd: () => void }) {
  // NO RUNNING TIMER. A counting call duration is the universal signal that a call
  // connected — nothing connects here, and a demo that fakes a live call in front of
  // a prospect is the one thing this page must not do. It says what it is instead.
  //
  // The note also no longer dates the missing half against an internal approval:
  // a prospect should not be told which sign-off the product is waiting on.
  return (
    <div style={S.call}>
      <div style={S.callAvatar} aria-hidden>خ</div>
      <div style={S.callName}>خالد — مطعم الديرة</div>
      <div style={S.callStatus}>المكالمة الصوتية غير مفعّلة في التجربة</div>
      <p style={S.callNote}>
        خالد يفهم الملاحظات الصوتية الحين — سجّل ملاحظة من زر المايك وبيرد عليك.
      </p>
      <button style={S.hangup} onClick={onEnd} aria-label="إغلاق">
        <PhoneIcon />
      </button>
    </div>
  );
}

const Dot = ({ d = 0 }: { d?: number }) => (
  <i style={{ ...S.dot, animationDelay: `${d}s` }} />
);

const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z" />
  </svg>
);
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z" />
  </svg>
);
const SendIcon = () => (
  // scaleX(-1): the glyph points right; in an RTL thread the send arrow points LEFT.
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden
       style={{ transform: "scaleX(-1)" }}>
    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
  </svg>
);

/* ── styles ──────────────────────────────────────────────────────────────── */
const WA = { green: "#005c4b", header: "#202c33", bg: "#0b141a", theirs: "#202c33", accent: "#00a884" };

const S: Record<string, React.CSSProperties> = {
  options: { display: "flex", flexWrap: "wrap", gap: 6, width: "100%", margin: "6px 2px 2px", justifyContent: "flex-start" },
  optionsHead: { width: "100%", fontSize: 11, color: "#8696a0", padding: "0 2px 2px" },
  option: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
    background: "#202c33", color: "#e9edef", border: "1px solid #2a3942",
    borderRadius: 14, padding: "8px 12px", font: "inherit", fontSize: 14,
    cursor: "pointer", textAlign: "start", maxWidth: "100%",
  },
  optionTitle: { fontWeight: 600 },
  optionDesc: { fontSize: 11, color: "#8696a0" },
  stage: { minHeight: "100dvh", background: "#0a0f13", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: "16px 12px", gap: 12,
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" },
  phone: { width: "100%", maxWidth: 420, height: "min(860px, 92dvh)", background: WA.bg,
    borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column",
    position: "relative", boxShadow: "0 24px 70px rgba(0,0,0,.6)", border: "1px solid #222d34" },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
    background: WA.header, color: "#e9edef", flexShrink: 0 },
  back: { fontSize: 26, lineHeight: 1, opacity: .7 },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "#6a7175", color: "#fff",
    display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  demoChip: { fontSize: 10, fontWeight: 700, background: "#f0b232", color: "#1c1c1c",
    borderRadius: 4, padding: "1px 5px" },
  presence: { fontSize: 12, color: "#8696a0" },
  iconBtn: { background: "none", border: 0, color: "#e9edef", cursor: "pointer", padding: 8 },
  thread: { flex: 1, overflowY: "auto", padding: "10px 10px 14px",
    background: `${WA.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 20h40M20 0v40' stroke='%23121b21' stroke-width='1'/%3E%3C/svg%3E")` },
  dayPill: { margin: "6px auto 10px", width: "fit-content", background: "#182229", color: "#8696a0",
    fontSize: 12, padding: "4px 10px", borderRadius: 7 },
  disclaimer: { margin: "0 auto 12px", width: "fit-content", maxWidth: "90%", textAlign: "center",
    background: "#182229", color: "#ffd279", fontSize: 11.5, padding: "6px 10px", borderRadius: 7, lineHeight: 1.5 },
  row: { display: "flex", marginBottom: 6 },
  bubble: { maxWidth: "82%", borderRadius: 8, padding: "6px 8px 4px", color: "#e9edef",
    fontSize: 14.5, lineHeight: 1.5, boxShadow: "0 1px 1px rgba(0,0,0,.25)" },
  mine: { background: WA.green, borderTopLeftRadius: 0 },
  theirs: { background: WA.theirs, borderTopRightRadius: 0 },
  text: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
  meta: { display: "flex", gap: 4, justifyContent: "flex-start", alignItems: "center",
    fontSize: 10.5, color: "#8696a0", marginTop: 2 },
  ticks: { color: "#53bdeb" },
  voice: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0 4px" },
  play: { fontSize: 14, opacity: .9 },
  wave: { display: "flex", alignItems: "center", gap: 2, flex: 1 },
  bar: { display: "block", width: 2, background: "#8696a0", borderRadius: 1 },
  voiceTime: { fontSize: 11, color: "#8696a0" },
  typing: { display: "flex", gap: 4, alignItems: "center", padding: "10px 12px" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#8696a0", display: "block",
    animation: "demoDot 1.2s infinite" },
  notice: { margin: "8px auto", width: "fit-content", maxWidth: "88%", textAlign: "center",
    background: "#3b2a1a", color: "#ffd279", fontSize: 12.5, padding: "8px 12px", borderRadius: 8 },
  composer: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
    background: WA.header, flexShrink: 0 },
  inputWrap: { flex: 1, background: "#2a3942", borderRadius: 22, padding: "8px 14px" },
  input: { width: "100%", background: "transparent", border: 0, outline: "none",
    color: "#e9edef", fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: "50%", background: WA.accent, color: "#0b141a",
    border: 0, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 },
  recBar: { flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#2a3942",
    borderRadius: 22, padding: "6px 10px", color: "#e9edef" },
  trash: { background: "none", border: 0, fontSize: 17, cursor: "pointer" },
  recDot: { width: 9, height: 9, borderRadius: "50%", background: "#f15c6d",
    animation: "demoPulse 1s infinite", display: "block" },
  recTime: { fontSize: 13, fontVariantNumeric: "tabular-nums" },
  recHint: { fontSize: 11, color: "#8696a0", flex: 1, textAlign: "center" },
  call: { position: "absolute", inset: 0, background: "#111b21", display: "flex",
    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
    color: "#e9edef", padding: 24, textAlign: "center" },
  callAvatar: { width: 96, height: 96, borderRadius: "50%", background: "#6a7175",
    display: "grid", placeItems: "center", fontSize: 38, fontWeight: 700 },
  callName: { fontSize: 20, fontWeight: 600 },
  callStatus: { fontSize: 14, color: "#8696a0", fontVariantNumeric: "tabular-nums" },
  callNote: { fontSize: 12.5, color: "#8696a0", maxWidth: 300, lineHeight: 1.7, marginTop: 6 },
  hangup: { marginTop: 18, width: 60, height: 60, borderRadius: "50%", background: "#f15c6d",
    color: "#fff", border: 0, display: "grid", placeItems: "center", cursor: "pointer",
    transform: "rotate(135deg)" },
  footnote: { color: "#5c6d75", fontSize: 12, textAlign: "center", maxWidth: 420, lineHeight: 1.7 },
};
