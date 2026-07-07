"use client";

// ============================================================================
// console_v2 item 5 — Live Shift. The operator's live operating surface.
//
// LAWS honored here:
//  • display vocabulary ONLY through displayState()/derive*() — no ad-hoc badges.
//  • money is DISPLAYED, never derived — order.total straight from the DB row.
//  • AWAITING HANDOFF (pos_status = not_entered on a confirmed order) is the ONLY
//    alarm — the sole fast-pulse ACT-NOW dot on the page (§5 motion).
//  • payment-mix is a PASSIVE chip (order truth, no urgency).
//  • every mutating action goes through an audited server route: POS stamp →
//    /api/orders/[id]/pos, 86 → /api/menu/availability, pause → /api/settings/ops
//    (via the shared ops store, optimistic + revert-on-fail).
//  • surfaces with no real backing (Order Heat, Loss/Ad-sources) render GATHERING —
//    never fabricated numbers.
//  • test orders are excluded from the payment-mix count and badged, never hidden.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { UtensilsCrossed, Store, Printer } from "lucide-react";
import { useOrderStore } from "@/lib/order-store";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useConsoleOps } from "@/lib/console-ops-store";
import { useRole } from "@/lib/use-role";
import {
  deriveOrderDisplay,
  derivePosDisplay,
  derivePaymentDisplay,
} from "@/lib/console-v2/display-state";
import { StateChip, ActNowDot } from "@/components/console-v2";
import { LiveMaps, type HeatPoint } from "@/components/console-v2/shift/LiveMaps";
import { OrderDetailsModal } from "@/components/console-v2/shift/OrderDetailsModal";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num } from "@/components/kivo";
import type { LocalOrder, OrderStatusKey, PosStatus } from "@/lib/types";

// Active on the board (not draft/delivered/cancelled).
const ACTIVE: OrderStatusKey[] = [
  "pending_confirmation", "pending_payment", "paid", "preparing", "ready", "out_for_delivery",
];
// An order is kitchen-bound (eligible for the POS handoff board) once confirmed.
const POS_ELIGIBLE: OrderStatusKey[] = ["paid", "preparing", "ready", "out_for_delivery", "delivered"];

const posOf = (o: LocalOrder): PosStatus => o.posStatus ?? "not_entered";

