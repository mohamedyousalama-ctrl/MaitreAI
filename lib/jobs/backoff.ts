// ============================================================================
// MaitreAI — Item 11: retry backoff (pure; browser+server safe)
// Exponential backoff with a cap, split out from the server-only queue so it is
// unit-testable without pulling `server-only`.
// ============================================================================

export const BASE_MS = 60_000; // 1 min
export const CAP_MS = 3_600_000; // 1 hour

/** After the Nth failed attempt (attempts already incremented to N), the next run
 *  is now + min(BASE * 2^(N-1), CAP). Pure. */
export function computeNextAtMs(attempts: number, nowMs: number, baseMs = BASE_MS, capMs = CAP_MS): number {
  const n = Math.max(1, attempts);
  const delay = Math.min(baseMs * 2 ** (n - 1), capMs);
  return nowMs + delay;
}
