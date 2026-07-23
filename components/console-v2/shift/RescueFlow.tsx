"use client";

// ============================================================================
// KIVO-SHIFT — the takeover rescue flow (WO-SHIFT-2). The full-screen experience
// reached from a Section-A card: the seconds when a human realises Karim needs help
// and steps in. It must feel like an operational rescue, not a generic chat.
//
// Six steps:
//  1. Entry states the REASON, not the sender.
//  2. The situation before any action — reason · triggering message · live wait ·
//     owner · is Karim active.
//  3. Server-confirmed claim (reuses the WO-SHIFT-1 claim wiring). The composer stays
//     disabled until the SERVER confirms ownership — no optimistic ownership; a stale
//     epoch refreshes; a lost race → view-only.
//  4. COMPILED context, not a chat log — what happened · the current order (confirmed
//     vs unconfirmed, total from the server) · confirmed info · safety (customer's own
//     words + data-derived two-axis facts with provenance, never authored) · what Karim
//     was doing. The raw thread stays available below.
//  5. Composer with the WhatsApp 24h window visible — free-reply time inside; disabled
//     with a reason + templates-only outside; a send failure is designed (no-dup + retry).
//  6. Handback — ordinary is one confirm; a SAFETY case requires a structured handback
//     (record the restaurant's response) and can NEVER use resolved/safe/confirmed wording.
//
// Safety facts are DISPLAYED from menu data via the canonical vocab labels
// (lib/ai/allergen-prep-vocab.ts, a pure import) — the interface authors none.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldAlert, AlertTriangle, X, Package, MapPin, Bot, Send, CornerDownLeft, ChevronDown, ChevronUp,
} from "lucide-react";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi, Num, Phone } from "@/components/kivo";
import { useConversationStore } from "@/lib/conversation-store";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore } from "@/lib/store";
import { useMembersStore, membersNameMap } from "@/lib/members-store";
import { prepStatusLabelAr, crossContactLabelAr, kitchenCanIsolateLabelAr } from "@/lib/ai/allergen-prep-vocab";
import type { Conversation, LocalOrder, MenuItem, ChatMessage } from "@/lib/types";
import {
  whatsappWindow, composerState, resolveClaimResponse, isForbiddenSafetyResolution, formatElapsed,
  type SafetyAckState,
} from "./shift-model";
import { SAFETY_RED, SAFETY_TINT, SAFETY_STROKE, ServerMoney, ghostBtn, claimBtn, safetyBtn, primaryBtn } from "./shift-ui";

