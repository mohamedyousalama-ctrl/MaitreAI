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
import { UtensilsCrossed, Store, Printer, Map as MapIcon } from "lucide-react";
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
import { HeaderRow, PageGrid, StatTile, SectionHeader, MiniModal, AuroraDrawer, TruthChip } from "@/components/console-v2/kit";
import { LiveMaps, type HeatPoint } from "@/components/console-v2/shift/LiveMaps";
import { OrderDetailsModal } from "@/components/console-v2/shift/OrderDetailsModal";
import { WaThreadDrawer } from "@/components/console-v2/shift/WaThreadDrawer";
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
  // Order → WhatsApp thread drawer (#ovWa) — the order's conversation, opened from details.
  const [waOrder, setWaOrder] = useState<LocalOrder | null>(null);
  // Pause/resume confirm overlay (#ovPause) — a kill switch confirms before acting.
  const [pauseConfirm, setPauseConfirm] = useState(false);
  // Drill/evidence drawer (#ovDrill/#ovEv/#ovLost) — the outcomes-blocked cluster.
  // Rendered as the DESIGNED aurora drawer in its honest GATHERING state (never a
  // flat placeholder); lights up when the outcomes ledger (WO-1) lands.
  const [drillOpen, setDrillOpen] = useState(false);

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

  // Paid-today — PASSIVE, "today" only (the store loads full history), non-test,
  // excluding cancelled. Order truth (a count, never derived money).
  const mix = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const real = orders.filter((o) => !o.isTest && o.orderStatus !== "cancelled" && o.createdAt >= startOfToday);
    const paid = real.filter((o) => o.paymentStatus === "paid").length;
    return { paid };
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

  const karimOn = opsLoaded && assistantOn;

  // The single most-urgent handoff (longest-waiting) — the ONE solid primary action
  // in the alarm context; every other row action renders as a restrained ghost (FIX C).
  const mostUrgentHandoffId = useMemo(
    () => awaitingHandoff.reduce<LocalOrder | null>((a, b) => (a && a.createdAt <= b.createdAt ? a : b), null)?.id ?? null,
    [awaitingHandoff]
  );

  return (
    <>
      <HeaderRow
        title={t("shift.title")}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Shift-health chips (FIX F): live · #awaiting-POS · #active · paid-today. */}
            <HealthChip dot="var(--teal)" label={t("shift.live")} />
            <HealthChip dot="var(--coral)" value={awaitingHandoff.length} label={t("shift.chip.waiting")} />
            <HealthChip dot="var(--blue)" value={active.length} label={t("shift.chip.active")} />
            <HealthChip dot="var(--gold)" value={mix.paid} label={t("shift.chip.paid")} title={t("shift.paymentMix")} />
            {isManager && (
              <PauseControl
                on={karimOn}
                loading={!opsLoaded}
                busy={pauseBusy}
                onToggle={() => setPauseConfirm(true)}
                activeLabel={t("shift.karimActive")}
                pausedLabel={t("shift.karimPaused")}
                loadingLabel={t("shift.karimLoading")}
                ariaLabel={t("shift.pause")}
              />
            )}
          </div>
        }
      />
      {pauseError && (
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 14 }}>{t("shift.pauseError")}</div>
      )}

      <PageGrid
        context={
          <>
            <SectionHeader tier="blue" icon={<Store size={15} />} title={t("shift.now")} />
            <Drillable onOpen={() => setDrillOpen(true)}>
              <StatTile variant="accent" tier="coral" label={t("shift.ctx.handoff")} countUp={awaitingHandoff.length} value={awaitingHandoff.length} fact={t("shift.ctx.handoffFact")} />
            </Drillable>
            <Drillable onOpen={() => setDrillOpen(true)}>
              <StatTile variant="accent" tier="blue" label={t("shift.ctx.active")} countUp={active.length} value={active.length} fact={t("shift.ctx.activeFact")} />
            </Drillable>
            <Drillable onOpen={() => setDrillOpen(true)}>
              <StatTile variant="accent" tier="gold" label={t("shift.ctx.paid")} countUp={mix.paid} value={mix.paid} fact={t("shift.ctx.paidFact")} />
            </Drillable>
            {/* Karim status — paused is AMBER (operational caution), not green (success);
                red stays reserved for safety. Paused surfaces a reason + a resume CTA. */}
            <KarimCard on={karimOn} loading={!opsLoaded} isManager={isManager} onResume={() => setPauseConfirm(true)}
              statusLabel={karimOn ? t("shift.karimActive") : t("shift.karimPaused")}
              loadingLabel={t("shift.karimLoading")}
              caption={t("shift.ctx.karim")}
              reason={karimOn ? t("shift.ctx.karimFact") : t("shift.ctx.karimPausedFact")}
              resumeLabel={t("shift.karimResume")} />
            <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.7, padding: "4px 2px", borderTop: "1px dashed var(--stroke)", marginTop: 4 }}>{t("shift.doctrine")}</div>
          </>
        }
        hero={
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* AWAITING HANDOFF — the only alarm (fast-pulse ACT-NOW dot). */}
      <section>
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
                <button onClick={() => stampPos(o)} disabled={posBusy.has(o.id)} style={o.id === mostUrgentHandoffId ? primaryBtn : ghostBtn}>
                  {t("shift.stampPos")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active orders board — every axis via displayState()/derive*(). */}
      <section>
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

      {/* Maps grid (v35 flagship) — composed INSIDE the hero flow as mapsGrid 1.45fr 1fr
          (Order Heat large + Losing Orders/Ad Sources stacked), NOT a full-width band
          below the grid. Order Heat is LIVE from real 0043 coords; loss/ads render the
          designed GATHERING map-cards until their engines feed them. */}
      <section>
        <SectionHead icon={<MapIcon size={16} />} title={t("shift.mapsSection")} />
        <LiveMaps heatPoints={heatPoints} ordersToday={active.length} />
      </section>
          </div>
        }
      />

      {/* Order details popup (#ovDetails) — opens on an order row. */}
      <OrderDetailsModal
        order={selected}
        onClose={() => setSelected(null)}
        onViewConversation={() => { const o = selected; setSelected(null); setWaOrder(o); }}
      />

      {/* Order → WhatsApp thread drawer (#ovWa) — the order's conversation thread. */}
      <WaThreadDrawer order={waOrder} onClose={() => setWaOrder(null)} />

      {/* Pause/resume confirm overlay (#ovPause) — the kill switch confirms first. */}
      <MiniModal open={pauseConfirm} onClose={() => setPauseConfirm(false)}>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", marginBottom: 6 }}>
            {karimOn ? t("shift.pauseConfirm.title") : t("shift.resumeConfirm.title")}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6, marginBottom: 16 }}>
            {karimOn ? t("shift.pauseConfirm.body") : t("shift.resumeConfirm.body")}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setPauseConfirm(false)} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "1px solid var(--stroke2)", background: "rgba(255,255,255,.04)", color: "var(--txt)", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {t("shift.cancel")}
            </button>
            <button
              onClick={async () => { setPauseConfirm(false); await togglePause(); }}
              disabled={pauseBusy}
              /* pause is an operational kill-switch, NOT a safety event → amber, never red */
              style={{ height: 38, padding: "0 18px", borderRadius: 10, border: 0, background: karimOn ? "var(--amber)" : "var(--teal)", color: "#062018", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
            >
              {karimOn ? t("shift.pauseConfirm.go") : t("shift.resumeConfirm.go")}
            </button>
          </div>
        </div>
      </MiniModal>

      {/* Drill / evidence drawer (#ovDrill/#ovEv/#ovLost) — the designed aurora drawer
          in its honest GATHERING state (the outcomes ledger feeds it). */}
      <AuroraDrawer open={drillOpen} onClose={() => setDrillOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", margin: 0, flex: 1 }}>{t("shift.drill.title")}</h3>
            <button onClick={() => setDrillOpen(false)} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("shift.od.close")}</button>
          </div>
          <div style={{ display: "grid", placeItems: "center", gap: 12, padding: "48px 12px", textAlign: "center" }}>
            <TruthChip state="gather" />
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.7, maxWidth: 300 }}>{t("shift.drill.gather")}</div>
          </div>
        </div>
      </AuroraDrawer>
    </>
  );
}

