// console_v2 — foundation styleguide (the living law-verification surface). Renders
// every display state the mapping table produces plus the truth/attribution chips,
// so the foundation is provable at a glance and future page PRs have a reference.
// A DESIGN reference with no tenant data, so it sits OUTSIDE the authed (app) gate:
// reachable whenever CONSOLE_V2 is on (Layer-1), and it renders its own <AppFrame>
// (rail) with a static workspace label rather than resolving a real tenant.

import {
  deriveOrderDisplay,
  derivePosDisplay,
  derivePaymentDisplay,
  deriveConversationDisplay,
  type ConversationOwnershipState,
} from "@/lib/console-v2/display-state";
import type { OrderStatusKey, PaymentStatusKey, PosStatus } from "@/lib/types";
import { AppFrame, StateChip, TruthChip, AttributionChip, type TruthState } from "@/components/console-v2";
import type { AttributableSender } from "@/lib/console-v2/display-state";

const ORDER_STATUSES: OrderStatusKey[] = [
  "draft", "pending_confirmation", "pending_payment", "paid",
  "preparing", "ready", "out_for_delivery", "delivered", "cancelled",
];
const POS_STATUSES: PosStatus[] = ["not_entered", "entered", "sent_to_kitchen"];
const PAY_STATUSES: PaymentStatusKey[] = ["unpaid", "payment_link_sent", "paid", "failed", "refunded"];
const CONV_STATES: ConversationOwnershipState[] = [
  "AI_ACTIVE", "HUMAN_ACTIVE", "HUMAN_IDLE", "SYSTEM_HOLD", "CLOSED",
];
const TRUTH_STATES: TruthState[] = ["live", "gathering", "degraded", "soon"];
const SENDERS: AttributableSender[] = ["ai", "human", "system"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--kv-muted)", margin: "0 0 12px" }}>{title}</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{children}</div>
    </section>
  );
}

export default function FoundationPage() {
  return (
    <AppFrame tenantName="Kivo · styleguide" role="manager">
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--kv-text)", margin: "0 0 4px" }}>
        أساس الكونسول ‏· console_v2 foundation
      </h1>
      <p style={{ fontSize: 13, color: "var(--kv-muted)", margin: "0 0 24px", lineHeight: 1.7 }}>
        كل حالة تُشتق من جدول الربط الواحد (display-state) — لا مكوّن يربط الحالات بنفسه.
        الأحمر للسلامة فقط.
      </p>

      <Section title="الطلبات · orders (order_status)">
        {ORDER_STATUSES.map((s) => (
          <StateChip key={s} display={deriveOrderDisplay(s)} />
        ))}
      </Section>

      <Section title="الإدخال في النظام · POS hand-off (WB1)">
        {POS_STATUSES.map((s) => (
          <StateChip key={s} display={derivePosDisplay(s)} />
        ))}
      </Section>

      <Section title="الدفع · payments (payment_status)">
        {PAY_STATUSES.map((s) => (
          <StateChip key={s} display={derivePaymentDisplay(s)} />
        ))}
      </Section>

      <Section title="المحادثات · conversations (ownership spine — red = safety only)">
        {CONV_STATES.map((s) => (
          <StateChip key={s} display={deriveConversationDisplay({ ownershipState: s })} />
        ))}
        <StateChip display={deriveConversationDisplay({ ownershipState: "AI_ACTIVE", isSafetyHold: true })} />
      </Section>

      <Section title="النسبة · attribution (R6)">
        {SENDERS.map((s) => (
          <AttributionChip key={s} sender={s} />
        ))}
      </Section>

      <Section title="حالة الحقيقة · truth-state chips">
        {TRUTH_STATES.map((s) => (
          <TruthChip key={s} state={s} />
        ))}
      </Section>
    </div>
    </AppFrame>
  );
}