// ---------------------------------------------------------------------------
export function RescueFlow({
  conversationId, reasonKey, isSafety, online, dataState, actorMemberId, actorReady, onClose,
}: {
  conversationId: string;
  reasonKey: DictKey;
  isSafety: boolean;
  online: boolean;
  dataState: string;
  actorMemberId: string | null;
  actorReady: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const conv = useConversationStore((s) => s.conversations.find((c) => c.id === conversationId));
  const orders = useOrderStore((s) => s.orders);
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const members = useMembersStore((s) => s.members);
  const nameMap = useMemo(() => membersNameMap(members), [members]);

  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Claim state (server-confirmed; ownedConfirmed only set AFTER a 200 win).
  const [claiming, setClaiming] = useState(false);
  const [ownedConfirmed, setOwnedConfirmed] = useState(false);
  const [claimNotice, setClaimNotice] = useState<{ tone: "ok" | "amber"; text: string } | null>(null);

  const order = useMemo<LocalOrder | null>(() => {
    if (!conv) return null;
    if (conv.linkedOrderId) { const o = orders.find((x) => x.id === conv.linkedOrderId); if (o) return o; }
    return orders.filter((x) => x.conversationId === conversationId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  }, [conv, orders, conversationId]);

  if (!conv) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ padding: 40, textAlign: "center", color: "var(--dim)", fontSize: 15 }}>{t("shift.v2.rescue.loading")}</div>
      </Overlay>
    );
  }

  const lastInbound = lastCustomerMessage(conv);
  const waitMs = lastInbound?.createdAtMs != null ? Math.max(0, now - lastInbound.createdAtMs) : null;
  const win = whatsappWindow(lastInbound?.createdAtMs ?? null, now);

  const assignedToMe = !!actorMemberId && conv.assignedMemberId === actorMemberId;
  const claimedByOther = !!conv.assignedMemberId && conv.assignedMemberId !== actorMemberId;
  const ownedByMe = ownedConfirmed || (assignedToMe && conv.ownershipState === "HUMAN_ACTIVE");
  const ownerName = conv.assignedMemberId ? (nameMap[conv.assignedMemberId] ?? t("shift.v2.someone")) : null;
  const karimActive = conv.ownershipState === "AI_ACTIVE";

  async function claim() {
    if (claiming || !actorReady || !online) return;
    setClaiming(true); setClaimNotice(null);
    try {
      const res = await fetch("/c/conversations/claim", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, renderedEpoch: Number(conv?.controlEpoch ?? 0) }),
      });
      const body = await res.json().catch(() => ({}));
      const out = resolveClaimResponse(res.status, body);
      if (out.kind === "won") {
        setOwnedConfirmed(true); // server CONFIRMED — not optimistic
        setClaimNotice({ tone: "ok", text: t("shift.v2.rescue.youOwnNow") });
        void useConversationStore.getState().reload();
      } else if (out.kind === "view_only") {
        setClaimNotice({ tone: "amber", text: `${t("shift.v2.fail.takenClaimPrefix")} ${out.ownerName ?? t("shift.v2.someone")} · ${t("shift.v2.viewOnly")}` });
        void useConversationStore.getState().reload();
      } else if (out.kind === "stale") {
        setClaimNotice({ tone: "amber", text: t("shift.v2.fail.stale") });
        void useConversationStore.getState().reload();
      } else {
        setClaimNotice({ tone: "amber", text: t("shift.v2.fail.claim") });
      }
    } catch {
      setClaimNotice({ tone: "amber", text: t("shift.v2.fail.claim") });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <RescueStyles />
      {/* Step 1 + 2 — the reason leads; then the situation. */}
      <header className="kvsh-rescue-head" style={isSafety ? { borderColor: SAFETY_STROKE, background: SAFETY_TINT } : undefined}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {isSafety ? <ShieldAlert size={20} style={{ color: SAFETY_RED, flex: "none", marginTop: 2 }} /> : <AlertTriangle size={19} style={{ color: "var(--amber)", flex: "none", marginTop: 2 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--faint)" }}>{t("shift.v2.rescue.needsYou")}</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: isSafety ? SAFETY_RED : "var(--txt)", margin: "2px 0 0" }}>{t(reasonKey)}</h2>
          </div>
          <button onClick={onClose} aria-label={t("shift.od.close")} style={{ border: 0, background: "transparent", color: "var(--faint)", cursor: "pointer", flex: "none" }}><X size={22} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 13, fontWeight: 700, color: "var(--dim)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Bdi>{conv.customer}</Bdi>{conv.phone && <span style={{ color: "var(--faint)" }}><Phone>{conv.phone}</Phone></span>}</span>
          <span style={{ color: "var(--faint)" }}>·</span>
          <WaitLabel waitMs={waitMs} />
          <span style={{ color: "var(--faint)" }}>·</span>
          <span>{t("shift.v2.rescue.owner")}: <b style={{ color: ownerName ? "var(--txt)" : "var(--amber)" }}>{ownerName ? <Bdi>{ownerName}</Bdi> : t("shift.v2.rescue.noOwner")}</b></span>
          <span style={{ color: "var(--faint)" }}>·</span>
          <span style={{ color: karimActive ? "var(--teal)" : "var(--amber)" }}>{karimActive ? t("shift.v2.rescue.karimActive") : t("shift.v2.rescue.karimStopped")}</span>
        </div>

        {/* Triggering customer message — the exact words, quoted. */}
        {lastInbound && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "var(--inset2)", border: "1px solid var(--stroke)" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--faint)", marginBottom: 4 }}>{t("shift.v2.rescue.triggerMsg")}</div>
            <div style={{ fontSize: 15, color: "var(--txt)", lineHeight: 1.6 }}><Bdi>{lastInbound.text}</Bdi></div>
          </div>
        )}
      </header>

      <div className="kvsh-rescue-body">
        {/* Step 3 — claim / ownership banner. */}
        <ClaimBar
          ownedByMe={ownedByMe} claimedByOther={claimedByOther} ownerName={ownerName}
          claiming={claiming} canClaim={actorReady && online && !claimedByOther}
          onClaim={claim} notice={claimNotice}
        />

        {/* Step 4 — compiled context. */}
        <CompiledContext conv={conv} order={order} menuItems={menuItems} isSafety={isSafety} now={now} />

        {/* Raw conversation stays available below, but the operator can act without it. */}
        <RawConversation messages={conv.messages} />
      </div>

      {/* Step 5 — composer with the window state. */}
      <Composer
        conversationId={conversationId}
        ownedByMe={ownedByMe} claimedByOther={claimedByOther} online={online} dataState={dataState}
        windowOpen={win.open} remainingMs={win.remainingMs}
      />

      {/* Step 6 — handback. */}
      <Handback
        conversationId={conversationId} isSafety={isSafety} order={order} conv={conv}
        ownedByMe={ownedByMe} ownerName={ownerName}
        onDone={onClose}
      />
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Overlay shell — full-screen on phone, centred large panel on wide screens.
// ---------------------------------------------------------------------------
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="kvsh-rescue-scrim" onClick={onClose}>
      <section className="kvsh-rescue" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        {children}
      </section>
    </div>
  );
}

