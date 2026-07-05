// ============================================================================
// console_v2 — THE DISPLAY-STATE MAPPING TABLE (PR 1, the ratified first contract)
//
// This is the ONE place that maps raw database states → the design's display
// vocabulary. No console_v2 component may map a DB state itself: a page reads a
// row, calls a derive*() here, and renders the returned { state, tone, labelKey }.
// That single indirection is what keeps orders, conversations, and payments
// speaking one visual language across every page.
//
// Two laws are enforced structurally here, not by convention:
//
//   • "red = safety only" — the Tone union has NO generic error/danger tone. The
//     only tone that maps to red is `safety`, and the only states that carry it
//     are real safety holds (allergen / SYSTEM_HOLD). A cancelled order or a
//     failed payment is `neutral` / `warning`, never red.
//
//   • completeness — every derive*() switch is exhaustive over its DB union and
//     ends in an `assertNever`. Add a new DB state and the build fails until it
//     is given a display mapping HERE, so no state can silently fall through to a
//     component's private guesswork.
//
// Labels live in the i18n dictionary (labelKey: DictKey) — never inline strings —
// so the same state reads identically in فصحى and EN and never gets interpolated
// (the no-arabic-name-number-interpolation rule). This module is pure: no React,
// no i18n lookup, no DB access. It turns states into a typed display contract.
// ============================================================================

import type { DictKey } from "@/lib/i18n/dictionary";
import type {
  OrderStatusKey,
  PaymentStatusKey,
  PosStatus,
} from "@/lib/types";

/** Exhaustiveness guard: a `default: return assertNever(x)` makes an unmapped DB
 *  state a compile error, so every state is forced through this table. */
