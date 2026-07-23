"use client";

// ============================================================================
// KIVO-SHIFT — Order detail (WO-SHIFT-1). The product boundary changed: Kivo does
// intake + acceptance and nothing after. So this detail speaks the TWO states only
// (يحتاج قبول / مقبول واتسلّم للمطعم) — the old three-axis kitchen/POS/fulfillment
// chips are gone. It shows the itemized lines, the money DISPLAYED straight off the
// row (never recomputed), and the fulfillment/address facts, plus a link into the
// order's WhatsApp thread. Reused as a modal on phone and inline on the tablet split.
// ============================================================================

import { Receipt, MessageCircle } from "lucide-react";
import { MiniModal, SectionHeader } from "@/components/console-v2/kit";
import { useT } from "@/lib/i18n/lang";
import { Bdi, Num, Phone } from "@/components/kivo";
import { AcceptanceChip, SafetyMark } from "./shift-ui";
import { shiftOrderState } from "./shift-model";
import type { LocalOrder } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, padding: "5px 0" }}>
      <span style={{ color: "var(--faint)", fontWeight: 700, minWidth: 92 }}>{label}</span>
      <span style={{ color: "var(--txt)", fontWeight: 600, flex: 1, textAlign: "start" }}>{children}</span>
    </div>
  );
}

/** Shared body — rendered inside a modal (phone) or inline (tablet split). */
export function OrderDetailBody({ order, onViewConversation, hasSafety }: { order: LocalOrder; onViewConversation?: () => void; hasSafety?: boolean }) {
  const t = useT();
  const state = shiftOrderState({
    id: order.id,
    orderStatus: order.orderStatus,
    posStatus: order.posStatus ?? "not_entered",
    isTest: order.isTest,
    createdAt: order.createdAt,
  });
  const money = (n: number) => (
    <span style={{ fontFamily: "var(--kvx-font-ui)", fontWeight: 800 }}>
      <Num>{n.toLocaleString("en-US")}</Num> <span style={{ fontSize: 11, color: "var(--dim)" }}>{order.currency}</span>
    </span>
  );

  return (
    <>
      {/* Identity + the single acceptance state (never the old kitchen/POS badges) */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: "var(--txt)" }}><Bdi>{order.customerName}</Bdi></span>
        {order.isTest && <span style={{ fontSize: 12, fontWeight: 800, color: "#c4b1ff", background: "rgba(168,120,240,.16)", borderRadius: 6, padding: "3px 8px" }}>{t("shift.test")}</span>}
        <span style={{ flex: 1 }} />
        {hasSafety && <SafetyMark />}
        {state && <AcceptanceChip state={state} />}
      </div>

      {/* Items */}
      <div style={{ background: "var(--inset)", border: "1px solid var(--stroke)", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--faint)", margin: "2px 0 6px" }}>{t("shift.od.items")}</div>
        {order.items.map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--stroke)" }}>
            <span style={{ color: "var(--gold)", fontWeight: 800, fontFamily: "var(--kvx-font-ui)" }}><Num>{it.quantity}</Num>×</span>
            <span style={{ flex: 1, color: "var(--txt)", fontWeight: 600 }}>
              <Bdi>{it.name}</Bdi>
              {it.modifiers?.length > 0 && <span style={{ display: "block", fontSize: 12, color: "var(--dim)" }}><Bdi>{it.modifiers.join("، ")}</Bdi></span>}
            </span>
            <span style={{ color: "var(--dim)", fontFamily: "var(--kvx-font-ui)", fontWeight: 700 }}><Num>{it.total.toLocaleString("en-US")}</Num></span>
          </div>
        ))}
      </div>

      {/* Money — displayed straight off the row, never recomputed */}
      <div style={{ marginBottom: 12 }}>
        <Row label={t("shift.od.subtotal")}>{money(order.subtotal)}</Row>
        {order.deliveryFee > 0 && <Row label={t("shift.od.delivery")}>{money(order.deliveryFee)}</Row>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, padding: "7px 0 2px", borderTop: "1px solid var(--stroke)", marginTop: 4 }}>
          <span style={{ color: "var(--txt)", fontWeight: 800, minWidth: 92 }}>{t("shift.od.total")}</span>
          <span style={{ flex: 1, textAlign: "start", color: "var(--txt)" }}>{money(order.total)}</span>
        </div>
      </div>

      {/* Facts */}
      <Row label={t("shift.od.customer")}><Phone>{order.customerPhone}</Phone></Row>
      <Row label={t("shift.od.fulfillment")}>{order.fulfillmentType === "pickup" ? t("shift.od.pickup") : t("shift.od.deliveryType")}</Row>
      {order.deliveryAddress && <Row label={t("shift.od.address")}><Bdi>{order.deliveryAddress}</Bdi></Row>}

      {order.conversationId && onViewConversation && (
        <button
          onClick={onViewConversation}
          style={{ marginTop: 14, width: "100%", height: 46, borderRadius: 12, border: "1px solid rgba(75,139,255,.34)", background: "rgba(75,139,255,.12)", color: "#a9c6ff", fontFamily: "var(--kvx-font-ar)", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <MessageCircle size={16} /> {t("shift.wa.view")}
        </button>
      )}
    </>
  );
}

export function OrderDetailsModal({ order, onClose, onViewConversation, hasSafety }: { order: LocalOrder | null; onClose: () => void; onViewConversation?: () => void; hasSafety?: boolean }) {
  const t = useT();
  if (!order) return null;
  return (
    <MiniModal open={!!order} onClose={onClose}>
      <div style={{ padding: "16px 18px" }}>
        <SectionHeader
          tier="blue"
          icon={<Receipt size={15} />}
          title={t("shift.od.title")}
          sub={`#${order.orderNumber}`}
          right={
            <button onClick={onClose} style={{ border: 0, background: "transparent", color: "var(--faint)", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {t("shift.od.close")}
            </button>
          }
        />
        <OrderDetailBody order={order} onViewConversation={onViewConversation} hasSafety={hasSafety} />
      </div>
    </MiniModal>
  );
}