function WaitLabel({ waitMs }: { waitMs: number | null }) {
  const t = useT();
  const e = formatElapsed(waitMs);
  if (!e) return null;
  const unit: DictKey = e.unit === "sec" ? "shift.v2.unit.sec" : e.unit === "min" ? "shift.v2.unit.min" : "shift.v2.unit.hr";
  return <span>{t("shift.v2.waitingSince")} <Num>{e.value}</Num> {t(unit)}</span>;
}

// ---------------------------------------------------------------------------
// Step 3 — claim bar. No optimistic ownership: the primary claim CTA shows until
// the server confirms; view-only when another operator owns it.
// ---------------------------------------------------------------------------
function ClaimBar({
  ownedByMe, claimedByOther, ownerName, claiming, canClaim, onClaim, notice,
}: {
  ownedByMe: boolean; claimedByOther: boolean; ownerName: string | null; claiming: boolean;
  canClaim: boolean; onClaim: () => void; notice: { tone: "ok" | "amber"; text: string } | null;
}) {
  const t = useT();
  if (ownedByMe) {
    return (
      <div style={bannerStyle("ok")}>
        <b style={{ color: "var(--teal)", fontSize: 15 }}>{t("shift.v2.rescue.youOwnNow")}</b>
      </div>
    );
  }
  if (claimedByOther) {
    return (
      <div style={bannerStyle("amber")}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--amber)" }}>
          {t("shift.v2.fail.takenClaimPrefix")} {ownerName ? <Bdi>{ownerName}</Bdi> : t("shift.v2.someone")} · {t("shift.v2.viewOnly")}
        </span>
      </div>
    );
  }
  return (
    <div style={{ ...bannerStyle("amber"), flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--dim)" }}>{t("shift.v2.rescue.noOwner")}</div>
      <button onClick={onClaim} disabled={!canClaim || claiming} style={{ ...claimBtn, height: 52, fontSize: 16, width: "100%", opacity: !canClaim || claiming ? 0.6 : 1, cursor: !canClaim || claiming ? "default" : "pointer" }}>
        {claiming ? t("shift.v2.rescue.claiming") : t("shift.v2.act.claim")}
      </button>
      {notice && <div style={{ fontSize: 13, fontWeight: 700, color: notice.tone === "ok" ? "var(--teal)" : "var(--amber)" }}>{notice.text}</div>}
    </div>
  );
}

function bannerStyle(tone: "ok" | "amber"): React.CSSProperties {
  const c = tone === "ok" ? "rgba(46,204,154,.34)" : "rgba(232,180,90,.4)";
  const bg = tone === "ok" ? "rgba(46,204,154,.08)" : "rgba(232,180,90,.08)";
  return { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: `1px solid ${c}`, background: bg };
}

// ---------------------------------------------------------------------------
// Step 4 — compiled context. Panels, not a chat log.
// ---------------------------------------------------------------------------
function Panel({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone?: "safety"; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--inset)", border: `1px solid ${tone === "safety" ? SAFETY_STROKE : "var(--stroke)"}`, borderRadius: 14, padding: "12px 14px", borderInlineStart: tone === "safety" ? `3px solid ${SAFETY_RED}` : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: tone === "safety" ? SAFETY_RED : "var(--dim)", display: "inline-flex" }}>{icon}</span>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: tone === "safety" ? SAFETY_RED : "var(--txt)", margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CompiledContext({ conv, order, menuItems, isSafety, now }: { conv: Conversation; order: LocalOrder | null; menuItems: MenuItem[]; isSafety: boolean; now: number }) {
  const t = useT();
  void now;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ما الذي حدث */}
      <Panel icon={<AlertTriangle size={15} />} title={t("shift.v2.ctx.whatHappened")}>
        <div style={{ fontSize: 14, color: "var(--txt)", lineHeight: 1.6 }}>
          {conv.escalationReason ? <Bdi>{conv.escalationReason}</Bdi> : t("shift.v2.actNow.safetyNeutral")}
        </div>
      </Panel>

      {/* الطلب الحالي */}
      <Panel icon={<Package size={15} />} title={t("shift.v2.ctx.currentOrder")}>
        <CurrentOrder conv={conv} order={order} />
      </Panel>

      {/* معلومات مؤكدة */}
      <Panel icon={<MapPin size={15} />} title={t("shift.v2.ctx.confirmed")}>
        <ConfirmedInfo conv={conv} order={order} />
      </Panel>

      {/* السلامة — data-derived, two axes, provenance */}
      {isSafety && (
        <Panel icon={<ShieldAlert size={15} />} title={t("shift.v2.ctx.safety")} tone="safety">
          <SafetyContext conv={conv} order={order} menuItems={menuItems} />
        </Panel>
      )}

      {/* كريم كان بيعمل إيه */}
      <Panel icon={<Bot size={15} />} title={t("shift.v2.ctx.karimDoing")}>
        <div style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.6 }}>{karimActivity(conv, order, t)}</div>
      </Panel>
    </div>
  );
}