/** Wraps a StatTile so clicking it opens the drill/evidence drawer. */
function Drillable({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }} style={{ cursor: "pointer" }}>
      {children}
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
        {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--teal)" }}>{msg}</span>}
        {err && <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--amber)" }}>{t("shift.86error")}</span>}
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
        borderRadius: 10, border: "1px solid var(--stroke)", background: "var(--inset2)",
        color: "var(--dim)", fontSize: 12, fontWeight: 700, textDecoration: "none", flex: "none",
      }}
    >
      <Printer size={14} /> {t("shift.printTicket")}
    </a>
  );
}

function OrderIdentity({ order, test, onClick }: { order: LocalOrder; test: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ minWidth: 0, border: 0, background: "transparent", padding: 0, cursor: onClick ? "pointer" : "default", textAlign: "start", fontFamily: "var(--kvx-font-ar)" }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)", display: "flex", alignItems: "center", gap: 7 }}>
        <span>#<Num>{order.orderNumber}</Num></span>
        <Bdi>{order.customerName}</Bdi>
        {order.isTest && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "#c4b1ff", background: "rgba(168,120,240,.16)", borderRadius: 6, padding: "3px 7px" }}>{test}</span>
        )}
      </div>
    </button>
  );
}

function Money({ total, currency }: { total: number; currency: string }) {
  // DISPLAY only — the amount comes straight from the order row, never recomputed.
  return (
    <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--txt)", whiteSpace: "nowrap", fontFamily: "var(--kvx-font-ui)" }}>
      <Num>{total.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{currency}</span>
    </span>
  );
}

