// ============================================================================
// MaitreAI — Never-stuck spine, Step 2: stuck detection + operator notify
//
// A conversation is STUCK when it has fallen into a state where neither the
// AI nor any human has a clear path to respond — the customer is waiting with
// no movement. Three conditions, each with a configurable threshold:
//
//   A. SYSTEM_HOLD timeout  — safety/allergy hold with no operator activity
//      beyond the hold threshold. The operator must act; if they haven't the
//      customer is stuck with no channel.
//   B. Payment-review timeout — an order is "awaiting payment" (payment_status
//      = 'unpaid', order_status = 'confirmed') and conversations.updated_at
//      hasn't moved past the payment threshold. The payment window has expired.
//   C. Human-no-response    — HUMAN_ACTIVE or HUMAN_IDLE and conversations.
//      updated_at hasn't moved past the human-response threshold. Customer is
//      waiting for staff; nobody has replied.
//
// Detection is PURE (no DB) and TESTABLE. The DB helper wraps it, dedups the
// alert, and fires the existing operator-visible timeline channel so no new
// notification plumbing is needed.
//
// Thresholds live in STUCK_THRESHOLDS — one place to tune for ops feedback.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Thresholds — tune here; no code changes needed elsewhere.
// ---------------------------------------------------------------------------
export interface StuckThresholds {
  /** Minutes a SYSTEM_HOLD can sit without operator activity before stuck. */
  systemHoldMinutes: number;
  /** Minutes an order stays payment-pending before stuck. */
  paymentReviewMinutes: number;
  /** Minutes HUMAN_ACTIVE or HUMAN_IDLE can go without a staff reply before stuck. */
  humanNoResponseMinutes: number;
  /** Dedup window: don't fire a second alert within this many minutes. */
  alertDedupeMinutes: number;
}

export const STUCK_THRESHOLDS: Readonly<StuckThresholds> = {
  systemHoldMinutes: 30,
  paymentReviewMinutes: 30,
  humanNoResponseMinutes: 10,
  alertDedupeMinutes: 30,
};

// ---------------------------------------------------------------------------
// Pure detection — no DB calls, fully testable.
// ---------------------------------------------------------------------------
export type StuckReason =
  | "system_hold_timeout"   // Condition A
  | "payment_review_timeout" // Condition B
  | "human_no_response";    // Condition C

export interface StuckConversationInput {
  ownershipState: string | null;
  /** conversations.updated_at — the SLA/wait clock. */
  updatedAt: string | null;
  /** orders.payment_status of the most-recent order for this conversation, if any. */
  latestOrderPaymentStatus: string | null;
  /** orders.order_status of the most-recent order, if any. */
  latestOrderStatus: string | null;
  /** orders.updated_at of the most-recent order, if any. */
  latestOrderUpdatedAt: string | null;
}

export interface StuckResult {
  stuck: boolean;
  reason: StuckReason | null;
}

function minutesAgo(isoTs: string | null | undefined, now: number): number {
  if (!isoTs) return 0;
  const t = new Date(isoTs).getTime();
  if (!Number.isFinite(t)) return 0;
  return (now - t) / 60_000;
}

/**
 * Pure function: given a conversation snapshot, return whether it's stuck
 * and which condition fired first.
 *
 * Condition A is checked before C so a SYSTEM_HOLD is always labelled
 * correctly (ownership_state is SYSTEM_HOLD, not HUMAN_*).
 */
export function detectStuck(
  conv: StuckConversationInput,
  thresholds: StuckThresholds = STUCK_THRESHOLDS,
  now: number = Date.now()
): StuckResult {
  const idle = (ts: string | null) => minutesAgo(ts, now);

  // A: SYSTEM_HOLD timeout
  if (conv.ownershipState === "SYSTEM_HOLD") {
    if (idle(conv.updatedAt) >= thresholds.systemHoldMinutes) {
      return { stuck: true, reason: "system_hold_timeout" };
    }
  }

  // B: Payment-review timeout — order confirmed + unpaid + stale
  if (
    conv.latestOrderStatus === "confirmed" &&
    conv.latestOrderPaymentStatus === "unpaid" &&
    idle(conv.latestOrderUpdatedAt) >= thresholds.paymentReviewMinutes
  ) {
    return { stuck: true, reason: "payment_review_timeout" };
  }

  // C: Human-no-response (covers both HUMAN_ACTIVE and HUMAN_IDLE)
  if (
    (conv.ownershipState === "HUMAN_ACTIVE" || conv.ownershipState === "HUMAN_IDLE") &&
    idle(conv.updatedAt) >= thresholds.humanNoResponseMinutes
  ) {
    return { stuck: true, reason: "human_no_response" };
  }

  return { stuck: false, reason: null };
}

