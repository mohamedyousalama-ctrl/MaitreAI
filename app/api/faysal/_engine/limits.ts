// ============================================================================
// فيصل / Faysal — public-demo caps. Pure data, so the route, the page and any
// future proof test read the SAME values. Modelled on `lib/demo/config.ts`'s
// discipline; it imports nothing from it, because that file pins a restaurant
// tenant id and the seam between the two products is a wall, not a valve.
// ============================================================================

/**
 * Per-message character cap, applied to the message AND to every history entry.
 *
 * This is the spend control, not a UX nicety. Uncapped input on a public endpoint
 * is a denial-of-wallet. Faysal makes at most ONE model call per turn (intent
 * classification, Haiku-tier, `maxTokens: 200`) — an order of magnitude below the
 * Kivo demo's six-iteration tool loop — but the cap is what keeps that true when
 * someone pastes a novel into the composer.
 */
export const FAYSAL_MAX_CHARS = 400;

/** Turns of history replayed into the classifier. Bounds total prompt size. */
export const FAYSAL_MAX_HISTORY = 8;

/** Per-IP pre-filter. A speed bump — `lib/rate-limit` is process-local by design. */
export const FAYSAL_PER_IP_TURNS = 30;
export const FAYSAL_WINDOW_MS = 60 * 60 * 1000;

/** Per-IP cap on session minting (`/api/faysal/reset`), which costs no tokens. */
export const FAYSAL_PER_IP_RESETS = 40;

/**
 * THE GLOBAL DAILY CEILING. A per-IP limit alone is defeated by any number of
 * source addresses, so this is the real control and the per-IP one is courtesy.
 *
 * ARITHMETIC, stated so it can be re-checked rather than trusted: one turn is one
 * `perception`-use-case call — `claude-haiku-4-5` at $1/M in, $5/M out, capped at
 * 200 output tokens, over a prompt bounded by FAYSAL_MAX_CHARS × (1 + history) ≈
 * 3,600 characters ≈ 1,200 tokens. Worst case ≈ $0.0022 a turn, so 3,000 turns
 * bounds a worst day at ≈ $7. RE-RUN THIS WHENEVER THE MODEL OR THE RATE CHANGES:
 * the model lives in `lib/ai/llm/models.ts` (`perception`) and this paragraph goes
 * stale the moment that entry is re-pointed at a Sonnet-tier model.
 *
 * Note the scene machine is deterministic, so a turn that the classifier's
 * deterministic pre-pass already resolves makes NO model call at all. In practice
 * most demo turns are free; the ceiling is sized against what the caps physically
 * permit, not against the expectation.
 */
export const FAYSAL_GLOBAL_DAILY_TURNS = 3000;

/**
 * How long a sealed session token stays valid. It is checked on the SERVER against
 * the token's own `lastAt`, so an old token is refused rather than resumed — the
 * expiry is not something the client can extend by keeping the tab open.
 */
export const FAYSAL_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** UTC day bucket, so the global counter resets at 00:00 UTC (03:00 Riyadh). */
export function globalDayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Hour bucket for the durable per-IP ceiling. */
export function ipHourBucket(ip: string, now = new Date()): string {
  return `${ip}:${now.toISOString().slice(0, 13)}`;
}