export default function LiveShiftPage() {
  const t = useT();
  const hydrated = useHasHydrated();
  // Pause posts to the manager-only /api/settings/ops — only a confirmed manager
  // sees the control (demo resolves to manager). Operators never see a 403 switch.
  const isManager = useRole() === "manager";
  const orders = useOrderStore((s) => s.orders);
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const setItemAvailability = useRestaurantStore((s) => s.setItemAvailability);

  // Karim pause — shared ops store (DB-backed, optimistic, reverts on failure).
  const assistantOn = useConsoleOps((s) => s.assistantOn);
  const opsLoaded = useConsoleOps((s) => s.loaded);
  const setAssistant = useConsoleOps((s) => s.setAssistant);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState(false);

  // Order-details popup (#ovDetails) — the primary row interaction.
  const [selected, setSelected] = useState<LocalOrder | null>(null);

  // Optimistic local layers (realtime reconciles in a configured tenant).
  const [stamped, setStamped] = useState<Set<string>>(new Set());
  const [posRef, setPosRef] = useState<Record<string, string>>({});
  const [posBusy, setPosBusy] = useState<Set<string>>(new Set());

  // Item 17 — the kitchen-ticket print link is gated on the real `kitchen_ticket`
  // flag (GET /api/settings/flags): the ticket route 404s when the flag is off, so
  // we render the link ONLY when the tenant has it on — the rail-never-links-to-a-404
  // discipline, applied to an action link. Off / unresolved → no link, never a 404.
  const [kitchenTicket, setKitchenTicket] = useState(false);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/flags");
        const j = await res.json();
        if (!dead && res.ok && j.flags) setKitchenTicket(j.flags.kitchen_ticket === true);
      } catch { /* stays false → no link */ }
    })();
    return () => { dead = true; };
  }, []);

  const active = useMemo(
    () => orders.filter((o) => ACTIVE.includes(o.orderStatus)),
    [orders]
  );
  const awaitingHandoff = useMemo(
    // Test orders are rejected by the POS route + excluded by the R3 board, so they
    // must NOT inflate the sole alarm (they still show in the active list, badged).
    () => orders.filter((o) => !o.isTest && POS_ELIGIBLE.includes(o.orderStatus) && posOf(o) === "not_entered" && !stamped.has(o.id)),
    [orders, stamped]
  );

  // Order-Heat points — real located-order coordinates (0043 orders.lat/lng),
  // non-test, non-cancelled. Null coords (WhatsApp / typed-address orders) are
  // dropped; when none are located the map renders its honest GATHERING state.
  const heatPoints = useMemo<HeatPoint[]>(
    () => orders
      .filter((o) => !o.isTest && o.orderStatus !== "cancelled" && typeof o.lat === "number" && typeof o.lng === "number")
      .map((o) => ({ lat: o.lat as number, lng: o.lng as number })),
    [orders]
  );

  // Payment mix — PASSIVE, "today" only (the store loads full history), non-test,
  // excluding cancelled. Order truth (counts, not derived money).
  const mix = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const real = orders.filter((o) => !o.isTest && o.orderStatus !== "cancelled" && o.createdAt >= startOfToday);
    const paid = real.filter((o) => o.paymentStatus === "paid").length;
    const cod = real.filter((o) => o.paymentMethod === "cod").length;
    return { paid, cod };
  }, [orders]);

  async function togglePause() {
    if (!opsLoaded || pauseBusy) return;
    setPauseError(false);
    setPauseBusy(true);
    const res = await setAssistant(!assistantOn);
    if (!res.ok) setPauseError(true);
    setPauseBusy(false);
  }

  async function stampPos(order: LocalOrder) {
    if (posBusy.has(order.id)) return;
    setPosBusy((s) => new Set(s).add(order.id));
    try {
      const res = await fetch(`/api/orders/${order.id}/pos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "entered", reference: posRef[order.id] ?? "" }),
      });
      if (res.ok) setStamped((s) => new Set(s).add(order.id)); // clear from the alarm
    } finally {
      setPosBusy((s) => { const n = new Set(s); n.delete(order.id); return n; });
    }
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* Header: title + Karim pause + passive payment-mix chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: 0, flex: 1 }}>{t("shift.title")}</h1>
        <PaymentMixChip codLabel={t("shift.cod")} paidLabel={t("shift.paidCount")} cod={mix.cod} paid={mix.paid} mixLabel={t("shift.paymentMix")} />
        {isManager && (
          <PauseControl
            on={opsLoaded && assistantOn}
            loading={!opsLoaded}
            busy={pauseBusy}
            onToggle={togglePause}
            activeLabel={t("shift.karimActive")}
            pausedLabel={t("shift.karimPaused")}
            loadingLabel={t("shift.karimLoading")}
            ariaLabel={t("shift.pause")}
          />
        )}
      </div>
      {pauseError && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--kv-red)", marginBottom: 14 }}>{t("shift.pauseError")}</div>
      )}

      {/* AWAITING HANDOFF — the only alarm (fast-pulse ACT-NOW dot). */}
      <section style={{ marginBottom: 22 }}>
        <SectionHead icon={<Store size={16} />} title={t("shift.awaitingHandoff")} count={awaitingHandoff.length} />
        {awaitingHandoff.length === 0 ? (
          <EmptyLine>{t("shift.awaitingHandoffEmpty")}</EmptyLine>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {awaitingHandoff.map((o) => (
              <div key={o.id} style={{ ...cardStyle, borderInlineStart: "3px solid #e8b45a" }}>
                <ActNowDot kind="handoff" />
                <OrderIdentity order={o} test={t("shift.test")} onClick={() => setSelected(o)} />
                <div style={{ flex: 1 }} />
                <TicketPrintLink id={o.id} enabled={kitchenTicket} />
                <input
                  value={posRef[o.id] ?? ""}
                  onChange={(e) => setPosRef((s) => ({ ...s, [o.id]: e.target.value }))}
                  placeholder={t("shift.posRefPlaceholder")}
                  dir="ltr"
                  style={posInputStyle}
                />
                <button onClick={() => stampPos(o)} disabled={posBusy.has(o.id)} style={primaryBtn}>
                  {t("shift.stampPos")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active orders board — every axis via displayState()/derive*(). */}
      <section style={{ marginBottom: 22 }}>
        <SectionHead title={t("shift.orders")} count={active.length} />
        {!hydrated ? null : active.length === 0 ? (
          <EmptyLine>{t("shift.noOrders")}</EmptyLine>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map((o) => (
              <div key={o.id} style={cardStyle}>
                <OrderIdentity order={o} test={t("shift.test")} onClick={() => setSelected(o)} />
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <StateChip display={deriveOrderDisplay(o.orderStatus)} />
                  {POS_ELIGIBLE.includes(o.orderStatus) && <StateChip display={derivePosDisplay(posOf(o))} dot={false} />}
                  {/* payment chip is passive */}
                  <StateChip display={derivePaymentDisplay(o.paymentStatus)} dot={false} />
                  <Money total={o.total} currency={o.currency} />
                  {POS_ELIGIBLE.includes(o.orderStatus) && <TicketPrintLink id={o.id} enabled={kitchenTicket} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 86 quick action — wired to the audited availability route. */}
      <Eighty6 menuItems={menuItems} setItemAvailability={setItemAvailability} />

      {/* The maps grid (v35 flagship): Order Heat (LIVE from 0043 order coords when
          located orders exist, else the designed GATHERING map-card) + Losing Orders
          and Ad Sources as designed GATHERING map-cards until their engines feed them. */}
      <div style={{ marginTop: 22 }}>
        <LiveMaps heatPoints={heatPoints} ordersToday={active.length} />
      </div>

      {/* Order details popup (#ovDetails) — opens on an order row. */}
      <OrderDetailsModal order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 86 quick action
// ---------------------------------------------------------------------------
function Eighty6({
  menuItems,
  setItemAvailability,
}: {
  menuItems: { id: string; name: string; available: boolean }[];
  setItemAvailability: (id: string, available: boolean) => Promise<boolean>;
}) {
  const t = useT();
  const available = menuItems.filter((m) => m.available);
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function eightySix() {
    if (!sel || busy) return;
    setBusy(true); setErr(false); setMsg(null);
    // The store method does the optimistic flip + the audited POST /api/menu/availability
    // + reconcile-on-failure, and returns the REAL result (never a silent success).
    const ok = await setItemAvailability(sel, false);
    if (ok) { setMsg(t("shift.86done")); setSel(""); } else setErr(true);
    setBusy(false);
  }

  return (
    <section style={{ marginBottom: 4 }}>
      <SectionHead icon={<UtensilsCrossed size={16} />} title={t("shift.86")} />
      <div style={{ ...cardStyle, gap: 10, flexWrap: "wrap" }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={selectStyle}>
          <option value="">{t("shift.86choose")}</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button onClick={eightySix} disabled={!sel || busy} style={{ ...primaryBtn, opacity: !sel || busy ? 0.5 : 1 }}>
          {t("shift.86button")}
        </button>
        {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-deep)" }}>{msg}</span>}
        {err && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--kv-red)" }}>{t("shift.86error")}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// small pieces
// ---------------------------------------------------------------------------

// Item 17 — kitchen-ticket print link. Opens the audited, money-STRIPPED ticket
// route (/c/orders/[id]/ticket) in a new tab; that page owns the print (QZ silent or
// the browser dialog) and stamps the ticket_printed audit. Rendered ONLY when the
// tenant's kitchen_ticket flag is on — the route 404s otherwise, so we never link
// into a dead page.
function TicketPrintLink({ id, enabled }: { id: string; enabled: boolean }) {
  const t = useT();
  if (!enabled) return null;
  return (
    <a
      href={`/c/orders/${id}/ticket`}
      target="_blank"
      rel="noopener noreferrer"
      title={t("shift.printTicket")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
        borderRadius: 10, border: "1px solid var(--kv-border)", background: "var(--kv-card)",
        color: "var(--kv-muted)", fontSize: 12, fontWeight: 700, textDecoration: "none", flex: "none",
      }}
    >
      <Printer size={14} /> {t("shift.printTicket")}
    </a>
  );
}

function OrderIdentity({ order, test, onClick }: { order: LocalOrder; test: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ minWidth: 0, border: 0, background: "transparent", padding: 0, cursor: onClick ? "pointer" : "default", textAlign: "start", fontFamily: "var(--kv-font)" }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)", display: "flex", alignItems: "center", gap: 7 }}>
        <span>#<Num>{order.orderNumber}</Num></span>
        <Bdi>{order.customerName}</Bdi>
        {order.isTest && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#7d4fd0", background: "rgba(168,120,240,.16)", borderRadius: 6, padding: "3px 7px" }}>{test}</span>
        )}
      </div>
    </button>
  );
}

function Money({ total, currency }: { total: number; currency: string }) {
  // DISPLAY only — the amount comes straight from the order row, never recomputed.
  return (
    <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--kv-text)", whiteSpace: "nowrap" }}>
      <Num>{total.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--kv-muted)" }}>{currency}</span>
    </span>
  );
}

function PaymentMixChip({ cod, paid, codLabel, paidLabel, mixLabel }: { cod: number; paid: number; codLabel: string; paidLabel: string; mixLabel: string }) {
  return (
    <span title={mixLabel} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: "var(--kv-r-pill)", background: "var(--kv-card)", border: "1px solid var(--kv-border)", fontSize: 11.5, fontWeight: 700, color: "var(--kv-muted)" }}>
      <span>{codLabel} <Num>{cod}</Num></span>
      <span style={{ color: "var(--kv-faint)" }}>·</span>
      <span>{paidLabel} <Num>{paid}</Num></span>
    </span>
  );
}

function PauseControl({ on, loading, busy, onToggle, activeLabel, pausedLabel, loadingLabel, ariaLabel }: {
  on: boolean; loading: boolean; busy: boolean; onToggle: () => void;
  activeLabel: string; pausedLabel: string; loadingLabel: string; ariaLabel: string;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "6px 12px", borderRadius: "var(--kv-r-pill)", background: on ? "var(--kv-primary-tint)" : "rgba(154,167,184,.14)", border: "1px solid var(--kv-border)" }}>
      <span className={on ? "kv-pulse" : undefined} aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "var(--kv-primary)" : "var(--kv-faint)" }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--kv-text)" }}>
        {loading ? loadingLabel : on ? activeLabel : pausedLabel}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={ariaLabel}
        disabled={loading || busy} onClick={onToggle}
        style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: loading || busy ? "default" : "pointer", opacity: loading ? 0.5 : 1, padding: 0, position: "relative", background: on ? "var(--kv-primary)" : "#cdd9d2" }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "inset-inline-start .15s" }} />
      </button>
    </div>
  );
}

function SectionHead({ icon, title, count }: { icon?: React.ReactNode; title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      {icon && <span style={{ color: "var(--kv-muted)", display: "inline-flex" }}>{icon}</span>}
      <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-muted)", margin: 0 }}>{title}</h2>
      {typeof count === "number" && (
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--kv-faint)" }}>(<Num>{count}</Num>)</span>
      )}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--kv-faint)", padding: "14px 4px" }}>{children}</div>;
}

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "var(--kv-card)", border: "1px solid var(--kv-border)",
  borderRadius: "var(--kv-r-md-lg)", padding: "12px 14px", boxShadow: "var(--kv-shadow-card)",
};
const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 14px", borderRadius: "var(--kv-r-md-sm)", border: 0,
  background: "var(--kv-grad-brand)", color: "#fff", fontFamily: "var(--kv-font)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const posInputStyle: React.CSSProperties = {
  height: 34, width: 160, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", padding: "0 10px", fontSize: 12.5, fontFamily: "var(--kv-font)", color: "var(--kv-text)",
};
const selectStyle: React.CSSProperties = {
  height: 36, minWidth: 220, borderRadius: "var(--kv-r-md-sm)", border: "1.5px solid var(--kv-border)",
  background: "var(--kv-card-soft)", padding: "0 10px", fontSize: 13, fontFamily: "var(--kv-font)", color: "var(--kv-text)",
};