// ---------------------------------------------------------------------------
// Arabic alert text per reason (operator-facing timeline)
// ---------------------------------------------------------------------------
const ALERT_TEXT: Record<StuckReason, string> = {
  system_hold_timeout:
    "🔒⏰ محادثة السلامة لسه محتجزة بدون متابعة — برجاء مراجعة الموظف المعني وإغلاق الملف أو إعادة المحادثة.",
  payment_review_timeout:
    "💳⏰ الطلب منتظر تأكيد الدفع من فترة طويلة — برجاء متابعة حالة الدفع مع العميل.",
  human_no_response:
    "⏰ العميل لسه مستني ردك — المحادثة متوقفة ومحتاجة متابعة من الفريق.",
};

// ---------------------------------------------------------------------------
// DB helper: detect, dedup, notify, record stuck_reason on the conversation.
// ---------------------------------------------------------------------------
export interface CheckAndNotifyArgs {
  admin: SupabaseClient;
  restaurantId: string;
  conversationId: string;
  thresholds?: StuckThresholds;
  /** Optional: if caller already has the conversation row, pass it here. */
  convSnapshot?: StuckConversationInput;
}

export interface CheckAndNotifyResult extends StuckResult {
  alerted: boolean;
}

/**
 * Detect if a conversation is stuck; if so, fire one deduped operator alert
 * and persist `stuck_reason` on the conversation row. Reuses the same
 * noteToTimeline channel as realertOperator (handoff_idle_alert), keyed on
 * kind:"stuck_alert". Never inserts more than one alert per alertDedupeMinutes.
 */
export async function checkAndNotifyStuck(args: CheckAndNotifyArgs): Promise<CheckAndNotifyResult> {
  const t = args.thresholds ?? STUCK_THRESHOLDS;

  // 1. Snapshot — fetch only if caller didn't provide one.
  let snap = args.convSnapshot;
  if (!snap) {
    const { data: conv } = await args.admin
      .from("conversations")
      .select("ownership_state, updated_at")
      .eq("id", args.conversationId)
      .maybeSingle();

    const { data: order } = await args.admin
      .from("orders")
      .select("payment_status, order_status, updated_at")
      .eq("conversation_id", args.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    snap = {
      ownershipState: (conv?.ownership_state as string | null) ?? null,
      updatedAt: (conv?.updated_at as string | null) ?? null,
      latestOrderPaymentStatus: (order?.payment_status as string | null) ?? null,
      latestOrderStatus: (order?.order_status as string | null) ?? null,
      latestOrderUpdatedAt: (order?.updated_at as string | null) ?? null,
    };
  }

  // 2. Pure detection.
  const result = detectStuck(snap, t);
  if (!result.stuck || !result.reason) return { ...result, alerted: false };

  // 3. Dedup: is there already a stuck_alert in the last alertDedupeMinutes?
  const since = new Date(Date.now() - t.alertDedupeMinutes * 60_000).toISOString();
  const { data: recent } = await args.admin
    .from("messages")
    .select("id")
    .eq("conversation_id", args.conversationId)
    .eq("sender", "system")
    .gte("created_at", since)
    .contains("meta", { kind: "stuck_alert" })
    .limit(1);
  if (recent && recent.length > 0) return { ...result, alerted: false };

  // 4. Persist stuck_reason on the conversation so the escalations console can
  //    surface it without re-running detection.
  await args.admin
    .from("conversations")
    .update({ stuck_reason: result.reason })
    .eq("id", args.conversationId);

  // 5. Fire operator alert on the existing timeline channel.
  await args.admin.from("messages").insert({
    restaurant_id: args.restaurantId,
    conversation_id: args.conversationId,
    direction: "outbound",
    sender: "system",
    text: ALERT_TEXT[result.reason],
    status: "sent",
    meta: { kind: "stuck_alert", stuck_reason: result.reason },
  });

  return { ...result, alerted: true };
}
