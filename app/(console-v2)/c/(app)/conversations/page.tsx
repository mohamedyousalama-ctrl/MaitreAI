"use client";

// ============================================================================
// console_v2 item 6 — Conversations. The ownership spine, rendered.
//
// LAWS honored:
//  • ownership vocabulary ONLY through deriveConversationDisplay() — blue = Karim's
//    stage, amber = human-held, red = safety lock (the one red).
//  • takeover-at-SEND (MO2): the composer's SEND is the single product-wide trigger.
//    Sending an AI-owned/idle/held conversation fires the atomic claim FIRST; a lost
//    race renders «تولّاها زميل بالفعل», and the message is NOT sent.
//  • R6 attribution: every bubble carries its author via <AttributionChip> — a TEAM
//    bubble is visibly the operator, never mistaken for Karim.
//  • close goes through the server-authoritative close route (the ONE outcome trigger).
//  • allergen name is OFF the glance surfaces: a safety lock shows the lock + the
//    verbatim operator-hint microcopy, never the allergen itself, on the list.
//  • assign-to-a-teammate has no backing route yet → rendered SOON, never faked.
// ============================================================================

import { useMemo, useState } from "react";
import { Send, Lock, CornerUpLeft, CheckCircle2 } from "lucide-react";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated } from "@/lib/store";
import { deriveConversationDisplay, type ConversationOwnershipState } from "@/lib/console-v2/display-state";
import { StateChip, TruthChip, AttributionChip } from "@/components/console-v2";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";
import { CONVERSATION_STAGE_LABELS, type Conversation } from "@/lib/types";

type Tab = "floor" | "closed";

const ownOf = (c: Conversation): ConversationOwnershipState => c.ownershipState ?? "AI_ACTIVE";
const isHold = (c: Conversation) => c.isSafetyHold === true || ownOf(c) === "SYSTEM_HOLD";

