// ============================================================================
// MaitreAI — Allergy audit trail writer (WO-COMPANION §4) — SERVER helper.
// Append-only structured record of every allergy interaction (mention, emergency,
// checkpoint, recovery, post-commit). A liability record — queryable, not an AI blob.
//
// DEPLOY-SAFE / NEVER-THROW: writes to conversation_allergy_events (migration 0080,
// PREPARE-ONLY). If the table isn't applied yet, or a transient write fails, this is
// INERT — it never blocks or fails a customer turn. Best-effort, like the voice
// counter (respond-and-send) and conversation-outcomes emitters.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type AllergyEventKind =
  | "mention"             // §1a plain allergy mention → companion flow
  | "post_commit_mention" // §1a.3 mention after confirmation/payment
  | "emergency"           // §5 active emergency → escalate
  | "checkpoint"          // §6 pre-confirmation checkpoint
  | "recovery";           // §1e pending-human recovery reply

export interface AllergyEventInput {
  restaurantId: string;
  conversationId: string;
  orderId?: string | null;
  allergens?: string[];
  customerMessage: string;
  eventKind: AllergyEventKind;
  agentReply?: string | null;
  truthStates?: Record<string, unknown>;
  dataSource?: string | null;
  dataVerifiedAt?: string | null;
  humanOffered?: boolean;
  humanAccepted?: boolean | null;
  checkpointAckText?: string | null;
  checkpointAckAt?: string | null;
  bannerWritten?: boolean;
  staffNotified?: boolean;
  netReason?: string | null;
}

/**
 * Append one allergy audit row. Never throws — a missing table (0080 not applied)
 * or a transient error is swallowed so the customer turn is never affected. Returns
 * true if the row was written, false if it was skipped/failed (for observability).
 */
export async function recordAllergyEvent(admin: SupabaseClient, input: AllergyEventInput): Promise<boolean> {
  try {
    const { error } = await admin.from("conversation_allergy_events").insert({
      restaurant_id: input.restaurantId,
      conversation_id: input.conversationId,
      order_id: input.orderId ?? null,
      allergens: input.allergens ?? [],
      customer_message: input.customerMessage,
      event_kind: input.eventKind,
      agent_reply: input.agentReply ?? null,
      truth_states: input.truthStates ?? {},
      data_source: input.dataSource ?? null,
      data_verified_at: input.dataVerifiedAt ?? null,
      human_offered: input.humanOffered ?? false,
      human_accepted: input.humanAccepted ?? null,
      checkpoint_ack_text: input.checkpointAckText ?? null,
      checkpoint_ack_at: input.checkpointAckAt ?? null,
      banner_written: input.bannerWritten ?? false,
      staff_notified: input.staffNotified ?? false,
      net_reason: input.netReason ?? null,
    });
    return !error; // column/table absent (not applied) or transient → false, never throws
  } catch {
    return false;
  }
}
