"use client";

// ============================================================================
// console_v2 — Ask Kivo, the ⌘K command palette (item 14). A GLOBAL overlay above
// every /c screen (not a route). ONE COMMAND BRAIN, TWO DOORS: this palette never
// parses a command itself — it hands the raw text to /api/console/command, which
// runs the EXACT WO-2 core (parseStaffCommand + matchMenuItem + handleStaffCommand)
// the staff-WhatsApp webhook uses, and stamps the audit with channel="console_command".
//
// Three honest tiers (the truth laws made visible):
//   • Commands (LIVE)     — recognized by the shared brain; echoed, confirmed-before-act,
//                           executed, then stamped with the acting member's name.
//   • Questions (GATHERING) — anything the brain doesn't recognize: no answer engine yet,
//                           so we say GATHERING and never guess a number.
//   • Proposals (SOON)    — Brain-never-acts; a standing rule routes to Approvals, unbuilt.
//
// Safety is NEVER commandable: the parser has no safety verb, and a safety-keyword
// attempt is refused here in red (red = safety only) — it never reaches the server.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, Pause, Play, Ban, RotateCcw, Activity, HelpCircle,
  ShieldAlert, Check, CornerDownLeft, Loader2, type LucideIcon,
} from "lucide-react";
import { useAskKivoStore } from "@/lib/console-v2/ask-kivo-store";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi } from "@/components/kivo";
import { TruthChip, type TruthState } from "./TruthChip";

// Safety vocabulary is never commandable — matched here purely to RENDER THE REFUSAL
// (the server core has no safety verb either, so nothing could act regardless).
const SAFETY_RE = /حساس|الحساسي|سلام[ةه]|allerg|safety/i;

type Tier = "live" | "gathering" | "soon";
interface Suggestion {
  icon: LucideIcon;
  labelKey: DictKey;
  subKey: DictKey;
  tier: Tier;
  /** Run this exact command through the brain. */
  run?: string;
  /** Prefill the input (item name completed by the user), don't submit. */
  fill?: string;
  /** Show an honest placeholder tier without touching the server. */
  show?: "gathering" | "proposal";
}

const SUGGESTIONS: Suggestion[] = [
  { icon: Pause, labelKey: "ask.sug.pause", subKey: "ask.sug.pause.sub", tier: "live", run: "وقف كريم" },
  { icon: Play, labelKey: "ask.sug.live", subKey: "ask.sug.live.sub", tier: "live", run: "شغل كريم" },
  { icon: Ban, labelKey: "ask.sug.eightysix", subKey: "ask.sug.eightysix.sub", tier: "live", fill: "86 " },
  { icon: RotateCcw, labelKey: "ask.sug.restore", subKey: "ask.sug.restore.sub", tier: "live", fill: "رجع " },
  { icon: Activity, labelKey: "ask.sug.status", subKey: "ask.sug.status.sub", tier: "live", run: "الحالة" },
  { icon: HelpCircle, labelKey: "ask.sug.question", subKey: "ask.sug.question.sub", tier: "gathering", show: "gathering" },
  { icon: Sparkles, labelKey: "ask.sug.proposal", subKey: "ask.sug.proposal.sub", tier: "soon", show: "proposal" },
];

const TIER_TRUTH: Record<Tier, TruthState> = { live: "live", gathering: "gathering", soon: "soon" };

type View =
  | { kind: "loading"; echoed: string }
  | { kind: "refuse"; echoed: string }
  | { kind: "gathering"; echoed: string }
  | { kind: "proposal"; echoed: string }
  | { kind: "reply"; echoed: string; text: string }
  | { kind: "confirm"; echoed: string; command: string; confirmText: string; itemName: string | null; fuzzy: boolean }
  | { kind: "done"; echoed: string; reply: string; member: string | null };