function assertNever(x: never): never {
  throw new Error(`console_v2 display-state: unmapped DB state ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// Tone — the shared visual semantics every display state resolves to. Each tone
// IS a Kivo_Color_System.md §2 Layer-1 identity color — pages map a tone to color
// via TONE_TOKENS; components never pick colors ad-hoc. Reconciliation ruling #4
// (CANON WINS): the hexes below are the canon palette EXACTLY; any hex outside it
// is a defect. Ruling #3: there is no `delivery` tone — deliveries are out of V1
// scope, so delivery-ish states render `slate`. `safety` is the ONLY red, so red
// can only ever mean a safety hold ("red = safety only").
// ---------------------------------------------------------------------------
export type Tone =
  | "slate"   // §2 Slate  — system / neutral / no-claim / done / cancelled
  | "blue"    // §2 Blue    — Karim / AI-sourced / informational / an order Karim is building
  | "emerald" // §2 Emerald — Kivo affirmative: confirmed / committed / money-in
  | "amber"   // §2 Amber   — human-sourced / waiting-on-human (handoff queue, human-held)
  | "safety"; // §2 Red     — safety hold only. The single red in the system.

/** Tone → color tokens (foreground + tinted background), the canon §2 hexes
 *  verbatim. `safety` is the only entry that resolves red (#ff6b5e). */
export const TONE_TOKENS: Record<Tone, { fg: string; bg: string }> = {
  slate: { fg: "#5b6b7a", bg: "rgba(154,167,184,.16)" }, // Slate #9aa7b8
  blue: { fg: "#3a6fd8", bg: "rgba(75,139,255,.14)" }, // Blue #4b8bff
  emerald: { fg: "#0A8A5F", bg: "rgba(14,159,110,.14)" }, // Emerald #0E9F6E
  amber: { fg: "#b9822a", bg: "rgba(232,180,90,.18)" }, // Amber #e8b45a
  safety: { fg: "#e0483a", bg: "rgba(255,107,94,.14)" }, // Red #ff6b5e
};

/** The uniform shape every derivation returns: a display token, its tone, and the
 *  dictionary key for its label. Generic over each domain's display vocabulary. */
export interface DisplayState<S extends string> {
  state: S;
  tone: Tone;
  labelKey: DictKey;
}

// ---------------------------------------------------------------------------
// Orders — the operational lifecycle the operator sees on the Live Shift board.
// Derived from orders.order_status (the authoritative lifecycle column). POS
// hand-off (WB1) and payment are SEPARATE axes with their own derivations below,
// because an order can be `confirmed` yet not-in-POS, or `preparing` yet unpaid.
// ---------------------------------------------------------------------------
export type OrderDisplayState =
  | "incoming"         // draft / pending_confirmation — just arrived, needs a look
  | "awaiting_payment" // pending_payment — link out, money not in yet
  | "confirmed"        // paid — money in, not yet cooking
  | "in_kitchen"       // preparing
  | "ready"            // ready — for pickup / handoff to driver
  | "on_the_way"       // out_for_delivery
  | "completed"        // delivered
  | "cancelled";       // cancelled — muted, NOT red

export function deriveOrderDisplay(status: OrderStatusKey): DisplayState<OrderDisplayState> {
  switch (status) {
    // Building — Karim is composing the order (blue, §6 "blue building").
    case "draft":
    case "pending_confirmation":
      return { state: "incoming", tone: "blue", labelKey: "state.order.incoming" };
    case "pending_payment":
      return { state: "awaiting_payment", tone: "blue", labelKey: "state.order.awaiting_payment" };
    // Confirmed / committed — money in, in the kitchen, ready (emerald, §6 "emerald confirmed").
    case "paid":
      return { state: "confirmed", tone: "emerald", labelKey: "state.order.confirmed" };
    case "preparing":
      return { state: "in_kitchen", tone: "emerald", labelKey: "state.order.in_kitchen" };
    case "ready":
      return { state: "ready", tone: "emerald", labelKey: "state.order.ready" };
    // Past Kivo's surface (deliveries out of V1 scope, ruling #3) → neutral slate.
    case "out_for_delivery":
      return { state: "on_the_way", tone: "slate", labelKey: "state.order.on_the_way" };
    case "delivered":
      return { state: "completed", tone: "slate", labelKey: "state.order.completed" };
    case "cancelled":
      return { state: "cancelled", tone: "slate", labelKey: "state.order.cancelled" };
    default:
      return assertNever(status);
  }
}

// ---------------------------------------------------------------------------
// POS hand-off (WB1) — Deyafa POS entry state, a SEPARATE axis from order status.
// During the Kivo cutover a confirmed order is NOT in the kitchen until staff
// re-enter it in the POS; `needs_pos` is the warning the Live Shift board raises.
// ---------------------------------------------------------------------------
export type PosDisplayState = "needs_pos" | "entered" | "sent_to_kitchen";

export function derivePosDisplay(pos: PosStatus): DisplayState<PosDisplayState> {
  switch (pos) {
    // needs_pos = AWAITING HANDOFF — the amber alarm identity (§6).
    case "not_entered":
      return { state: "needs_pos", tone: "amber", labelKey: "state.pos.needs_pos" };
    case "entered":
      return { state: "entered", tone: "blue", labelKey: "state.pos.entered" };
    case "sent_to_kitchen":
      return { state: "sent_to_kitchen", tone: "emerald", labelKey: "state.pos.sent_to_kitchen" };
    default:
      return assertNever(pos);
  }
}

// ---------------------------------------------------------------------------
// Payments — payment STATE only. The displayed money AMOUNT is never derived
// here (that law lives at the render site: amounts come straight from the DB).
// `failed` is `warning` (amber), never red — red is reserved for safety.
// ---------------------------------------------------------------------------
export type PaymentDisplayState = "unpaid" | "link_sent" | "paid" | "failed" | "refunded";

export function derivePaymentDisplay(status: PaymentStatusKey): DisplayState<PaymentDisplayState> {
  switch (status) {
    case "unpaid":
      return { state: "unpaid", tone: "slate", labelKey: "state.pay.unpaid" };
    case "payment_link_sent":
      return { state: "link_sent", tone: "blue", labelKey: "state.pay.link_sent" };
    case "paid":
      return { state: "paid", tone: "emerald", labelKey: "state.pay.paid" };
    case "failed":
      // A failed payment is a problem, not a SAFETY event — amber, never red.
      return { state: "failed", tone: "amber", labelKey: "state.pay.failed" };
    case "refunded":
      return { state: "refunded", tone: "slate", labelKey: "state.pay.refunded" };
    default:
      return assertNever(status);
  }
}

// ---------------------------------------------------------------------------
// Conversations — the ownership SPINE (conversations.ownership_state), the axis
// the Conversations page is organised around. A safety hold overrides everything:
// SYSTEM_HOLD or the isSafetyHold flag → `safety_hold`, the system's only red.
// ---------------------------------------------------------------------------
export type ConversationOwnershipState =
  | "AI_ACTIVE"
  | "HUMAN_ACTIVE"
  | "HUMAN_IDLE"
  | "SYSTEM_HOLD"
  | "CLOSED";

export type ConversationDisplayState =
  | "ai_active"    // Karim owns it, replying
  | "human_active" // a teammate has taken over
  | "human_idle"   // taken over but idle (handoff timeout window)
  | "safety_hold"  // allergen / system safety hold — RED, needs deliberate release
  | "closed";      // conversation closed

export function deriveConversationDisplay(input: {
  ownershipState: ConversationOwnershipState;
  isSafetyHold?: boolean;
}): DisplayState<ConversationDisplayState> {
  // Safety overrides the ownership axis: a held conversation reads as a hold no
  // matter who nominally owns it. This is the single source of the only red chip.
  if (input.isSafetyHold || input.ownershipState === "SYSTEM_HOLD") {
    return { state: "safety_hold", tone: "safety", labelKey: "state.conv.safety_hold" };
  }
  switch (input.ownershipState) {
    // Karim's stage is blue (§6 conversation monitor).
    case "AI_ACTIVE":
      return { state: "ai_active", tone: "blue", labelKey: "state.conv.ai_active" };
    // Human-held is amber (§6 hall pill "amber (human-held)").
    case "HUMAN_ACTIVE":
      return { state: "human_active", tone: "amber", labelKey: "state.conv.human_active" };
    case "HUMAN_IDLE":
      return { state: "human_idle", tone: "slate", labelKey: "state.conv.human_idle" };
    case "CLOSED":
      return { state: "closed", tone: "slate", labelKey: "state.conv.closed" };
    // SYSTEM_HOLD is returned by the safety branch above, so the type is narrowed
    // to exclude it here; the default stays a compile-time exhaustiveness guard.
    default:
      return assertNever(input.ownershipState);
  }
}

// ---------------------------------------------------------------------------
// Attribution (R6) — WHO authored a turn / handled a conversation. The message
// senders `agent` and `human` both attribute to a human teammate; `customer` is
// inbound (not an attribution) and returns null so callers render nothing.
// ---------------------------------------------------------------------------
export type AttributionKind = "ai" | "human" | "system";

export type AttributableSender = "customer" | "ai" | "agent" | "human" | "system";

export function deriveAttribution(
  sender: AttributableSender
): DisplayState<AttributionKind> | null {
  switch (sender) {
    case "ai":
      return { state: "ai", tone: "blue", labelKey: "attr.ai" }; // 🤖 Karim — blue
    case "agent":
    case "human":
      return { state: "human", tone: "amber", labelKey: "attr.human" }; // ✋ human — amber
    case "system":
      return { state: "system", tone: "slate", labelKey: "attr.system" };
    case "customer":
      return null; // inbound customer turn — nothing to attribute
    default:
      return assertNever(sender);
  }
}

// ---------------------------------------------------------------------------
// displayState(order, conversation) — the CANONICAL composition (Design_Handoff
// line 43: "order status, conversation ownership, POS handoff are three axes —
// never one badge. One displayState(order, conversation) function maps them.").
//
// The per-axis derive*() functions above stay the pure, individually-tested units;
// this is the single entry that maps a row's three axes AT ONCE and returns them
// as one object — three separate axis displays, never merged into a single badge.
// Payment is included as its own axis (Part 4's passive payment chip), kept
// distinct from the three lifecycle axes. Any field the row doesn't carry yields
// null for that axis, so a page renders only the axes it has.
// ---------------------------------------------------------------------------
export interface OrderAxes {
  orderStatus: OrderStatusKey;
  posStatus?: PosStatus | null;
  paymentStatus?: PaymentStatusKey | null;
}

export interface ConversationAxes {
  ownershipState: ConversationOwnershipState;
  isSafetyHold?: boolean;
}

export interface DisplayAxes {
  order: DisplayState<OrderDisplayState>;
  pos: DisplayState<PosDisplayState> | null;
  payment: DisplayState<PaymentDisplayState> | null;
  conversation: DisplayState<ConversationDisplayState> | null;
}

export function displayState(
  order: OrderAxes,
  conversation?: ConversationAxes | null
): DisplayAxes {
  return {
    order: deriveOrderDisplay(order.orderStatus),
    pos: order.posStatus != null ? derivePosDisplay(order.posStatus) : null,
    payment: order.paymentStatus != null ? derivePaymentDisplay(order.paymentStatus) : null,
    conversation: conversation ? deriveConversationDisplay(conversation) : null,
  };
}
