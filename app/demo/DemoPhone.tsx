"use client";

// ============================================================================
// The WhatsApp-style phone. Layout, bubbles, hold-to-record voice notes and the
// call button are modelled on WhatsApp deliberately — that is the interaction
// language a Saudi restaurant owner already speaks, so the demo needs no
// explanation. Meta's branding is NOT copied; a "تجربة" chip sits in the header.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeReplyAudio } from "@/lib/demo/audio-payload";
import { DEMO_MAX_AUDIO_BYTES, DEMO_MAX_CHARS, DEMO_MAX_RECORD_SECONDS } from "@/lib/demo/config";
import { newVadState, vadStep, callResponseAction, type VadVerdict } from "@/lib/demo/call-loop";
import { parseWhatsAppMarkup, isEmojiOnly } from "@/lib/util/whatsapp-markup";

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
  /** Khalid's SPOKEN reply, as an object URL. The transcript stays in `text`, so the
   *  message is readable whether or not the audio plays — a voice-only bubble would be
   *  unusable on a muted phone, which is most phones. */
  audioUrl?: string | null;
  /** Dish photos the Brain asked to send. WhatsApp sends these as separate image messages
   *  after the text (respond-and-send.ts sendRequestedPhotos); the demo renders them as
   *  photo bubbles under the reply, which is what that looks like on a phone. */
  photos?: DemoPhoto[] | null;
  at: string;
};

/** Mirrors PhotoRequest from lib/ai/tools.ts — the fields the client actually renders. */
type DemoPhoto = { itemId: string; name: string; imageUrl: string; caption: string };

/** Only http(s) images are rendered. The payload is server-built, but this page is public
 *  and a `javascript:` or `data:` src has no business reaching an <img> on it. */
function usablePhotos(raw: unknown): DemoPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is DemoPhoto =>
      !!p && typeof p === "object" &&
      typeof (p as DemoPhoto).imageUrl === "string" &&
      /^https:\/\//i.test((p as DemoPhoto).imageUrl))
    .slice(0, DEMO_MAX_PHOTOS);
}

/** WhatsApp sends at most a handful of images per turn; an unbounded list on a public page
 *  is a page-weight problem the visitor pays for. */
const DEMO_MAX_PHOTOS = 4;

const clock = () =>
  new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });

const GREETING =
  "هلا والله، أنا خالد من مطعم الديرة 👋\nوش تحب تطلب اليوم؟ تقدر تكتب لي أو ترسل لي ملاحظة صوتية.";

