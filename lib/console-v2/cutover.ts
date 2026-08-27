// ============================================================================
// console_v2 — CUTOVER-1 legacy→/c path mapping (pure). A console_v2 flag-ON tenant
// is redirected from every legacy (console) page to its /c equivalent by the old
// console layout; this is the single source of truth for that mapping.
//
// Design: leaf names line up (/conversations ↔ /c/conversations), with a few
// deliberate folds (/orders + /dashboard → the /c home is Live Shift; /menu →
// Knowledge). The kitchen-ticket route keeps its dynamic id. Anything unmapped
// falls to `/c`, which itself forwards to /c/shift — so a flag-on tenant is NEVER
// stranded on a legacy page, even for a route we didn't enumerate.
//
// Pure so the redirect and its test share one source of truth.
// ============================================================================

const EXACT: Readonly<Record<string, string>> = {
  "/dashboard": "/c/shift",
  "/orders": "/c/shift",
  "/conversations": "/c/conversations",
  "/customers": "/c/customers",
  "/settings": "/c/settings",
  "/menu": "/c/knowledge",
  "/team": "/c/team",
  "/insights": "/c/insights",
  // Cash has no /c surface at all — console_v2's scope law ends at confirmed
  // order + kitchen handoff, so these genuinely fold to the operating home. A
  // flag-on tenant therefore has NO cash-settlement screen; that is a product
  // gap, recorded here so the fold is not mistaken for a routing accident.
  "/cod": "/c/shift",
  "/cod/close": "/c/shift",
  // Deliveries DOES have a /c surface — app/(console-v2)/c/(app)/(manager)/
  // deliveries, which lib/console-v2/nav.ts already links as `ready: true`. This
  // entry used to fold to /c/shift under a "no dedicated /c surface yet" comment
  // that went stale when that page was built, so anyone following a legacy
  // /deliveries link landed on Live Shift instead of the board their own nav
  // points at. The target is manager-only, and the (manager) layout is the
  // authoritative role gate — an `operation` member is redirected there before
  // the page renders, so this mapping cannot expose a manager surface.
  "/deliveries": "/c/deliveries",
};

/** Map a legacy (console) pathname to its console_v2 (/c) target. */
export function mapLegacyToConsoleV2(pathname: string): string {
  const clean = (pathname || "").replace(/\/+$/, "") || "/";
  // Kitchen ticket keeps its order id: /orders/<id>/ticket → /c/orders/<id>/ticket.
  const ticket = clean.match(/^\/orders\/([^/]+)\/ticket$/);
  if (ticket) return `/c/orders/${ticket[1]}/ticket`;
  return EXACT[clean] ?? "/c";
}
