// ============================================================================
// MaitreAI — MO4 actor audit trail writer (append-only) — SERVER ONLY.
// One helper every member-action calls to record WHO did WHAT. The actor is
// resolved server-side from the authenticated session (tenant.userId → members.id)
// — NEVER from a client-supplied id. Writes via the service-role admin client
// (audit_events is admin-write-only per the M1.7 lockdown).
//
// BEST-EFFORT: recordAuditEvent NEVER throws — an audit-write failure must not
// break the user's action (the action is the priority; the trail is best-effort
// but reliable). Safe to call before the migration is applied: the insert simply
// fails and is logged, the action proceeds.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "conversation_claimed"
  | "conversation_returned"
  | "conversation_closed"
  | "order_status_changed"
  | "order_test_marked"
  | "conversation_stage_changed"
  | "order_pos_marked";

export interface AuditInput {
  restaurantId: string;
  /** Session auth user id (server-resolved; never client-supplied). */
  userId: string;
  role?: string | null;
  action: AuditAction;
  entityType: "conversation" | "order";
  entityId: string;
  /** Pre-resolved actor members.id (optional — resolved from userId when absent). */
  memberId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(admin: SupabaseClient, input: AuditInput): Promise<void> {
  try {
    let memberId = input.memberId ?? null;
    if (!memberId) {
      const { data } = await admin
        .from("members")
        .select("id")
        .eq("user_id", input.userId)
        .eq("restaurant_id", input.restaurantId)
        .maybeSingle();
      memberId = (data as { id?: string } | null)?.id ?? null;
    }
    const { error } = await admin.from("audit_events").insert({
      restaurant_id: input.restaurantId,
      actor_member_id: memberId,
      actor_user_id: input.userId,
      actor_role: input.role ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("[audit] insert failed (non-blocking):", error.message);
  } catch (e) {
    console.error("[audit] write failed (non-blocking):", e);
  }
}