function CurrentOrder({ conv, order }: { conv: Conversation; order: LocalOrder | null }) {
  const t = useT();
  // Confirmed = a created order (items are committed). Unconfirmed = an in-progress
  // draft that Karim hasn't turned into an order yet. Totals ONLY from the server order.
  const draftItems = order ? [] : (conv.draftOrder?.items ?? conv.entities?.items?.map((e) => ({ name: e.name, quantity: e.quantity, price: 0, modifiers: [] as string[] })) ?? []);
  if (!order && draftItems.length === 0) {
    return <div style={{ fontSize: 13.5, color: "var(--faint)" }}>{t("shift.v2.ctx.noOrderYet")}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {order ? (
        <>
          {order.items.map((it) => (
            <ItemLine key={it.id} name={it.name} qty={it.quantity} modifiers={it.modifiers} confirmed />
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4, paddingTop: 6, borderTop: "1px solid var(--stroke)" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--dim)" }}>{t("shift.od.total")}</span>
            <ServerMoney total={order.total} currency={order.currency} />
            <span style={{ flex: 1 }} />
            <FactChip label={t("shift.v2.ctx.deliveryState")} value={order.fulfillmentType === "pickup" ? t("shift.v2.pickup") : t("shift.v2.delivery")} />
            <FactChip label={t("shift.v2.ctx.paymentState")} value={paymentLabel(order.paymentStatus, t)} />
          </div>
        </>
      ) : (
        <>
          {draftItems.map((it, i) => (
            <ItemLine key={i} name={it.name} qty={it.quantity} modifiers={it.modifiers} confirmed={false} />
          ))}
          <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{t("shift.v2.ctx.noOrderYet")}</div>
        </>
      )}
    </div>
  );
}

function ItemLine({ name, qty, modifiers, confirmed }: { name: string; qty: number; modifiers: string[]; confirmed: boolean }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14 }}>
      <span style={{ color: "var(--gold)", fontWeight: 800, fontFamily: "var(--kvx-font-ui)" }}><Num>{qty}</Num>×</span>
      <span style={{ flex: 1, color: "var(--txt)", fontWeight: 600 }}>
        <Bdi>{name}</Bdi>
        {modifiers?.length > 0 && <span style={{ display: "block", fontSize: 12.5, color: "var(--dim)" }}><Bdi>{modifiers.join("، ")}</Bdi></span>}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: confirmed ? "var(--teal)" : "var(--amber)" }}>
        {confirmed ? t("shift.v2.ctx.confirmedItems") : t("shift.v2.ctx.unconfirmedItems")}
      </span>
    </div>
  );
}

function FactChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)" }}>
      {label}: <b style={{ color: "var(--txt)" }}>{value}</b>
    </span>
  );
}

function ConfirmedInfo({ conv, order }: { conv: Conversation; order: LocalOrder | null }) {
  const t = useT();
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (order?.deliveryAddress) rows.push({ label: t("shift.od.address"), value: <Bdi>{order.deliveryAddress}</Bdi> });
  if (order && (typeof order.lat === "number" && typeof order.lng === "number")) rows.push({ label: t("shift.v2.ctx.location"), value: <span style={{ fontFamily: "var(--kvx-font-ui)" }}><Num>{order.lat!.toFixed(4)}</Num>, <Num>{order.lng!.toFixed(4)}</Num></span> });
  if (conv.entities?.deliveryArea) rows.push({ label: t("shift.v2.delivery"), value: <Bdi>{conv.entities.deliveryArea}</Bdi> });
  const lastCustomer = lastCustomerMessage(conv);
  if (lastCustomer) rows.push({ label: t("shift.v2.ctx.lastChoice"), value: <Bdi>{lastCustomer.text}</Bdi> });
  if (rows.length === 0) return <div style={{ fontSize: 13.5, color: "var(--faint)" }}>{t("shift.v2.ctx.none")}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 10, fontSize: 13.5 }}>
          <span style={{ color: "var(--faint)", fontWeight: 700, minWidth: 96 }}>{r.label}</span>
          <span style={{ color: "var(--txt)", fontWeight: 600, flex: 1 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// The safety panel: the customer's OWN words + the menu's two-axis facts with
// provenance. No verdict is authored; every fact comes from data or a vocab label.
function SafetyContext({ conv, order, menuItems }: { conv: Conversation; order: LocalOrder | null; menuItems: MenuItem[] }) {
  const t = useT();
  const stated = conv.entities?.allergens ?? [];
  const trigger = lastCustomerMessage(conv);
  // Dishes to check: the created order's items, else the draft's.
  const dishNames: { name: string; menuItemId?: string }[] = order
    ? order.items.map((it) => ({ name: it.name, menuItemId: it.menuItemId }))
    : (conv.draftOrder?.items ?? []).map((it) => ({ name: it.name }));
  const dishes = dishNames.map((d) => ({ name: d.name, item: resolveMenuItem(d, menuItems) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Customer's own words (never paraphrased into reassurance). */}
      {(stated.length > 0 || trigger) && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--faint)", marginBottom: 4 }}>{t("shift.v2.ctx.customerWords")}</div>
          {stated.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
              {stated.map((a, i) => (
                <span key={i} style={{ fontSize: 12.5, fontWeight: 800, color: SAFETY_RED, background: SAFETY_TINT, borderRadius: 8, padding: "3px 9px" }}><Bdi>{a}</Bdi></span>
              ))}
            </div>
          )}
          {trigger && <div style={{ fontSize: 13.5, color: "var(--txt)", lineHeight: 1.6 }}>«<Bdi>{trigger.text}</Bdi>»</div>}
        </div>
      )}

      {/* Data-derived, two axes, per dish. */}
      {dishes.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--faint)" }}>{t("shift.v2.ctx.noSafetyData")}</div>
      ) : (
        dishes.map((d, i) => <DishSafety key={i} name={d.name} item={d.item} />)
      )}

      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)", fontStyle: "italic" }}>{t("shift.v2.ctx.provenance")}</div>
    </div>
  );
}

