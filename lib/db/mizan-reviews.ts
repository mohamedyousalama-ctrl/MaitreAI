// ============================================================================
// MaitreAI — MIZAN reviewer score persistence (SERVER ONLY) — WO-KHALID-STEP5B.
// The only path that reads/writes the mizan_reviews table. Every call is made by
// the token-scoped API route with the service-role admin client AFTER the token
// hash has authenticated; this layer scopes every query to that reviewer's hash so
// no reviewer can read another's rows. It stores what a human tapped — never a
// score of its own (the honesty core lives in mizan-panel-score.mjs).
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedSubmission } from "@/lib/mizan/active-packet";

export interface SavedReviewRow {
  scenarioId: string;
  suiteId: number;
  dimension: string;
  score: number;
  notes: string | null;
}

/** Upsert ONE score cell for this reviewer. Re-submitting the same
 *  (packet, reviewer, scenario, dimension) overwrites the score/notes and bumps
 *  updated_at — that IS the resume/edit flow. Returns { ok, error? }. */
export async function upsertReview(
  admin: SupabaseClient,
  args: { packetId: string; tokenHash: string; sub: ValidatedSubmission },
): Promise<{ ok: boolean; error?: string }> {
  const { packetId, tokenHash, sub } = args;
  const { error } = await admin.from("mizan_reviews").upsert(
    {
      packet_id: packetId,
      reviewer_token_hash: tokenHash,
      scenario_id: sub.scenarioId,
      suite_id: sub.suiteId,
      dimension: sub.dimension,
      score: sub.score,
      notes: sub.notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "packet_id,reviewer_token_hash,scenario_id,dimension" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** All of THIS reviewer's saved cells for the packet — used to restore progress on
 *  resume (GET). Scoped to the reviewer's own token hash; never returns another
 *  reviewer's rows. */
export async function getReviewsForReviewer(
  admin: SupabaseClient,
  args: { packetId: string; tokenHash: string },
): Promise<SavedReviewRow[]> {
  const { data, error } = await admin
    .from("mizan_reviews")
    .select("scenario_id,suite_id,dimension,score,notes")
    .eq("packet_id", args.packetId)
    .eq("reviewer_token_hash", args.tokenHash);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    scenarioId: String(r.scenario_id),
    suiteId: Number(r.suite_id),
    dimension: String(r.dimension),
    score: Number(r.score),
    notes: r.notes == null ? null : String(r.notes),
  }));
}
