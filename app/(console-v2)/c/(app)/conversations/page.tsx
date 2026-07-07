"use client";

// ============================================================================
// console_v2 item 6 — Conversations (v35 dark-glass rebuild). The ownership spine
// rendered as the design's BROADCAST WALL: Karim's Stage (blue) + the Human Hall
// (amber), with a "Right now" summary rail. Composed from the kit (shell #362).
// The rebuild is VISUAL — every ownership law and safety wire survives:
//
//  • ownership vocabulary ONLY through deriveConversationDisplay() — blue = Karim's
//    stage, amber = human-held, slate = idle, RED = safety hold (the one red).
//  • takeover-at-SEND (MO2): the composer's SEND is the single product-wide claim.
//    Sending an AI-owned/idle/held conversation fires the atomic server claim
//    FIRST; a lost race renders «تولّاها زميل بالفعل» and the message is NOT sent.
//  • R6 attribution: every outbound bubble carries <HandledByChip> — a TEAM bubble
//    is visibly the operator, never mistaken for Karim.
//  • close goes through the server-authoritative close route (the ONE outcome
//    trigger). A safety lock shows the lock + verbatim operator-hint microcopy,
//    NEVER the allergen itself, on any glance surface.
//  • assign-to-a-teammate has no backing route yet → rendered SOON, never faked.
// ============================================================================

import { useMemo, useState } from "react";
import { Send, Lock, CornerUpLeft, CheckCircle2, Radio, Users, ShieldAlert, CheckCheck, X, Receipt } from "lucide-react";
import { useConversationStore } from "@/lib/conversation-store";
import { useHasHydrated, useRestaurantStore } from "@/lib/store";
import { useOrderStore } from "@/lib/order-store";
import { deriveConversationDisplay, derivePaymentDisplay, type ConversationOwnershipState, type ConversationDisplayState } from "@/lib/console-v2/display-state";
import type { DisplayState } from "@/lib/console-v2/display-state";
import {
  HeaderRow, PageGrid, Panel, SectionHeader, StatTile, TruthChip, HandledByChip, AuroraDrawer, MiniModal, Toasts, pushToast,
} from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";
import { CONVERSATION_STAGE_LABELS, type Conversation } from "@/lib/types";

const ownOf = (c: Conversation): ConversationOwnershipState => c.ownershipState ?? "AI_ACTIVE";
const isHold = (c: Conversation) => c.isSafetyHold === true || ownOf(c) === "SYSTEM_HOLD";

// Derived tone → dark-palette chip colors (the law engine picks the tone; this
// only paints it on dark). `safety` is the one red — red = safety only.
const TONE_DARK: Record<string, { fg: string; bg: string; bd: string }> = {
  blue: { fg: "#93d2ff", bg: "rgba(75,139,255,.14)", bd: "rgba(75,139,255,.36)" },
  amber: { fg: "#ffcf8d", bg: "rgba(232,180,90,.14)", bd: "rgba(232,180,90,.4)" },
  slate: { fg: "var(--dim)", bg: "var(--inset)", bd: "var(--stroke)" },
  safety: { fg: "#ffc9c9", bg: "rgba(255,107,94,.14)", bd: "rgba(255,107,94,.4)" },
};

function OwnChip({ display }: { display: DisplayState<ConversationDisplayState> }) {
  const t = useT();
  const c = TONE_DARK[display.tone] ?? TONE_DARK.slate;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 800, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 99, padding: "3px 9px" }}>{t(display.labelKey)}</span>;
}

