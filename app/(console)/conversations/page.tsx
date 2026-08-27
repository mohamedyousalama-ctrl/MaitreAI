"use client";

// ============================================================================
// Kivo — المحادثات (Conversations). SPEC 03, the flagship cockpit. Renders inside
// <ConsoleLayout> (the (console) route group). 3-pane: queue · thread · rail.
//
// REFLECTS the shipped ownership/safety spine — never bypasses it:
//  • Composer is INERT while Karim (AI) owns the thread; staff must «استلم وردّ»
//    (takeoverToHuman) to reply. Active only when a human owns it (addHumanMessage).
//  • Return-to-AI opens a "what next" chooser — never a blind resume. continue/ask
//    map to the existing returnToAi(note); wait/close do NOT resume (TODO: the
//    store exposes no wait/close transition — see notes).
//  • Allergy/safety card uses the EXACT "operational hint, NOT a safety guarantee"
//    wording; a safety hold shows a locked marker and is released only by the
//    deliberate return-to-AI action (the chooser) — the UI never auto-resumes.
//
// Truth-states: «قراءة كريم» summary
// isn't exposed client-side → neutral last-message snippet (never invented).
// «متوسط زمن الرد» isn't reliably derivable client-side → gathering skeleton.
// Triage + nav counts are live (countEscalations) — no hardcoded ٤/٣٦.
//
// NOTE: reads the REAL spine flags exposed in #116 — Conversation.ownershipState
// (AI_ACTIVE/HUMAN_ACTIVE/HUMAN_IDLE/SYSTEM_HOLD/CLOSED) and Conversation.isSafetyHold
// (loader-mapped). The UI derives ownership/safety from these; keyword-guessing on
// escalationReason/order-notes survives ONLY as a null-fallback for older rows that
// predate the flags. owner/status remain as legacy fallbacks.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/lang";
import { sendFailureMessageKey } from "@/lib/console-v2/send-failure";
import { conversationBucket } from "@/lib/console-v2/display-state";
import Link from "next/link";
import { Search, ArrowLeft, Send, AlertTriangle, Lock, UserPlus, CornerUpLeft, UserCheck, Megaphone } from "lucide-react";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useMembersStore, membersNameMap } from "@/lib/members-store";
import { useHasHydrated } from "@/lib/store";
import { isEscalated, countEscalations } from "@/lib/escalation";
import { useConsoleUi } from "@/components/console/console-ui-store";
import { runAction, runActionOutcome } from "@/lib/console-toast";
import { KvSkeletonBlock, useRiseIn } from "@/components/kivo";
import { useConversationPresence, presenceLabel } from "@/lib/realtime/use-conversation-presence";
import type { Conversation, ChannelKey, ConversationStage } from "@/lib/types";
import { CONVERSATION_STAGES, CONVERSATION_STAGE_LABELS } from "@/lib/types";

const AR = "٠١٢٣٤٥٦٧٨٩";
const toAr = (n: number | string) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const money = (n: number) => toAr(String(Math.round(Number(n || 0))));

const CHANNEL_AR: Record<ChannelKey, string> = {
  whatsapp: "واتساب", website: "ويب", instagram: "انستغرام", facebook: "فيسبوك", google: "جوجل", voice: "مكالمة",
};

const ALLERGY_RE = /حساس|مكسرات|فول سوداني|allerg|nut/i;

// Prefer the REAL spine flags (#116): ownershipState === SYSTEM_HOLD / isSafetyHold.
// Fall back to escalationReason/order-notes keyword scan ONLY for older rows that
// predate the flag (both absent) — never keyword-guess when the real flag exists.
function resolveHold(c: Conversation, orderNotes?: string): boolean {
  if (c.ownershipState === "SYSTEM_HOLD") return true;
  if (typeof c.isSafetyHold === "boolean") return c.isSafetyHold;
  return ALLERGY_RE.test(c.escalationReason ?? "") || ALLERGY_RE.test(orderNotes ?? "");
}

type OwnView = "AI" | "HUMAN" | "HOLD" | "CLOSED";
// Real 5-state ownership → UI view; falls back to the legacy owner flag only for
// older rows without ownershipState.
function ownView(c: Conversation): OwnView {
  switch (c.ownershipState) {
    case "SYSTEM_HOLD": return "HOLD";
    case "HUMAN_ACTIVE":
    case "HUMAN_IDLE": return "HUMAN";
    case "CLOSED": return "CLOSED";
    case "AI_ACTIVE": return "AI";
    default: return c.owner === "human" ? "HUMAN" : "AI";
  }
}

type PillTone = { label: string; bg: string; fg: string };
function intentPill(c: Conversation): PillTone {
  if (resolveHold(c) || isEscalated(c)) return { label: "تصعيد", bg: "rgba(192,73,47,.12)", fg: "#c0492f" };
  if (c.status === "بانتظار الدفع" || c.status === "طلب قيد البناء") return { label: "قيد الطلب", bg: "rgba(201,138,31,.16)", fg: "#9a6a14" };
  if (c.status === "طلب مكتمل") return { label: "اتجاوب", bg: "rgba(100,116,139,.14)", fg: "#51637a" };
  if (c.owner === "ai" && (c.linkedOrderId || c.draftOrder)) return { label: "طلب جديد", bg: "rgba(14,159,110,.12)", fg: "#0a8a5f" };
  return { label: "اتجاوب", bg: "rgba(100,116,139,.14)", fg: "#51637a" };
}

