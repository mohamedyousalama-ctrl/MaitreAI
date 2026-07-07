"use client";

// ============================================================================
// console_v2 Live Shift — Order Details popup (#ovDetails, v35). Opens on an order
// row; shows the order's three truth axes (status / POS handoff / payment — never
// one badge), the itemized lines, the engine-computed money (DISPLAYED, never
// derived here), and the fulfillment/zone/address facts. Composed from the dark
// kit MiniModal + SectionHeader. All money comes straight off the order row.
// ============================================================================

import { Receipt, MessageCircle } from "lucide-react";
import { MiniModal, SectionHeader } from "@/components/console-v2/kit";
import { StateChip } from "@/components/console-v2";
import { deriveOrderDisplay, derivePosDisplay, derivePaymentDisplay } from "@/lib/console-v2/display-state";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num, Phone } from "@/components/kivo";
import type { LocalOrder, OrderStatusKey, PosStatus } from "@/lib/types";

const POS_ELIGIBLE: OrderStatusKey[] = ["paid", "preparing", "ready", "out_for_delivery", "delivered"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12, padding: "5px 0" }}>
      <span style={{ color: "var(--faint)", fontWeight: 700, minWidth: 92 }}>{label}</span>
      <span style={{ color: "var(--txt)", fontWeight: 600, flex: 1, textAlign: "start" }}>{children}</span>
    </div>
  );
}

export function OrderDetailsModal({ order, onClose, onViewConversation }: { order: LocalOrder | null; onClose: () => void; onViewConversation?: () => void }) {
  const t = useT();
  if (!order) return null;
  const pos: PosStatus = order.posStatus ?? "not_entered";
  const money = (n: number) => (
    <span style={{ fontFamily: "var(--kvx-font-ui)", fontWeight: 800 }}>
      <Num>{n.toLocaleString("en-US")}</Num> <span style={{ fontSize: 10, color: "var(--dim)" }}>{order.currency}</span>
    </span>
  );

  return (
    <MiniModal open={!!order} onClose={onClose}>
      <div style={{ padding: "16px 18px" }}>
        <SectionHeader
          tier="blue"
          icon={<Receipt size={15} />}
          title={t("shift.od.title")}
          sub={`#${order.orderNumber}`}
          right={
            <button onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
              {t("shift.od.close")}
            </button>
          }
        />

        {/* Identity + the three truth axes (never one badge) */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--txt)" }}><Bdi>{order.customerName}</Bdi></span>
          {order.isTest && <span style={{ fontSize: 9, fontWeight: 800, color: "#c4b1ff", background: "rgba(168,120,240,.16)", borderRadius: 6, padding: "3px 7px" }}>TEST</span>}
          <span style={{ flex: 1 }} />
          <StateChip display={deriveOrderDisplay(order.orderStatus)} />
          {POS_ELIGIBLE.includes(order.orderStatus) && <StateChip display={derivePosDisplay(pos)} dot={false} />}
          <StateChip display={derivePaymentDisplay(order.paymentStatus)} dot={false} />
        </div>

        {/* Items */}
        <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".08em", color: "var(--faint)", textTransform: "uppercase", margin: "2px 0 6px" }}>{t("shift.od.items")}</div>
          {order.items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, padding: "4px 0", borderTop: "1px solid var(--stroke)" }}>
              <span style={{ color: "var(--gold)", fontWeight: 800, fontFamily: "var(--kvx-font-ui)" }}><Num>{it.quantity}</Num>×</span>
              <span style={{ flex: 1, color: "var(--txt)", fontWeight: 600 }}>
                <Bdi>{it.name}</Bdi>
                {it.modifiers?.length > 0 && <span style={{ display: "block", fontSize: 10, color: "var(--dim)" }}><Bdi>{it.modifiers.join("، ")}</Bdi></span>}
              </span>
              <span style={{ color: "var(--dim)", fontFamily: "var(--kvx-font-ui)", fontWeight: 700 }}><Num>{it.total.toLocaleString("en-US")}</Num></span>
            </div>
          ))}
        </div>

        {/* Money — displayed straight off the row, never recomputed */}
        <div style={{ marginBottom: 12 }}>
          <Row label={t("shift.od.subtotal")}>{money(order.subtotal)}</Row>
          {order.deliveryFee > 0 && <Row label={t("shift.od.delivery")}>{money(order.deliveryFee)}</Row>}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, padding: "7px 0 2px", borderTop: "1px solid var(--stroke)", marginTop: 4 }}>
            <span style={{ color: "var(--txt)", fontWeight: 800, minWidth: 92 }}>{t("shift.od.total")}</span>
            <span style={{ flex: 1, textAlign: "start", color: "var(--txt)" }}>{money(order.total)}</span>
          </div>
        </div>

        {/* Facts */}
        <Row label={t("shift.od.customer")}><Phone>{order.customerPhone}</Phone></Row>
        <Row label={t("shift.od.fulfillment")}>{order.fulfillmentType === "pickup" ? t("shift.od.pickup") : t("shift.od.deliveryType")}</Row>
        {order.deliveryAddress && <Row label={t("shift.od.address")}><Bdi>{order.deliveryAddress}</Bdi></Row>}

        {/* Order → its WhatsApp thread (#ovWa). Only when a conversation is linked. */}
        {order.conversationId && onViewConversation && (
          <button
            onClick={onViewConversation}
            style={{ marginTop: 14, width: "100%", height: 40, borderRadius: 11, border: "1px solid rgba(75,139,255,.34)", background: "rgba(75,139,255,.12)", color: "#a9c6ff", fontFamily: "var(--kvx-font-ar)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <MessageCircle size={15} /> {t("shift.wa.view")}
          </button>
        )}
      </div>
    </MiniModal>
  );
}
