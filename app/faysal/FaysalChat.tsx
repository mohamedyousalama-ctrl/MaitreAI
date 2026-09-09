"use client";

// ============================================================================
// فيصل / Faysal — the WhatsApp-shaped chat.
//
// WHY IT LOOKS LIKE WHATSAPP: the product genuinely runs on WhatsApp. Showing a
// Riyadh clinic group their booking agent in any other shell would misrepresent
// it and force them to translate. The layout, the bubbles, the tick marks, the
// quick replies and the typing indicator are the interaction language this
// audience already speaks.
//
// WHERE THE LINE IS: this is WhatsApp-STYLE, not a counterfeit. No Meta logo, no
// wordmark, no claim to be WhatsApp — and, unlike the restaurant demo, this page
// wears a REAL client's registered trade name, so it carries Rule DEMO-1(a)
// permanently in the header and repeats DEMO-1(b) as the first message in the
// thread. The chrome marker never scrolls away; the in-thread one survives a
// screenshot.
//
// THREE THINGS THIS FILE DELIBERATELY DOES NOT DO:
//   · it never composes Arabic. Every word on screen came from the server, which
//     is where the frozen strings live. A client-side «جاري التحميل…» in Faysal's
//     bubble would be Faysal saying something no spec reviewed.
//   · it never renders a chip on a turn whose `stopReason` is the rail's. A
//     tappable "Book now" beside an ambulance instruction is the defect SPEC-4
//     §4.1 sets `presentation: null` to prevent, and the server already sends an
//     empty array — this is the second lock, on the surface that draws them.
//   · it does not persist the thread. A refresh is a new patient, which is also
//     what the founder wants between two client meetings.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { parseWhatsAppMarkup, isEmojiOnly, type MarkupToken } from "@/lib/util/whatsapp-markup";

const MAX_CHARS = 400; // mirrors FAYSAL_MAX_CHARS; the server truncates regardless.

const DEMO_CHIP = "عرض تجريبي — ليس قناة حجز فعلية لمجموعة الوطن الطبية";

type From = "me" | "faysal" | "system";

interface Msg {
  id: number;
  from: From;
  text: string;
  at: string;
  /** The rail turn. Rendered without chips and without a "delivered" flourish. */
  rail?: boolean;
}

interface TurnResponse {
  ok?: boolean;
  sessionId?: string;
  messages?: { from: "system" | "faysal"; text: string }[];
  chips?: string[];
  stopReason?: string | null;
  error?: string;
}

const RAIL_STOP = "faysal_redflag_emergency";

const clock = () =>
  new Date().toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });

let seq = 0;
const nextId = () => (seq += 1);