export default function ConversationsPage() {
  const t = useT();
  const hydrated = useHasHydrated();
  const conversations = useConversationStore((s) => s.conversations);
  const selectedId = useConversationStore((s) => s.selectedId);
  const select = useConversationStore((s) => s.selectConversation);

  const { stage, hall, counts } = useMemo(() => {
    const stage: Conversation[] = [], hall: Conversation[] = [];
    const counts = { karim: 0, gate: 0, lock: 0, harvest: 0 };
    for (const c of conversations) {
      const own = ownOf(c);
      if (own === "CLOSED") { counts.harvest++; continue; }
      if (isHold(c)) { counts.lock++; hall.push(c); continue; }
      if (own === "AI_ACTIVE") { counts.karim++; stage.push(c); }
      else { if (own === "HUMAN_IDLE") counts.gate++; hall.push(c); }
    }
    // Safety holds first in the hall (never missed).
    hall.sort((a, b) => Number(isHold(b)) - Number(isHold(a)));
    return { stage, hall, counts };
  }, [conversations]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const [modal, setModal] = useState<null | "assign" | "guest">(null);

  return (
    <>
      <HeaderRow
        title={t("conv.title")}
        jobLine={t("conv.floorSub")}
        right={<span style={healthChip}>{t("conv.rightNow")} <TruthChip state="gather" /></span>}
      />

      <PageGrid
        context={
          <>
            <Panel>
              <SectionHeader icon={<Radio size={15} />} tier="blue" title={t("conv.rightNow")} sub={t("conv.floorSub")} />
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <StatTile tier="blue" label={`🤖 ${t("conv.now.karim")}`} value={counts.karim} countUp={counts.karim} fact={t("conv.karimStage")} />
                <StatTile tier="coral" label={`🧑 ${t("conv.now.gate")}`} value={counts.gate} countUp={counts.gate} fact={t("conv.humanHands")} />
                {/* Safety lock summary — the one sanctioned red surface. */}
                <div style={safetyTile}>
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>⚠ {t("conv.now.lock")}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, marginTop: 3, color: "#fff", fontFamily: "var(--kvx-font-ui)" }}>{counts.lock}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 4, borderTop: "1px solid rgba(255,255,255,.22)", paddingTop: 5 }}>{t("conv.safetyLock")}</div>
                </div>
                <StatTile tier="green" label={`✓ ${t("conv.now.harvest")}`} value={counts.harvest} countUp={counts.harvest} fact={t("conv.tabClosed")} />
              </div>
              <div style={doctrine}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 6 }}>{t("conv.ownershipRules")}</div>
                <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.7, margin: 0 }}>{t("conv.ownershipBody")}</p>
              </div>
            </Panel>
          </>
        }
        hero={
          <Panel style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionHeader icon={<Radio size={15} />} tier="blue" title={t("conv.tabFloor")} sub={t("conv.floorSub")} right={<TruthChip state="live" />} />

            {/* KARIM'S STAGE — blue zone, live monitor tiles. */}
            <div style={stageZone}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                <span style={onAir}><span style={onAirDot} /> {t("conv.onAir")}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: "#93d2ff" }}>{t("conv.karimStage")}</span>
              </div>
              {!hydrated ? null : stage.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--dim)", padding: "18px 4px", textAlign: "center" }}>{t("conv.stageEmpty")}</div>
              ) : (
                <div style={wall}>
                  {stage.map((c) => <MonitorTile key={c.id} conv={c} onOpen={() => select(c.id)} />)}
                </div>
              )}
            </div>

            {/* IN HUMAN HANDS — amber hall, minimal pills. */}
            <div style={hallZone}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", color: "#ffcf8d", textTransform: "uppercase", marginBottom: 9 }}>{t("conv.humanHands")}</div>
              {!hydrated ? null : hall.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "12px 4px", textAlign: "center" }}>{t("conv.hallEmpty")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {hall.map((c) => <HallPill key={c.id} conv={c} onOpen={() => select(c.id)} />)}
                </div>
              )}
              <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 8 }}>{t("conv.privacy")}</div>
            </div>
          </Panel>
        }
      />

      <AuroraDrawer open={!!selected} onClose={() => select("")} safety={!!selected && isHold(selected)}>
        {selected && <ConversationDrawer key={selected.id} conv={selected} onClose={() => select("")} onAssign={() => setModal("assign")} onGuest={() => setModal("guest")} />}
      </AuroraDrawer>

      {/* ovAssign — assign-to-teammate. No backing route yet → SOON, never faked. */}
      <MiniModal open={modal === "assign"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>↪</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--txt)", flex: 1 }}>{t("conv.assignTitle")}</span>
          <TruthChip state="soon" />
          <button onClick={() => setModal(null)} style={drawerX}><X size={15} /></button>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--faint)", margin: "0 0 12px", lineHeight: 1.6 }}>{t("conv.assignSub")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <TeammateRow initial="ب" name="بهاء" role={t("conv.assignRoles.manager")} />
          <TeammateRow initial="أ" name="أحمد" role={t("conv.assignRoles.operator")} />
        </div>
      </MiniModal>

      {/* ovGuest — guest-card-lite. Facts GATHERING until the full card is wired;
          allergy hint is the verbatim operator-hint microcopy (never a guarantee). */}
      <MiniModal open={modal === "guest"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ ...avatar, width: 32, height: 32 }}>{selected ? <Bdi>{selected.customer.slice(0, 1)}</Bdi> : "👤"}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)" }}>{selected ? <Bdi>{selected.customer}</Bdi> : ""}</div>
            <div style={{ fontSize: 9, color: "var(--faint)" }}>{t("conv.guestLite")}</div>
          </div>
          <button onClick={() => setModal(null)} style={drawerX}><X size={15} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase" }}>{t("conv.facts")}</span>
          <TruthChip state="gather" />
          <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{t("conv.guestGathering")}</span>
        </div>
        {selected && isHold(selected) && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: "rgba(255,107,94,.08)", border: "1px solid rgba(255,107,94,.35)", borderRadius: 12, padding: "11px 13px" }}>
            <Lock size={14} strokeWidth={2.4} color="#ffc9c9" style={{ flex: "none", marginTop: 1 }} />
            <span style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>{t("conv.allergyHint")}</span>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, textAlign: "center" }}>{t("conv.guestFull")}</div>
      </MiniModal>

      <Toasts />
    </>
  );
}

