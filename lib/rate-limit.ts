// ============================================================================
// MaitreAI — Lightweight in-memory rate limiter (T5) — SERVER ONLY.
//
// Fixed-window counter keyed by an arbitrary string (we key by token+route on
// the public delivery endpoints). Purpose: cap abuse/scraping/DoS on the
// unauthenticated, token-scoped public routes without throttling legitimate use.
//
// PILOT LIMITATION (by design): this is process-local memory. On Vercel
// serverless the counters live only within a WARM instance — they reset on cold
// start and are NOT shared across concurrent instances. So a determined attacker
// hitting fresh/parallel instances gets more headroom than the nominal limit.
// For a single-restaurant pilot this is an honest, dependency-free mitigation
// that meaningfully reduces sustained abuse against a warm instance; it is
// explicitly NOT a distributed rate limiter. Upgrade path (post-pilot): swap the
// store for Upstash/Redis or a Supabase table — the call sites don't change.
//
// NOT a replacement for token validation: callers still validate the token and
// 404 a bad one. This is an ADDITIONAL throttle layer only.
// ============================================================================

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the current window expires
}

const buckets = new Map<string, Bucket>();

// Cap the map so a flood of distinct keys (e.g. token enumeration) can't grow
// memory without bound. When exceeded we drop expired entries first, then — if
// still over — clear the map (a coarse but safe reset; the next requests just
// start fresh windows). MAX is generous for pilot scale.
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — use for the Retry-After header. */
  retryAfterSec: number;
}

/**
 * Fixed-window rate limit. Returns ok=false once `limit` requests have been seen
 * for `key` within the current `windowMs` window.
 *
 * @param key       unique bucket key (e.g. `track:<token>`)
 * @param limit     max requests allowed per window
 * @param windowMs  window length in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    // New window.
    if (buckets.size >= MAX_KEYS) prune(now);
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec };
  }
  return { ok: true, remaining: Math.max(0, limit - bucket.count), retryAfterSec };
}

/** Drop expired buckets; if still at/over the cap, clear everything. */
function prune(now: number) {
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/** Test-only: reset all state. */
export function __resetRateLimitForTests() {
  buckets.clear();
}
