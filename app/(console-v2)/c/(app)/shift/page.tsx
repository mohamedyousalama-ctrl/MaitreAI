"use client";

// ============================================================================
// KIVO-SHIFT — «الوردية» Shift Control (WO-SHIFT-1). The operator's primary screen
// during a Cairo dinner rush. Exception-based (andon): Karim absorbs normal demand
// silently; this screen surfaces the ABNORMAL. It answers three questions only —
// does anything need me now · are today's orders moving · is Karim working — and is
// a live list of what the shift must do next, ordered by operational urgency.
//
// THE PRODUCT BOUNDARY (the critical change): Kivo does intake + acceptance and
// NOTHING after. Exactly TWO order states live here — «يحتاج قبول» (Karim confirmed
// with the customer; no human has accepted) and «مقبول واتسلّم للمطعم» (a human
// accepted → it left Kivo). The old kitchen / ready / dispatched / delivered / POS
// columns / heat + driver maps are GONE from this screen (see the handback for what
// was removed and what was left in place to avoid breaking another route).
//
// EVERY rule from the window brief + the WO is honored here:
//  • Money is DISPLAYED from server values — no arithmetic in the UI (ServerMoney).
//  • The interface authors NO safety text; the forbidden set never appears.
//  • Safety red #B4232C is used ONLY for an active safety hold; ops uses amber.
//  • Ownership is SERVER-CONFIRMED — claim/accept go through the audited routes and
//    the outcome resolvers decide the view; nothing optimistic; a stale epoch
//    REFRESHES rather than forces; a race yields exactly one winner (loser told).
//  • Tenant isolation is the existing resolution (DataBootstrap); no id from a
//    query param; no service-role in the browser; no direct WhatsApp API call.
//  • Every failure state is designed (never a bare «حصل خطأ»).
//  • The pure model (shift-model.ts) is unit-tested (shift-model.test.ts).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Store, ShieldAlert, AlertTriangle, Clock3, LayoutGrid, MoreHorizontal, Radio } from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useConversationStore } from "@/lib/conversation-store";
import { useConsoleOps } from "@/lib/console-ops-store";
import { useRestaurantStore } from "@/lib/store";
import { useConsoleDataStore } from "@/lib/console-data-state";
import { useRole } from "@/lib/use-role";
import { getBrowserTenant } from "@/lib/db/tenant";
import { useT } from "@/lib/i18n/lang";
import type { DictKey } from "@/lib/i18n/dictionary";
import { Bdi, Num } from "@/components/kivo";
import type { LocalOrder, Conversation } from "@/lib/types";
import {
  shiftOrderState,
  isPaymentBlocked,
  isAcceptedToday,
  isPastTimeLimit,
  shiftCounts,
  sortActNow,
  connectionState,
  actionsEnabled,
  acceptAvailability,
  stopKarimAvailability,
  resolveAcceptResponse,
  type ShiftOrder,
  type ActionContext,
} from "@/components/console-v2/shift/shift-model";
import {
  ShiftStyles, Elapsed, AcceptanceChip, SafetyMark, Fulfil, ServerMoney,
  Card, OrderIdentity, SafetyDot, ReasonHead,
  primaryFull, claimBtn, safetyBtn, ghostBtn,
  SAFETY_RED, type ActNowEntry,
} from "@/components/console-v2/shift/shift-ui";
import { OrderDetailsModal, OrderDetailBody } from "@/components/console-v2/shift/OrderDetailsModal";
import { WaThreadDrawer } from "@/components/console-v2/shift/WaThreadDrawer";
import { StopSheet } from "@/components/console-v2/shift/StopSheet";
import { RejectSheet, type RejectReason } from "@/components/console-v2/shift/RejectSheet";
import { RescueFlow } from "@/components/console-v2/shift/RescueFlow";

const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  unavailable: "الصنف غير متاح",
  outOfRange: "خارج نطاق التوصيل",
  closed: "المطعم مقفول",
  payment: "مشكلة دفع",
  other: "رفض من الوردية",
};