/** Where the visitor's demo session id lives between turns. */
const SESSION_KEY = "kivo.demo.session";

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
  // Every object URL minted for a spoken reply, revoked on unmount. Without this each
  // reply leaks its audio buffer for the lifetime of the tab.
  const audioUrls = useRef<string[]>([]);
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

  // ── THE ORDER SESSION ────────────────────────────────────────────────────
  // The id of this visitor's ephemeral demo conversation. The server keeps the
  // BASKET against it, which is the whole reason the demo can now close an order:
  // before this the agent re-derived the basket from the on-screen transcript every
  // turn and, past the history cap, simply lost it — «أجهّز لك الطلب؟» forever.
  //
  // sessionStorage, not localStorage: a demo is one sitting, and the session expires
  // server-side anyway. Every access is wrapped — Safari private mode THROWS on
  // sessionStorage rather than returning null, and a storage quirk must not take the
  // demo down. Losing the id is survivable: the server mints a fresh session.
  const convId = useRef<string | null>(null);
  useEffect(() => {
    try { convId.current = window.sessionStorage.getItem(SESSION_KEY); } catch { /* storage blocked */ }
  }, []);
  const rememberSession = useCallback((id: unknown) => {
    if (typeof id !== "string" || !id) return;
    convId.current = id;
    try { window.sessionStorage.setItem(SESSION_KEY, id); } catch { /* storage blocked */ }
  }, []);

  useEffect(() => {
    setMsgs((prev) => (prev[0] && !prev[0].at ? [{ ...prev[0], at: clock() }, ...prev.slice(1)] : prev));
  }, []);

  // Revoke every spoken-reply object URL on unmount. Each one pins its audio buffer in
  // memory until revoked or the tab closes.
  useEffect(() => () => {
    for (const url of audioUrls.current) URL.revokeObjectURL(url);
    audioUrls.current = [];
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
    async (text: string, asVoice?: { seconds: number }, interactiveId?: string) => {
      const mine = push({
        from: "me",
        kind: asVoice ? "voice" : "text",
        text,
        seconds: asVoice?.seconds,
      });
      setTyping(true);
      setNotice(null);
      try {
        // History is still rebuilt from what is on screen — it is what the model READS.
        // The BASKET is not in it: that lives server-side against `conversationId`,
        // because a transcript capped at DEMO_MAX_HISTORY turns cannot hold an order.
        const history = msgs
          .filter((m) => m.kind === "text" || m.from === "me")
          .map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: m.text }));
        const res = await fetch("/api/demo/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `interactiveId` is what a TAP posts on real WhatsApp, and it is the whole
          // reason the deterministic layer exists: a tap resolves to an ACTION, never to a
          // sentence the model has to re-interpret. The demo used to send only the visible
          // title, so tapping «تأكيد الطلب» and typing it were byte-identical at the route,
          // and both depended on the model choosing to finalize. The bubble still shows the
          // title, exactly as WhatsApp does.
          body: JSON.stringify({ text, history, conversationId: convId.current, interactiveId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean; reply?: string; error?: string; presentation?: Presentation | null;
          conversationId?: string; photoRequests?: unknown;
        };
        // Store it even on a failed turn: the server may have minted the session before
        // whatever went wrong, and re-minting one per failure would leak rows.
        rememberSession(data.conversationId);
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
          photos: usablePhotos(data.photoRequests),
        });
      } catch {
        setNotice("ما قدرنا نوصل للخدمة 🙏 تأكد من الاتصال.");
      } finally {
        setTyping(false);
      }
      void mine;
    },
    [msgs, push, rememberSession],
  );

  const submitText = useCallback(() => {
    const t = draft.trim();
    if (!t || typing) return;
    setDraft("");
    void send(t);
  }, [draft, typing, send]);

  /** A tapped option posts BOTH the visible title and the row id, as WhatsApp does.
   *
   *  This used to send the title alone, with a comment calling that safe "because the Brain
   *  understands it anyway". It does not, reliably: on WhatsApp a tap resolves through
   *  lib/messaging/typed-actions.ts to a deterministic ACTION with no model call at all,
   *  and the demo reached none of it. Live consequence — tapping «تأكيد الطلب» closed order
   *  #1002 instantly, while typing «ايه أكد الطلب» re-printed the receipt and asked again,
   *  because closing depended on the model deciding to call finalize. */
  const onPick = useCallback((label: string, id?: string) => {
    if (typing) return;
    void send(label, undefined, id);
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
        // The same session id as the typed path, so a spoken follow-up adds to the
        // SAME basket rather than starting a second one the server cannot reconcile.
        if (convId.current) fd.append("conversationId", convId.current);
        const res = await fetch("/api/demo/voice", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean; transcript?: string; reply?: string; error?: string;
          presentation?: Presentation | null; conversationId?: string;
          replyAudio?: string | null; replyAudioMime?: string | null; photoRequests?: unknown;
        };
        rememberSession(data.conversationId);
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
        // KHALID'S SPOKEN REPLY. base64 → Blob → object URL, so the audio never touches
        // disk and disappears with the tab. Additive: the text bubble renders exactly as
        // before and gains a play control, which is what keeps the reply usable on a muted
        // phone — i.e. most phones.
        // The decode lives in lib/demo/audio-payload.ts so a proof can drive it with real
        // bytes; it returns null rather than throwing, so a bad payload never costs the
        // visitor their reply.
        let audioUrl: string | null = null;
        const decoded = decodeReplyAudio(data.replyAudio, data.replyAudioMime);
        // The Blob/URL construction stays INSIDE a try. Outside one, a throw here escaped
        // to the request-level catch, which skips pushing the message entirely — so an
        // audio problem cost the visitor their TEXT reply and showed a network error that
        // had not happened, the exact outcome the decode is written to prevent.
        try {
        if (decoded) {
          const url = URL.createObjectURL(new Blob([decoded.bytes], { type: decoded.type }));
          if (!mounted.current) {
            // The visitor closed the tab mid-request. The unmount cleanup has already run,
            // so anything pushed now would never be revoked.
            URL.revokeObjectURL(url);
          } else {
            audioUrls.current.push(url);
            audioUrl = url;
          }
        }
        } catch {
          audioUrl = null;
        }
        push({
          from: "khalid",
          kind: "text",
          text: String(data.reply ?? ""),
          presentation: data.presentation ?? null,
          photos: usablePhotos(data.photoRequests),
          audioUrl,
        });
      } catch {
        setNotice("ما قدرنا نوصل للخدمة 🙏");
      } finally {
        setTyping(false);
      }
    },
    [recSecs, push, msgs, rememberSession],
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
                  // The server already truncates to DEMO_MAX_CHARS, but the LOCAL bubble
                  // renders the raw draft, and renderWhatsApp re-parses it on every render.
                  // Without this, pasting a very long body only ever hurt the visitor's own
                  // tab — but it cost nothing to stop.
                  maxLength={DEMO_MAX_CHARS}
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

        {inCall && (
          <CallScreen
            convId={convId}
            onSession={rememberSession}
            push={push}
            onEnd={() => setInCall(false)}
          />
        )}
      </div>
      <p style={S.footnote}>
        هذه تجربة من Kivo. خالد يرد فعلياً — نفس المحرّك، نفس قائمة الطعام، نفس فحص الحساسية.
      </p>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