export function AskKivoPalette() {
  const open = useAskKivoStore((s) => s.open);
  const setOpen = useAskKivoStore((s) => s.setOpen);
  const toggle = useAskKivoStore((s) => s.toggle);
  const t = useT();

  const [input, setInput] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K toggle + Esc close — always active while mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setOpen]);

  // Reset + focus on open.
  useEffect(() => {
    if (!open) return;
    setInput(""); setView(null); setBusy(false); setSel(0);
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return SUGGESTIONS;
    return SUGGESTIONS.filter((s) => (t(s.labelKey) + " " + t(s.subKey)).toLowerCase().includes(q));
  }, [input, t]);

  async function submit(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    // Safety is never commandable — refuse before any server call.
    if (SAFETY_RE.test(text)) { setView({ kind: "refuse", echoed: text }); return; }
    setBusy(true);
    setView({ kind: "loading", echoed: text });
    try {
      const res = await fetch("/api/console/command", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) setView({ kind: "reply", echoed: text, text: t("ask.error") });
      else if (j.needsConfirm) setView({ kind: "confirm", echoed: text, command: String(j.command), confirmText: String(j.confirmText), itemName: j.itemName ?? null, fuzzy: !!j.fuzzy });
      else if (j.recognized === false) setView({ kind: "gathering", echoed: text });
      else setView({ kind: "reply", echoed: text, text: String(j.reply ?? "") });
    } catch { setView({ kind: "reply", echoed: text, text: t("ask.error") }); }
    finally { setBusy(false); }
  }

  async function confirmAct(confirmText: string, echoed: string) {
    if (busy) return;
    setBusy(true);
    setView({ kind: "loading", echoed });
    try {
      const res = await fetch("/api/console/command", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: confirmText, confirm: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) setView({ kind: "reply", echoed, text: t("ask.error") });
      else setView({ kind: "done", echoed, reply: String(j.reply ?? ""), member: j.member ?? null });
    } catch { setView({ kind: "reply", echoed, text: t("ask.error") }); }
    finally { setBusy(false); }
  }

  function fireSuggestion(s: Suggestion) {
    if (s.run) { setInput(""); void submit(s.run); return; }
    if (s.fill) { setInput(s.fill); inputRef.current?.focus(); return; }
    if (s.show === "gathering") { setView({ kind: "gathering", echoed: t(s.labelKey) }); return; }
    if (s.show === "proposal") { setView({ kind: "proposal", echoed: t(s.labelKey) }); return; }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = input.trim();
      if (text) { void submit(text); setInput(""); }
      else if (filtered[sel]) fireSuggestion(filtered[sel]);
      return;
    }
    if (!input.trim() && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSel((p) => (p + (e.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
    }
  }

  if (!open) return null;

  return (
    <>
      <style>{PALETTE_CSS}</style>
      <div className="askScrim" onClick={() => setOpen(false)} />
      <div className="askPalette" role="dialog" aria-label={t("nav.askKivo")} onClick={(e) => e.stopPropagation()}>
        {/* input row */}
        <div className="askPin">
          <span className="askMark"><Sparkles size={15} strokeWidth={2.2} /></span>
          <input
            ref={inputRef}
            className="askInput"
            autoComplete="off"
            placeholder={t("ask.placeholder")}
            value={input}
            onChange={(e) => { setInput(e.target.value); setSel(0); if (view) setView(null); }}
            onKeyDown={onKeyDown}
          />
          <span className="askEsc">esc</span>
        </div>

        {/* tier rail — the three honest tiers, always visible */}
        <div className="askTrail">
          <span className="askPill live"><span className="askDot live" />{t("ask.tier.commands")}<span className="askSt">{t("truth.live")}</span></span>
          <span className="askPill"><span className="askDot gather" />{t("ask.tier.questions")}<span className="askSt">{t("truth.gathering")}</span></span>
          <span className="askPill"><span className="askDot soon" />{t("ask.tier.proposals")}<span className="askSt">{t("truth.soon")}</span></span>
        </div>

        <div className="askDiv" />

        <div className="askRes kv-scroll">
          {view ? (
            <div className="askStream">
              <div className="askQline"><span className="askQic">✋</span><span>{view.echoed}</span></div>
              <div className="askAnsRow"><span className="askAic"><Sparkles size={13} strokeWidth={2.2} /></span><div className="askABody">{renderView(view, t, confirmAct)}</div></div>
            </div>
          ) : (
            <>
              <div className="askGl">{t("ask.group.suggestions")}</div>
              {filtered.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.labelKey} className={`askRow${s.tier === "live" ? " cmd" : ""}${i === sel && !input.trim() ? " sel" : ""}`} onClick={() => fireSuggestion(s)}>
                    <span className="askIc"><Icon size={15} strokeWidth={2.1} /></span>
                    <span className="askRt"><span className="askRl">{t(s.labelKey)}</span><span className="askRs">{t(s.subKey)}</span></span>
                    <TruthChip state={TIER_TRUTH[s.tier]} />
                    <span className="askEnter"><CornerDownLeft size={11} /></span>
                  </div>
                );
              })}
              {/* Safety is never commandable — a persistent, honest note. */}
              <div className="askSafety"><ShieldAlert size={14} /><span>{t("ask.safety.note")}</span></div>
            </>
          )}
        </div>

        <div className="askFoot">
          <span className="askFk"><span className="askKbd"><CornerDownLeft size={10} /></span>{t("ask.foot.run")}</span>
          <span className="askFk"><span className="askKbd">↑↓</span>{t("ask.foot.nav")}</span>
          <span className="askFk"><span className="askKbd">esc</span>{t("ask.foot.close")}</span>
          <span className="askAttrib"><span className="askChip">✦ Kivo</span>{t("ask.foot.audit")}</span>
        </div>
      </div>
    </>
  );
}

