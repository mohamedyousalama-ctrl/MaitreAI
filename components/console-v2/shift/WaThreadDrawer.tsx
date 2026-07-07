"use client";

// ============================================================================
// console_v2 Live Shift — the order's WhatsApp conversation thread (#ovWa / chat
// drawer, v35). Opens from an order's details: order.conversationId → the real
// conversation from the shared store. Safety law applied verbatim:
//   • allergen name is OFF-glance: a safety hold shows the LOCK + the frozen
//     operator-hint microcopy, NEVER the allergen itself.
//   • every restaurant bubble is stamped via <AttributionChip> (🤖 Karim / ✋ name).
//   • takeover-at-SEND: the composer's SEND is the single takeover trigger — it
//     claims the conversation for a human (audited server route) THEN sends; a
//     safety hold is human-only and refuses auto-answer, never opened from here.
// Reuses the shared conversation store + primitives (never touches the
// Conversations page — Window B territory).
// ============================================================================

import { useMemo, useState } from "react";
import { Lock, Send } from "lucide-react";
import { AuroraDrawer } from "@/components/console-v2/kit";
import { StateChip, AttributionChip } from "@/components/console-v2";
import { useConversationStore } from "@/lib/conversation-store";
import { deriveConversationDisplay, type AttributableSender } from "@/lib/console-v2/display-state";
import { useT } from "@/lib/i18n/lang";
import { Bdi } from "@/components/kivo";
import type { LocalOrder, Conversation, ChatMessage } from "@/lib/types";

function ownOf(c: Conversation) {
  return c.ownershipState ?? (c.isSafetyHold ? "SYSTEM_HOLD" : c.owner === "human" ? "HUMAN_ACTIVE" : "AI_ACTIVE");
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.sender !== "customer"; // restaurant side (ai/human/system) sits on the end
  const restaurant = m.sender === "ai" || m.sender === "human";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: mine ? "flex-end" : "flex-start" }}>
      {restaurant && <AttributionChip sender={m.sender as AttributableSender} />}
      <div style={{
        maxWidth: "86%", padding: "8px 12px", borderRadius: 13, fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
        background: m.sender === "customer" ? "rgba(255,255,255,.06)" : m.sender === "human" ? "rgba(232,180,90,.16)" : m.sender === "ai" ? "rgba(75,139,255,.16)" : "rgba(255,255,255,.04)",
        border: `1px solid ${m.sender === "human" ? "rgba(232,180,90,.36)" : m.sender === "ai" ? "rgba(75,139,255,.32)" : "var(--stroke)"}`,
        color: "var(--txt)",
      }}>
        <Bdi>{m.text}</Bdi>
      </div>
      <span style={{ fontSize: 9, color: "var(--faint)" }}>{m.time}</span>
    </div>
  );
}

export function WaThreadDrawer({ order, onClose }: { order: LocalOrder | null; onClose: () => void }) {
  const t = useT();
  const conversations = useConversationStore((s) => s.conversations);
  const takeover = useConversationStore((s) => s.takeoverToHuman);
  const addHuman = useConversationStore((s) => s.addHumanMessage);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  const conv = useMemo<Conversation | null>(() => {
    if (!order) return null;
    return conversations.find((c) => c.id === order.conversationId || c.linkedOrderId === order.id) ?? null;
  }, [order, conversations]);

  const hold = !!conv && (conv.isSafetyHold === true || ownOf(conv) === "SYSTEM_HOLD");

  async function send() {
    if (!conv || !text.trim() || busy || hold) return; // safety hold never auto-opens here
    setBusy(true); setConflict(false);
    // Takeover-at-SEND: claim for a human first (audited), then send.
    if (ownOf(conv) !== "HUMAN_ACTIVE") {
      const res = await takeover(conv.id);
      if (!res.ok) { setConflict(true); setBusy(false); return; }
    }
    addHuman(conv.id, text.trim());
    setText("");
    setBusy(false);
  }

  return (
    <AuroraDrawer open={!!order} onClose={onClose} safety={hold}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)" }}>{t("shift.wa.title")}</div>
            {conv && <div style={{ fontSize: 11, color: "var(--dim)" }}><Bdi>{conv.customer}</Bdi></div>}
          </div>
          {conv && <StateChip display={deriveConversationDisplay({ ownershipState: ownOf(conv), isSafetyHold: conv.isSafetyHold })} />}
          <button onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("shift.od.close")}</button>
        </div>

        {!conv ? (
          <div style={{ margin: "auto", fontSize: 12.5, color: "var(--dim)", textAlign: "center", padding: 30 }}>{t("shift.wa.none")}</div>
        ) : (
          <>
            {/* Safety hold — lock + verbatim operator hint. NEVER the allergen name. */}
            {hold && (
              <div style={{ display: "flex", gap: 9, padding: "11px 13px", background: "rgba(255,107,94,.1)", border: "1px solid rgba(255,107,94,.42)", borderRadius: 12 }}>
                <Lock size={16} style={{ color: "var(--red)", flex: "none", marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "#ffb3a8" }}>{t("conv.safetyLock")}</div>
                  <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.6, marginTop: 3 }}>{t("conv.allergyHint")}</div>
                </div>
              </div>
            )}

            <div className="kv-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px" }}>
              {conv.messages.map((m) => <Bubble key={m.id} m={m} />)}
            </div>

            {conflict && <div style={{ fontSize: 11.5, color: "var(--amber)", fontWeight: 700 }}>{t("shift.wa.conflict")}</div>}

            {/* Composer — takeover-at-SEND. Disabled on a safety hold (human-only, opens by hand). */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
                placeholder={hold ? t("conv.safetyLock") : t("conv.composerHuman")}
                disabled={hold || busy}
                style={{ flex: 1, background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 11, padding: "10px 13px", fontSize: 12.5, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none", opacity: hold ? 0.5 : 1 }}
              />
              <button onClick={() => void send()} disabled={hold || busy || !text.trim()} title={t("conv.composerArmed")}
                style={{ height: 40, padding: "0 14px", borderRadius: 11, border: 0, background: "var(--amber)", color: "#062018", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: hold ? "not-allowed" : "pointer", opacity: hold || !text.trim() ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Send size={14} /> {t("conv.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </AuroraDrawer>
  );
}