/** Render one message body the way WhatsApp does.
 *
 *  The reply arrives in WhatsApp's WIRE FORMAT — `*bold*`, `_italic_`, `~strike~`,
 *  backtick monospace — because lib/util/customer-visible-format.ts produces exactly what
 *  the real client is sent. This page was printing that wire format raw, so a customer
 *  saw «خصم *15%* على أول طلب» with the asterisks. The parser only READS; nothing here
 *  changes a single character that goes out. */
function renderWhatsApp(body: string): React.ReactNode[] {
  return parseWhatsAppMarkup(body).map((t, i) => {
    switch (t.kind) {
      case "bold": return <strong key={i} style={{ fontWeight: 700 }}>{t.text}</strong>;
      case "italic": return <em key={i}>{t.text}</em>;
      case "strike": return <s key={i}>{t.text}</s>;
      case "mono": return <code key={i} style={S.mono}>{t.text}</code>;
      case "link":
        return (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" style={S.link}>
            {t.text}
          </a>
        );
      default: return <span key={i}>{t.text}</span>;
    }
  });
}

/** Khalid's spoken reply — a play control above the text, the way WhatsApp shows a voice
 *  note. The TEXT IS ALWAYS RENDERED TOO: audio alone is unusable on a muted phone, and it
 *  would put the order total somewhere a visitor cannot re-read. */
function SpokenReply({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div style={S.voice}>
      <button
        type="button"
        style={S.play}
        aria-label={playing ? "إيقاف" : "تشغيل"}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (playing) { el.pause(); el.currentTime = 0; setPlaying(false); return; }
          // A failed play() must not leave the button stuck showing "playing" — and must
          // not fail SILENTLY either. Resetting the icon and saying nothing means a tap
          // does visibly nothing in front of a prospect: the likeliest causes are an
          // unsupported codec (ogg/opus on older Safari), NotAllowedError, or low-power
          // mode, none of which the visitor can diagnose from an unchanged button.
          setFailed(false);
          void el.play().then(() => setPlaying(true)).catch(() => { setPlaying(false); setFailed(true); });
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span style={S.wave} aria-hidden>
        {Array.from({ length: 22 }).map((_, i) => (
          <i key={i} style={{ ...S.bar, height: `${5 + ((i * 7) % 13)}px` }} />
        ))}
      </span>
      {failed ? <span style={S.voiceFail}>الصوت ما اشتغل — النص فوق</span> : null}
      <audio
        ref={ref}
        src={url}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true); }}
      />
    </div>
  );
}

