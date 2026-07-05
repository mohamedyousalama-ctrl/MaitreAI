// ============================================================================
// MaitreAI — Item 14: tonight-note expiry (pure; browser+server safe)
// A tonight note expires at the END of today's service window (from the
// restaurant's hours) so it self-drops from Karim's prompt after close — no cron.
// The route resolves today's close INSTANT (epoch ms, in the tenant's timezone)
// and hands it here; this bounds it so a note can never live too briefly or too
// long: at least MIN_TTL, at most MAX_TTL. A closed/unknown day → a bounded
// default TTL. Pure so the route and its harness share one source of truth.
// ============================================================================

export const MIN_TTL_MS = 60 * 60 * 1000; // 1h — a note always lasts at least this
export const MAX_TTL_MS = 18 * 60 * 60 * 1000; // 18h — hard ceiling (never "forever")
export const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // closed/unknown day fallback

/**
 * @param nowMs         current epoch ms
 * @param todayCloseMs  epoch ms of today's close instant in the tenant tz, or null
 *                      when today is closed / hours unknown.
 * Returns the expiry epoch ms, clamped to [now+MIN_TTL, now+MAX_TTL].
 */
export function computeTonightExpiryMs(nowMs: number, todayCloseMs: number | null): number {
  const candidate = todayCloseMs != null && todayCloseMs > nowMs ? todayCloseMs : nowMs + DEFAULT_TTL_MS;
  const floor = nowMs + MIN_TTL_MS;
  const ceil = nowMs + MAX_TTL_MS;
  return Math.min(Math.max(candidate, floor), ceil);
}