export default function ConversationsPage() {
  const t = useT();
  const hydrated = useHasHydrated();
  const conversations = useConversationStore((s) => s.conversations);
  const selectedId = useConversationStore((s) => s.selectedId);
  const select = useConversationStore((s) => s.selectConversation);
  const [tab, setTab] = useState<Tab>("floor");

  const { floor, closed } = useMemo(() => {
    const floor: Conversation[] = [];
    const closed: Conversation[] = [];
    for (const c of conversations) (ownOf(c) === "CLOSED" ? closed : floor).push(c);
    // Safety holds first (they're the only thing that must never be missed), then the rest.
    floor.sort((a, b) => Number(isHold(b)) - Number(isHold(a)));
    return { floor, closed };
  }, [conversations]);

  const list = tab === "floor" ? floor : closed;
  const selected = conversations.find((c) => c.id === selectedId && list.includes(c)) ?? null;

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 48px)" }}>
      {/* LEFT — Floor / Closed list */}
      <aside style={{ width: 340, flex: "none", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 12px" }}>{t("conv.title")}</h1>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <TabButton active={tab === "floor"} onClick={() => setTab("floor")}>{t("conv.tabFloor")} · <Bdi>{floor.length}</Bdi></TabButton>
          <TabButton active={tab === "closed"} onClick={() => setTab("closed")}>{t("conv.tabClosed")} · <Bdi>{closed.length}</Bdi></TabButton>
        </div>
        <div className="kv-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
          {!hydrated ? null : list.length === 0 ? (
            <EmptyLine>{tab === "floor" ? t("conv.stageEmpty") : t("conv.closedEmpty")}</EmptyLine>
          ) : (
            list.map((c) => <ListRow key={c.id} conv={c} active={c.id === selectedId} onClick={() => select(c.id)} />)
          )}
        </div>
      </aside>

      {/* RIGHT — conversation view */}
      <section style={{ flex: 1, minWidth: 0, background: "var(--kv-card)", border: "1px solid var(--kv-border)", borderRadius: "var(--kv-r-lg)", boxShadow: "var(--kv-shadow-panel)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {selected ? <ConversationView conv={selected} /> : (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--kv-faint)", fontSize: 13, fontWeight: 700 }}>{t("conv.select")}</div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row — ownership chip + stage; allergen name NEVER on glance.
// ---------------------------------------------------------------------------
function ListRow({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const t = useT();
  const display = deriveConversationDisplay({ ownershipState: ownOf(conv), isSafetyHold: conv.isSafetyHold });
  const hold = isHold(conv);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 5, textAlign: "start", width: "100%",
        padding: "11px 13px", borderRadius: "var(--kv-r-md)", cursor: "pointer",
        border: active ? "1.5px solid var(--kv-primary)" : "1px solid var(--kv-border)",
        borderInlineStart: hold ? "3px solid #ff6b5e" : undefined,
        background: active ? "var(--kv-primary-tint)" : "var(--kv-card)", fontFamily: "var(--kv-font)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Bdi>{conv.customer}</Bdi>
        </span>
        {conv.unread > 0 && (
          <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "var(--kv-primary)", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Bdi>{conv.unread}</Bdi></span>
        )}
      </div>
      {/* Last message preview — for a safety hold, do NOT leak the allergen: show the lock line. */}
      <div style={{ fontSize: 12, color: "var(--kv-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
        {hold ? t("conv.safetyLock") : <Bdi>{conv.lastMessage}</Bdi>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <StateChip display={display} />
        {conv.stage && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--kv-faint)", background: "var(--kv-card-soft)", borderRadius: 6, padding: "3px 7px" }}>{CONVERSATION_STAGE_LABELS[conv.stage]}</span>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Conversation view — transcript (authorship-labeled) + composer + actions.
// ---------------------------------------------------------------------------
function ConversationView({ conv }: { conv: Conversation }) {
  const t = useT();
  const takeover = useConversationStore((s) => s.takeoverToHuman);
  const addHuman = useConversationStore((s) => s.addHumanMessage);
  const close = useConversationStore((s) => s.closeConversation);
  const returnToAi = useConversationStore((s) => s.returnToAi);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const own = ownOf(conv);
  const hold = isHold(conv);
  const closed = own === "CLOSED";
  const humanOwned = own === "HUMAN_ACTIVE";
  // Close is a terminal, outcome-emitting action — only for human-handled chats.
  // Closing a live AI_ACTIVE thread would cut Karim off and emit a verdict while the
  // customer may still be active (Codex P1); safety holds are rejected server-side.
  const canClose = own === "HUMAN_ACTIVE" || own === "HUMAN_IDLE";

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setConflict(null); setErr(null);
    try {
      // takeover-at-SEND — claim first unless I already own it.
      if (!humanOwned) {
        const res = await takeover(conv.id);
        if (!res.ok) {
          if (res.conflictName) setConflict(res.conflictName);
          else setErr(t("conv.sendError"));
          return;
        }
      }
      addHuman(conv.id, text);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    if (busy) return;
    setBusy(true); setErr(null);
    const ok = await close(conv.id);
    if (!ok) setErr(t("conv.closeError"));
    setBusy(false);
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--kv-border)" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--kv-text)" }}><Bdi>{conv.customer}</Bdi></span>
        <StateChip display={deriveConversationDisplay({ ownershipState: own, isSafetyHold: conv.isSafetyHold })} />
        <div style={{ flex: 1 }} />
        {!closed && (
          <>
            <TruthChip state="soon" label={t("conv.assign")} />
            {humanOwned && (
              <button onClick={() => returnToAi(conv.id)} disabled={busy} style={ghostBtn}>
                <CornerUpLeft size={14} /> {t("conv.returnKarim")}
              </button>
            )}
            {canClose && (
              <button onClick={doClose} disabled={busy} style={ghostBtn}>
                <CheckCircle2 size={14} /> {t("conv.close")}
              </button>
            )}
          </>
        )}
      </div>

      {/* Safety lock banner — verbatim operator-hint microcopy, no allergen name. */}
      {hold && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 18px", background: "rgba(255,107,94,.10)", borderBottom: "1px solid rgba(255,107,94,.25)", color: "#c0392b" }}>
          <Lock size={16} strokeWidth={2.4} />
          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.6 }}>
            <div>{t("conv.safetyLock")}</div>
            <div style={{ fontWeight: 600, color: "var(--kv-muted)", marginTop: 2 }}>{t("conv.allergyHint")}</div>
          </div>
        </div>
      )}

      {/* Transcript — each bubble authorship-labeled (R6). */}
      <div className="kv-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        {conv.messages.map((m) => {
          const inbound = m.sender === "customer";
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: inbound ? "flex-start" : "flex-end", gap: 3 }}>
              {!inbound && <AttributionChip sender={m.sender} />}
              <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.6, background: inbound ? "var(--kv-card-soft)" : "rgba(75,139,255,.10)", color: "var(--kv-text)", border: "1px solid var(--kv-border)" }}>
                <Bdi>{m.text}</Bdi>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--kv-faint)" }}>{m.time}</span>
            </div>
          );
        })}
      </div>

      {/* Composer — takeover-at-SEND. Closed conversations are read-only. */}
      {!closed && (
        <div style={{ borderTop: "1px solid var(--kv-border)", padding: "12px 16px" }}>
          {conflict && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-amber)", marginBottom: 8 }}>{t("conv.conflict")}: <Bdi>{conflict}</Bdi></div>}
          {err && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-red)", marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={humanOwned ? t("conv.composerHuman") : t("conv.composerArmed")}
              rows={1}
              style={{ flex: 1, resize: "none", minHeight: 42, maxHeight: 120, borderRadius: "var(--kv-r-md)", border: "1.5px solid var(--kv-border)", background: "var(--kv-card-soft)", padding: "11px 13px", fontSize: 13.5, fontFamily: "var(--kv-font)", color: "var(--kv-text)", lineHeight: 1.5 }}
            />
            <button onClick={send} disabled={busy || !draft.trim()} aria-label={t("conv.send")} style={{ ...primaryBtn, opacity: busy || !draft.trim() ? 0.5 : 1, height: 42, width: 46, padding: 0, display: "grid", placeItems: "center" }}>
              <Send size={17} strokeWidth={2.3} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ flex: 1, height: 34, borderRadius: "var(--kv-r-pill)", border: active ? 0 : "1px solid var(--kv-border)", background: active ? "var(--kv-grad-brand)" : "var(--kv-card)", color: active ? "#fff" : "var(--kv-muted)", fontFamily: "var(--kv-font)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
      {children}
    </button>
  );
}
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--kv-faint)", padding: "18px 6px", lineHeight: 1.7 }}>{children}</div>;
}
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: "var(--kv-r-md-sm)",
  border: "1px solid var(--kv-border)", background: "var(--kv-card)", color: "var(--kv-muted)", fontFamily: "var(--kv-font)",
  fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};
const primaryBtn: React.CSSProperties = {
  borderRadius: "var(--kv-r-md-sm)", border: 0, background: "var(--kv-grad-brand)", color: "#fff", cursor: "pointer",
};
