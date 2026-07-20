// ============================================================================
// MaitreAI — control_epoch SEND GATE (WO-CONTROL, Part B) — SERVER ONLY.
//
// The core send-time guarantee of the control plane. A conversation carries a
// monotonic control_epoch that bumps on every ownership/authority transition
// (migration 0099 trigger). A sender captures the epoch when it starts composing
// (the "enqueue" epoch) and passes it to the outbound chokepoint; IMMEDIATELY before
// the WhatsApp API call the chokepoint RE-READS the current control_epoch. If it no
// longer matches, the conversation changed hands mid-flight (e.g. a human claimed it
// while the Brain was thinking) — the stale reply is DROPPED, never transmitted, and a
// `blocked_stale_sender` signal is logged. This lives at the lowest send chokepoint
// (lib/messaging/outbound.ts) so it protects AI and human sends identically.
//
// DEPLOY-SAFE + BYTE-NEUTRAL: when no enqueue epoch is supplied (the human/console path,
// or a pre-migration deploy) the gate is inert — the send proceeds exactly as today. When
// the epoch MATCHES (the normal case) the gate is a pure no-op. A missing control_epoch
// column (42703) or a transient read error also proceeds (never drop a live reply on an
// instrumentation blip) — the gate only ever blocks on a CONFIRMED mismatch.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** What a sender must know to be gated: which conversation, the epoch it enqueued at,
 *  and a source label for the signal (e.g. "ai_reply"). restaurantId scopes the signal. */
export interface EpochGuard {
  admin: SupabaseClient;
  conversationId: string;
  restaurantId: string;
  epochAtEnqueue: number | null | undefined;
  source: string;
}

export interface EpochCheck {
  /** True ONLY on a confirmed epoch mismatch — the send must be dropped. */
  blocked: boolean;
  /** The current epoch read from the row (null when unread / column absent). */
  currentEpoch: number | null;
  /** False when the gate was inert (no enqueue epoch, missing column, transient error). */
  deployed: boolean;
}

/** Read a conversation's current control_epoch. Deploy-safe: a missing column (42703) or
 *  any error returns null (gate inert), so instrumentation can never drop a live reply. */
export async function readControlEpoch(admin: SupabaseClient, conversationId: string): Promise<number | null> {
  const { data, error } = await admin
    .from("conversations")
    .select("control_epoch")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) return null; // column absent (pre-migration) or transient → inert
  const raw = (data as { control_epoch?: number | null } | null)?.control_epoch;
  return raw == null ? null : Number(raw);
}

/**
 * The gate decision. Returns blocked ONLY when an enqueue epoch was supplied AND the
 * freshly-read current epoch differs from it. No enqueue epoch → inert (never blocks).
 * A null current epoch (column absent / unread) → inert (never blocks).
 */
export async function checkControlEpoch(guard: EpochGuard): Promise<EpochCheck> {
  if (guard.epochAtEnqueue == null) {
    return { blocked: false, currentEpoch: null, deployed: false }; // no epoch captured → inert
  }
  const current = await readControlEpoch(guard.admin, guard.conversationId);
  if (current == null) {
    return { blocked: false, currentEpoch: null, deployed: false }; // column absent / unread → inert
  }
  const blocked = current !== Number(guard.epochAtEnqueue);
  return { blocked, currentEpoch: current, deployed: true };
}

/** Log the drop of a stale sender to conversation_signals. Best-effort — a signal-write
 *  failure must never affect the (already-decided) send outcome. */
export async function logBlockedStaleSender(guard: EpochGuard, currentEpoch: number | null): Promise<void> {
  try {
    await guard.admin.from("conversation_signals").insert({
      restaurant_id: guard.restaurantId,
      conversation_id: guard.conversationId,
      type: "blocked_stale_sender",
      detail: {
        enqueued_epoch: guard.epochAtEnqueue ?? null,
        current_epoch: currentEpoch,
        source: guard.source,
      },
    });
  } catch (e) {
    console.error("[send-gate] blocked_stale_sender signal insert failed (swallowed)", e);
  }
}

export interface GuardedSendOutcome<T> {
  /** True when the send was dropped as a stale sender (thunk NOT invoked). */
  blocked: boolean;
  /** The send thunk's result, or null when blocked. */
  result: T | null;
}

/**
 * Run a send thunk behind the epoch gate. On a confirmed mismatch: log the signal and
 * return { blocked:true, result:null } WITHOUT invoking the thunk (nothing transmitted).
 * Otherwise invoke the thunk and return its result. This is the one entry the outbound
 * chokepoint uses so AI and human sends are gated identically.
 */
export async function guardedSend<T>(guard: EpochGuard, sendThunk: () => Promise<T>): Promise<GuardedSendOutcome<T>> {
  const check = await checkControlEpoch(guard);
  if (check.blocked) {
    await logBlockedStaleSender(guard, check.currentEpoch);
    return { blocked: true, result: null };
  }
  return { blocked: false, result: await sendThunk() };
}