function renderView(view: View, t: (k: DictKey) => string, confirmAct: (c: string, e: string) => void) {
  switch (view.kind) {
    case "loading":
      return <div className="askLoad"><Loader2 size={16} className="askSpin" />{t("ask.running")}</div>;
    case "refuse":
      return <div className="askRefuse"><ShieldAlert size={16} className="askRi" /><span>{t("ask.safety.refuse")}</span></div>;
    case "gathering":
      return (
        <div className="askGather">
          <div className="askGatherH">{t("ask.gathering.title")}</div>
          <div className="askGatherB">{t("ask.gathering.body")}</div>
        </div>
      );
    case "proposal":
      return (
        <div className="askSoon">
          <div className="askSoonH"><Sparkles size={12} /> {t("ask.proposal.title")}</div>
          <div className="askSoonB">{t("ask.proposal.body")}</div>
          <div className="askProute">{t("ask.proposal.route")}</div>
          <div className="askNever">🔒 {t("ask.proposal.never")}</div>
        </div>
      );
    case "reply":
      return <div className="askReply">{view.text}</div>;
    case "confirm":
      return (
        <div className="askConfirm">
          <div className="askCh">⌘ {t("ask.cmdTag")}</div>
          <div className="askCw">{view.confirmText}</div>
          {view.fuzzy && <div className="askCd">{t("ask.fuzzyNote")}</div>}
          <div className="askCf">
            <button className="askCbtn go" onClick={() => confirmAct(view.confirmText, view.echoed)}>{t("ask.confirm")}</button>
            <button className="askCbtn" onClick={() => useAskKivoStore.getState().setOpen(false)}>{t("ask.cancel")}</button>
          </div>
        </div>
      );
    case "done":
      return (
        <div className="askConfirm">
          <div className="askReply" style={{ padding: "12px 13px 4px" }}>{view.reply}</div>
          <div className="askStamp">
            <Check size={13} /> {t("ask.done")}
            <span className="askWho">· {t("ask.auditedAs")} {view.member ? <Bdi>{view.member}</Bdi> : t("ask.you")} · {t("ask.justNow")}</span>
          </div>
        </div>
      );
  }
}