function Bubble({
  m, mmss, onPick,
}: {
  m: Msg;
  mmss: (s: number) => string;
  // Must match Options' signature. It declared `(label: string) => void` while Options
  // called it with two arguments — assignable by arity, so it compiled and worked at
  // runtime, but any refactor trusting the declared type would silently drop the id,
  // revert every tap to the model path, and produce no type error and no test failure.
  onPick: (label: string, id?: string) => void;
}) {
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
        {m.audioUrl ? <SpokenReply url={m.audioUrl} /> : null}
        {m.text ? <div style={{ ...S.text, ...(isEmojiOnly(m.text) ? S.emojiOnly : null) }}>{renderWhatsApp(m.text)}</div> : null}
        <div style={S.meta}>
          <span>{m.at}</span>
          {mine && <span style={S.ticks} aria-label="تم التسليم">✓✓</span>}
        </div>
      </div>
      {m.photos?.length ? <DishPhotos photos={m.photos} /> : null}
      {m.presentation ? <Options p={m.presentation} onPick={onPick} /> : null}
    </div>
  );
}

/** Dish photos, WhatsApp-style: image bubbles under the reply, each with its caption.
 *
 *  The Brain has always built these and both demo routes have always returned them — the
 *  client simply dropped the field, so a request for a dish photo produced a text reply and
 *  no picture. Rendering them here is the whole fix on this side; whether anything appears
 *  depends on the tenant's menu_items.image_url being populated, which is a content task.
 *
 *  A broken or slow image must never break the reply: onError hides the tile, so a dead URL
 *  degrades to the text the visitor already has rather than to a broken-image icon. */
