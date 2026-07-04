// ============================================================================
// MaitreAI — Item 11: retry-job dispatch (server only)
// Maps a durable retry job's `kind` to the side-effect that re-attempts it. A
// handler MUST THROW on a still-failed attempt so the queue backs off + retries
// (and eventually marks the job 'dead'); it returns normally only on success.
// Handlers are idempotent — a job may run more than once (at-least-once).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetryJobKind } from "@/lib/jobs/retry-queue";
import { emitConversationOutcome } from "@/lib/intelligence/conversation-outcomes";
import { sendWhatsAppText } from "@/lib/messaging/outbound";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";

type Handler = (admin: SupabaseClient, payload: Record<string, unknown>) => Promise<void>;

const HANDLERS: Record<RetryJobKind, Handler> = {
  // Re-run the outcome classify/emit. Idempotent: conversation_outcomes has
  // unique(conversation_id), so a concurrent success is a no-op. We THROW if the
  // row still isn't present after the attempt, so the queue keeps retrying.
  outcome_emit: async (admin, payload) => {
    const restaurantId = String(payload.restaurantId ?? "");
    const conversationId = String(payload.conversationId ?? "");
    if (!restaurantId || !conversationId) throw new Error("outcome_emit: missing restaurantId/conversationId");
    await emitConversationOutcome(admin, { restaurantId, conversationId });
    const { data } = await admin
      .from("conversation_outcomes").select("id").eq("conversation_id", conversationId).maybeSingle();
    if (!data) throw new Error("outcome_emit: outcome row still missing after emit");
  },

  // Re-send the customer's paid confirmation from the tenant's own number.
  // THROW unless the send actually left the building (status='sent').
  paid_notify: async (admin, payload) => {
    const restaurantId = String(payload.restaurantId ?? "");
    const to = String(payload.to ?? "");
    const text = String(payload.text ?? "");
    if (!restaurantId || !to || !text) throw new Error("paid_notify: missing restaurantId/to/text");
    const res = await runWithTenantWhatsAppCreds(admin, restaurantId, () => sendWhatsAppText({ to, text }));
    if (res.status !== "sent") throw new Error(`paid_notify: send not delivered (status=${res.status})`);
  },
};

export function dispatchRetryJob(admin: SupabaseClient, kind: RetryJobKind, payload: Record<string, unknown>): Promise<void> {
  const handler = HANDLERS[kind];
  if (!handler) return Promise.reject(new Error(`unknown retry job kind: ${kind}`));
  return handler(admin, payload);
}

/** The kinds this dispatcher knows how to run (for the harness + observability). */
export const KNOWN_KINDS: RetryJobKind[] = Object.keys(HANDLERS) as RetryJobKind[];
