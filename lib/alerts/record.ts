// ============================================================================
// MaitreAI — record a critical failure so a human sees it.
//
// Writes a row to system_alerts (drives the console banner) and fires the email
// scaffold (no-op until a provider is wired — see ./email). BEST-EFFORT: every
// call is wrapped so alerting can never throw into the request path. If the
// system_alerts migration hasn't been applied yet, the insert fails silently
// and the rest of the flow is unaffected.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlertEmail } from "./email";
import { sendAlertWhatsApp } from "./whatsapp";

export type CriticalAlertType =
  | "agent_error"
  | "whatsapp_send_failed"
  | "inbound_persist_failed"
  // Q2 — launch-critical revenue/cash failures (previously console.error-only).
  | "order_persist_failed"
  | "receipt_send_failed"
  | "cod_capture_failed"
  | "operator_send_failed"
  // R3 — audited manager override: delivered without a confirmed driver after the
  // driver-check failed (COD cash attribution risk consciously accepted).
  | "delivered_without_driver_override"
  // T7 — an order was persisted without a determined payment method (the draft was
  // finalized with no set_payment_method). It's still stored (not lost) but is
  // flagged for resolution instead of silently presented as a cash (COD) order.
  | "payment_unspecified"
  // WO-1 — the outcome classifier failed after all retries for a terminal
  // conversation. No conversation_outcomes row is written (a missing row is a
  // logged gap, never an invented outcome); the operator is alerted so the gap
  // is visible and can be re-run.
  | "outcome_classify_failed"
  // WO-3c — a Moyasar webhook reported 'paid' but the charged amount did NOT match
  // the session amount. The order is NOT marked paid (held); a human must reconcile.
  | "payment_amount_mismatch"
  // WO-3c — a verified 'paid' webhook could not stamp the order (0 rows — e.g. the
  // order is missing). The session is NOT marked paid (held); a human reconciles.
  | "payment_stamp_failed"
  // WO-PAYLINK-EXPIRY — a 'paid' webhook settled a session that had already EXPIRED
  // (the customer paid a stale link). Money truth stands: we record paid + stamp the
  // order, NEVER refuse — but raise this so a human reconciles a possible double-link.
  | "paid_after_expiry"
  // WO-SAFE-1 — a payment settled on an order whose conversation is under an active
  // safety hold. Money truth stands (not blocked); SAFE-1 holds it from the kitchen;
  // a human must review before fulfilment.
  | "paid_while_safety_held"
  // WO-VOICE-2 — the primary TTS (ElevenLabs) failed and the outbound voice note fell
  // back to OpenAI onyx. The customer still got the text + a voice note (never a silent
  // drop); the alert surfaces the EL outage/quota so it can be checked.
  | "voice_tts_fallback";

export interface CriticalAlertInput {
  restaurantId: string;
  type: CriticalAlertType;
  detail: string;
  conversationId?: string | null;
  context?: Record<string, unknown>;
}

// T9 — dedupe key. Two alerts are "the same" iff they share (restaurant_id, type)
// AND the same ENTITY. The entity is derived from whichever identifying field the
// caller already provides (no schema change): an order, a message, a sender, a
// driver — else the conversation, else null (a tenant-level alert). The key name
// is prefixed so e.g. an orderId "123" never collides with a conversationId "123".
// Per type today: payment_unspecified/cod/order alerts → per ORDER (orderId);
// whatsapp_send_failed/operator_send_failed/agent_error → per CONVERSATION;
// inbound_persist_failed → per SENDER (context.from); a null entity → per TYPE.
const ENTITY_KEYS = ["orderId", "orderNumber", "messageId", "wamid", "from", "driverId"] as const;

function dedupeEntity(
  conversationId: string | null | undefined,
  context: Record<string, unknown> | null | undefined
): string | null {
  const ctx = context ?? {};
  for (const k of ENTITY_KEYS) {
    const v = ctx[k];
    if (v != null && v !== "") return `${k}:${String(v)}`;
  }
  if (conversationId) return `conv:${conversationId}`;
  return null; // tenant-level alert → dedupe on (restaurant_id, type) alone.
}

/**
 * Record a critical failure. Never throws. Inserts the alert row (banner source)
 * and triggers the email scaffold. Failures here are logged, not propagated.
 */