export default function FaysalChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const sessionId = useRef<string | null>(null);
  // React 18 StrictMode invokes mount effects TWICE in development. Without this
  // the opener ran twice and the visitor saw the demo disclosure and the greeting
  // duplicated — which is precisely the message a client reads most carefully.
  const started = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const applyResponse = useCallback((data: TurnResponse) => {
    // The session lives in this ref and nowhere else. It is deliberately NOT put in
    // sessionStorage: a refresh is a new patient, which is also what the founder
    // wants between two client meetings — and it means the sealed token never
    // outlives the tab that earned it.
    if (data.sessionId) sessionId.current = data.sessionId;
    const rail = data.stopReason === RAIL_STOP;
    const incoming = (data.messages ?? []).map((m) => ({
      id: nextId(),
      from: m.from as From,
      text: m.text,
      at: clock(),
      rail,
    }));
    setMsgs((prev) => [...prev, ...incoming]);
    setChips(rail ? [] : (data.chips ?? []));
  }, []);

  /** Start and restart are the same call — see `app/api/faysal/reset/route.ts`. */
  const start = useCallback(async () => {
    setBooting(true);
    setNotice(null);
    setChips([]);
    setMsgs([]);
    try {
      const res = await fetch("/api/faysal/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current }),
      });
      const data = (await res.json()) as TurnResponse;
      if (!res.ok) {
        setNotice(data.error === "rate_limited" ? "استنى شوي وجرّب مرة ثانية." : "العرض التجريبي مو متاح الحين.");
        return;
      }
      sessionId.current = null;
      applyResponse(data);
    } catch {
      setNotice("ما قدرت أوصل للخادم. تأكد من الاتصال وجرّب مرة ثانية.");
    } finally {
      setBooting(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, typing, chips]);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim().slice(0, MAX_CHARS);
      if (!body || typing) return;
      setDraft("");
      setChips([]);
      setNotice(null);
      setMsgs((prev) => [...prev, { id: nextId(), from: "me", text: body, at: clock() }]);
      setTyping(true);
      try {
        const res = await fetch("/api/faysal/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: body, sessionId: sessionId.current }),
        });
        const data = (await res.json()) as TurnResponse;
        if (!res.ok) {
          setNotice(
            data.error === "rate_limited"
              ? "خذ نفس — وصلت الحد لهذي الساعة."
              : "العرض التجريبي متوقف مؤقتاً. للحجز الفعلي: 920009303.",
          );
          return;
        }
        applyResponse(data);
      } catch {
        setNotice("ما قدرت أوصل للخادم. جرّب مرة ثانية.");
      } finally {
        setTyping(false);
        inputRef.current?.focus();
      }
    },
    [applyResponse, typing],
  );

  return (
    <div style={S.stage}>
      {/* Scoped to this page so the demo carries its own motion and nothing else
          on the site has to know about it. Reduced-motion is honoured.

          `dangerouslySetInnerHTML` is not decoration here: as a text child, React
          escapes the `"` inside the attribute selector to `&quot;` on the client
          and not on the server, which is a HYDRATION MISMATCH — and a mismatch in
          the root subtree makes React throw the server HTML away and re-render the
          whole page on the client. That is a visible blank-then-repaint on the
          first screen a prospect sees, on a phone. Driven: 7 hydration errors and
          "the entire root will switch to client rendering". */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div style={S.phone}>
        {/* ── header ──────────────────────────────────────────────────────── */}
        <div style={S.header}>
          <span style={S.back} aria-hidden>
            ‹
          </span>
          <div style={S.avatar} aria-hidden>
            ف
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.name}>
              <span style={S.nameText}>فيصل — مجموعة الوطن الطبية</span>
              {/* Rule DEMO-1(a): persistent, never scrolls away. */}
              <span style={S.demoChip} title={DEMO_CHIP}>
                تجريبي
              </span>
            </div>
            <div style={S.presence}>{typing ? "يكتب…" : "متصل الآن"}</div>
          </div>
          <button
            style={S.iconBtn}
            onClick={() => {
              started.current = true;
              void start();
            }}
            aria-label="محادثة جديدة"
            title="محادثة جديدة"
          >
            <ResetIcon />
          </button>
        </div>

        {/* Rule DEMO-1(a), in words. The chip above is the glance; this is the claim. */}
        <div style={S.chromeBanner}>{DEMO_CHIP}</div>

        {/* ── thread ──────────────────────────────────────────────────────── */}
        <div ref={scrollRef} style={S.thread} dir="rtl">
          <div style={S.dayPill}>اليوم</div>
          {msgs.map((m) =>
            m.from === "system" ? (
              <div key={m.id} style={S.systemLine}>
                {m.text}
              </div>
            ) : (
              <Bubble key={m.id} m={m} />
            ),
          )}
          {typing && (
            <div style={{ ...S.row, justifyContent: "flex-start" }}>
              <div style={{ ...S.bubble, ...S.theirs, ...S.typingBubble }}>
                <Dot /> <Dot d={0.2} /> <Dot d={0.4} />
              </div>
            </div>
          )}
          {notice && <div style={S.notice}>{notice}</div>}
          {chips.length > 0 && !typing && (
            <div style={S.chips}>
              {chips.map((c) => (
                <button key={c} style={S.chip} onClick={() => void send(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── composer ────────────────────────────────────────────────────── */}
        <div style={S.composer}>
          <div style={S.inputWrap}>
            <input
              ref={inputRef}
              value={draft}
              maxLength={MAX_CHARS}
              disabled={booting}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(draft);
              }}
              placeholder="رسالة"
              dir="rtl"
              style={S.input}
              aria-label="اكتب رسالة"
            />
          </div>
          <button style={S.sendBtn} onClick={() => void send(draft)} aria-label="إرسال" disabled={booting}>
            <SendIcon />
          </button>
        </div>
      </div>

      <p style={S.footnote}>
        عرض تجريبي لمحرّك حجز المواعيد. الأطباء والمواعيد والأسعار المعروضة افتراضية وغير معتمدة من مجموعة الوطن الطبية.
        <br />
        للحجز الفعلي: 920009303 · واتساب 0504490460 · للطوارئ: 997
      </p>
    </div>
  );
}

// ── bubbles ─────────────────────────────────────────────────────────────────

function Bubble({ m }: { m: Msg }) {
  const mine = m.from === "me";
  const emojiOnly = isEmojiOnly(m.text);
  return (
    <div style={{ ...S.row, justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ ...S.bubble, ...(mine ? S.mine : S.theirs), ...(m.rail ? S.rail : null) }}>
        <div style={{ ...S.text, ...(emojiOnly ? S.emojiOnly : null) }}>{renderMarkup(m.text)}</div>
        <div style={{ ...S.meta, justifyContent: mine ? "flex-end" : "flex-start" }}>
          <span>{m.at}</span>
          {mine && <span style={S.ticks}>✓✓</span>}
        </div>
      </div>
    </div>
  );
}

/** WhatsApp markup, tokenized on the shared parser — never `dangerouslySetInnerHTML`. */
function renderMarkup(text: string) {
  return parseWhatsAppMarkup(text).map((t: MarkupToken, i: number) => {
    switch (t.kind) {
      case "bold":
        return <strong key={i}>{t.text}</strong>;
      case "italic":
        return <em key={i}>{t.text}</em>;
      case "strike":
        return <s key={i}>{t.text}</s>;
      case "mono":
        return (
          <code key={i} style={S.mono}>
            {t.text}
          </code>
        );
      case "link":
        return (
          <a key={i} href={t.href} style={S.link} target="_blank" rel="noopener noreferrer">
            {t.text}
          </a>
        );
      default:
        return <span key={i}>{t.text}</span>;
    }
  });
}

function Dot({ d = 0 }: { d?: number }) {
  return <span style={{ ...S.dot, animationDelay: `${d}s` }} />;
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </svg>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

const WA = { green: "#005c4b", header: "#202c33", bg: "#0b141a", theirs: "#202c33", accent: "#00a884" };

const KEYFRAMES = `
@keyframes faysalDot { 0%,60%,100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-2px) } }
@media (prefers-reduced-motion: reduce) { [style*="faysalDot"] { animation: none !important; opacity:.6 } }
`;

const S: Record<string, React.CSSProperties> = {
  stage: {
    minHeight: "100dvh",
    background: "#0a0f13",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px 12px",
    gap: 12,
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  phone: {
    width: "100%",
    maxWidth: 420,
    height: "min(860px, 92dvh)",
    background: WA.bg,
    borderRadius: 22,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    boxShadow: "0 24px 70px rgba(0,0,0,.6)",
    border: "1px solid #222d34",
  },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: WA.header, color: "#e9edef", flexShrink: 0 },
  back: { fontSize: 26, lineHeight: 1, opacity: 0.7 },
  avatar: { width: 38, height: 38, borderRadius: "50%", background: "#3b6f63", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  nameText: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 },
  demoChip: { fontSize: 10, fontWeight: 700, background: "#f0b232", color: "#1c1c1c", borderRadius: 4, padding: "1px 5px", flexShrink: 0 },
  presence: { fontSize: 12, color: "#8696a0" },
  iconBtn: { background: "none", border: 0, color: "#e9edef", cursor: "pointer", padding: 8, display: "grid", placeItems: "center" },
  chromeBanner: {
    background: "#1b2b23",
    color: "#ffd279",
    fontSize: 11,
    lineHeight: 1.5,
    padding: "6px 12px",
    textAlign: "center",
    borderBottom: "1px solid #12241c",
    flexShrink: 0,
  },
  thread: {
    flex: 1,
    overflowY: "auto",
    padding: "10px 10px 14px",
    background: `${WA.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 20h40M20 0v40' stroke='%23121b21' stroke-width='1'/%3E%3C/svg%3E")`,
  },
  dayPill: { margin: "6px auto 10px", width: "fit-content", background: "#182229", color: "#8696a0", fontSize: 12, padding: "4px 10px", borderRadius: 7 },
  // Rule DEMO-1(b) is a SYSTEM line, not Faysal's voice — so it must not look like
  // a message from him. Centred, flat, no bubble, no avatar, no time.
  systemLine: {
    margin: "0 auto 12px",
    width: "fit-content",
    maxWidth: "92%",
    textAlign: "center",
    background: "#182229",
    color: "#ffd279",
    fontSize: 11.5,
    padding: "8px 12px",
    borderRadius: 7,
    lineHeight: 1.7,
  },
  row: { display: "flex", marginBottom: 6 },
  bubble: { maxWidth: "84%", borderRadius: 8, padding: "6px 8px 4px", color: "#e9edef", fontSize: 14.5, lineHeight: 1.6, boxShadow: "0 1px 1px rgba(0,0,0,.25)" },
  mine: { background: WA.green, borderTopLeftRadius: 0 },
  theirs: { background: WA.theirs, borderTopRightRadius: 0 },
  // The rail is the one message on this page that must not be skimmed past.
  rail: { background: "#3a2226", border: "1px solid #7a2f38" },
  // Plaintext bidi so EACH LINE resolves its own direction, as WhatsApp does — the
  // thread is hardcoded dir="rtl", so «011 496 4455» or an English line would
  // otherwise lay out right-to-left. `textAlign: "start"` is needed too: bidi fixes
  // the reading order, but alignment still resolves against the inherited rtl.
  text: { whiteSpace: "pre-wrap", wordBreak: "break-word", unicodeBidi: "plaintext", textAlign: "start" },
  emojiOnly: { fontSize: 40, lineHeight: 1.15 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em", background: "rgba(0,0,0,.22)", borderRadius: 4, padding: "0 4px" },
  link: { color: "#53bdeb", textDecoration: "underline" },
  meta: { display: "flex", gap: 4, alignItems: "center", fontSize: 10.5, color: "#8696a0", marginTop: 2 },
  ticks: { color: "#53bdeb" },
  typingBubble: { display: "flex", gap: 4, alignItems: "center", padding: "10px 12px" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#8696a0", display: "block", animation: "faysalDot 1.2s infinite" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 2px 2px", justifyContent: "flex-start" },
  chip: {
    background: "#202c33",
    color: "#e9edef",
    border: "1px solid #2a3942",
    borderRadius: 14,
    padding: "8px 14px",
    font: "inherit",
    fontSize: 14,
    cursor: "pointer",
    textAlign: "start",
    maxWidth: "100%",
  },
  notice: { margin: "8px auto", width: "fit-content", maxWidth: "88%", textAlign: "center", background: "#3b2a1a", color: "#ffd279", fontSize: 12.5, padding: "8px 12px", borderRadius: 8 },
  composer: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: WA.header, flexShrink: 0 },
  inputWrap: { flex: 1, background: "#2a3942", borderRadius: 22, padding: "8px 14px" },
  input: { width: "100%", background: "transparent", border: 0, outline: "none", color: "#e9edef", fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: "50%", background: WA.accent, color: "#0b141a", border: 0, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 },
  footnote: { color: "#5c6d75", fontSize: 12, textAlign: "center", maxWidth: 420, lineHeight: 1.8, margin: 0 },
};