function DishSafety({ name, item }: { name: string; item: MenuItem | null }) {
  const t = useT();
  if (!item) {
    return (
      <div style={{ padding: "8px 10px", borderRadius: 10, background: "var(--inset2)", border: "1px solid var(--stroke)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)" }}><Bdi>{name}</Bdi></div>
        <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{t("shift.v2.ctx.noSafetyData")}</div>
      </div>
    );
  }
  const reviewed1 = !!item.allergensReviewedAt;
  const reviewed2 = !!item.prepVerifiedAt;
  const allergens = item.allergens ?? [];
  const risks = item.crossContactRisks ?? [];
  return (
    <div style={{ padding: "9px 11px", borderRadius: 10, background: "var(--inset2)", border: "1px solid var(--stroke)", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)" }}><Bdi>{name}</Bdi></div>
      {/* Axis 1 — in the product */}
      <AxisRow label={t("shift.v2.ctx.axis1")} reviewed={reviewed1}>
        {allergens.length > 0
          ? <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>{allergens.map((a, i) => <span key={i} style={axisTagStyle}><Bdi>{a}</Bdi></span>)}</span>
          : <span style={{ color: "var(--faint)", fontWeight: 700 }}>{reviewed1 ? t("shift.v2.ctx.uncertain") : t("shift.v2.ctx.undocumented")}</span>}
      </AxisRow>
      {/* Axis 2 — during preparation */}
      <AxisRow label={t("shift.v2.ctx.axis2")} reviewed={reviewed2}>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={axisTagStyle}>{item.prepStatus ? prepStatusLabelAr(item.prepStatus) : t("shift.v2.ctx.uncertain")}</span>
          {risks.map((r, i) => <span key={i} style={axisTagStyle}>{crossContactLabelAr(r)}</span>)}
          <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 700 }}>
            {item.kitchenCanIsolate === "yes" ? t("shift.v2.ctx.canIsolateYes") : item.kitchenCanIsolate === "no" ? t("shift.v2.ctx.canIsolateNo") : t("shift.v2.ctx.unknownToRestaurant")}
          </span>
        </span>
      </AxisRow>
    </div>
  );
}

const axisTagStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--txt)", background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 7, padding: "2px 8px" };

function AxisRow({ label, reviewed, children }: { label: string; reviewed: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--faint)", fontWeight: 800, minWidth: 84 }}>{label}</span>
      <span style={{ flex: 1 }}>{children}</span>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: reviewed ? "var(--teal)" : "var(--amber)" }}>{reviewed ? t("shift.v2.ctx.reviewed") : t("shift.v2.ctx.notReviewed")}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raw conversation — available, but the operator shouldn't need it.
