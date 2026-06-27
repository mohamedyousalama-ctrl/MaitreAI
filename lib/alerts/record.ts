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

export type CriticalAlertType =
  | "agent_error"
  | "whatsapp_send_failed"
  | "inbound_persist_failed";

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
}