// Order-context chip (drawer header) — order# · engine total · payment-state.
// REAL order data only; payment tone via the law engine (failed=amber, not red);
// no safety/allergen detail ever reaches this chip.
const PAYMENT_KEYS = new Set(["unpaid", "payment_link_sent", "paid", "failed", "refunded"]);
function OrderContextChip({ order, currency }: { order: { ref: string; total: number; paymentStatus: string }; currency: string }) {
  const t = useT();
  // Defensive: only route KNOWN payment keys through the law engine (its switch
  // ends in assertNever). An unexpected value → omit the payment sub-chip rather
  // than crash the drawer. Order#/total (engine money) still show honestly.
  const pay = PAYMENT_KEYS.has(order.paymentStatus)
    ? derivePaymentDisplay(order.paymentStatus as Parameters<typeof derivePaymentDisplay>[0])
    : null;
  const payTone = pay ? (TONE_DARK[pay.tone] ?? TONE_DARK.slate) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--stroke)" }}>
      <Receipt size={13} color="var(--dim)" style={{ flex: "none" }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--txt)" }}>#<Num>{order.ref}</Num></span>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--gold)" }}><Num>{order.total.toLocaleString("en-US")}</Num> <span style={{ fontSize: 9.5, color: "var(--dim)" }}>{currency}</span></span>
      {pay && payTone && <span style={{ marginInlineStart: "auto", fontSize: 9.5, fontWeight: 800, color: payTone.fg, background: payTone.bg, border: `1px solid ${payTone.bd}`, borderRadius: 99, padding: "3px 9px" }}>{t(pay.labelKey)}</span>}
    </div>
  );
}