// Header shift-health chip (FIX F): a compact dot + value + label pill.
function HealthChip({ dot, value, label, title }: { dot: string; value?: React.ReactNode; label: string; title?: string }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "var(--inset)", border: "1px solid var(--stroke)", fontSize: 11, fontWeight: 700, color: "var(--dim)", whiteSpace: "nowrap" }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}` }} />
      {value != null && <b style={{ color: "var(--txt)", fontFamily: "var(--kvx-font-ui)", fontWeight: 800 }}>{value}</b>}
      <span>{label}</span>
    </span>
  );
}

function PauseControl({ on, loading, busy, onToggle, activeLabel, pausedLabel, loadingLabel, ariaLabel }: {
  on: boolean; loading: boolean; busy: boolean; onToggle: () => void;
  activeLabel: string; pausedLabel: string; loadingLabel: string; ariaLabel: string;
}) {
  // Paused is NOT success → AMBER (operational caution), never green. Active = green.
  // Red stays reserved for safety and never appears here.
  const amber = "var(--amber)", teal = "var(--teal)";
  const accent = loading ? "var(--faint)" : on ? teal : amber;
  const tint = loading ? "rgba(154,167,184,.12)" : on ? "rgba(46,204,154,.12)" : "rgba(232,180,90,.14)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "5px 11px", borderRadius: 999, background: tint, border: `1px solid ${loading ? "var(--stroke)" : on ? "rgba(46,204,154,.34)" : "rgba(232,180,90,.4)"}` }}>
      <span className={on ? "kv-pulse" : undefined} aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: loading ? undefined : `0 0 6px ${accent}` }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--txt)" }}>
        {loading ? loadingLabel : on ? activeLabel : pausedLabel}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={ariaLabel}
        disabled={loading || busy} onClick={onToggle}
        style={{ width: 38, height: 22, borderRadius: 99, border: 0, cursor: loading || busy ? "default" : "pointer", opacity: loading ? 0.5 : 1, padding: 0, position: "relative", background: loading ? "rgba(255,255,255,.14)" : on ? teal : amber }}
      >
        <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.35)", transition: "inset-inline-start .15s" }} />
      </button>
    </div>
  );
}

function SectionHead({ icon, title, count }: { icon?: React.ReactNode; title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
      {icon && <span style={{ color: "var(--dim)", display: "inline-flex" }}>{icon}</span>}
      <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--dim)", margin: 0 }}>{title}</h2>
      {typeof count === "number" && (
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--faint)" }}>(<Num>{count}</Num>)</span>
      )}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--faint)", padding: "14px 4px" }}>{children}</div>;
}

// Karim status tile — accent card. Active = green (success); paused = AMBER
// (operational caution, never red = safety), with the reason + a resume CTA. Until
// the ops store confirms, it renders a NEUTRAL loading state — it never asserts
// "paused" for a state it hasn't actually read.
function KarimCard({ on, loading, isManager, onResume, statusLabel, loadingLabel, caption, reason, resumeLabel }: {
  on: boolean; loading: boolean; isManager: boolean; onResume: () => void;
  statusLabel: string; loadingLabel: string; caption: string; reason: string; resumeLabel: string;
}) {
  const color = loading ? "" : on ? "green" : "amber";
  const txtColor = loading ? "var(--dim)" : on ? "var(--teal)" : "var(--amber)";
  return (
    <div className={`kvx-stile accent${color ? " " + color : ""}`}>
      <div className="kvx-slbl">{caption}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: txtColor, marginTop: 4, fontFamily: "var(--kvx-font-ar)" }}>{loading ? loadingLabel : statusLabel}</div>
      {!loading && <div className="kvx-sfact">{reason}</div>}
      {!loading && !on && isManager && (
        <button onClick={onResume} style={{ marginTop: 10, height: 30, width: "100%", borderRadius: 9, border: 0, background: "var(--amber)", color: "#3a2600", fontFamily: "var(--kvx-font-ar)", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>
          {resumeLabel}
        </button>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "var(--inset)", border: "1px solid var(--stroke)",
  borderRadius: 14, padding: "11px 14px",
};
// One primary per context — solid green. Everything else uses ghostBtn.
const primaryBtn: React.CSSProperties = {
  height: 34, padding: "0 15px", borderRadius: 10, border: 0,
  background: "linear-gradient(135deg,#3fd39b,#0E9F6E)", color: "#062018", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
// Secondary/outlined — the restrained default for non-primary row actions.
const ghostBtn: React.CSSProperties = {
  height: 34, padding: "0 15px", borderRadius: 10, border: "1px solid rgba(46,204,154,.42)",
  background: "rgba(46,204,154,.08)", color: "#7fe6c0", fontFamily: "var(--kvx-font-ar)",
  fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
};
const posInputStyle: React.CSSProperties = {
  height: 34, width: 148, borderRadius: 10, border: "1px solid var(--stroke)",
  background: "var(--inset2)", padding: "0 10px", fontSize: 12.5, fontFamily: "var(--kvx-font-ui)", color: "var(--txt)", outline: "none",
};
const selectStyle: React.CSSProperties = {
  height: 36, minWidth: 220, borderRadius: 10, border: "1px solid var(--stroke)",
  background: "var(--inset2)", padding: "0 10px", fontSize: 13, fontFamily: "var(--kvx-font-ar)", color: "var(--txt)", outline: "none",
};
