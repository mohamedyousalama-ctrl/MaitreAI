// ============================================================================
// MaitreAI — CSRF-1: same-origin assertion for cookie-authed mutating requests.
//
// Cookie auth is ambient: a browser attaches the session cookie to ANY request
// it makes to our origin, including a cross-site form/fetch a malicious page
// triggers. RLS + the tenant gate stop cross-TENANT damage, but a same-tenant
// operator tricked into a cross-site POST could still drive a state change. The
// deterministic defense is to reject cookie-authed MUTATING requests whose
// browser-attested origin isn't ours.
//
// Split mirrors the tenant gate (tenant-gate.ts pure + require-tenant.ts async):
//   • `sameOriginGate()` — PURE decision over {method, origin, referer, host}.
//     Exhaustively unit-testable, no Next runtime.
//   • `assertSameOrigin()` — thin async wrapper that reads next/headers and maps
//     a deny to a ready-to-return 403. Wired at ONE site: requireTenant.
//
// Method comes from `x-kivo-method`, which the middleware stamps with the real
// request method on every matched request (an attacker cannot omit it — the
// middleware overwrites it, so a cross-site POST is always seen as a POST).
// ============================================================================

/** Methods that never change state → never CSRF-relevant, always allowed. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Parse the host[:port] out of an Origin/Referer URL; null if unparseable. */
function urlHost(value: string): string | null {
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

export interface SameOriginInput {
  /** HTTP method (case-insensitive). Missing → treated as unsafe (fail-closed). */
  method: string | null | undefined;
  /** Origin header, if the browser sent one. */
  origin: string | null | undefined;
  /** Referer header, if present. */
  referer: string | null | undefined;
  /** OUR request host — prefer x-forwarded-host, else host. */
  host: string | null | undefined;
}

export interface SameOriginResult {
  ok: boolean;
  /** Only set on deny. Always the stable string 'csrf'. */
  reason?: "csrf";
}

/**
 * PURE same-origin decision:
 *   • safe method (GET/HEAD/OPTIONS) → allow.
 *   • Origin header present → allow iff its host equals our request host.
 *   • Origin absent, Referer present → allow iff the Referer's host equals ours.
 *   • both absent → DENY ('csrf').  (Fail-closed: PM ruling.)
 * A missing/empty host on our side, or an unparseable origin/referer, denies.
 */
export function sameOriginGate(input: SameOriginInput): SameOriginResult {
  const method = (input.method ?? "").toString().trim().toUpperCase();
  // A missing method is treated as unsafe (fail-closed) rather than skipped.
  if (method && SAFE_METHODS.has(method)) return { ok: true };

  const host = (input.host ?? "").toString().trim();
  if (!host) return { ok: false, reason: "csrf" };

  const origin = (input.origin ?? "").toString().trim();
  if (origin) {
    // Some agents send Origin: "null" (e.g. sandboxed iframe) — never ours.
    const oh = urlHost(origin);
    return oh && oh === host ? { ok: true } : { ok: false, reason: "csrf" };
  }

  const referer = (input.referer ?? "").toString().trim();
  if (referer) {
    const rh = urlHost(referer);
    return rh && rh === host ? { ok: true } : { ok: false, reason: "csrf" };
  }

  // Neither Origin nor Referer on a mutating cookie-authed request → refuse.
  return { ok: false, reason: "csrf" };
}
