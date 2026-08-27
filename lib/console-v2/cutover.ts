// ============================================================================
// console_v2 — CUTOVER-1 legacy→/c path mapping (pure). The single source of
// truth for what the old console layout does with a console_v2 flag-ON tenant.
//
// THE RULE (revised 2026-08-26): a legacy page is folded to /c ONLY when a real
// /c surface replaces it. Where none exists, the legacy page RENDERS — it is not
// bounced to an unrelated screen.
//
// The original design folded everything, so "never stranded on a legacy page"
// was achieved by sending operators somewhere that could not do their job:
// /orders (1,202 lines — the order book, drawer, POS hand-off, driver assign,
// pay link), /cod + /cod/close (cash capture and shift close) and /deliveries
// (450 lines — create delivery, add driver, map pin, driver + tracking links,
// reassign) all landed on Live Shift, which is an exception-triage queue and
// carries none of that. The tenant was not stranded; they were stranded
// somewhere else. Wesaya has real cash flowing through it and had no screen to
// settle a driver.
//
// So KEEP_LEGACY below is not a to-do list. It is the set of pages where the
// classic console is still the product, and folding them loses capability.
//
// Anything unmapped and not in KEEP_LEGACY still falls to `/c`, so an unknown
// legacy route is never a dead end.
//
// Pure so the redirect and its test share one source of truth.
// ============================================================================

/**
 * Legacy paths that must RENDER, not redirect: no /c surface replaces them.
 * Removing an entry here silently removes an operator capability — check that a
 * real /c equivalent exists first, and update cutover.test.ts, which pins this.
 */
const KEEP_LEGACY: ReadonlySet<string> = new Set([
  "/orders",     // the order book. /c/shift is a triage queue, not a replacement.
  "/dashboard",  // no /c equivalent; Live Shift answers a different question.
  "/cod",        // cash capture — console_v2 has no cash surface at all.
  "/cod/close",  // shift close — same.
  "/deliveries", // /c/deliveries exists but is a 156-line read-only board; the
                 // classic page (450 lines) is the one with driver management,
                 // driver + customer links, and reassignment.
]);

/** Legacy paths where a real /c surface replaces the classic page. */
const EXACT: Readonly<Record<string, string>> = {
  "/conversations": "/c/conversations",
  "/customers": "/c/customers",
  "/settings": "/c/settings",
  "/menu": "/c/knowledge",
  "/team": "/c/team",
  "/insights": "/c/insights",
};

/**
 * Map a legacy (console) pathname to its console_v2 (/c) target.
 *
 * @returns the /c path to redirect to, or `null` to RENDER the legacy page.
 */
export function mapLegacyToConsoleV2(pathname: string): string | null {
  const clean = (pathname || "").replace(/\/+$/, "") || "/";
  if (KEEP_LEGACY.has(clean)) return null;
  // Kitchen ticket keeps its order id: /orders/<id>/ticket → /c/orders/<id>/ticket.
  // This one DOES have a /c surface and stays folded, even though /orders itself
  // no longer does — the ticket is a standalone print view, not the order book.
  const ticket = clean.match(/^\/orders\/([^/]+)\/ticket$/);
  if (ticket) return `/c/orders/${ticket[1]}/ticket`;
  return EXACT[clean] ?? "/c";
}

/** True when this legacy path renders instead of redirecting. */
export function rendersLegacy(pathname: string): boolean {
  return mapLegacyToConsoleV2(pathname) === null;
}