export async function recordCriticalAlert(
  admin: SupabaseClient | null,
  input: CriticalAlertInput
): Promise<void> {
  const at = new Date().toISOString();

  // T9 — DEDUPE: suppress a duplicate of an alert that is still ACTIVE (undismissed)
  // so each distinct issue shows once instead of spamming the banner. Active-state
  // (not a time window): once the operator dismisses/handles it, a genuine
  // recurrence re-alerts. Best-effort and FAIL-OPEN — any error in the check falls
  // through to a normal insert (better a possible duplicate than a lost alert). The
  // race (two concurrent inserts both passing the check) is accepted at pilot scale.
  let suppressedDuplicate = false;
  if (admin) {
    try {
      const entity = dedupeEntity(input.conversationId, input.context);
      const { data: actives, error } = await admin
        .from("system_alerts")
        .select("id, conversation_id, context")
        .eq("restaurant_id", input.restaurantId)
        .eq("type", input.type)
        .is("dismissed_at", null);
      if (!error && actives && actives.length) {
        const dup = actives.find(
          (a) =>
            dedupeEntity(
              (a as { conversation_id?: string | null }).conversation_id ?? null,
              (a as { context?: Record<string, unknown> | null }).context ?? null
            ) === entity
        );
        if (dup) {
          suppressedDuplicate = true;
          // Bump a recurrence count on the existing active alert so the operator
          // can see it's recurring — without stacking a second banner row.
          const ctx = ((dup as { context?: Record<string, unknown> | null }).context ?? {}) as Record<string, unknown>;
          const count = typeof ctx.recurrenceCount === "number" ? ctx.recurrenceCount : 1;
          try {
            await admin
              .from("system_alerts")
              .update({ context: { ...ctx, recurrenceCount: count + 1, lastSeenAt: at } })
              .eq("id", (dup as { id: string }).id)
              .eq("restaurant_id", input.restaurantId);
          } catch (e) {
            console.error("[alerts] failed to bump recurrence count", input.type, e);
          }
        }
      }
    } catch (e) {
      // Fail-OPEN: never suppress on uncertainty — continue to the normal insert.
      console.error("[alerts] dedupe check failed (continuing to insert)", input.type, e);
    }
  }

  // A suppressed duplicate stops here: the banner already shows this active issue,
  // and we also skip the duplicate email/WhatsApp notification below. Note: this is
  // a record-time dedupe only — it does NOT touch the fail-loud read path
  // (/api/alerts still returns alertSystemStatus:"degraded" on infra failure).
  if (suppressedDuplicate) return;

  try {
    if (admin) {
      await admin.from("system_alerts").insert({
        restaurant_id: input.restaurantId,
        type: input.type,
        detail: input.detail,
        conversation_id: input.conversationId ?? null,
        context: input.context ?? {},
      });
    }
  } catch (e) {
    console.error("[alerts] failed to record system_alert", input.type, e);
  }

  try {
    const r = await sendAlertEmail({
      type: input.type,
      detail: input.detail,
      restaurantId: input.restaurantId,
      conversationId: input.conversationId ?? null,
      at,
    });
    if (!r.sent && r.reason !== "no_recipients" && r.reason !== "provider_not_configured") {
      console.error("[alerts] email send failed", input.type, r.reason);
    }
  } catch (e) {
    console.error("[alerts] email scaffold threw (swallowed)", input.type, e);
  }

  // Q1 — real out-of-band channel: WhatsApp-to-admin. Best-effort, never throws.
  // Logs LOUDLY on a real failure (not the clean unset/no-recipient no-op), so an
  // alert-send failure is itself visible instead of silently swallowed (Audit-7 Q3).
  try {
    let restaurantName: string | null = null;
    if (admin) {
      const { data } = await admin
        .from("restaurants")
        .select("name")
        .eq("id", input.restaurantId)
        .maybeSingle();
      restaurantName = (data as { name?: string } | null)?.name ?? null;
    }
    const r = await sendAlertWhatsApp({
      type: input.type,
      detail: input.detail,
      restaurantName,
      restaurantId: input.restaurantId,
      conversationId: input.conversationId ?? null,
      at,
    });
    if (!r.sent && r.reason !== "no_recipient") {
      console.error("[alerts] WhatsApp alert send failed", input.type, r.reason);
    }
  } catch (e) {
    console.error("[alerts] WhatsApp alert threw (swallowed)", input.type, e);
  }
}