// --- store → pure-model mappers ---
function toShiftOrder(o: LocalOrder): ShiftOrder {
  return {
    id: o.id,
    orderStatus: o.orderStatus,
    posStatus: o.posStatus ?? "not_entered",
    isTest: o.isTest,
    paymentStatus: o.paymentStatus,
    fulfillmentType: o.fulfillmentType,
    deliveryAddress: o.deliveryAddress ?? null,
    posEnteredAt: o.posEnteredAt ?? null,
    createdAt: o.createdAt,
  };
}

/** Last time a customer message was seen on a conversation (ms), else null. */
function lastCustomerWaitMs(conv: Conversation, now: number): number | null {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.sender === "customer" && typeof m.createdAtMs === "number") return Math.max(0, now - m.createdAtMs);
  }
  return null;
}

/**
 * Classify a conversation into at most ONE Section-A kind, by precedence:
 * safety > complaint > human_request. HUMAN_ACTIVE (someone's on it), CLOSED, and
 * resume-pending produce nothing. Safety wins regardless of ownership.
 */
function classifyConversation(conv: Conversation): { kind: ActNowEntry["kind"]; tone: "safety" | "amber"; reasonKey: DictKey } | null {
  const own = conv.ownershipState;
  if (own === "CLOSED" || own === "AI_RESUME_PENDING") return null;
  if (conv.isSafetyHold || own === "SYSTEM_HOLD") {
    return { kind: "safety_hold", tone: "safety", reasonKey: "shift.v2.reason.safety" };
  }
  if (own === "HUMAN_ACTIVE") return null; // a teammate is already on it
  if (conv.currentIntent === "complaint") {
    return { kind: "complaint", tone: "amber", reasonKey: "shift.v2.reason.complaint" };
  }
  if (own === "HOLD_UNCLAIMED" || conv.currentIntent === "human_request") {
    return { kind: "human_request", tone: "amber", reasonKey: "shift.v2.reason.humanRequest" };
  }
  return null;
}

type Notice = { tone: "ok" | "amber" | "safety"; text: string } | null;

