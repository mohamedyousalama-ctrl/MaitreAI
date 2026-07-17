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
import { parseAllergyNote } from "@/lib/ai/allergen-companion";

export type AllergyEventKind =
  | "mention"             // §1a plain allergy mention → companion flow
  | "post_commit_mention" // §1a.3 mention after confirmation/payment
  | "emergency"           // §5 active emergency → escalate
  | "checkpoint"          // §6 pre-confirmation checkpoint
  | "recovery"            // §1e pending-human recovery reply
  | "banned_phrase_block"; // §0 output-scan block (WO-LIVE-2-F4): the model drafted a
                           // banned safety phrase in an allergy context → blocked +
                           // escalated. event_kind is free-text (no DB CHECK, 0080:36),
                           // so this new kind needs no migration.

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

/** A signal as emitted by respond() (ToolSignal-shaped). */
interface AuditSignal {
  type: string;
  detail: Record<string, unknown>;
}

/**
 * WO-LIVE-2-F4 — build the §0 banned-phrase-BLOCK audit input from a turn's signals,
 * or null if this turn had no block. PURE. The block is emitted by respond()'s output
 * scan as an "escalation" signal with reason "companion_banned_phrase", carrying the
 * banned phrase(s) and the blocked draft (`reply`). It is NOT on the mention/emergency/
 * checkpoint audit paths, so without this a companion safety block writes zero audit
 * rows (the live gap). We record the phrases + blocked draft (in truth_states) and the
 * rewrite actually sent (agent_reply).
 */
export function buildBannedPhraseBlockAudit(
  signals: readonly AuditSignal[] | null | undefined,
  ctx: { restaurantId: string; conversationId: string; customerMessage: string; sessionAllergyNote?: string | null; agentReply: string }
): AllergyEventInput | null {
  const sig = (signals ?? []).find(
    (s) => s.type === "escalation" && s.detail?.reason === "companion_banned_phrase"
  );
  if (!sig) return null;
  const phrases = Array.isArray(sig.detail.phrases) ? (sig.detail.phrases as unknown[]).map(String) : [];
  const blockedDraft = typeof sig.detail.reply === "string" ? (sig.detail.reply as string) : null;
  return {
    restaurantId: ctx.restaurantId,
    conversationId: ctx.conversationId,
    allergens: parseAllergyNote(ctx.sessionAllergyNote),
    customerMessage: ctx.customerMessage,
    eventKind: "banned_phrase_block",
    agentReply: ctx.agentReply, // the banned-phrase-clean REWRITE actually sent
    truthStates: { bannedPhrases: phrases, blockedDraft },
    humanOffered: false,
    staffNotified: true, // the block escalates to a human (needs-attention / SYSTEM_HOLD)
    netReason: `banned_phrase_block:${phrases.join(",")}`,
  };
}

/**
 * Append one allergy audit row. Never throws — a missing table (0080 not applied)
 * or a transient error is swallowed so the customer turn is never affected. Returns
 * true if the row was written, false if it was skipped/failed (for observability).
 */
export async function recordAllergyEvent(admin: SupabaseClient, input: AllergyEventInput): Promise<boolean> {
  try {
    // eslint-disable-next-line local-rules/no-unchecked-supabase-write -- best-effort observability insert; failure is intentionally non-fatal and returned as boolean.
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
