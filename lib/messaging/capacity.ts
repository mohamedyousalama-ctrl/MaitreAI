// ============================================================================
// Kivo — WO-6: WhatsApp messaging capacity — tier/quality logic + the send
// ledger that backs the honest "remaining" estimate. Server logic.
//
// The capacity chip contract (GET /api/capacity):
//   { tier, quality, source, fetched_at, sent_24h, remaining_est }
// remaining_est = tier_limit − sent_24h, and is ALWAYS an estimate we own (our
// count of business-initiated template sends in the last 24h). Meta's counter is
// authoritative; ours is the honest approximation — render it labelled `est.`.
//
// Pure logic (tier map / normalizers) is node-loadable for the proof harness; the
// DB helpers take an INJECTED admin (service-role) client.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneQuality = "green" | "yellow" | "red" | "unknown";
export type CapacitySource = "meta_sync" | "manual";

// Meta messaging-limit tiers → business-initiated conversations per 24h. UNLIMITED
// (and unknown) → null = "no numeric cap" (remaining is not a finite number).
export const TIER_LIMITS: Record<string, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: null,
};

/** Normalize a raw Meta `messaging_limit_tier` to our canonical label (or null). */
export function normalizeTier(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  const withPrefix = v.startsWith("TIER_") ? v : `TIER_${v}`;
  return withPrefix;
}

/** Numeric 24h limit for a tier label, or null when unlimited / unknown. */
export function tierLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const key = normalizeTier(tier);
  if (key && key in TIER_LIMITS) return TIER_LIMITS[key];
  return null;
}

export function normalizeQuality(raw: unknown): PhoneQuality {
  switch (String(raw ?? "").trim().toUpperCase()) {
    case "GREEN": return "green";
    case "YELLOW": return "yellow";
    case "RED": return "red";
    default: return "unknown";
  }
}

export interface RemainingEst {
  tierLimit: number | null;
  /** null when the tier has no finite cap (unlimited/unknown). */
  remainingEst: number | null;
}

/** remaining_est = max(0, tier_limit − sent_24h); null when no finite cap. */
export function computeRemaining(tier: string | null | undefined, sent24h: number): RemainingEst {
  const limit = tierLimit(tier);
  if (limit == null) return { tierLimit: null, remainingEst: null };
  return { tierLimit: limit, remainingEst: Math.max(0, limit - Math.max(0, sent24h)) };
}

// ── DB helpers (injected admin / service-role client) ────────────────────────

/**
 * Record ONE business-initiated template send. BEST-EFFORT: never throws — a
 * ledger write must never break an actual send. The count it feeds is honest
 * only for sends made AFTER this ledger shipped (we can only own what we record).
 */
export async function recordTemplateSend(
  admin: SupabaseClient | null,
  restaurantId: string,
  templateName: string
): Promise<void> {
  if (!admin || !restaurantId) return;
  try {
    await admin.from("template_sends").insert({
      restaurant_id: restaurantId,
      template_name: templateName || "",
    });
  } catch (e) {
    console.error("[capacity] template_sends insert failed (swallowed)", e);
  }
}

/** Count this tenant's business-initiated template sends in the last 24h. */
export async function countTemplateSends24h(
  admin: SupabaseClient,
  restaurantId: string
): Promise<number> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("template_sends")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("sent_at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}