export default function ShiftControlPage() {
  const t = useT();
  const orders = useOrderStore((s) => s.orders);
  const conversations = useConversationStore((s) => s.conversations);
  const assistantOn = useConsoleOps((s) => s.assistantOn);
  const opsLoaded = useConsoleOps((s) => s.loaded);
  const isOpen = useConsoleOps((s) => s.isOpen);
  const setAssistant = useConsoleOps((s) => s.setAssistant);
  const restaurantName = useRestaurantStore((s) => s.profile?.name ?? "");
  const dataState = useConsoleDataStore((s) => s.state);
  const roleState = useRole();
  const isManager = roleState === "manager";

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const [online, setOnline] = useState(true);
  const [actor, setActor] = useState<{ memberId: string | null; ready: boolean }>({ memberId: null, ready: false });
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const [selected, setSelected] = useState<LocalOrder | null>(null);
  const [waOrder, setWaOrder] = useState<LocalOrder | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<LocalOrder | null>(null);
  const [rescue, setRescue] = useState<{ conversationId: string; reasonKey: DictKey; isSafety: boolean } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [busy, setBusy] = useState<{ acceptId?: string; stop?: boolean; reject?: boolean }>({});
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  // Mount + live ticks.
  useEffect(() => { setMounted(true); setNow(Date.now()); }, []);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // "Last sync" = the last time the live data actually moved (a real signal, not a fake countdown).
  useEffect(() => { setLastSyncAt(Date.now()); }, [orders, conversations]);

  // WO-PAYLINK-UI — is electronic payment on for THIS tenant? Read from the one
  // endpoint that already answers it (GET /api/settings/flags) rather than adding a
  // second source of truth. The server re-checks the flag on every create, so this
  // only decides whether rendering the control would be misleading.
  const [pspEnabled, setPspEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/settings/flags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { flags?: Record<string, unknown> } | null) => {
        if (alive) setPspEnabled(d?.flags?.psp_payments === true);
      })
      .catch(() => { /* leave the control hidden — never block the shift screen */ });
    return () => { alive = false; };
  }, []);

  // Actor membership (for claims) + my user id (for "accepted by you").
  useEffect(() => {
    if (dataState === "DEMO") { setActor({ memberId: null, ready: true }); return; }
    if (dataState !== "DB_READY") { setActor({ memberId: null, ready: false }); return; }
    let cancel = false;
    fetch("/c/conversations/actor", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("actor"))))
      .then((j: { currentMemberId?: string }) => { if (!cancel) setActor({ memberId: j.currentMemberId ?? null, ready: true }); })
      .catch(() => { if (!cancel) setActor({ memberId: null, ready: false }); });
    getBrowserTenant().then((tt) => { if (!cancel) setMyUserId(tt?.userId ?? null); }).catch(() => {});
    return () => { cancel = true; };
  }, [dataState]);

  const conn = connectionState(online, dataState);
  const canAct = actionsEnabled(online, dataState);
  const actionCtx: ActionContext = { online, dataState, role: roleState, actorReady: actor.ready };
  const karimOn = opsLoaded ? assistantOn : true;
  const startOfDay = useMemo(() => (mounted ? new Date(now).setHours(0, 0, 0, 0) : 0), [now, mounted]);

  // Safety-held conversation ids (for the order card's safety marker) + a lookup.
  const convById = useMemo(() => {
    const m = new Map<string, Conversation>();
    for (const c of conversations) m.set(c.id, c);
    return m;
  }, [conversations]);
  const safetyConvIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversations) if (c.isSafetyHold || c.ownershipState === "SYSTEM_HOLD") s.add(c.id);
    return s;
  }, [conversations]);

  // ---- Section A — the andon (safety, complaint, human_request, payment blocker).
  // needs_acceptance + time_limit live in Section B (the acceptance queue) so no
  // order is rendered twice; confusion has no reliable live signal (see handback).
  const actNow = useMemo<ActNowEntry[]>(() => {
    if (!mounted) return [];
    const entries: ActNowEntry[] = [];
    for (const c of conversations) {
      const cls = classifyConversation(c);
      if (!cls) continue;
      entries.push({
        id: `conv:${c.id}`,
        kind: cls.kind,
        tone: cls.tone,
        reasonKey: cls.reasonKey,
        waitingMs: lastCustomerWaitMs(c, now),
        customerName: c.customer,
        conversationId: c.id,
        controlEpoch: typeof c.controlEpoch === "number" ? c.controlEpoch : null,
        ownerName: c.assignedMemberId && c.assignedMemberId === actor.memberId ? null : null,
        summaryData: cls.kind === "safety_hold" ? (c.escalationReason ?? null) : (c.escalationReason ?? null),
        summaryKey: cls.kind === "safety_hold" && !c.escalationReason ? "shift.v2.actNow.safetyNeutral" : undefined,
        primary: "claim",
      });
    }
    for (const o of orders) {
      if (isPaymentBlocked(o)) {
        entries.push({
          id: `order:${o.id}`,
          kind: "payment_or_address",
          tone: "amber",
          reasonKey: "shift.v2.reason.payment",
          waitingMs: Math.max(0, now - o.createdAt),
          customerName: o.customerName,
          orderNumber: o.orderNumber,
          orderId: o.id,
          primary: "details",
        });
      }
    }
    return sortActNow(entries);
  }, [mounted, now, conversations, orders, actor.memberId]);

  // ---- Section B — the acceptance queue (needs_acceptance), oldest first, late floats up.
  const newOrders = useMemo(() => {
    const list = orders.filter((o) => shiftOrderState(toShiftOrder(o)) === "needs_acceptance" && !acceptedIds.has(o.id));
    return list.sort((a, b) => a.createdAt - b.createdAt); // longest waiting first
  }, [orders, acceptedIds]);

  // ---- Section C — accepted today, most recent first.
  const acceptedList = useMemo(() => {
    if (!mounted) return [];
    return orders
      .filter((o) => isAcceptedToday(toShiftOrder(o), startOfDay))
      .sort((a, b) => (b.posEnteredAt ?? 0) - (a.posEnteredAt ?? 0));
  }, [orders, startOfDay, mounted]);

  const counts = useMemo(() => shiftCounts(orders.map(toShiftOrder), startOfDay), [orders, startOfDay]);

  // ---- actions ----
  function flashNotice(n: Notice) {
    setNotice(n);
    if (n) window.setTimeout(() => setNotice((cur) => (cur === n ? null : cur)), 4200);
  }

  async function accept(o: LocalOrder) {
    const avail = acceptAvailability(actionCtx);
    if (!avail.enabled || busy.acceptId) return;
    setBusy((b) => ({ ...b, acceptId: o.id }));
    try {
      const res = await fetch(`/api/orders/${o.id}/pos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "entered" }),
      });
      const body = await res.json().catch(() => ({}));
      const out = resolveAcceptResponse(res.status, body);
      if (out.kind === "accepted") {
        setAcceptedIds((s) => new Set(s).add(o.id));
        void useOrderStore.getState().reload();
      } else if (out.kind === "taken") {
        flashNotice({ tone: "amber", text: t("shift.v2.fail.takenAccept") });
        void useOrderStore.getState().reload();
      } else if (out.kind === "ineligible") {
        flashNotice({ tone: "amber", text: t("shift.v2.fail.stale") });
        void useOrderStore.getState().reload();
      } else {
        flashNotice({ tone: "amber", text: t("shift.v2.fail.accept") });
      }
    } catch {
      flashNotice({ tone: "amber", text: t("shift.v2.fail.accept") });
    } finally {
      setBusy((b) => ({ ...b, acceptId: undefined }));
    }
  }

  async function stopKarim() {
    if (busy.stop) return;
    setBusy((b) => ({ ...b, stop: true }));
    const res = await setAssistant(false);
    if (!res.ok) flashNotice({ tone: "amber", text: t("shift.pauseError") });
    setBusy((b) => ({ ...b, stop: false }));
  }

  async function reject(reason: RejectReason) {
    const o = rejectOrder;
    if (!o || busy.reject) return;
    // MONEY-SAFE: a PAID order's rejection is a refund — never composed in the
    // browser. Route it to the manager money tools instead of firing a browser
    // refund amount. UNPAID orders cancel cleanly through the audited route.
    if (o.paymentStatus === "paid") {
      flashNotice({ tone: "amber", text: t("shift.v2.reject.managerOnly") });
      setRejectOrder(null);
      return;
    }
    setBusy((b) => ({ ...b, reject: true }));
    try {
      const res = await fetch(`/api/orders/${o.id}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: REJECT_REASON_TEXT[reason] }),
      });
      if (res.ok) {
        setRejectOrder(null);
        void useOrderStore.getState().reload();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        flashNotice({ tone: "amber", text: b.error === "forbidden" ? t("shift.v2.reject.managerOnly") : t("shift.v2.fail.accept") });
      }
    } catch {
      flashNotice({ tone: "amber", text: t("shift.v2.fail.accept") });
    } finally {
      setBusy((b) => ({ ...b, reject: false }));
    }
  }

  // ---- render ----
  const acceptAvail = acceptAvailability(actionCtx);
  const stopAvail = stopKarimAvailability(actionCtx);

  return (
    <div className="kvsh">
      <ShiftStyles />

      {/* Sticky status bar — never a bare green dot; always explicit text. */}
      <div className="kvsh-statusbar">
        <div className="kvsh-sb-seg">
          <Radio size={15} style={{ color: "var(--teal)" }} />
          <b style={{ fontSize: 14, color: "var(--txt)" }}><Bdi>{restaurantName || "—"}</Bdi></b>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>·</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dim)" }}>{t("shift.v2.shiftRunning")}</span>
          {mounted && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--faint)", fontFamily: "var(--kvx-font-ui)" }}>
              <Num>{new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Num>
            </span>
          )}
        </div>

        <div className="kvsh-sb-seg kvsh-sb-center">
          <KarimStatus loaded={opsLoaded} on={karimOn} />
          <span style={{ fontSize: 12, color: "var(--faint)" }}>·</span>
          <ConnPill conn={conn} label={t("shift.v2.wa")} text={t(CONN_KEY[conn])} />
          {mounted && lastSyncAt != null && <LastSync since={Math.max(0, now - lastSyncAt)} />}
        </div>

        <div className="kvsh-sb-seg">
          <button
            type="button" onClick={() => setStopOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px", borderRadius: 11, border: "1px solid rgba(232,180,90,.4)", background: "rgba(232,180,90,.12)", color: "var(--amber)", fontFamily: "var(--kvx-font-ar)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            <AlertTriangle size={15} /> {t("shift.v2.stop.control")}
          </button>
        </div>
      </div>

      {!canAct && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", marginBottom: 14, borderRadius: 12, background: "rgba(232,180,90,.1)", border: "1px solid rgba(232,180,90,.34)", color: "var(--amber)", fontSize: 13.5, fontWeight: 700 }}>
          <AlertTriangle size={16} /> {t("shift.v2.fail.offlineActions")}
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", marginBottom: 14, borderRadius: 12, fontSize: 14, fontWeight: 800,
            color: notice.tone === "ok" ? "var(--teal)" : notice.tone === "safety" ? SAFETY_RED : "var(--amber)",
            background: notice.tone === "ok" ? "rgba(46,204,154,.1)" : notice.tone === "safety" ? "rgba(180,35,44,.1)" : "rgba(232,180,90,.1)",
            border: `1px solid ${notice.tone === "ok" ? "rgba(46,204,154,.34)" : notice.tone === "safety" ? "rgba(180,35,44,.4)" : "rgba(232,180,90,.34)"}`,
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Verifiable counts only — needs-acceptance · accepted today. Never a delivered count. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14, fontSize: 13.5, fontWeight: 800, color: "var(--dim)" }}>
        <CountPill value={counts.needsAcceptance} label={t("shift.v2.count.needs")} tone="amber" />
        <span style={{ color: "var(--faint)" }}>·</span>
        <CountPill value={counts.acceptedToday} label={t("shift.v2.count.accepted")} tone="teal" />
      </div>

      <div className="kvsh-grid">
        {/* RIGHT column (RTL first child) — the queue. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {/* Section A — لازم تتصرف الآن (dominant). */}
          <section className="kvsh-section">
            <SectionHead icon={<AlertTriangle size={17} />} title={t("shift.v2.actNow.title")} count={actNow.length} />
            {!mounted ? null : actNow.length === 0 ? (
              <CalmEmpty title={t("shift.v2.actNow.emptyTitle")} body={t("shift.v2.actNow.emptyBody")} />
            ) : (
              actNow.map((e) => (
                <ActNowCard
                  key={e.id} entry={e}
                  onOpenRescue={() => { if (e.conversationId) setRescue({ conversationId: e.conversationId, reasonKey: e.reasonKey, isSafety: e.tone === "safety" }); }}
                  onDetails={() => { const o = orders.find((x) => x.id === e.orderId); if (o) setSelected(o); }}
                />
              ))
            )}
          </section>

          {/* Section B — طلبات جديدة (the acceptance queue). */}
          <section className="kvsh-section">
            <SectionHead icon={<Store size={17} />} title={t("shift.v2.newOrders.title")} count={newOrders.length} />
            {newOrders.length === 0 ? (
              <EmptyLine>{t("shift.v2.newOrders.empty")}</EmptyLine>
            ) : (
              newOrders.map((o) => (
                <NewOrderCard
                  key={o.id} order={o} now={now}
                  hasSafety={!!o.conversationId && safetyConvIds.has(o.conversationId)}
                  acceptEnabled={acceptAvail.enabled} acceptReason={acceptAvail.reasonKey ? t(acceptAvail.reasonKey as DictKey) : null}
                  accepting={busy.acceptId === o.id}
                  onAccept={() => accept(o)}
                  onDetails={() => setSelected(o)}
                  onReject={() => setRejectOrder(o)}
                />
              ))
            )}
          </section>

          {/* Section C — طلبات النهاردة (accepted today, no progress state). */}
          <section className="kvsh-section">
            <SectionHead icon={<Clock3 size={17} />} title={t("shift.v2.today.title")} count={acceptedList.length} />
            {!mounted ? null : acceptedList.length === 0 ? (
              <EmptyLine>{t("shift.v2.today.empty")}</EmptyLine>
            ) : (
              acceptedList.map((o) => (
                <TodayRow key={o.id} order={o} byYou={!!myUserId && o.posEnteredBy === myUserId} onDetails={() => setSelected(o)} />
              ))
            )}
          </section>
        </div>

        {/* LEFT column (RTL, ≥1000px) — the tablet split: selected detail inline, else context. */}
        <aside className="kvsh-side">
          {selected ? (
            <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <b style={{ fontSize: 15, color: "var(--txt)", flex: 1, fontFamily: "var(--kvx-font-ui)" }}>#<Num>{selected.orderNumber}</Num></b>
                <button onClick={() => setSelected(null)} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{t("shift.od.close")}</button>
              </div>
              <OrderDetailBody
                order={selected}
                hasSafety={!!selected.conversationId && safetyConvIds.has(selected.conversationId)}
                onViewConversation={selected.conversationId ? () => { const o = selected; setWaOrder(o); } : undefined}
                pspEnabled={pspEnabled}
              />
            </div>
          ) : (
            <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 16, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <KarimStatus loaded={opsLoaded} on={karimOn} big />
              <div style={{ height: 1, background: "var(--stroke)" }} />
              <CountPill value={counts.needsAcceptance} label={t("shift.v2.count.needs")} tone="amber" block />
              <CountPill value={counts.acceptedToday} label={t("shift.v2.count.accepted")} tone="teal" block />
            </div>
          )}
        </aside>
      </div>

      {/* Bottom navigation — exactly THREE (phone IA). «الوردية» is active; «المنيو»
          and «المزيد» are the intended IA targets whose pages are owned by other
          windows / not yet shipped, so they are non-navigating placeholders (matches
          the rail's "ignore href while not ready" convention) — see handback. */}
      <nav className="kvsh-bottomnav" aria-label={t("shift.v2.nav.shift")}>
        <span className="kvsh-navitem active"><Radio size={18} />{t("shift.v2.nav.shift")}</span>
        <span className="kvsh-navitem" aria-disabled><LayoutGrid size={18} />{t("shift.v2.nav.menu")}</span>
        <span className="kvsh-navitem" aria-disabled><MoreHorizontal size={18} />{t("shift.v2.nav.more")}</span>
      </nav>

      {/* Detail (phone modal), thread, stop + reject sheets. */}
      <OrderDetailsModal
        order={selected}
        hasSafety={!!selected?.conversationId && safetyConvIds.has(selected.conversationId)}
        onClose={() => setSelected(null)}
        onViewConversation={() => { const o = selected; setSelected(null); setWaOrder(o); }}
        pspEnabled={pspEnabled}
      />
      <WaThreadDrawer order={waOrder} onClose={() => setWaOrder(null)} />
      <StopSheet
        open={stopOpen} onClose={() => setStopOpen(false)}
        karimOn={karimOn} canStopKarim={stopAvail.enabled} stopReason={stopAvail.reasonKey ? t(stopAvail.reasonKey as DictKey) : null}
        busy={!!busy.stop} onStopKarim={stopKarim} intakeOpen={isOpen}
      />
      <RejectSheet
        open={!!rejectOrder} orderNumber={rejectOrder?.orderNumber}
        canReject={isManager} managerReason={isManager ? null : t("shift.v2.reject.managerOnly")}
        busy={!!busy.reject}
        onClose={() => setRejectOrder(null)}
        onConfirm={reject}
      />

      {/* The takeover rescue flow (WO-SHIFT-2) — opened from a Section-A card. */}
      {rescue && (
        <RescueFlow
          conversationId={rescue.conversationId}
          reasonKey={rescue.reasonKey}
          isSafety={rescue.isSafety}
          online={online}
          dataState={dataState}
          actorMemberId={actor.memberId}
          actorReady={actor.ready}
          onClose={() => setRescue(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// status-bar pieces
// ---------------------------------------------------------------------------
const CONN_KEY: Record<ReturnType<typeof connectionState>, DictKey> = {
  connected: "shift.v2.conn.connected",
  degraded: "shift.v2.conn.degraded",
  weak: "shift.v2.conn.weak",
  offline: "shift.v2.conn.offline",
};

function KarimStatus({ loaded, on, big }: { loaded: boolean; on: boolean; big?: boolean }) {
  const t = useT();
  // Active = teal; paused = AMBER (operational caution), never green-success, never red (safety).
  const color = !loaded ? "var(--faint)" : on ? "var(--teal)" : "var(--amber)";
  const label = !loaded ? t("shift.karimLoading") : on ? t("shift.karimActive") : t("shift.karimPaused");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: big ? 15 : 13.5, fontWeight: 800, color: "var(--txt)" }}>
      <span aria-hidden style={{ width: big ? 10 : 8, height: big ? 10 : 8, borderRadius: "50%", background: color, boxShadow: loaded ? `0 0 6px ${color}` : undefined }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

function ConnPill({ conn, label, text }: { conn: ReturnType<typeof connectionState>; label: string; text: string }) {
  const color = conn === "connected" ? "var(--teal)" : conn === "offline" || conn === "weak" ? "var(--amber)" : "var(--gold)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "var(--dim)" }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {label} · <span style={{ color }}>{text}</span>
    </span>
  );
}

function LastSync({ since }: { since: number }) {
  const t = useT();
  const sec = Math.floor(since / 1000);
  const unit: DictKey = sec < 60 ? "shift.v2.unit.sec" : sec < 3600 ? "shift.v2.unit.min" : "shift.v2.unit.hr";
  const val = sec < 60 ? sec : sec < 3600 ? Math.floor(sec / 60) : Math.floor(sec / 3600);
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)" }}>
      · {t("shift.v2.lastSync")} {t("shift.v2.since")} <Num>{val}</Num> {t(unit)}
    </span>
  );
}

function CountPill({ value, label, tone, block }: { value: number; label: string; tone: "amber" | "teal"; block?: boolean }) {
  const color = tone === "amber" ? "var(--amber)" : "var(--teal)";
  return (
    <span style={{ display: block ? "flex" : "inline-flex", alignItems: "center", gap: 8, width: block ? "100%" : undefined, justifyContent: block ? "space-between" : undefined, padding: block ? "10px 12px" : undefined, background: block ? "var(--inset2)" : undefined, borderRadius: block ? 12 : undefined }}>
      <b style={{ fontFamily: "var(--kvx-font-ui)", fontSize: block ? 20 : 15, fontWeight: 900, color }}><Num>{value}</Num></b>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dim)" }}>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// section pieces
// ---------------------------------------------------------------------------
function SectionHead({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "2px 0 2px" }}>
      <span style={{ color: "var(--dim)", display: "inline-flex" }}>{icon}</span>
      <h2 style={{ fontSize: 15, fontWeight: 900, color: "var(--txt)", margin: 0 }}>{title}</h2>
      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--faint)", fontFamily: "var(--kvx-font-ui)" }}>(<Num>{count}</Num>)</span>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13.5, color: "var(--faint)", padding: "12px 4px" }}>{children}</div>;
}

function CalmEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "22px 16px", borderRadius: 16, background: "rgba(46,204,154,.06)", border: "1px solid rgba(46,204,154,.22)" }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "var(--teal)" }}>{title}</div>
      <div style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function ActNowCard({
  entry, onOpenRescue, onDetails,
}: {
  entry: ActNowEntry; onOpenRescue: () => void; onDetails: () => void;
}) {
  const t = useT();
  const safety = entry.tone === "safety";
  return (
    <Card accent={safety ? SAFETY_RED : "var(--amber)"} style={safety ? { background: "rgba(180,35,44,.05)" } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {safety ? <SafetyDot /> : null}
        <ReasonHead
          icon={safety ? <ShieldAlert size={16} style={{ color: SAFETY_RED }} /> : <AlertTriangle size={15} style={{ color: "var(--amber)" }} />}
          text={t(entry.reasonKey)} tone={entry.tone}
        />
        <span style={{ flex: 1 }} />
        <Elapsed waitingMs={entry.waitingMs} />
      </div>

      <div style={{ fontSize: 14, color: "var(--txt)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {entry.customerName && <Bdi>{entry.customerName}</Bdi>}
        {entry.orderNumber && <span style={{ fontFamily: "var(--kvx-font-ui)", color: "var(--dim)" }}>#<Num>{entry.orderNumber}</Num></span>}
      </div>

      {(entry.summaryData || entry.summaryKey) && (
        <div style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.6 }}>
          {entry.summaryData ? <Bdi>{entry.summaryData}</Bdi> : entry.summaryKey ? t(entry.summaryKey) : null}
        </div>
      )}

      {/* The primary action opens the takeover RESCUE flow (WO-SHIFT-2), where the
          claim is server-confirmed and the compiled context leads. A payment/address
          blocker (no conversation to rescue) opens the order detail instead. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
        {entry.primary === "claim" ? (
          <button onClick={onOpenRescue} style={safety ? safetyBtn : claimBtn}>{t("shift.v2.act.claim")}</button>
        ) : (
          <button onClick={onDetails} style={ghostBtn}>{t("shift.v2.act.details")}</button>
        )}
      </div>
    </Card>
  );
}

function NewOrderCard({
  order, now, hasSafety, acceptEnabled, acceptReason, accepting, onAccept, onDetails, onReject,
}: {
  order: LocalOrder; now: number; hasSafety: boolean; acceptEnabled: boolean; acceptReason: string | null;
  accepting: boolean; onAccept: () => void; onDetails: () => void; onReject: () => void;
}) {
  const t = useT();
  const waitMs = Math.max(0, now - order.createdAt);
  const late = isPastTimeLimit(waitMs);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <Card accent={late ? "var(--amber)" : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <OrderIdentity orderNumber={order.orderNumber} name={order.customerName} onClick={onDetails} />
        <span style={{ flex: 1 }} />
        {late && <span style={{ fontSize: 12, fontWeight: 900, color: "var(--amber)", background: "rgba(232,180,90,.16)", borderRadius: 8, padding: "3px 9px" }}>{t("shift.v2.late")}</span>}
        <Elapsed waitingMs={waitMs} prefix={false} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Fulfil type={order.fulfillmentType} />
        <span style={{ fontSize: 12, color: "var(--faint)" }}>·</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dim)" }}><Num>{order.items.length}</Num> {t("shift.v2.items")}</span>
        {order.deliveryAddress && <><span style={{ fontSize: 12, color: "var(--faint)" }}>·</span><span style={{ fontSize: 12.5, color: "var(--dim)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Bdi>{order.deliveryAddress}</Bdi></span></>}
        <span style={{ flex: 1 }} />
        {hasSafety && <SafetyMark />}
        <ServerMoney total={order.total} currency={order.currency} />
      </div>

      {/* «قبول» is the single visible primary, full width. رفض is behind المزيد. */}
      <button onClick={onAccept} disabled={!acceptEnabled || accepting} style={{ ...primaryFull, opacity: !acceptEnabled || accepting ? 0.55 : 1, cursor: !acceptEnabled || accepting ? "default" : "pointer" }}>
        {t("shift.v2.act.accept")}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setMoreOpen((v) => !v)} style={{ ...ghostBtn, flex: 1 }}>{t("shift.v2.act.more")}</button>
      </div>
      {moreOpen && (
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDetails} style={{ ...ghostBtn, flex: 1 }}>{t("shift.v2.act.details")}</button>
          <button onClick={onReject} style={{ ...ghostBtn, flex: 1, color: "var(--amber)", borderColor: "rgba(232,180,90,.42)" }}>{t("shift.v2.act.reject")}</button>
        </div>
      )}
      {!acceptEnabled && acceptReason && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)" }}>{acceptReason}</div>}
    </Card>
  );
}

function TodayRow({ order, byYou, onDetails }: { order: LocalOrder; byYou: boolean; onDetails: () => void }) {
  const t = useT();
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <OrderIdentity orderNumber={order.orderNumber} name={order.customerName} onClick={onDetails} />
        <span style={{ flex: 1 }} />
        <AcceptanceChip state="accepted" />
        <ServerMoney total={order.total} currency={order.currency} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--dim)", fontWeight: 700 }}>
        <Fulfil type={order.fulfillmentType} />
        <span style={{ color: "var(--faint)" }}>·</span>
        <span>
          {t("shift.v2.today.acceptedAt")}{" "}
          {order.posEnteredAt != null && <span style={{ fontFamily: "var(--kvx-font-ui)" }}><Num>{new Date(order.posEnteredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Num></span>}
        </span>
        {byYou && <><span style={{ color: "var(--faint)" }}>·</span><span>{t("shift.v2.today.byYou")}</span></>}
      </div>
    </Card>
  );
}
