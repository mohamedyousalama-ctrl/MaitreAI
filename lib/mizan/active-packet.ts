// ============================================================================
// MaitreAI — MIZAN active-packet accessors + reviewer-submission validation
// (WO-KHALID-STEP5B). SERVER-SIDE authority for the hosted reviewer surface.
//
// Wraps the generated active-packet-data.ts with: a reviewer-safe view (what the
// /mizan page hands the client island), token auth (never leaks the env hashes to
// the client), and a PURE validator for an incoming score submission (scenario ∈
// packet, dimension ∈ that suite's rubric, score in range). Kept free of
// "server-only" so it strip-types cleanly in the unit test; the env-reading auth
// path is only ever called from server code.
// ============================================================================

import { ACTIVE_PACKET_DATA } from "./active-packet-data";
import { isValidReviewerToken, reviewerTokenAllowlist } from "./token";

export interface PacketItem {
  scenarioId: string;
  suiteId: number;
  suiteName: string;
  region: string | null;
  frame: string | null;
  turns: string[];
  replies: string[];
  dimensions: string[];
  scale: number;
}
export interface ActivePacket {
  packetId: string;
  benchmark: string;
  unseeded?: boolean;
  minReviewers: number;
  note: string;
  suites: { id: number; name: string; dimensions: string[]; scale: number; threshold: number }[];
  items: PacketItem[];
}

const PACKET = ACTIVE_PACKET_DATA as unknown as ActivePacket;

/** The active packet id (ties every saved score row to this capture run). */
export function activePacketId(): string {
  return PACKET.packetId;
}

/** The reviewer-safe packet view handed to the client island. The packet carries
 *  no secrets, so this is the packet as-is — the client needs scenarioId/suiteId/
 *  dimension to save each score, but the UI never surfaces those ids to the human. */
export function reviewerPacket(): ActivePacket {
  return PACKET;
}

/** Fast lookup of one item by scenario id. */
export function packetItem(scenarioId: string): PacketItem | undefined {
  return PACKET.items.find((it) => it.scenarioId === scenarioId);
}

/** Token auth (server-side): sha256(url token) ∈ MIZAN_REVIEWER_TOKEN_HASHES.
 *  Returns false when the allowlist env is unset/empty (fail-closed). */
export function validateReviewerToken(token: string): boolean {
  return isValidReviewerToken(token, reviewerTokenAllowlist());
}

export interface ReviewSubmission {
  scenarioId?: unknown;
  suiteId?: unknown;
  dimension?: unknown;
  score?: unknown;
  notes?: unknown;
}
export type ValidatedSubmission = {
  scenarioId: string;
  suiteId: number;
  dimension: string;
  score: number;
  notes: string | null;
};

/** PURE validator for one incoming score cell against a packet. Guarantees the row
 *  we upsert is a real (scenario, dimension) in this packet with an in-range score —
 *  a reviewer can't inject arbitrary scenario ids, off-rubric dimensions, or scores
 *  outside 1..scale. suiteId is taken from the packet (not trusted from the client). */
export function validateSubmission(
  packet: ActivePacket,
  sub: ReviewSubmission,
): { ok: true; value: ValidatedSubmission } | { ok: false; error: string } {
  // Gate-integrity guard: never persist a score against a reply that doesn't exist.
  // An UNSEEDED packet (the committed default, or one whose capture never ran) has no
  // real replies to review, so ALL submissions are rejected — otherwise taps on the
  // "(no reply yet)" placeholder would flow into the DB and feed the launch gate as if
  // a human had reviewed an actual reply. Authenticity is human-scored on real replies
  // only; a blank reply is never scorable.
  if (packet.unseeded) return { ok: false, error: "unseeded_packet" };

  const scenarioId = typeof sub.scenarioId === "string" ? sub.scenarioId : "";
  const item = packet.items.find((it) => it.scenarioId === scenarioId);
  if (!item) return { ok: false, error: "unknown_scenario" };

  // Per-item guard: even in a seeded packet, an individual scenario whose capture failed
  // ships with no non-empty reply. Reject scores for it (no real reply was reviewed).
  const hasReply = (item.replies || []).some((r) => typeof r === "string" && r.trim().length > 0);
  if (!hasReply) return { ok: false, error: "no_reply" };

  const dimension = typeof sub.dimension === "string" ? sub.dimension : "";
  if (!item.dimensions.includes(dimension)) return { ok: false, error: "unknown_dimension" };

  const score = Number(sub.score);
  if (!Number.isInteger(score) || score < 1 || score > (item.scale || 10)) {
    return { ok: false, error: "score_out_of_range" };
  }

  const notes = typeof sub.notes === "string" ? sub.notes.slice(0, 2000) : null;
  return { ok: true, value: { scenarioId, suiteId: item.suiteId, dimension, score, notes } };
}
