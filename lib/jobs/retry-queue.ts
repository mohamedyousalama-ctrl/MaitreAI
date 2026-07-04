// ============================================================================
// MaitreAI — Item 11: durable retry queue (server only)
// A DB-backed retry queue so a failed side-effect (an LLM outcome classify, a
// customer paid-notify) survives a process restart instead of dying in an
// in-memory loop. Callers ENQUEUE a job on failure; a cron route drains due jobs
// with exponential backoff. Terminal after max_attempts → 'dead' (a durable
// record for an operator, never a silent drop).
//
// The backoff math is a pure function (testable without a DB). Claiming is
// per-row and atomic (conditional UPDATE guarded on status) so two concurrent
// cron ticks never double-run one job.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextAtMs } from "@/lib/jobs/backoff";

export { computeNextAtMs } from "@/lib/jobs/backoff";

export type RetryJobKind = "outcome_emit" | "paid_notify";

export interface RetryJob {
  id: string;
  restaurant_id: string | null;
  kind: RetryJobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  next_at: string;
  status: "pending" | "processing" | "done" | "dead";
  last_error: string | null;
}

/** Enqueue a durable retry job. Best-effort: a failure to enqueue is logged, never
 *  thrown (the caller's primary path already failed once — don't compound it). */
export async function enqueueRetryJob(
  admin: SupabaseClient,
  job: { kind: RetryJobKind; payload: Record<string, unknown>; restaurantId?: string | null; maxAttempts?: number },
): Promise<void> {
  try {
    const { error } = await admin.from("retry_jobs").insert({
      restaurant_id: job.restaurantId ?? null,
      kind: job.kind,
      payload: job.payload,
      max_attempts: job.maxAttempts ?? 6,
      // next_at defaults to now() → eligible on the next cron tick.
    });
    if (error) console.error("[retry-queue] enqueue failed (non-blocking):", error.message);
  } catch (e) {
    console.error("[retry-queue] enqueue threw (non-blocking):", e);
  }
}

/** Fetch due pending jobs (status='pending', next_at<=now), oldest first. */
export async function fetchDueJobs(admin: SupabaseClient, nowIso: string, limit = 50): Promise<RetryJob[]> {
  const { data, error } = await admin
    .from("retry_jobs")
    .select("id, restaurant_id, kind, payload, attempts, max_attempts, next_at, status, last_error")
    .eq("status", "pending")
    .lte("next_at", nowIso)
    .order("next_at", { ascending: true })
    .limit(limit);
  if (error) { console.error("[retry-queue] fetchDue failed:", error.message); return []; }
  return (data ?? []) as RetryJob[];
}

/** Atomically claim ONE job: flip pending→processing guarded on the current
 *  status. Returns true iff THIS caller won the row (0 rows = another tick took it). */
export async function claimJob(admin: SupabaseClient, jobId: string): Promise<boolean> {
  const { data } = await admin
    .from("retry_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id");
  return (data?.length ?? 0) > 0;
}

/** Mark a claimed job done. */
export async function completeJob(admin: SupabaseClient, jobId: string): Promise<void> {
  await admin.from("retry_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
}

/** Record a failed attempt: increment attempts; if exhausted → 'dead', else back to
 *  'pending' with a backed-off next_at. */
export async function failJob(admin: SupabaseClient, job: RetryJob, errorMsg: string, nowMs: number): Promise<void> {
  const attempts = job.attempts + 1;
  const dead = attempts >= job.max_attempts;
  await admin
    .from("retry_jobs")
    .update({
      attempts,
      status: dead ? "dead" : "pending",
      next_at: dead ? job.next_at : new Date(computeNextAtMs(attempts, nowMs)).toISOString(),
      last_error: errorMsg.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}