// ---------------------------------------------------------------------------
function RawConversation({ messages }: { messages: ChatMessage[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={{ ...ghostBtn, width: "100%" }}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {open ? t("shift.v2.ctx.hideRaw") : t("shift.v2.ctx.showRaw")}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", padding: "4px 2px" }}>
          {messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.sender === "customer" ? "flex-start" : "flex-end", maxWidth: "82%", padding: "8px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, background: m.sender === "customer" ? "var(--inset2)" : m.sender === "ai" ? "rgba(75,139,255,.12)" : m.sender === "system" ? "transparent" : "rgba(46,204,154,.1)", color: m.sender === "system" ? "var(--faint)" : "var(--txt)", border: m.sender === "system" ? "1px dashed var(--stroke)" : "1px solid var(--stroke)" }}>
              <Bdi>{m.text}</Bdi>
              <span style={{ display: "block", fontSize: 11, color: "var(--faint)", marginTop: 3, fontFamily: "var(--kvx-font-ui)" }}>{m.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — composer with the WhatsApp window visible.
// ---------------------------------------------------------------------------
function Composer({
  conversationId, ownedByMe, claimedByOther, online, dataState, windowOpen, remainingMs,
}: {
  conversationId: string; ownedByMe: boolean; claimedByOther: boolean; online: boolean; dataState: string;
  windowOpen: boolean; remainingMs: number;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<null | "generic" | "window">(null);
  const gate = composerState({ claimedByOther, ownedByMe, online, dataState, windowOpen });

  async function send() {
    if (!gate.enabled || sending || !text.trim()) return;
    setSending(true); setFailed(null);
    const res = await useConversationStore.getState().addHumanMessage(conversationId, text.trim());
    setSending(false);
    if (res?.ok) { setText(""); return; }
    setFailed(res?.code === "outside_24h_window" ? "window" : "generic");
  }

  const reasonText: Record<NonNullable<typeof gate.reason>, DictKey> = {
    view_only: "shift.v2.viewOnly",
    offline: "shift.reason.offline",
    not_ready: "shift.reason.notReady",
    not_owned: "shift.v2.composer.notOwned",
    outside_window: "shift.v2.composer.outsideWindow",
  };

  return (
    <footer className="kvsh-rescue-composer">
      {/* Window state is ALWAYS visible — never let the operator type then discover a rejection. */}
      {gate.enabled ? (
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--teal)", marginBottom: 6 }}>
          {t("shift.v2.composer.freeReplyLeft")}: <WindowLeft remainingMs={remainingMs} />
        </div>
      ) : (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: gate.reason === "outside_window" ? "var(--amber)" : "var(--faint)", marginBottom: 6 }}>
          {t(reasonText[gate.reason!])}
          {gate.reason === "outside_window" && <span style={{ display: "block", marginTop: 3, color: "var(--faint)" }}>{t("shift.v2.composer.templatesDeferred")}</span>}
        </div>
      )}

      {failed && (
        <div style={{ marginBottom: 8, padding: "9px 12px", borderRadius: 11, background: "rgba(232,180,90,.1)", border: "1px solid rgba(232,180,90,.34)" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--amber)" }}>{failed === "window" ? t("shift.v2.composer.outsideWindow") : t("shift.v2.composer.sendFailed")}</div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3 }}>{t("shift.v2.composer.noDup")}</div>
          {failed === "generic" && (
            <button onClick={send} disabled={sending} style={{ ...ghostBtn, marginTop: 8, height: 40 }}>{t("shift.v2.fail.retry")}</button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} disabled={!gate.enabled || sending}
          placeholder={gate.enabled ? t("shift.v2.composer.placeholder") : t("shift.v2.composer.templatesOnly")}
          rows={2}
          style={{ flex: 1, resize: "none", minHeight: 48, borderRadius: 12, border: "1px solid var(--stroke)", background: gate.enabled ? "var(--inset2)" : "var(--inset)", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 15, padding: "10px 12px", outline: "none", opacity: gate.enabled ? 1 : 0.6 }}
        />
        <button onClick={send} disabled={!gate.enabled || sending || !text.trim()} style={{ ...primaryBtn, height: 48, opacity: !gate.enabled || sending || !text.trim() ? 0.5 : 1, cursor: !gate.enabled || sending || !text.trim() ? "default" : "pointer" }}>
          <Send size={16} /> {sending ? t("shift.v2.composer.sending") : t("shift.v2.composer.send")}
        </button>
      </div>
    </footer>
  );
}

function WindowLeft({ remainingMs }: { remainingMs: number }) {
  const t = useT();
  const e = formatElapsed(remainingMs);
  if (!e) return <span>—</span>;
  const unit: DictKey = e.unit === "sec" ? "shift.v2.unit.sec" : e.unit === "min" ? "shift.v2.unit.min" : "shift.v2.unit.hr";
  return <span style={{ fontFamily: "var(--kvx-font-ui)" }}><Num>{e.value}</Num> {t(unit)}</span>;
}

// ---------------------------------------------------------------------------
// Step 6 — handback. Ordinary = one confirm; safety = structured (record response,
// never resolved/safe wording).
// ---------------------------------------------------------------------------
function Handback({
  conversationId, isSafety, order, conv, ownedByMe, ownerName, onDone,
}: {
  conversationId: string; isSafety: boolean; order: LocalOrder | null; conv: Conversation;
  ownedByMe: boolean; ownerName: string | null; onDone: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"idle" | "karim" | "safety">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Safety ack: unclaimed → in_review (owned) → recorded (response written).
  const [safetyResponse, setSafetyResponse] = useState("");
  const [recorded, setRecorded] = useState(false);
  const ack: SafetyAckState = recorded ? "recorded" : ownedByMe ? "in_review" : "unclaimed";

  async function toKarim() {
    setBusy(true); setErr(null);
    // Ordinary handback → return to Karim (server-confirmed release + resume).
    useConversationStore.getState().returnToAi(conversationId);
    setBusy(false);
    onDone();
  }
  async function keepHuman() {
    setBusy(true); setErr(null);
    const ok = await useConversationStore.getState().setConversationIdle(conversationId);
    setBusy(false);
    if (ok) onDone(); else setErr(t("shift.v2.hb.failed"));
  }
  async function close() {
    if (isSafety) { setErr(t("shift.v2.hb.cannotCloseSafety")); return; }
    setBusy(true); setErr(null);
    const ok = await useConversationStore.getState().closeConversation(conversationId);
    setBusy(false);
    if (ok) onDone(); else setErr(t("shift.v2.hb.failed"));
  }
  async function releaseSafety() {
    // Structured safety handback: only once the restaurant's response is RECORDED,
    // and never with resolved/safe wording. returnToAi routes a held thread through
    // the deliberate safety-release path (release-hold) with the response as the note.
    const note = safetyResponse.trim();
    if (!recorded || !note || isForbiddenSafetyResolution(note)) { setErr(t("shift.v2.hb.needRecord")); return; }
    setBusy(true); setErr(null);
    useConversationStore.getState().returnToAi(conversationId, note);
    setBusy(false);
    onDone();
  }

  // The resume preview — data-derived facts Karim will resume with.
  const resumeFacts = resumeSummary(conv, order, t);

  if (isSafety) {
    return (
      <div className="kvsh-rescue-hb" style={{ borderColor: SAFETY_STROKE }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <ShieldAlert size={16} style={{ color: SAFETY_RED }} />
          <b style={{ fontSize: 15, color: SAFETY_RED }}>{t("shift.v2.hb.safetyTitle")}</b>
        </div>
        <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.6, marginBottom: 10 }}>{t("shift.v2.hb.safetyNote")}</div>
        <SafetyAckTrack ack={ack} ownerName={ownerName} assignedToMe={ownedByMe} />
        <textarea
          value={safetyResponse} onChange={(e) => { setSafetyResponse(e.target.value); setRecorded(false); }}
          placeholder={t("shift.v2.hb.responsePlaceholder")} rows={2}
          disabled={!ownedByMe}
          style={{ width: "100%", resize: "none", minHeight: 48, borderRadius: 12, border: "1px solid var(--stroke)", background: "var(--inset2)", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 15, padding: "10px 12px", outline: "none", marginTop: 10, opacity: ownedByMe ? 1 : 0.6 }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => { if (safetyResponse.trim() && !isForbiddenSafetyResolution(safetyResponse)) setRecorded(true); else setErr(t("shift.v2.hb.needRecord")); }}
            disabled={!ownedByMe || !safetyResponse.trim() || recorded}
            style={{ ...ghostBtn, opacity: !ownedByMe || !safetyResponse.trim() || recorded ? 0.55 : 1 }}
          >
            {t("shift.v2.hb.recordResponse")}
          </button>
          <button onClick={releaseSafety} disabled={!recorded || busy} style={{ ...safetyBtn, opacity: !recorded || busy ? 0.55 : 1, cursor: !recorded || busy ? "default" : "pointer" }}>
            {t("shift.v2.hb.releaseSafety")}
          </button>
          <button onClick={keepHuman} disabled={busy} style={ghostBtn}>{t("shift.v2.hb.keepHuman")}</button>
        </div>
        {err && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)", marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  if (mode === "karim") {
    return (
      <div className="kvsh-rescue-hb">
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--faint)", marginBottom: 8 }}>{t("shift.v2.hb.karimResumeTitle")}</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          {resumeFacts.map((f, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 700, color: "var(--txt)", background: "var(--inset2)", border: "1px solid var(--stroke)", borderRadius: 999, padding: "5px 11px" }}><Bdi>{f}</Bdi></span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setMode("idle")} style={ghostBtn}>{t("shift.cancel")}</button>
          <button onClick={toKarim} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}><CornerDownLeft size={16} /> {t("shift.v2.hb.toKarim")}</button>
        </div>
        {err && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)", marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div className="kvsh-rescue-hb">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setMode("karim")} disabled={!ownedByMe} style={{ ...primaryBtn, opacity: ownedByMe ? 1 : 0.55 }}>{t("shift.v2.hb.resolved")}</button>
        <button onClick={() => setMode("karim")} disabled={!ownedByMe} style={{ ...ghostBtn, opacity: ownedByMe ? 1 : 0.55 }}>{t("shift.v2.hb.toKarim")}</button>
        <button onClick={keepHuman} disabled={!ownedByMe || busy} style={{ ...ghostBtn, opacity: ownedByMe && !busy ? 1 : 0.55 }}>{t("shift.v2.hb.keepHuman")}</button>
        <button onClick={close} disabled={!ownedByMe || busy} style={{ ...ghostBtn, opacity: ownedByMe && !busy ? 1 : 0.55 }}>{t("shift.v2.hb.close")}</button>
      </div>
      {err && <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)", marginTop: 8 }}>{err}</div>}
    </div>
  );
}

function SafetyAckTrack({ ack, ownerName, assignedToMe }: { ack: SafetyAckState; ownerName: string | null; assignedToMe: boolean }) {
  const t = useT();
  const steps: { key: SafetyAckState; label: React.ReactNode }[] = [
    { key: "unclaimed", label: t("shift.v2.hb.ack.unclaimed") },
    { key: "in_review", label: assignedToMe ? t("shift.v2.hb.ack.inReviewYou") : <span>{t("shift.v2.hb.ack.inReviewWith")} {ownerName ? <Bdi>{ownerName}</Bdi> : t("shift.v2.someone")}</span> },
    { key: "recorded", label: t("shift.v2.hb.ack.recorded") },
  ];
  const activeIdx = steps.findIndex((s) => s.key === ack);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, color: i <= activeIdx ? SAFETY_RED : "var(--faint)", background: i <= activeIdx ? SAFETY_TINT : "var(--inset2)", border: `1px solid ${i <= activeIdx ? SAFETY_STROKE : "var(--stroke)"}` }}>{s.label}</span>
          {i < steps.length - 1 && <span style={{ color: "var(--faint)" }}>→</span>}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function lastCustomerMessage(conv: Conversation): ChatMessage | null {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    if (conv.messages[i].sender === "customer") return conv.messages[i];
  }
  return null;
}

function resolveMenuItem(d: { name: string; menuItemId?: string }, items: MenuItem[]): MenuItem | null {
  if (d.menuItemId) { const byId = items.find((m) => m.id === d.menuItemId); if (byId) return byId; }
  return items.find((m) => m.name === d.name) ?? null;
}

function paymentLabel(status: string, t: (k: DictKey) => string): string {
  if (status === "paid") return t("state.pay.paid");
  return t("shift.v2.ctx.noPayment");
}

function karimActivity(conv: Conversation, order: LocalOrder | null, t: (k: DictKey) => string): string {
  const parts: string[] = [];
  if (conv.suggestedAction) parts.push(conv.suggestedAction);
  parts.push(order ? t("shift.v2.hb.orderConfirmed") : t("shift.v2.ctx.noOrderYet"));
  return parts.join(" · ");
}

function resumeSummary(conv: Conversation, order: LocalOrder | null, t: (k: DictKey) => string): string[] {
  const facts: string[] = [];
  if (order) {
    facts.push(`${t("shift.v2.hb.chose")} ${order.fulfillmentType === "pickup" ? t("shift.v2.pickup") : t("shift.v2.delivery")}`);
    if (order.fulfillmentType === "delivery") facts.push(order.deliveryAddress ? t("shift.v2.hb.addressConfirmed") : t("shift.v2.hb.addressMissing"));
    facts.push(order.orderStatus === "pending_payment" || order.orderStatus === "pending_confirmation" ? t("shift.v2.hb.orderNotConfirmed") : t("shift.v2.hb.orderConfirmed"));
  } else {
    facts.push(t("shift.v2.hb.orderNotConfirmed"));
  }
  return facts;
}

// ---------------------------------------------------------------------------
function RescueStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
.kvsh-rescue-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(6,9,13,.66); backdrop-filter: blur(3px); display: flex; align-items: stretch; justify-content: center; }
.kvsh-rescue { display: flex; flex-direction: column; width: 100%; max-width: 720px; background: var(--bg, #0c1016); border-inline: 1px solid var(--stroke); }
.kvsh-rescue-head { padding: 14px 16px; border-bottom: 1px solid var(--stroke); background: var(--inset); }
.kvsh-rescue-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
.kvsh-rescue-composer { padding: 12px 16px; border-top: 1px solid var(--stroke); background: var(--inset); }
.kvsh-rescue-hb { padding: 12px 16px; border-top: 1px solid var(--stroke); background: var(--inset2); }
@media (min-width: 900px) {
  .kvsh-rescue-scrim { align-items: center; padding: 24px; }
  .kvsh-rescue { max-height: calc(100vh - 48px); border-radius: 18px; border: 1px solid var(--stroke); overflow: hidden; }
}
` }} />
  );
}