// Scoped, self-contained dark palette (static CSS — a text node, no data interpolation).
const PALETTE_CSS = `
.askScrim{position:fixed;inset:0;background:rgba(6,7,10,.62);backdrop-filter:blur(3px);z-index:60;animation:askFade .22s ease}
.askPalette{position:fixed;z-index:61;inset-block-start:9vh;inset-inline:0;margin-inline:auto;width:min(660px,94vw);
  max-height:82vh;display:flex;flex-direction:column;
  background:rgba(22,23,30,.82);backdrop-filter:blur(40px) saturate(1.4);border:1px solid rgba(255,255,255,.14);
  border-radius:20px;box-shadow:0 40px 120px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);
  overflow:hidden;color:#f4f5f8;font-family:var(--kv-font,inherit);animation:askRise .24s cubic-bezier(.2,.9,.25,1)}
.askPalette::before{content:"";position:absolute;inset:0 0 auto 0;height:120px;pointer-events:none;
  background:radial-gradient(500px 120px at 78% 0,rgba(139,92,246,.16),transparent 70%)}
@keyframes askFade{from{opacity:0}to{opacity:1}}
@keyframes askRise{from{opacity:0;transform:translateY(-10px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.askScrim,.askPalette{animation:none}}

.askPin{display:flex;align-items:center;gap:12px;padding:16px 19px}
.askMark{width:29px;height:29px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.38);color:#c4b1ff}
.askInput{flex:1;background:none;border:none;outline:none;color:#f4f5f8;font-family:inherit;font-size:16px;font-weight:500}
.askInput::placeholder{color:#666c7c}
.askEsc{font-size:10px;color:#666c7c;border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:2px 7px;flex-shrink:0}

.askTrail{display:flex;align-items:center;gap:6px;padding:0 19px 12px;flex-wrap:wrap}
.askPill{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:#a2a7b4;
  background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 9px}
.askDot{width:5px;height:5px;border-radius:50%}
.askDot.live{background:#34d399;box-shadow:0 0 6px #34d399}
.askDot.gather{background:#a78bfa}
.askDot.soon{background:#666c7c}
.askPill .askSt{font-size:8px;font-weight:700;letter-spacing:.06em;color:#666c7c}
.askPill.live .askSt{color:#34d399}

.askDiv{height:1px;background:rgba(255,255,255,.08)}

.askRes{flex:1;overflow-y:auto;padding:8px 10px 10px;min-height:70px}
.askGl{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#666c7c;padding:9px 12px 6px}
.askRow{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;cursor:pointer;transition:background .12s}
.askRow:hover,.askRow.sel{background:rgba(255,255,255,.055)}
.askRow .askIc{width:30px;height:30px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#d7dae2}
.askRow.cmd .askIc{background:rgba(139,92,246,.14);border-color:rgba(139,92,246,.38);color:#c4b1ff}
.askRow .askRt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.askRow .askRl{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.askRow .askRs{font-size:10.5px;color:#666c7c}
.askRow .askEnter{opacity:0;color:#666c7c;display:flex;align-items:center}
.askRow.sel .askEnter,.askRow:hover .askEnter{opacity:1}

.askSafety{display:flex;align-items:center;gap:9px;margin:8px 6px 2px;border-radius:11px;padding:9px 12px;
  background:rgba(255,107,94,.12);border:1px solid rgba(255,107,94,.4);color:#ffc9c9;font-size:11px;line-height:1.5}
.askSafety svg{flex-shrink:0;color:#ff6b5e}

.askStream{padding:8px 14px 12px;display:flex;flex-direction:column;gap:13px}
.askQline{display:flex;align-items:center;gap:9px;color:#a2a7b4;font-size:13px;font-weight:500}
.askQic{width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
  display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.askAnsRow{display:flex;gap:11px}
.askAic{width:26px;height:26px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.38);color:#c4b1ff;margin-top:1px}
.askABody{flex:1;min-width:0}

.askLoad{display:flex;align-items:center;gap:9px;color:#a2a7b4;font-size:12.5px;padding:4px 0}
.askSpin{animation:askSpin 1s linear infinite;color:#c4b1ff}
@keyframes askSpin{to{transform:rotate(360deg)}}

.askRefuse{border:1px solid rgba(255,107,94,.42);background:rgba(255,107,94,.09);border-radius:13px;padding:12px 14px;
  font-size:12px;line-height:1.6;color:#ffc9c9;display:flex;gap:10px}
.askRefuse .askRi{color:#ff6b5e;flex-shrink:0}

.askReply{border:1px solid rgba(255,255,255,.08);border-radius:13px;padding:13px 14px;background:rgba(255,255,255,.02);
  font-size:12.5px;line-height:1.7;color:#d7dae2;white-space:pre-wrap}

.askGather{border:1px solid rgba(139,92,246,.38);background:rgba(139,92,246,.06);border-radius:13px;padding:12px 14px}
.askGatherH{font-size:12px;font-weight:700;color:#c4b1ff;margin-bottom:4px}
.askGatherB{font-size:11.5px;color:#a2a7b4;line-height:1.65}

.askSoon{border:1px dashed rgba(139,92,246,.38);border-radius:13px;overflow:hidden;background:rgba(139,92,246,.04)}
.askSoonH{display:flex;align-items:center;gap:7px;padding:10px 13px;font-size:9px;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;color:#c4b1ff;background:rgba(139,92,246,.14)}
.askSoonB{font-size:11.5px;color:#a2a7b4;line-height:1.6;padding:11px 13px 4px}
.askProute{font-size:10.5px;color:#a2a7b4;margin:0 13px 10px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);
  border-radius:9px;padding:9px 11px;line-height:1.55}
.askNever{font-size:9.5px;color:#666c7c;padding:0 13px 12px;line-height:1.5}

.askConfirm{border:1px solid rgba(139,92,246,.38);border-radius:13px;overflow:hidden;background:rgba(139,92,246,.05)}
.askCh{display:flex;align-items:center;gap:8px;padding:11px 13px 3px;font-size:8.5px;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:#c4b1ff}
.askCw{font-size:14px;font-weight:600;padding:3px 13px 2px;color:#f4f5f8}
.askCd{font-size:11px;color:#a2a7b4;line-height:1.55;padding:2px 13px 0}
.askCf{display:flex;gap:8px;padding:12px 13px 13px}
.askCbtn{border-radius:9px;padding:8px 14px;font-size:11.5px;font-weight:600;cursor:pointer;
  border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#f4f5f8;font-family:inherit;transition:.14s}
.askCbtn:hover{background:rgba(255,255,255,.08)}
.askCbtn.go{background:#8b5cf6;border-color:transparent;color:#160a2e;font-weight:700}
.askCbtn.go:hover{background:#a78bfa}
.askStamp{display:flex;align-items:center;gap:7px;margin:0 13px 13px;font-size:10.5px;color:#34d399;
  background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:9px;padding:8px 11px}
.askStamp .askWho{color:#a2a7b4;font-size:9.5px}

.askFoot{display:flex;align-items:center;gap:14px;padding:9px 16px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2)}
.askFk{display:flex;align-items:center;gap:6px;font-size:9.5px;color:#666c7c}
.askKbd{display:flex;align-items:center;font-size:9px;color:#a2a7b4;background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.08);border-radius:5px;padding:2px 6px}
.askAttrib{margin-inline-start:auto;font-size:9px;color:#666c7c;display:flex;align-items:center;gap:6px}
.askChip{font-weight:700;border-radius:5px;padding:1px 6px;color:#c4b1ff;background:rgba(139,92,246,.14)}
`;