export default function ConversationsPage() {
  const hydrated = useHasHydrated();
  const conversations = useConversationStore((s) => s.conversations);
  const storeSelected = useConversationStore((s) => s.selectedId);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const takeoverToHuman = useConversationStore((s) => s.takeoverToHuman);
  const returnToAi = useConversationStore((s) => s.returnToAi);
  const setConversationIdle = useConversationStore((s) => s.setConversationIdle);
  const closeConversation = useConversationStore((s) => s.closeConversation);
  const setStage = useConversationStore((s) => s.setStage);
  const setStaffNote = useConversationStore((s) => s.setStaffNote);
  const addHumanMessage = useConversationStore((s) => s.addHumanMessage);
  const getLatestOrderByConversation = useOrderStore((s) => s.getLatestOrderByConversation);

  // MO1 — member id→display-name map (names resolved server-side from the auth
  // user; `members` has no name column). Used to render «{name} تولّى المحادثة».
  // LIVE0 L5a — sourced from the shared members store (DB-backed + realtime) so a
  // name/role change reflects in assignee labels without a manual refresh.
  const teamMembers = useMembersStore((s) => s.members);
  const memberNames = useMemo(() => membersNameMap(teamMembers), [teamMembers]);
  // The owning member's display name (safe fallback, never blank) — empty when unowned.
  const ownerNameFor = (c: Conversation) =>
    c.assignedMemberId ? memberNames[c.assignedMemberId] || "موظف" : "";

  const query = useConsoleUi((s) => s.query);
  const focus = useConsoleUi((s) => s.focus);
  const clearFocus = useConsoleUi((s) => s.clearFocus);

  const [filter, setFilter] = useState<"all" | "escalation" | "order" | "idle">("all");
  const [localSel, setLocalSel] = useState<string | null>(null);

  const head = useRiseIn(0);
  const pane = useRiseIn(1);

  const list = useMemo(() => {
    if (!hydrated) return [] as Conversation[];
    const q = query.trim();
    return conversations.filter((c) => {
      if (filter === "escalation" && !isEscalated(c)) return false;
      if (filter === "order" && !(c.linkedOrderId || c.status === "بانتظار الدفع" || c.status === "طلب قيد البناء" || c.status === "طلب مكتمل")) return false;
      // «متروك» = customer's last message is unanswered (HUMAN_IDLE isn't surfaced client-side).
      if (filter === "idle") {
        // «متروك» = the real HUMAN_IDLE state; fall back to "customer waiting" only
        // for older rows without ownershipState.
        const idle = c.ownershipState === "HUMAN_IDLE"
          || (!c.ownershipState && c.messages[c.messages.length - 1]?.sender === "customer" && !isEscalated(c));
        if (!idle) return false;
      }
      if (q && !(c.customer.includes(q) || c.phone.includes(q))) return false;
      return true;
    });
  }, [conversations, filter, query, hydrated]);

  const selectedId = localSel ?? storeSelected;
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // deeplink: /conversations?c=<conversationId> pre-opens that thread (from
  // Orders / Customers). Applied once; `selected` searches the full list so a
  // filtered-out conversation still opens.
  const deepRef = useRef(false);
  const deepConv = useRef<string | null>(null);
  useEffect(() => {
    if (deepRef.current || !hydrated) return;
    const id = new URLSearchParams(window.location.search).get("c");
    if (id && conversations.some((c) => c.id === id)) {
      deepConv.current = id;
      setLocalSel(id);
      selectConversation(id);
    }
    deepRef.current = true;
  }, [hydrated, conversations, selectConversation]);

  // SR1 — global-search result click: open the chosen conversation (reactive,
  // same-page too — a fresh focus object re-triggers). One-shot (cleared after).
  useEffect(() => {
    if (!focus || focus.kind !== "conversation" || !hydrated) return;
    if (conversations.some((c) => c.id === focus.id)) {
      deepConv.current = focus.id;
      setLocalSel(focus.id);
      selectConversation(focus.id);
      clearFocus();
    }
  }, [focus, hydrated, conversations, selectConversation, clearFocus]);

  useEffect(() => {
    // don't auto-pick the first thread while a deeplink owns the selection.
    if (!selected && !deepConv.current && list.length) setLocalSel(list[0].id);
  }, [list, selected]);

  const open = (id: string) => { setLocalSel(id); selectConversation(id); };

  // MO2 — takeover is now an atomic claim: surface the REAL result. On a lost race
  // the store returns {ok:false, code:"already_claimed", conflictName} (and refreshes
  // the row); we tell the operator who already owns it instead of silently stealing.
  const handleTakeover = (id: string) => {
    void runActionOutcome("جارٍ الاستلام…", async () => {
      const r = await takeoverToHuman(id);
      if (r.ok) return { state: "success", message: "استلمت المحادثة" };
      if (r.code === "already_claimed") {
        return { state: "info", message: r.conflictName ? `${r.conflictName} تولّاها بالفعل` : "المحادثة اتأخذت بالفعل" };
      }
      return { state: "failed", message: "تعذّر استلام المحادثة", retry: true };
    });
  };

  const needIntervention = hydrated ? countEscalations(conversations) : 0;
  // FR-004 — count with the SHARED bucket, not the local ownView.
  // ownView has no case for HOLD_UNCLAIMED or AI_RESUME_PENDING, so both fell to
  // its default and were classified by the legacy `owner` flag. A conversation
  // sitting unclaimed, waiting for a human, was therefore counted here as "safe
  // with Karim" — the number told the operator the opposite of the truth.
  // conversationBucket routes both to "gate" and is unit-tested in
  // lib/console-v2/display-state.test.ts.
  const aiSafe = hydrated
    ? conversations.filter(
        (c) =>
          conversationBucket(
            c.ownershipState ?? (c.owner === "human" ? "HUMAN_ACTIVE" : "AI_ACTIVE"),
            resolveHold(c),
          ) === "karim",
      ).length
    : 0;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: "var(--kv-text)" }}>
      {/* Header + triage */}
      <header style={{ ...head.style, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 11px", borderRadius: 99, background: "rgba(14,159,110,.10)", color: "var(--kv-deep)", fontSize: 10.5, fontWeight: 800 }}>سطح العمل المباشر</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "9px 0 0" }}>المحادثات</h1>
        </div>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 11, flexWrap: "wrap" }}>
          <TriageTile value={needIntervention} label="محتاجة تدخّل الآن" tone="red" />
          <TriageTile value={aiSafe} label="مع كريم بدون تنبيه" tone="green" />
          {/* avg response time not reliably derivable client-side → gathering (honest) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 16px", borderRadius: 14, background: "var(--kv-card)", border: "1px solid var(--kv-border)" }}>
            <div>
              <KvSkeletonBlock style={{ width: 34, height: 12, marginBottom: 4 }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)" }}>متوسط زمن الرد · بنجمع بيانات</div>
            </div>
          </div>
        </div>
      </header>

      {/* 3 pane */}
      <section style={{ ...pane.style, display: "grid", gridTemplateColumns: "328px 1fr 304px", gap: 14, height: 620, marginTop: 14 }}>
        {/* QUEUE */}
        <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #eef2f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>صندوق المحادثات</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{toAr(conversations.length)} محادثة</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 11 }}>
              {([["all", "الكل"], ["escalation", "تصعيد"], ["order", "طلب"], ["idle", "متروك"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setFilter(k)} style={{
                  height: 26, padding: "0 11px", borderRadius: 99, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800,
                  border: filter === k ? "0" : "1px solid var(--kv-border)",
                  background: filter === k ? "var(--kv-primary)" : "var(--kv-card)",
                  color: filter === k ? "#fff" : "var(--kv-muted)",
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div className="kv-scroll" style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {!hydrated || list.length === 0 ? (
              <div style={{ padding: "48px 12px", textAlign: "center", color: "var(--kv-faint)", fontSize: 12.5, fontWeight: 600 }}>
                {hydrated ? "مفيش محادثات في النطاق ده لسه" : "بنحمّل…"}
              </div>
            ) : (
              list.map((c) => {
                const sel = c.id === selectedId;
                const esc = isEscalated(c);
                const pill = intentPill(c);
                const snippet = c.lastMessage || c.messages[c.messages.length - 1]?.text || "";
                return (
                  <button key={c.id} onClick={() => open(c.id)} style={{
                    display: "block", width: "100%", textAlign: "start", cursor: "pointer", fontFamily: "inherit",
                    padding: 11, borderRadius: 13, marginBottom: 7,
                    background: sel ? "linear-gradient(155deg,rgba(14,159,110,.08),rgba(14,159,110,.02))" : "transparent",
                    border: sel ? "1px solid rgba(14,159,110,.22)" : "1px solid transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, color: "#fff", background: c.avatarColor || "var(--kv-primary)" }}>{c.customer.trim().charAt(0) || "ع"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800 }}>{c.customer}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          <span style={{ height: 17, display: "inline-flex", alignItems: "center", padding: "0 7px", borderRadius: 99, background: pill.bg, color: pill.fg, fontSize: 8.5, fontWeight: 800 }}>{pill.label}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--kv-faint)" }}>{CHANNEL_AR[c.channel] ?? c.channel}</span>
                          {/* MO1 — named ownership badge: who took the conversation */}
                          {ownView(c) === "HUMAN" && ownerNameFor(c) && (
                            <span style={{ height: 17, display: "inline-flex", alignItems: "center", gap: 3, padding: "0 7px", borderRadius: 99, background: "rgba(192,73,47,.10)", color: "#a8412c", fontSize: 8.5, fontWeight: 800 }}>
                              <UserCheck size={9} /> {ownerNameFor(c)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: esc ? "#c0492f" : "var(--kv-faint)" }}>{c.lastTime}</span>
                    </div>
                    {snippet && <div style={{ fontSize: 10, color: "var(--kv-faint)", fontWeight: 600, marginTop: 8, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snippet}</div>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* THREAD */}
        {selected ? <Thread key={selected.id} c={selected} onTakeover={handleTakeover} onReturn={returnToAi} onSend={addHumanMessage} latestOrder={getLatestOrderByConversation(selected.id)} /> : (
          <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", display: "grid", placeItems: "center", color: "var(--kv-faint)", fontWeight: 600 }}>اختر محادثة</div>
        )}

        {/* ACTION RAIL */}
        {selected ? <Rail key={`r-${selected.id}`} c={selected} onTakeover={handleTakeover} onReturn={returnToAi} onWait={setConversationIdle} onClose={closeConversation} onSetStage={setStage} onSetStaffNote={setStaffNote} latestOrder={getLatestOrderByConversation(selected.id)} ownerName={ownerNameFor(selected)} /> : <div />}
      </section>
    </div>
  );
}

function TriageTile({ value, label, tone }: { value: number; label: string; tone: "red" | "green" }) {
  const red = tone === "red";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 52, padding: "0 16px", borderRadius: 14, background: red ? "linear-gradient(155deg,#fff,#fdf3f0)" : "linear-gradient(155deg,#fff,#f0f9f5)", border: `1px solid ${red ? "rgba(192,73,47,.22)" : "rgba(14,159,110,.2)"}` }}>
      <span className={red ? "kv-urgent" : "kv-pulse"} style={{ width: 9, height: 9, borderRadius: "50%", background: red ? "#c0492f" : "var(--kv-primary)" }} />
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: red ? "#c0492f" : "#0a8a5f", lineHeight: 1 }}>{toAr(value)}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: red ? "#9a5440" : "#5b8472", marginTop: 1 }}>{label}</div>
      </div>
    </div>
  );
}

function ownerLine(c: Conversation): string {
  if (c.owner === "human") return "محوّلة للفريق";
  return "كريم بيرد";
}

function Thread({ c, onTakeover, onReturn, onSend, latestOrder }: {
  c: Conversation;
  onTakeover: (id: string) => void;
  onReturn: (id: string, note?: string) => void;
  // FR-005 — the wire outcome, not void. addHumanMessage returns the
  // /api/whatsapp/send code, and discarding it is why a failed reply used to
  // vanish silently: the draft cleared and nothing said the message never left.
  onSend: (id: string, text: string) => Promise<{ ok: boolean; code?: string } | null> | void;
  latestOrder: ReturnType<ReturnType<typeof useOrderStore.getState>["getLatestOrderByConversation"]> | undefined;
}) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const tr = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  // FR-003 — is the operator parked near the bottom? If they have scrolled up
  // to read history, a new realtime message must NOT yank them back down.
  // Without this the transcript jumped on every inbound message, which on a busy
  // thread makes reading what the customer said earlier effectively impossible.
  const stickToBottom = useRef(true);

  const onThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Switching conversations → jump to the latest instantly, and re-arm sticking.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
  }, [c.id]);

  // New message / typing → auto-scroll ONLY if they were already at the bottom.
  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [c.messages.length, c.aiTyping]);
  // MO3 — ephemeral operator presence for THIS conversation (realtime, no DB).
  // Advisory only; never gates actions (MO2's claim is the authority).
  const { others, setTyping } = useConversationPresence(c.id);
  const presence = presenceLabel(others);
  const view = ownView(c);
  const humanOwns = view === "HUMAN";
  const canTakeover = view !== "HUMAN";
  const hold = resolveHold(c, latestOrder?.notes);
  const reason = c.escalationReason || (hold ? "تعليق أمان · حساسية" : isEscalated(c) ? "محتاجة تدخّل" : "");
  const orderNo = latestOrder?.orderNumber;

  const submit = async () => {
    const text = draft.trim();
    if (!text || !humanOwns || sending) return;
    setSending(true);
    setSendError(null);
    // Clear optimistically — the store echoes the message into the thread.
    setDraft("");
    try {
      const res = await onSend(c.id, text);
      // null => no wire attempt (demo mode / no persisted row); nothing to report.
      if (res && !res.ok) {
        // FR-005 — outside the WhatsApp 24-hour customer-care window a free-form
        // reply is not allowed at all, so "try again" is a lie. sendFailureMessageKey
        // maps the wire code to the honest line and keeps that mapping in one
        // unit-tested place instead of drifting from the route's contract.
        setSendError(tr(sendFailureMessageKey(res.code)));
        setDraft(text); // give the operator their text back — it never left.
      }
    } catch {
      setSendError(tr(sendFailureMessageKey(null)));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", display: "grid", gridTemplateRows: "auto 1fr auto", overflow: "hidden" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #eef2f0", background: "rgba(255,255,255,.6)" }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14, color: "#fff", background: c.avatarColor || "var(--kv-primary)" }}>{c.customer.trim().charAt(0) || "ع"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{c.customer}</span>
            {/* WB2 — sales stage badge (separate from ownership + order status). */}
            <StageBadge stage={c.stage} />
            {/* WB3 — light «من إعلان» marker when the lead arrived via a Meta ad. */}
            <AdBadge c={c} />
          </div>
          <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginTop: 2 }}>
            {CHANNEL_AR[c.channel] ?? c.channel} · {ownerLine(c)}{orderNo ? ` · طلب #${toAr(orderNo)}` : ""}{reason ? ` · السبب: ${reason}` : ""}
          </div>
          {/* MO3 — other operators present on this conversation (ephemeral). */}
          {presence && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, height: 18, padding: "0 8px", borderRadius: 99, background: "rgba(124,92,208,.1)", color: "#6243b0", fontSize: 9.5, fontWeight: 800 }}>
              <span className="kv-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#7c5cd0", flex: "none" }} />
              {presence}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {/* assign-to-team → takeover (HUMAN_IDLE assign isn't exposed; TODO) */}
          <button onClick={() => onTakeover(c.id)} disabled={!canTakeover} style={ghostBtn(!canTakeover)}>إسناد للفريق</button>
          <button onClick={() => onTakeover(c.id)} disabled={!canTakeover} style={primaryBtn(!canTakeover)}>استلم وردّ</button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} onScroll={onThreadScroll} className="kv-scroll" style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 11, background: "linear-gradient(180deg,rgba(244,248,246,.5),rgba(255,255,255,.2))" }}>
        {c.messages.map((m) => {
          if (m.sender === "system") {
            const urgent = ALLERGY_RE.test(m.text) || /صعّد|تحويل|تصعيد/.test(m.text);
            return (
              <div key={m.id} style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 7, minHeight: 28, padding: "5px 13px", borderRadius: 99, border: urgent ? "1px dashed rgba(192,73,47,.4)" : "1px solid var(--kv-border)", background: urgent ? "rgba(192,73,47,.07)" : "var(--kv-card-soft)", color: urgent ? "#a8412c" : "var(--kv-muted)", fontSize: 10, fontWeight: 800, textAlign: "center" }}>
                {urgent && <span className="kv-urgent" style={{ width: 7, height: 7, borderRadius: "50%", background: "#c0492f" }} />}
                {m.text}
              </div>
            );
          }
          const mine = m.sender === "customer";
          const isAi = m.sender === "ai";
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "74%" }}>
              <div style={{
                padding: "9px 12px", fontSize: 11.5, lineHeight: 1.55, fontWeight: 600,
                borderRadius: mine ? "14px 14px 14px 5px" : "14px 14px 5px 14px",
                background: mine ? "#fff" : isAi ? "linear-gradient(180deg,rgba(224,245,238,.9),rgba(212,242,231,.85))" : "rgba(100,116,139,.10)",
                border: mine ? "1px solid #eef2f0" : isAi ? "1px solid rgba(14,159,110,.18)" : "1px solid var(--kv-border)",
                color: isAi ? "#1f3b33" : "var(--kv-text)",
                boxShadow: mine ? "0 6px 16px -12px rgba(16,60,44,.4)" : "none",
              }}>{m.text}</div>
              <div style={{ fontSize: 9, fontWeight: 700, marginTop: 3, textAlign: mine ? "right" : "left", color: isAi ? "#0a8a5f" : "var(--kv-faint)" }}>
                {isAi ? "كريم" : m.sender === "human" ? "الفريق" : c.customer} · {m.time}
              </div>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div style={{ padding: "11px 14px", borderTop: "1px solid #eef2f0", background: "rgba(255,255,255,.6)" }}>
        {humanOwns ? (
          <>
          {/* FR-005 — a reply that never left the building says so, in the
              honest words for WHY. Outside the 24h window this is not a
              "try again" situation, so it must not read like one. Amber, not
              red: the send failed, nothing is broken. */}
          {sendError && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 11px", borderRadius: 10, border: "1px solid rgba(176,122,10,.35)", background: "rgba(176,122,10,.08)" }}>
              <AlertTriangle size={14} color="#b07a0a" aria-hidden />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#8a5f08" }}>{sendError}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, border: "1px solid var(--kv-border)", background: "#fff", padding: "7px 9px 7px 13px" }}>
            <input value={draft} onChange={(e) => { setDraft(e.target.value); setTyping(true); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="اكتب ردّ الفريق… كريم متوقّف عن الرد لحد ما تحلّ التصعيد أو ترجّعها له" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--kv-text)" }} />
            <button onClick={submit} disabled={sending} aria-label="إرسال" style={{ width: 32, height: 32, borderRadius: 10, border: 0, background: "var(--kv-primary)", color: "#fff", display: "grid", placeItems: "center", cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1, flex: "none" }}><Send size={15} /></button>
          </div>
          </>
        ) : view === "HOLD" ? (
          // SYSTEM_HOLD → composer locked; Karim is silent. Release ONLY by a
          // deliberate action (take over to reply, or return-to-AI via the chooser).
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, border: "1px dashed rgba(192,73,47,.4)", background: "rgba(192,73,47,.06)", padding: "11px 13px" }}>
            <Lock size={14} color="#c0492f" />
            <span style={{ flex: 1, fontSize: 11, color: "#a8412c", fontWeight: 700 }}>تعليق أمان — كريم متوقّف. استلم المحادثة للرد، والرجوع لكريم بقرار صريح فقط.</span>
          </div>
        ) : (
          // AI owns → composer INERT. Staff can't type into Karim's thread; take over first.
          <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, border: "1px dashed var(--kv-border)", background: "var(--kv-card-soft)", padding: "11px 13px" }}>
            <Lock size={14} color="#9aa8a0" />
            <span style={{ flex: 1, fontSize: 11, color: "var(--kv-faint)", fontWeight: 600 }}>كريم بيرد على المحادثة دلوقتي — اضغط «استلم وردّ» عشان تكتب.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Rail({ c, onTakeover, onReturn, onWait, onClose, onSetStage, onSetStaffNote, latestOrder, ownerName }: {
  c: Conversation;
  onTakeover: (id: string) => void;
  onReturn: (id: string, note?: string) => void;
  onWait: (id: string) => Promise<boolean>;
  onClose: (id: string) => Promise<boolean>;
  onSetStage: (id: string, stage: ConversationStage) => Promise<boolean>;
  onSetStaffNote: (id: string, note: string) => Promise<boolean>;
  latestOrder: ReturnType<ReturnType<typeof useOrderStore.getState>["getLatestOrderByConversation"]> | undefined;
  ownerName?: string;
}) {
  const [chooser, setChooser] = useState(false);
  // WB-FIX-1 — internal staff-note draft. `noteDirty` tracks whether the operator is
  // mid-edit. When the persisted value changes externally (initial DB load replacing
  // the optimistic conversation, OR another operator's edit via realtime) AND the
  // field is NOT dirty, sync the draft so it never shows stale text; if the operator
  // IS typing, their in-progress text is left untouched.
  const [noteDraft, setNoteDraft] = useState(c.staffNotes ?? "");
  const [noteDirty, setNoteDirty] = useState(false);
  useEffect(() => {
    if (!noteDirty) setNoteDraft(c.staffNotes ?? "");
  }, [c.staffNotes, noteDirty]);
  const view = ownView(c);
  const hold = resolveHold(c, latestOrder?.notes);
  const canTakeover = view !== "HUMAN";
  // Deliberate release to AI is legal from HUMAN and from SYSTEM_HOLD (the only
  // legal SYSTEM_HOLD → AI_ACTIVE path is this explicit operator release).
  const canReturn = view === "HUMAN" || view === "HOLD";
  const redOwn = view === "HUMAN" || view === "HOLD";
  const ownColor = redOwn ? "#c0492f" : view === "CLOSED" ? "#51637a" : "#0a8a5f";
  const ownBg = redOwn ? "rgba(192,73,47,.06)" : view === "CLOSED" ? "rgba(100,116,139,.08)" : "rgba(14,159,110,.06)";
  const ownBorder = redOwn ? "rgba(192,73,47,.16)" : view === "CLOSED" ? "rgba(100,116,139,.18)" : "rgba(14,159,110,.18)";
  // MO1 — named ownership: when a member owns it, say WHO. Safe fallback "موظف"
  // (never blank) is already applied upstream in ownerNameFor.
  const owner = ownerName?.trim();
  const ownLabel = view === "AI" ? "كريم نشط على المحادثة"
    : view === "HOLD" ? "تعليق أمان — مقفول"
    : view === "CLOSED" ? "المحادثة مقفولة"
    : c.ownershipState === "HUMAN_IDLE" ? (owner ? `${owner} · مستنية مع الفريق` : "محوّلة للفريق · مستنية")
    : owner ? `${owner} تولّى المحادثة` : "مع الفريق";

  // R5 — continue/ask resume via the existing returnToAi(note) (unchanged). wait/
  // close now perform REAL ownership transitions (HUMAN_IDLE / CLOSED) with R1
  // feedback. They're offered ONLY from a human-owned thread, never a SYSTEM_HOLD:
  // a safety hold must be deliberately released (continue/ask) or taken over — it
  // can't be parked-idle or closed-around (setOwnershipState also enforces this).
  const canWaitClose = view === "HUMAN";
  const chooseNext = (key: "continue" | "ask" | "wait" | "close") => {
    if (key === "wait" || key === "close") {
      if (!canWaitClose) return; // disabled for SYSTEM_HOLD — never a silent close-around
      setChooser(false);
      if (key === "wait") {
        void runAction(
          { pending: "جارٍ التحويل للانتظار…", success: "المحادثة مستنية مع الفريق", error: "تعذّر التحويل", retry: true },
          () => onWait(c.id),
        );
      } else {
        void runAction(
          { pending: "جارٍ الإقفال…", success: "تم إقفال المحادثة", error: "تعذّر إقفال المحادثة", retry: true },
          () => onClose(c.id),
        );
      }
      return;
    }
    setChooser(false);
    if (key === "continue") onReturn(c.id, "كمّل الطلب");
    else if (key === "ask") onReturn(c.id, "اسأل عن الناقص");
  };

  // WB2 — quick-set a sales stage with R1 feedback (separate from ownership).
  const quickStage = (stage: ConversationStage) => {
    void runAction(
      { pending: "جارٍ تحديث المرحلة…", success: `المرحلة: ${CONVERSATION_STAGE_LABELS[stage]}`, error: "تعذّر تحديث المرحلة", retry: true },
      () => onSetStage(c.id, stage),
    );
  };

  return (
    <div className="kv-scroll" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ownership */}
      <Card>
        <CardLabel>ملكية المحادثة</CardLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 10, borderRadius: 12, background: ownBg, border: `1px solid ${ownBorder}` }}>
          {view === "HOLD" ? <Lock size={13} color={ownColor} /> : <span className={view === "AI" ? "kv-pulse" : redOwn ? "kv-urgent" : undefined} style={{ width: 8, height: 8, borderRadius: "50%", background: ownColor }} />}
          <div style={{ fontSize: 11.5, fontWeight: 800, color: ownColor }}>{ownLabel}</div>
        </div>
        <button onClick={() => onTakeover(c.id)} disabled={!canTakeover} style={{ ...primaryBtn(!canTakeover), width: "100%", height: 40, marginTop: 10, gap: 8 }}>
          <ArrowLeft size={15} /> استلم المحادثة
        </button>
        {/* return-to-AI → deliberate chooser (never blind resume); also the legal release for SYSTEM_HOLD */}
        <button onClick={() => setChooser((v) => !v)} disabled={!canReturn} style={{ width: "100%", height: 36, marginTop: 8, border: "1px solid var(--kv-border)", borderRadius: 12, background: canReturn ? "#fff" : "var(--kv-card-soft)", color: canReturn ? "var(--kv-muted)" : "var(--kv-faint)", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", cursor: canReturn ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          <CornerUpLeft size={14} /> رجّعها لكريم
        </button>
        {chooser && (
          <div style={{ marginTop: 8, border: "1px solid var(--kv-border)", borderRadius: 12, padding: 10, background: "var(--kv-card-soft)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--kv-muted)", marginBottom: 8 }}>ترجّعها لكريم يعمل إيه؟</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <ChooserBtn onClick={() => chooseNext("continue")}>كمّل الطلب</ChooserBtn>
              <ChooserBtn onClick={() => chooseNext("ask")}>اسأل عن الناقص</ChooserBtn>
              <ChooserBtn onClick={() => chooseNext("wait")} disabled={!canWaitClose} title={!canWaitClose ? "غير متاح أثناء تعليق الأمان" : undefined}>استنى</ChooserBtn>
              <ChooserBtn onClick={() => chooseNext("close")} disabled={!canWaitClose} title={!canWaitClose ? "غير متاح أثناء تعليق الأمان" : undefined}>اقفل المحادثة</ChooserBtn>
            </div>
          </div>
        )}
      </Card>

      {/* WB2 — conversation sales STAGE (separate axis from ownership above and
          from the order's status below). Manual control + the high-value Be-On
          quick-actions. Setting a stage never changes ownership or order status. */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <CardLabel noMargin>مرحلة المحادثة</CardLabel>
          <StageBadge stage={c.stage} />
        </div>
        <select
          value={c.stage ?? "new"} aria-label="مرحلة المحادثة"
          onChange={(e) => {
            const next = e.target.value as ConversationStage;
            void runAction(
              { pending: "جارٍ تحديث المرحلة…", success: `المرحلة: ${CONVERSATION_STAGE_LABELS[next]}`, error: "تعذّر تحديث المرحلة", retry: true },
              () => onSetStage(c.id, next),
            );
          }}
          style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 12, border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-text)", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
        >
          {CONVERSATION_STAGES.map((s) => (
            <option key={s} value={s}>{CONVERSATION_STAGE_LABELS[s]}</option>
          ))}
        </select>
        {/* Explicit quick-actions for the high-value Be-On stages. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
          <StageQuickBtn label="لا يرد" active={c.stage === "no_answer"} onClick={() => quickStage("no_answer")} />
          <StageQuickBtn label="متابعة" active={c.stage === "follow_up"} onClick={() => quickStage("follow_up")} />
          <StageQuickBtn label="مغلق" active={c.stage === "closed"} onClick={() => quickStage("closed")} />
          <StageQuickBtn label="إعادة فتح" active={c.stage === "new"} onClick={() => quickStage("new")} />
        </div>
      </Card>

      {/* order state */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <CardLabel noMargin>حالة الطلب</CardLabel>
          {latestOrder && <span style={{ height: 19, display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: 99, background: "rgba(201,138,31,.16)", color: "#9a6a14", fontSize: 9, fontWeight: 800 }}>{latestOrder.orderStatus === "delivered" ? "اتسلّم" : "نشط"}</span>}
        </div>
        {latestOrder ? (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>طلب #{toAr(latestOrder.orderNumber)}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 9 }}>
              {latestOrder.items.slice(0, 4).map((it, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, fontWeight: 600, color: "var(--kv-muted)" }}>
                  <span>{it.name} ×{toAr(it.quantity)}</span><span>{money(it.total)} {latestOrder.currency}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: "#eef2f0", margin: "10px 0" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--kv-faint)" }}>{latestOrder.paymentStatus === "paid" ? "مدفوع" : "الدفع عند الاستلام"}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-deep)" }}>{money(latestOrder.total)} {latestOrder.currency}</span>
            </div>
            <Link href={`/orders?o=${latestOrder.id}`} style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 10.5, fontWeight: 800, color: "var(--kv-deep)", textDecoration: "none" }}>افتح الطلب ←</Link>
          </>
        ) : (
          <div style={{ fontSize: 11, color: "var(--kv-faint)", fontWeight: 600 }}>لسه مفيش طلب في المحادثة دي.</div>
        )}
      </Card>

      {/* allergy / safety risk — SAFETY-CRITICAL: operational hint, NOT a guarantee */}
      {hold && (
        <div style={{ borderRadius: 16, background: "linear-gradient(155deg,#fff,#fdf3f0)", border: "1px solid rgba(192,73,47,.22)", boxShadow: "var(--kv-shadow-panel)", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} color="#c0492f" />
            <span style={{ fontSize: 12, fontWeight: 800, color: "#a8412c" }}>تنبيه حساسية</span>
            <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, height: 19, padding: "0 8px", borderRadius: 99, background: "rgba(192,73,47,.1)", color: "#c0492f", fontSize: 8.5, fontWeight: 800 }}><Lock size={10} /> مقفول</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#7a4a3d", fontWeight: 600, marginTop: 7, lineHeight: 1.5 }}>
            العميلة ذكرت حساسية مكسرات. ده تنبيه تشغيلي للفريق — مش ضمان سلامة، أكّد المكوّنات قبل ما تأكّد. لازم رجوع متعمّد لكريم بعد الحل.
          </div>
        </div>
      )}

      {/* customer memory — real /api/customer-memory (honest-empty) */}
      <MemoryCard customerId={c.customerId} />

      {/* WB-FIX-1 — internal staff note. Staff-only: NEVER shown to the customer and
          NEVER read into Karim's prompt. Distinct from the return-to-Karim note. */}
      <Card>
        <CardLabel>ملاحظات داخلية للفريق</CardLabel>
        <div style={{ fontSize: 9.5, color: "var(--kv-faint)", fontWeight: 700, marginBottom: 8 }}>
          🔒 داخلي للفريق فقط — مش بيظهر للعميل ولا بيوصل لكريم.
        </div>
        <textarea
          value={noteDraft}
          onChange={(e) => { setNoteDraft(e.target.value); setNoteDirty(true); }}
          maxLength={2000}
          placeholder="اكتب ملاحظة داخلية عن المحادثة…"
          rows={3}
          style={{ width: "100%", resize: "vertical", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card-soft)", fontSize: 12, fontWeight: 600, color: "var(--kv-text)", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <button
          onClick={async () => {
            const ok = await runAction(
              { pending: "جارٍ الحفظ…", success: "اتسجّلت الملاحظة", error: "تعذّر حفظ الملاحظة", retry: true },
              () => onSetStaffNote(c.id, noteDraft),
            );
            // On success, clear dirty so future external (realtime) updates re-sync.
            if (ok) setNoteDirty(false);
          }}
          disabled={!noteDirty}
          style={{ marginTop: 8, height: 34, width: "100%", borderRadius: 10, border: 0, background: noteDirty ? "var(--kv-grad-brand)" : "var(--kv-card-soft)", color: noteDirty ? "#fff" : "var(--kv-faint)", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", cursor: noteDirty ? "pointer" : "default" }}
        >
          حفظ الملاحظة
        </button>
      </Card>
    </div>
  );
}

// ── small UI atoms ──
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ borderRadius: 16, background: "var(--kv-card)", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-panel)", padding: "15px 16px" }}>{children}</div>;
}
function CardLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)", marginBottom: noMargin ? 0 : 10 }}>{children}</div>;
}
function ChooserBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button onClick={onClick} disabled={disabled} title={title} style={{ height: 32, border: "1px solid var(--kv-border)", borderRadius: 9, background: disabled ? "var(--kv-card-soft)" : "#fff", color: disabled ? "var(--kv-faint)" : "var(--kv-text)", fontSize: 10.5, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>{children}</button>;
}
// WB2 — sales-stage badge (amber chip; distinct from ownership + order pills).
function StageBadge({ stage }: { stage?: ConversationStage }) {
  const s = stage ?? "new";
  return (
    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", height: 18, padding: "0 8px", borderRadius: 99, background: "rgba(124,92,208,.12)", color: "#6243b0", fontSize: 9.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      {CONVERSATION_STAGE_LABELS[s]}
    </span>
  );
}
// WB3 — «من إعلان» marker: shown ONLY when the conversation carries Meta ad
// referral context (organic conversations render nothing — never false-tagged).
// Light indicator only; campaign analytics is deferred (P2). Tooltip shows the ad
// headline when present so staff have context without a heavy panel.
function AdBadge({ c }: { c: Conversation }) {
  // Mirror the backend sentinel (lib/db/messages.ts): a Meta referral can lack
  // source_id and carry only ctwa_clid / headline / url, so consider the lead
  // ad-originated if ANY of the six ad fields is set. Organic (all six null) stays
  // un-badged — never false-tagged.
  const fromAd = !!(c.adSourceType || c.adSourceId || c.adHeadline || c.adBody || c.adReferrerUrl || c.adCtwaClid);
  if (!fromAd) return null;
  const tip = c.adHeadline || c.adBody || c.adReferrerUrl || "إعلان Meta";
  return (
    <span title={tip} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 4, height: 18, padding: "0 8px", borderRadius: 99, background: "rgba(37,99,235,.12)", color: "#2563eb", fontSize: 9.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      <Megaphone size={11} /> من إعلان
    </span>
  );
}
function StageQuickBtn({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ height: 32, border: "1px solid " + (active ? "rgba(124,92,208,.4)" : "var(--kv-border)"), borderRadius: 9, background: active ? "rgba(124,92,208,.1)" : "#fff", color: active ? "#6243b0" : "var(--kv-muted)", fontSize: 10.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
      {label}
    </button>
  );
}
function primaryBtn(disabled?: boolean): React.CSSProperties {
  return { height: 31, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 13px", borderRadius: 10, border: 0, background: disabled ? "#cdd9d2" : "var(--kv-primary)", color: "#fff", fontSize: 10.5, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", boxShadow: disabled ? "none" : "0 14px 26px -16px rgba(14,159,110,.7)" };
}
function ghostBtn(disabled?: boolean): React.CSSProperties {
  return { height: 31, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderRadius: 10, border: "1px solid var(--kv-border)", background: "#fff", color: disabled ? "var(--kv-faint)" : "var(--kv-muted)", fontSize: 10.5, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer" };
}

// Kivo memory card — fetches the real gated endpoint; renders nothing-ish on empty.
type Memory = {
  order_count: number;
  last_seen: string | null;
  fulfillment_pref: "delivery" | "pickup" | null;
  favorite_items?: { name: string; qty: number }[];
  inferred?: { allergy_notes?: string[] };
};
function MemoryCard({ customerId }: { customerId?: string }) {
  const [mem, setMem] = useState<Memory | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!customerId) { setLoaded(true); return; }
    let alive = true;
    fetch(`/api/customer-memory?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) { setMem(d?.memory ?? d ?? null); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [customerId]);

  if (!loaded || !mem || !mem.order_count) {
    // honest empty — no invented preferences
    return (
      <Card>
        <CardLabel>ذاكرة العميل</CardLabel>
        <div style={{ fontSize: 10.5, color: "var(--kv-faint)", fontWeight: 600 }}>لسه مفيش ذاكرة محفوظة للعميل ده.</div>
      </Card>
    );
  }
  const ageDays = mem.last_seen ? Math.round((Date.now() - new Date(mem.last_seen).getTime()) / 86400000) : null;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <CardLabel noMargin>ذاكرة العميل</CardLabel>
        <span style={{ height: 18, display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: 99, background: "rgba(14,159,110,.1)", color: "#0a8a5f", fontSize: 8.5, fontWeight: 800 }}>حقائق</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--kv-muted)", fontWeight: 600, lineHeight: 1.7 }}>
        عميل عائد · {toAr(mem.order_count)} طلب سابق
        {mem.favorite_items?.[0] ? <><br />بيفضّل: {mem.favorite_items[0].name}</> : null}
        {ageDays != null ? <><br />آخر طلب: من {toAr(ageDays)} يوم</> : null}
      </div>
      {/* allergy notes are inference — operator hint only, never a safety basis */}
      {mem.inferred?.allergy_notes?.length ? (
        <div style={{ marginTop: 9, fontSize: 10, color: "#7a4a3d", fontWeight: 600, lineHeight: 1.5, background: "rgba(192,73,47,.06)", border: "1px solid rgba(192,73,47,.16)", borderRadius: 10, padding: "8px 10px" }}>
          قراءة آلية · غير مؤكدة: {mem.inferred.allergy_notes.join("، ")} — تنبيه تشغيلي مش ضمان سلامة.
        </div>
      ) : null}
    </Card>
  );
}