function TeammateRow({ initial, name, role }: { initial: string; name: string; role: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "9px 12px" }}>
      <span style={{ ...avatar, background: "linear-gradient(135deg,#8fd0ff,#6db8f7)", color: "#03203a" }}><Bdi>{initial}</Bdi></span>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--txt)", flex: 1 }}><Bdi>{name}</Bdi></span>
      <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{role}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monitor tile (Karim's stage) — customer + last line preview + stage + ownership.
// ---------------------------------------------------------------------------
function MonitorTile({ conv, onOpen }: { conv: Conversation; onOpen: () => void }) {
  const display = deriveConversationDisplay({ ownershipState: ownOf(conv), isSafetyHold: conv.isSafetyHold });
  return (
    <button onClick={onOpen} style={monTile}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={avatar}><Bdi>{conv.customer.slice(0, 1)}</Bdi></span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" }}><Bdi>{conv.customer}</Bdi></span>
        {conv.unread > 0 && <span style={unreadDot}>{conv.unread}</span>}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.5, textAlign: "start", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: 30, direction: "rtl" }}><Bdi>{conv.lastMessage}</Bdi></div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <OwnChip display={display} />
        {conv.stage && <span style={stageChip}>{CONVERSATION_STAGE_LABELS[conv.stage]}</span>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hall pill — for a safety hold, NEVER leak the allergen: show the lock line.
// ---------------------------------------------------------------------------
function HallPill({ conv, onOpen }: { conv: Conversation; onOpen: () => void }) {
  const t = useT();
  const hold = isHold(conv);
  const display = deriveConversationDisplay({ ownershipState: ownOf(conv), isSafetyHold: conv.isSafetyHold });
  return (
    <button onClick={onOpen} style={{ ...hallPill, borderColor: hold ? "rgba(255,107,94,.5)" : "var(--stroke)", background: hold ? "rgba(255,107,94,.06)" : "var(--inset)" }}>
      <span style={{ ...avatar, background: hold ? "linear-gradient(135deg,#ff8d7e,#f75b52)" : undefined, color: hold ? "#fff" : undefined }}>{hold ? <Lock size={12} /> : <Bdi>{conv.customer.slice(0, 1)}</Bdi>}</span>
      <div style={{ minWidth: 0, flex: 1, textAlign: "start" }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{conv.customer}</Bdi></div>
        <div style={{ fontSize: 9.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hold ? t("conv.safetyLock") : <Bdi>{conv.lastMessage}</Bdi>}</div>
      </div>
      <OwnChip display={display} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Conversation drawer — transcript (authorship-labeled) + composer (takeover-at-
// SEND) + actions. Safety holds show the lock banner + verbatim allergy hint.
// ---------------------------------------------------------------------------
function ConversationDrawer({ conv, onClose, onAssign, onGuest }: { conv: Conversation; onClose: () => void; onAssign: () => void; onGuest: () => void }) {
  const t = useT();
  const takeover = useConversationStore((s) => s.takeoverToHuman);
  const addHuman = useConversationStore((s) => s.addHumanMessage);
  const close = useConversationStore((s) => s.closeConversation);
  const returnToAi = useConversationStore((s) => s.returnToAi);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  // Conversations whose server ownership claim we've WON this session. The first
  // send always claims (the atomic server proof); once won, later sends skip it.
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  // Order-context — REAL order only (resolved from the order store by the
  // conversation's linkedOrderId). Honest-empty when there's no linked order.
  // `total` is engine-computed money (displayed, never derived); payment tone
  // routes through derivePaymentDisplay so `failed` is amber, never red. This
  // chip carries ONLY order#/total/payment — no safety/allergen path touches it.
  const currency = useRestaurantStore((s) => s.profile.currency);
  // Match on the order's id OR its human orderNumber — linkedOrderId may carry
  // either depending on how the link was written; both are real identifiers.
  const order = useOrderStore((s) => (conv.linkedOrderId ? s.orders.find((o) => o.id === conv.linkedOrderId || o.orderNumber === conv.linkedOrderId) : undefined));

  const own = ownOf(conv);
  const hold = isHold(conv);
  const closed = own === "CLOSED";
  const humanOwned = own === "HUMAN_ACTIVE";
  const canClose = own === "HUMAN_ACTIVE" || own === "HUMAN_IDLE";
  const display = deriveConversationDisplay({ ownershipState: own, isSafetyHold: conv.isSafetyHold });

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setConflict(null);
    try {
      // takeover-at-SEND — the FIRST send claims through the atomic server proof
      // (works for AI/idle/held, 409s if a teammate owns it). We do NOT trust
      // local ownership state to skip.
      if (!claimed.has(conv.id)) {
        const res = await takeover(conv.id);
        if (!res.ok) {
          if (res.conflictName) setConflict(res.conflictName); // composer stays blocked, draft kept
          else pushToast(t("conv.sendError"), "amber");
          return;
        }
        setClaimed((s) => new Set(s).add(conv.id));
      }
      addHuman(conv.id, text);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    if (busy) return;
    setBusy(true);
    const ok = await close(conv.id);
    if (!ok) pushToast(t("conv.closeError"), "amber");
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: "1px solid var(--stroke)" }}>
        <span style={{ ...avatar, width: 34, height: 34, background: hold ? "linear-gradient(135deg,#ff8d7e,#f75b52)" : undefined, color: hold ? "#fff" : undefined }}>{hold ? <Lock size={14} /> : <Bdi>{conv.customer.slice(0, 1)}</Bdi>}</span>
        <button onClick={onGuest} style={{ minWidth: 0, flex: 1, border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "start", fontFamily: "inherit" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)" }}><Bdi>{conv.customer}</Bdi></div>
          <div style={{ marginTop: 3 }}><OwnChip display={display} /></div>
        </button>
        <button onClick={onClose} style={drawerX}><X size={15} /></button>
      </div>

      {/* Order-context chip — real linked order only; honest-empty otherwise. */}
      {order && <OrderContextChip order={{ ref: order.orderNumber, total: order.total, paymentStatus: order.paymentStatus }} currency={currency} />}

      {/* Actions */}
      {!closed && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--stroke)" }}>
          <button onClick={onAssign} style={soonChip}><TruthChip state="soon" /> {t("conv.assign")}</button>
          {humanOwned && <button onClick={() => returnToAi(conv.id)} disabled={busy} style={ghostBtn}><CornerUpLeft size={13} /> {t("conv.returnKarim")}</button>}
          {canClose && <button onClick={doClose} disabled={busy} style={ghostBtn}><CheckCircle2 size={13} /> {t("conv.close")}</button>}
        </div>
      )}

      {/* Safety lock banner — verbatim operator-hint, no allergen name. */}
      {hold && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 0", borderBottom: "1px solid rgba(255,107,94,.25)" }}>
          <Lock size={15} strokeWidth={2.4} color="#ffc9c9" />
          <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.6 }}>
            <div style={{ color: "#ffc9c9" }}>{t("conv.safetyLock")}</div>
            <div style={{ fontWeight: 600, color: "var(--dim)", marginTop: 2 }}>{t("conv.allergyHint")}</div>
          </div>
        </div>
      )}

      {/* Transcript — each outbound bubble authorship-labeled (R6). */}
      <div className="kv-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 0", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        {conv.messages.map((m) => {
          const inbound = m.sender === "customer";
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: inbound ? "flex-start" : "flex-end", gap: 3 }}>
              {!inbound && m.sender !== "system" && <HandledByChip by={m.sender === "ai" ? "karim" : "human"} />}
              <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.7, fontFamily: "var(--kvx-font-ar)", background: inbound ? "rgba(255,255,255,.07)" : "linear-gradient(135deg,rgba(63,110,220,.85),rgba(45,80,180,.85))", color: inbound ? "var(--txt)" : "#eaf1ff", direction: "rtl" }}>
                <Bdi>{m.text}</Bdi>
              </div>
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{m.time}</span>
            </div>
          );
        })}
      </div>

      {/* Composer — takeover-at-SEND. Closed conversations are read-only. */}
      {!closed && (
        <div style={{ borderTop: "1px solid var(--stroke)", paddingTop: 12 }}>
          {conflict && <div style={{ fontSize: 11.5, fontWeight: 700, color: "#ffcf8d", marginBottom: 8 }}>{t("conv.conflict")}: <Bdi>{conflict}</Bdi></div>}
          <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={humanOwned ? t("conv.composerHuman") : t("conv.composerArmed")}
              rows={1}
              disabled={!!conflict}
              dir="rtl"
              style={{ flex: 1, resize: "none", minHeight: 42, maxHeight: 120, borderRadius: 13, border: "1px solid var(--stroke)", background: "var(--inset2)", padding: "11px 13px", fontSize: 12.5, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", lineHeight: 1.5, outline: "none", opacity: conflict ? 0.6 : 1 }}
            />
            <button onClick={send} disabled={busy || !draft.trim() || !!conflict} aria-label={t("conv.send")} style={{ ...sendBtn, opacity: busy || !draft.trim() || conflict ? 0.5 : 1 }}>
              {busy ? <CheckCheck size={16} /> : <Send size={16} strokeWidth={2.3} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const healthChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: "var(--dim)", background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 99, padding: "5px 11px", fontFamily: "var(--kvx-font-ar)" };
const safetyTile: React.CSSProperties = { position: "relative", borderRadius: 15, padding: "13px 14px 12px 16px", overflow: "hidden", background: "linear-gradient(135deg,#ff8d7e,#f75b52)", boxShadow: "0 10px 26px rgba(0,0,0,.28)" };
const doctrine: React.CSSProperties = { marginTop: 12, background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 14, padding: "11px 13px" };
const stageZone: React.CSSProperties = { background: "linear-gradient(180deg,rgba(62,112,225,.13),rgba(62,112,225,.035))", border: "1px solid rgba(90,145,255,.28)", borderRadius: 18, padding: 13, marginBottom: 14 };
const hallZone: React.CSSProperties = { background: "linear-gradient(180deg,rgba(255,170,70,.11),rgba(255,170,70,.03))", border: "1px solid rgba(255,183,87,.3)", borderRadius: 18, padding: "12px 14px" };
const onAir: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: "#ffb3a8" };
const onAirDot: React.CSSProperties = { width: 8, height: 8, borderRadius: "50%", background: "#ff4d4d", boxShadow: "0 0 8px #ff4d4d" };
const wall: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 11 };
const monTile: React.CSSProperties = { border: "1px solid rgba(75,139,255,.35)", background: "rgba(10,15,24,.55)", borderRadius: 16, padding: "12px 13px", cursor: "pointer", display: "flex", flexDirection: "column", textAlign: "start", fontFamily: "inherit" };
const hallPill: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--stroke)", borderRadius: 13, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit" };
const avatar: React.CSSProperties = { width: 26, height: 26, borderRadius: 9, background: "linear-gradient(135deg,#b9c8de,#8fa3bf)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 11, color: "#0e1420", fontFamily: "var(--kvx-font-ar)", flex: "none" };
const unreadDot: React.CSSProperties = { minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "var(--blue)", color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" };
const stageChip: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: "var(--faint)", background: "var(--inset)", borderRadius: 6, padding: "3px 7px" };
const drawerX: React.CSSProperties = { width: 30, height: 30, borderRadius: 10, background: "var(--inset)", border: "1px solid var(--stroke)", color: "var(--dim)", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" };
const soonChip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--dim)", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 10, padding: "6px 11px", cursor: "pointer", fontFamily: "var(--kvx-font-ar)" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--inset)", color: "var(--dim)", fontFamily: "var(--kvx-font-ar)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const sendBtn: React.CSSProperties = { height: 42, width: 46, borderRadius: 13, border: 0, background: "linear-gradient(135deg,#4b8bff,#2f6ce0)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center", flex: "none" };
