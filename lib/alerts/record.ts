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
  | "delivered_without_driver_override";

export interface CriticalAlertInput {
  restaurantId: string;
  type: CriticalAlertType;
  detail: string;
  conversationId?: string | null;
  context?: Record<string, unknown>;
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
