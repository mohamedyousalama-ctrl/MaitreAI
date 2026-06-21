// ============================================================================
// MaitreAI — WhatsApp send retry policy (Bug #2) — PURE, no server/IO deps
// ----------------------------------------------------------------------------
// The classification + bounded-retry loop for outbound WhatsApp sends, split out
// of outbound.ts so it has ZERO server-only / network imports and is therefore
// unit-testable on its own. outbound.ts wraps each send's pre-checks (24h window,
// test-mode skip, interactive→text fallback) around `retrySend()`.
//
// Retry ONLY transient failures; NEVER a structural one (a structural retry just
// fails again, and could mask a real token/window/payload problem). Concretely:
//   RETRYABLE  : HTTP 429 (rate limit), 408 (timeout), 5xx (upstream), a thrown
//                network error, AND a small allowlist of Meta error codes that
//                are transient even when they arrive as a 4xx (rate-limit family).
//   NON-RETRY  : every other 4xx — invalid payload, auth/token (190/0/3), the
//                24h re-engagement-window rejection, template problems. These are
//                surfaced honestly (saved + flagged) instead.
// All retries this policy triggers are on a Meta REJECTION response (the message
// was not accepted → not delivered), so retrying cannot double-send. The single
// ambiguous case — a thrown network error after Meta may have delivered — is
// bounded to the same small N (WhatsApp Cloud API exposes no idempotency key).
// ============================================================================

import type { SendResult } from "./types";

/** Backoff between attempts (ms): 0.5s → 1.5s → 4s, then capped at the last. */
export const BACKOFF_MS = [500, 1500, 4000];

/** Meta error codes that are TRANSIENT (rate-limit / temporary upstream) even
 *  when delivered with a 4xx status — safe to retry after backoff. Structural
 *  4xx codes are intentionally absent. */
export const TRANSIENT_META_CODES = new Set<number>([
  4, // application request limit reached (app-level rate limit)
  80007, // rate limit issues
  130429, // Cloud API messaging throughput / rate limit reached
  131056, // (business, consumer) pair rate limit hit
  131000, // generic "Something went wrong" — transient upstream
  133016, // temporary service issue
]);

/** Decide whether a failed send is worth retrying. */
export function shouldRetry(res: SendResult): boolean {
  if (res.ok) return false;
  // A surfaced Meta error code wins: a transient rate-limit code retries even on
  // a 4xx; any other code does not (falls through to the HTTP-status check).
  const code = res.errorCode;
  if (typeof code === "number") {
    if (TRANSIENT_META_CODES.has(code)) return true;
    // A known structural code with a 4xx is handled by the HTTP check below; we
    // don't special-case each structural code here.
  }
  const m = /API (\d{3})/.exec(res.error ?? "");
  if (m) {
    const http = Number(m[1]);
    return http === 429 || http === 408 || http >= 500;
  }
  // No HTTP code parsed → the fetch threw (network/timeout) → one bounded retry.
  return res.status === "failed";
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a single-send function up to `retries`+1 times, stopping at the first
 * success or the first NON-retryable failure. Returns the last result and the
 * real number of attempts made. Pure of any WhatsApp specifics — the caller
 * supplies `sendOnce` (already built body/window-checked). `sleep` is injectable
 * so tests run instantly.
 */
export async function retrySend(
  sendOnce: () => Promise<SendResult>,
  retries: number,
  sleep: (ms: number) => Promise<void> = realSleep
): Promise<{ result: SendResult; attempts: number }> {
  let last: SendResult | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await sendOnce();
    if (last.ok) return { result: last, attempts: attempt + 1 };
    if (!shouldRetry(last) || attempt === retries) {
      return { result: last, attempts: attempt + 1 };
    }
    await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
  }
  // Unreachable (the loop always returns), but satisfies the type checker.
  return { result: last as SendResult, attempts: retries + 1 };
}
