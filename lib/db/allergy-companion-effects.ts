// ============================================================================
// MaitreAI — Allergy-Companion side effects (spec §1a.2/§1a.3/§4) — SERVER helper.
// The write-side of a companion turn: stamp the monotonic kitchen note on the
// conversation, run the POST-COMMIT status query (§1a.3), fire the staff alert
// when applicable, and emit the §4 audit row. Consulted ONLY when
// allergy_companion_mode is ON.
//
// DEPLOY-SAFE / NEVER-THROW: every write is best-effort. A missing 0080 column/
// table is inert — it never blocks or fails a customer turn. §1a.3 fail-safe: if
// the post-commit status query FAILS, we proceed with the flow AND fire the staff
// alert anyway (fail toward MORE alerting, never less).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAllergyEvent } from "@/lib/db/allergy-audit";
import { recordCriticalAlert } from "@/lib/alerts/record";
import { parseAllergyNote } from "@/lib/ai/allergen-companion";
import type { CompanionDecision } from "@/lib/ai/allergen-companion-flow";
import { mustWrite } from "@/lib/db/checked";

export interface CompanionEffectInput {
  restaurantId: string;
  conversationId: string;
  decision: CompanionDecision;
  customerMessage: string;
  agentReply: string;
}

export interface CompanionEffectResult {
  /** The monotonic union note was stamped on the conversation. */
  noteWritten: boolean;
  /** A staff alert fired this turn (post-commit mention or emergency). */
  staffNotified: boolean;
  /** A committed order already existed on this conversation (post-commit mention). */
  postCommit: boolean;
  /** The post-commit status query failed → we alerted anyway (fail-toward-more). */
  postCommitQueryFailed: boolean;
}

/**
 * Apply the write-side effects of a companion turn. Persists the session note,
 * runs the §1a.3 post-commit query, fires the staff alert when warranted, and
 * writes the §4 audit row. Never throws.
 */
export async function applyCompanionSideEffects(
  admin: SupabaseClient,
  input: CompanionEffectInput
): Promise<CompanionEffectResult> {
  const { restaurantId, conversationId, decision, customerMessage, agentReply } = input;

  // 1. Stamp the monotonic union note on the conversation (§1a.2). The kitchen
  //    ticket + the checkpoint read from it; order-create copies it onto the order.
  let noteWritten = false;
  if (decision.note) {
    try {
      await mustWrite<{ id: string }>(
        admin
          .from("conversations")
          .update({ allergy_note: decision.note })
          .eq("id", conversationId)
          .select("id"),
        "allergy_companion_effects.write_note",
        { exactRows: 1 },
      );
      noteWritten = true;
    } catch {
      /* column absent (0080 not applied) → inert */
    }
  }

  // 2. POST-COMMIT status query (§1a.3) — a SINGLE read by conversation_id. On
  //    QUERY FAILURE proceed AND alert anyway (fail toward MORE alerting).
  let postCommit = false;
  let postCommitQueryFailed = false;
  let orderId: string | null = null;
  let orderNumber: string | null = null;
  try {
    const { data, error } = await admin
      .from("orders")
      .select("id, order_number")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      postCommitQueryFailed = true;
    } else if (data && data.length) {
      postCommit = true;
      orderId = (data[0].id as string) ?? null;
      orderNumber = (data[0].order_number as string) ?? null;
    }
  } catch {
    postCommitQueryFailed = true;
  }

  // 2b. Kitchen-ticket invariant (§1a.2): on a POST-COMMIT mention the order already
  //     exists, so order-create never got the note — stamp it directly onto the order
  //     row now so its ticket carries the allergens. Best-effort / deploy-safe.
  if (postCommit && orderId && decision.note) {
    try {
      await admin.from("orders").update({ allergy_note: decision.note }).eq("id", orderId);
    } catch {
      /* column absent → inert */
    }
  }

  // 3. Staff alert. A POST-COMMIT mention fires the manager ping (§1a.3); the
  //    failed-query case fires it too (fail-toward-more). Emergency alerting is
  //    handled by the escalation/SYSTEM_HOLD path in customer-turn; here we only
  //    own the post-commit manager ping so it is never double-fired.
  let staffNotified = false;
  const firePostCommit = decision.path !== "emergency" && (postCommit || postCommitQueryFailed);
  if (firePostCommit) {
    await recordCriticalAlert(admin, {
      restaurantId,
      type: "allergy_added_post_commit",
      detail:
        `ملاحظة حساسية أُضيفت بعد التأكيد — راجعوا قبل التحضير/التسليم.` +
        (decision.note ? ` (${decision.note})` : "") +
        (postCommitQueryFailed ? " [تعذّر التحقق من حالة الطلب — نُبّه احتياطاً]" : ""),
      conversationId,
      context: orderId ? { orderId, orderNumber } : { postCommitQueryFailed: true },
    });
    staffNotified = true;
  }

  // 4. §4 AUDIT row — the structured liability record for this turn.
  const eventKind = decision.path === "emergency"
    ? "emergency"
    : firePostCommit
      ? "post_commit_mention"
      : "mention";
  await recordAllergyEvent(admin, {
    restaurantId,
    conversationId,
    orderId,
    allergens: parseAllergyNote(decision.note),
    customerMessage,
    eventKind,
    agentReply,
    dataSource: "none", // W1: no per-dish data yet; every dish resolves to "unknown"
    humanOffered: decision.offerHuman,
    bannerWritten: noteWritten,
    staffNotified: staffNotified || decision.path === "emergency",
    netReason: decision.path === "emergency" ? `emergency:${decision.emergencyLabel ?? ""}` : "companion_mention",
  });

  return { noteWritten, staffNotified, postCommit, postCommitQueryFailed };
}