function DishPhotos({ photos }: { photos: DemoPhoto[] }) {
  const [dead, setDead] = useState<Record<string, boolean>>({});
  const shown = photos.filter((p) => !dead[p.itemId + p.imageUrl]);
  if (!shown.length) return null;
  return (
    <div style={S.photoWrap}>
      {shown.map((p) => (
        <figure key={p.itemId + p.imageUrl} style={S.photoCard}>
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            decoding="async"
            style={S.photoImg}
            onError={() => setDead((d) => ({ ...d, [p.itemId + p.imageUrl]: true }))}
          />
          {p.caption ? <figcaption style={S.photoCap}>{p.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}

/** The tappable half of a turn. WhatsApp renders these as a native list sheet or a
 *  button row; here they are chips under the bubble. Tapping sends the row's TITLE as
 *  the next message — the same text a customer would have typed — so the Brain reads it
 *  through its normal path with no demo-only routing. */
function Options({ p, onPick }: { p: Presentation; onPick: (label: string, id?: string) => void }) {
  const items: { id: string; title: string; description?: string }[] =
    p.kind === "buttons"
      ? p.buttons
      : p.sections.flatMap((sec) => sec.rows);
  if (!items.length) return null;
  return (
    <div style={S.options}>
      {p.kind === "list" && p.button ? <div style={S.optionsHead}>{p.button}</div> : null}
      {items.map((it) => (
        <button key={it.id} style={S.option} onClick={() => onPick(it.title, it.id)}>
          <span style={S.optionTitle}>{it.title}</span>
          {it.description ? <span style={S.optionDesc}>{it.description}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** KIV-308 option A — a hands-free VOICE CONVERSATION, not a simulated phone call.
 *
 *  WHAT THIS IS, AND WHAT IT REFUSES TO PRETEND TO BE. Record → transcribe → the real
 *  Brain → speak → listen again. It is a genuine conversation and it is half-duplex, so it
 *  is labelled as a voice conversation and never as a connected PSTN call: no ringing
 *  tone, no «متصل الآن» before anything exists, and the duration counter starts only once
 *  a turn has actually completed — a timer that counts from the moment you tap is the
 *  universal signal that a call connected, and it is a lie until one has.
 *
 *  IT ONLY OFFERS ITSELF WHEN IT CAN ACTUALLY WORK. /api/demo/capabilities reports whether
 *  the server can both hear and speak. When it cannot, this falls back to exactly the
 *  honest panel that was here before. A call screen that listens, thinks and then answers
 *  with silence reads as a dropped call, not as an unconfigured feature — and shipping
 *  that in front of a restaurant owner is the worst outcome available here.
 *
 *  SOME TURNS ARE SILENT ON PURPOSE, AND THAT IS THE PRODUCT WORKING. Safety, money,
 *  payment-link and receipt replies are text-only by rule (lib/messaging/voice-budget.ts).
 *  On those turns the server returns the reply with no audio, and this screen SHOWS the
 *  text and says why rather than going quiet. Dead air would misread the one guarantee the
 *  demo exists to show off.
 *
 *  THE CAPS ARE THE SERVER'S, AND A REFUSAL ENDS THE CALL. A loop generates turns far
 *  faster than a person typing, so a 429 or a 503 stops it immediately instead of
 *  retrying — the client must never be what decides how much money this page may spend.
 */
function CallScreen({
  convId, onSession, push, onEnd,
}: {
  convId: React.MutableRefObject<string | null>;
  onSession: (id?: string) => void;
  push: (m: Omit<Msg, "id" | "at">) => Msg;
  onEnd: () => void;
}) {
  type Phase = "checking" | "unavailable" | "listening" | "thinking" | "speaking" | "ended";
  const [phase, setPhase] = useState<Phase>("checking");
  const [note, setNote] = useState<string>("");
  const [lastText, setLastText] = useState<string>("");
  const [textOnly, setTextOnly] = useState(false);

  // Every async path checks this. A hangup mid-request must not resume the loop, re-open
  // the microphone, or play audio into a screen the visitor has already left.
  const live = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  /** Hand back every OS resource we hold. Called on hangup, on unmount, and on any error
   *  path — a microphone left open after a demo is a red recording dot on a stranger's
   *  phone, and an AudioContext left running keeps the audio hardware awake. */
  const release = useCallback(() => {
    try { recorder.current?.state !== "inactive" && recorder.current?.stop(); } catch { /* already stopped */ }
    recorder.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try { void audioCtx.current?.close(); } catch { /* already closed */ }
    audioCtx.current = null;
    try { player.current?.pause(); } catch { /* nothing playing */ }
    player.current = null;
    if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; }
    abort.current?.abort();
    abort.current = null;
  }, []);

  const hangUp = useCallback(() => {
    live.current = false;
    release();
    onEnd();
  }, [release, onEnd]);

  /** Stop for a reason the visitor should see, without pretending the line dropped. */
  const stopWith = useCallback((msg: string) => {
    live.current = false;
    release();
    setPhase("ended");
    setNote(msg);
  }, [release]);

  // ── one turn: listen until silence, send, speak, repeat ───────────────────
  const runTurn = useCallback(async () => {
    if (!live.current) return;
    setPhase("listening");
    setTextOnly(false);

    let chunks: Blob[] = [];
    try {
      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!live.current) { release(); return; }
      }
      const mr = new MediaRecorder(stream.current);
      recorder.current = mr;
      chunks = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      // ENERGY-BASED END-OF-SPEECH. The browser has no "they stopped talking" event, so we
      // read the waveform: RMS above the floor means speech, and a continuous stretch of
      // quiet AFTER speech has started ends the turn. Requiring speech first is what stops
      // a silent room from firing an empty clip at the transcriber on a loop.
      audioCtx.current = new AudioContext();
      const analyser = audioCtx.current.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.current.createMediaStreamSource(stream.current).connect(analyser);
      const frame = new Uint8Array(analyser.fftSize);

      const MAX_MS = Math.min(DEMO_MAX_RECORD_SECONDS, 20) * 1000;
      const vad = newVadState(Date.now());

      const stopped = new Promise<VadVerdict>((resolve) => {
        const tick = setInterval(() => {
          if (!live.current) { clearInterval(tick); resolve("silent"); return; }
          analyser.getByteTimeDomainData(frame);
          let sum = 0;
          for (let i = 0; i < frame.length; i++) { const x = (frame[i] - 128) / 128; sum += x * x; }
          const verdict = vadStep(vad, Math.sqrt(sum / frame.length), Date.now(), MAX_MS);
          if (verdict !== "listening") { clearInterval(tick); resolve(verdict); }
        }, 60);
      });

      mr.start();
      const outcome = await stopped;
      await new Promise<void>((done) => { mr.onstop = () => done(); try { mr.stop(); } catch { done(); } });
      try { void audioCtx.current?.close(); } catch { /* already closed */ }
      audioCtx.current = null;
      if (!live.current) { release(); return; }

      if (outcome !== "spoke") {
        stopWith("ما سمعت شي 🙏 تقدر تبدأ المكالمة من جديد، أو تكتب لي في المحادثة.");
        return;
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      stopWith(
        name === "NotAllowedError" || name === "SecurityError"
          ? "ما أعطيتنا إذن المايك 🙏 فعّله من إعدادات المتصفح أو اكتب لي."
          : "ما قدرنا نفتح المايك 🙏 اكتب لي في المحادثة."
      );
      return;
    }

    // ── send ────────────────────────────────────────────────────────────────
    setPhase("thinking");
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
    if (blob.size > DEMO_MAX_AUDIO_BYTES) {
      stopWith("المقطع طويل شوي 🙏 جرّب جملة أقصر.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("audio", blob, "call.webm");
      if (convId.current) fd.append("conversationId", convId.current);
      abort.current = new AbortController();
      const res = await fetch("/api/demo/voice", { method: "POST", body: fd, signal: abort.current.signal });
      if (!live.current) return;

      // A CAP IS AN ANSWER, NOT A GLITCH. A voice loop can burn a per-IP budget in under a
      // minute, so a refusal ends the call — retrying is how a client turns a cap into a
      // suggestion.
      const decisionEarly = callResponseAction(res.status, false);
      if (decisionEarly.kind === "end") {
        stopWith(
          decisionEarly.reason === "rate_limited"
            ? "خلّصنا عدد المكالمات المسموح فيها الحين 🙏 كمّل معي بالكتابة."
            : "انقطع الاتصال بخالد 🙏 كمّل معي بالكتابة في المحادثة."
        );
        return;
      }

      const data = (await res.json()) as {
        conversationId?: string; transcript?: string; reply?: string;
        replyAudio?: string | null; replyAudioMime?: string | null;
        presentation?: Presentation | null;
      };
      onSession(data.conversationId);
      if (!live.current) return;

      // The call turns land in the THREAD too. Hanging up should leave a readable record of
      // what was said — a conversation that vanishes when the screen closes is not a
      // conversation the visitor can check the prices in.
      if (data.transcript) push({ from: "me", kind: "voice", text: data.transcript, seconds: 0 });
      const reply = String(data.reply ?? "");
      setLastText(reply);

      if (callResponseAction(res.status, !!data.replyAudio).kind !== "speak") {
        // BY DESIGN on a safety / money / payment-link / receipt turn. Say so and keep
        // going; silence here would look like a failure of the very rule being shown.
        push({ from: "khalid", kind: "text", text: reply, presentation: data.presentation ?? null });
        setTextOnly(true);
        setPhase("speaking");
        await new Promise((r) => setTimeout(r, 2600));
        if (live.current) void runTurn();
        return;
      }

      // ── speak ─────────────────────────────────────────────────────────────
      // decodeReplyAudio, not a second inline atob: this module exists because a bad
      // payload used to throw and silently drop a reply, and it is driven with real bytes
      // in the demo proof. A private copy here would be a second thing to get wrong.
      const decoded = decodeReplyAudio(data.replyAudio, data.replyAudioMime);
      if (!decoded) {
        push({ from: "khalid", kind: "text", text: reply, presentation: data.presentation ?? null });
        setTextOnly(true);
        setPhase("speaking");
        await new Promise((r) => setTimeout(r, 2400));
        if (live.current) void runTurn();
        return;
      }
      const url = URL.createObjectURL(new Blob([decoded.bytes], { type: decoded.type }));
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = url;
      push({ from: "khalid", kind: "voice", text: reply, audioUrl: url, presentation: data.presentation ?? null });

      setPhase("speaking");
      const el = new Audio(url);
      player.current = el;
      await new Promise<void>((done) => {
        el.onended = () => done();
        // A playback failure must not strand the loop in "speaking" forever — the visitor
        // still has the text, so carry on listening.
        el.onerror = () => done();
        void el.play().catch(() => done());
      });
      if (!live.current) return;
      void runTurn();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      stopWith("صار خلل بسيط 🙏 كمّل معي بالكتابة في المحادثة.");
    }
  }, [convId, onSession, push, release, stopWith]);

  // ── capability probe, then start ──────────────────────────────────────────
  useEffect(() => {
    live.current = true;
    let cancelled = false;
    (async () => {
      let can = false;
      try {
        const res = await fetch("/api/demo/capabilities", { cache: "no-store" });
        can = res.ok && !!(await res.json())?.voiceCall;
      } catch { can = false; }
      if (cancelled || !live.current) return;
      if (!can) { setPhase("unavailable"); return; }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setPhase("unavailable");
        return;
      }
      if (started.current) return;
      started.current = true;
      void runTurn();
    })();
    return () => { cancelled = true; live.current = false; release(); };
    // runTurn is stable for the life of the screen; re-running this effect would open a
    // second microphone and a second loop against the same conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NO DURATION COUNTER, DELIBERATELY — not even one that starts after a real turn.
  // A first version showed mm:ss once a turn had completed, on the argument that timing a
  // conversation that genuinely exists is honest. It is, but it is not what a viewer reads:
  // a counting duration on a call-styled screen is the universal signal that a CALL
  // connected, and this is a half-duplex voice conversation, not a phone line. KIV-308's
  // non-negotiable is literal about it, and proof-public-demo-hardening asserts the absence
  // outright. The phase label below says what is happening and says it more usefully.

  // The honest panel, unchanged, whenever the server cannot both hear and speak.
  if (phase === "checking" || phase === "unavailable") {
    return (
      <div style={S.call}>
        <div style={S.callAvatar} aria-hidden>خ</div>
        <div style={S.callName}>خالد — مطعم الديرة</div>
        <div style={S.callStatus}>
          {phase === "checking" ? "لحظة…" : "المكالمة الصوتية غير مفعّلة في التجربة"}
        </div>
        {phase === "unavailable" && (
          <p style={S.callNote}>
            خالد يفهم الملاحظات الصوتية الحين — سجّل ملاحظة من زر المايك وبيرد عليك.
          </p>
        )}
        <button style={S.hangup} onClick={hangUp} aria-label="إغلاق"><PhoneIcon /></button>
      </div>
    );
  }

  const status =
    phase === "listening" ? "يسمعك…"
    : phase === "thinking" ? "يفكر…"
    : phase === "speaking" ? (textOnly ? "هذي نعرضها مكتوبة" : "يتكلم…")
    : "انتهت المحادثة";

  return (
    <div style={S.call}>
      <div style={{ ...S.callAvatar, ...(phase === "listening" ? S.callAvatarLive : null) }} aria-hidden>خ</div>
      <div style={S.callName}>خالد — مطعم الديرة</div>
      {/* Named for what it is. Not «مكالمة», which would claim a phone line. */}
      <div style={S.callStatus}>محادثة صوتية</div>
      <div style={S.callPhase} aria-live="polite">{status}</div>
      {phase !== "ended" && (
        <div style={S.callWave} aria-hidden>
          <Dot d={0} /><Dot d={0.15} /><Dot d={0.3} />
        </div>
      )}
      {textOnly && (
        <p style={S.callNote}>
          الرسائل اللي فيها حساسية أو مبالغ أو إيصال نعرضها مكتوبة دايماً — عشان تقراها بنفسك.
        </p>
      )}
      {lastText && <p style={S.callTranscript}>{lastText}</p>}
      {note && <p style={S.callNote}>{note}</p>}
      <button style={S.hangup} onClick={hangUp} aria-label="إنهاء"><PhoneIcon /></button>
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
  // Plaintext bidi so EACH LINE resolves its own direction, as WhatsApp does — the thread
  // itself is hardcoded dir="rtl", so an English or digits-only line was laid out
  // right-to-left. `textAlign: "start"` is needed too: unicode-bidi fixes the reading
  // order but alignment still resolves against the inherited rtl direction, so an English
  // line would read correctly and sit on the wrong side.
  text: { whiteSpace: "pre-wrap", wordBreak: "break-word", unicodeBidi: "plaintext" as const, textAlign: "start" as const },
  emojiOnly: { fontSize: 40, lineHeight: 1.15 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em",
    background: "rgba(0,0,0,.22)", borderRadius: 4, padding: "0 4px" },
  link: { color: "#53bdeb", textDecoration: "underline" },
  meta: { display: "flex", gap: 4, justifyContent: "flex-start", alignItems: "center",
    fontSize: 10.5, color: "#8696a0", marginTop: 2 },
  ticks: { color: "#53bdeb" },
  voice: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0 4px" },
  play: { fontSize: 14, opacity: .9 },
  wave: { display: "flex", alignItems: "center", gap: 2, flex: 1 },
  bar: { display: "block", width: 2, background: "#8696a0", borderRadius: 1 },
  voiceTime: { fontSize: 11, color: "#8696a0" },
  voiceFail: { fontSize: 11, color: "#8696a0", whiteSpace: "nowrap" as const },
  photoWrap: { display: "flex", flexDirection: "column" as const, gap: 6, margin: "4px 0 2px" },
  photoCard: { margin: 0, background: "#fff", borderRadius: 10, overflow: "hidden" as const, boxShadow: "0 1px 1px rgba(0,0,0,.13)", maxWidth: 240 },
  photoImg: { display: "block", width: "100%", height: "auto", objectFit: "cover" as const, background: "#e9edef" },
  photoCap: { padding: "6px 8px", fontSize: 12.5, lineHeight: 1.4, color: "#111b21" },
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
  // A live ring while the microphone is open — the visitor should be able to see that the
  // page is listening without reading a word.
  callAvatarLive: { boxShadow: "0 0 0 3px rgba(0,168,132,.85), 0 0 0 10px rgba(0,168,132,.22)" },
  callPhase: { fontSize: 13, color: "#00a884", marginTop: 2, minHeight: 18 },
  callWave: { display: "flex", gap: 5, marginTop: 10, height: 10, alignItems: "center" },
  callTranscript: {
    fontSize: 13.5, color: "#e9edef", maxWidth: 300, lineHeight: 1.8, marginTop: 10,
    background: "#202c33", borderRadius: 12, padding: "10px 12px", textAlign: "start",
    maxHeight: 132, overflowY: "auto",
  },
  hangup: { marginTop: 18, width: 60, height: 60, borderRadius: "50%", background: "#f15c6d",
    color: "#fff", border: 0, display: "grid", placeItems: "center", cursor: "pointer",
    transform: "rotate(135deg)" },
  footnote: { color: "#5c6d75", fontSize: 12, textAlign: "center", maxWidth: 420, lineHeight: 1.7 },
};
