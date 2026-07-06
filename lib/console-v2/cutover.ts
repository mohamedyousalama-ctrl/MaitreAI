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
  // No dedicated /c surface yet — fold to the operating home (Live Shift).
  "/cod": "/c/shift",
  "/cod/close": "/c/shift",
  "/deliveries": "/c/shift",
};

/** Map a legacy (console) pathname to its console_v2 (/c) target. */
export function mapLegacyToConsoleV2(pathname: string): string {
  const clean = (pathname || "").replace(/\/+$/, "") || "/";
  // Kitchen ticket keeps its order id: /orders/<id>/ticket → /c/orders/<id>/ticket.
  const ticket = clean.match(/^\/orders\/([^/]+)\/ticket$/);
  if (ticket) return `/c/orders/${ticket[1]}/ticket`;
  return EXACT[clean] ?? "/c";
}
