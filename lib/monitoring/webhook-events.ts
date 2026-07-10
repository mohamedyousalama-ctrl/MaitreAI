// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: webhook anomaly ledger writer (server-only).
//
// The webhook calls this on the TWO Meta-side incident signatures — a 401 invalid
// signature (broken app secret / signature, like the outage) and an inbound
// dropped as unresolved_phone_number_id (a tenant number fell out of routing). The
// monitor sweep later counts these to detect a SPIKE. The happy webhook path never
// calls this, so the success path is byte-identical.
//
// FIRE-AND-FORGET: never throws and never blocks the webhook — a failed insert must
// not turn a WhatsApp message into a 500. Callers `void` it.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookAnomalyKind = "invalid_signature" | "unresolved_phone_number_id";

export async function recordWebhookAnomaly(
  admin: SupabaseClient | null,
  kind: WebhookAnomalyKind,
  opts: { phoneNumberId?: string | null; restaurantId?: string | null } = {}
): Promise<void> {
  if (!admin) return;
  try {
    await admin.from("monitor_webhook_events").insert({
      kind,
      phone_number_id: opts.phoneNumberId ?? null,
      restaurant_id: opts.restaurantId ?? null,
    });
  } catch (e) {
    console.error("[monitor] failed to record webhook anomaly", kind, e);
  }
}
