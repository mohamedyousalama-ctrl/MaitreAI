// ============================================================================
// WO-LOGIN-CLEANUP guarantee — a host-pinned operator subdomain resolves to its
// tenant REGARDLESS of any active-restaurant cookie. This is the byte-identical
// promise for Wesaya: adding a tenant switcher (which sets the cookie) must NEVER
// change what console.wesayachicken.com serves.
//
// Binds to the REAL hostMapping (lib/domains) so the Wesaya→restaurantId binding is
// verified against production data, not a copy. The precedence expression mirrors
// getServerTenant/getBrowserTenant exactly: `hostRid ?? cookieRid`.
//
// Run: node --experimental-strip-types scripts/test-host-pin-wesaya.test.ts
// ============================================================================

import { hostMapping } from "../lib/domains.ts";

const WESAYA_RID = "5acbc72f-def3-46cd-ad6c-bf0ff4a23642";
const WESAYA_HOST = "console.wesayachicken.com";

// The EXACT precedence used by getServerTenant() / getBrowserTenant(): a host pin
// (operator mapping) wins; otherwise the cookie selection is honored.
function resolvedActiveId(host: string | null, cookieRid: string | null): string | null {
  const m = hostMapping(host);
  const hostRid = m?.kind === "operator" ? (m.restaurantId ?? null) : null;
  return hostRid ?? cookieRid;
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.error("  FAIL ", n); } };

// --- The binding itself (guards against a stray edit to the host map) ---
const m = hostMapping(WESAYA_HOST);
ok("console.wesayachicken.com is an operator pin", m?.kind === "operator");
ok("…pinned to the real Wesaya restaurant id", m?.kind === "operator" && m.restaurantId === WESAYA_RID);

// --- The guarantee: host pin beats the cookie, every combination ---
ok("no cookie → Wesaya", resolvedActiveId(WESAYA_HOST, null) === WESAYA_RID);
ok("cookie for ANOTHER tenant → still Wesaya (host wins)", resolvedActiveId(WESAYA_HOST, "rid-SOMEWHERE-ELSE") === WESAYA_RID);
ok("cookie for Wesaya itself → Wesaya", resolvedActiveId(WESAYA_HOST, WESAYA_RID) === WESAYA_RID);
ok("empty-string cookie → still Wesaya", resolvedActiveId(WESAYA_HOST, "") === WESAYA_RID);

// --- The other side: where there's NO host pin, the cookie IS honored (the switcher
//     only works on the non-pinned host, e.g. getkivo.io) ---
ok("non-pinned host + cookie → cookie honored", resolvedActiveId("getkivo.io", "rid-CHOSEN") === "rid-CHOSEN");
ok("non-pinned host + no cookie → null (→ picker)", resolvedActiveId("getkivo.io", null) === null);

// --- A storefront host is not an operator pin (never resolves a console tenant) ---
ok("storefront host is not an operator pin", (() => { const s = hostMapping("wesayachicken.com"); return !s || s.kind !== "operator"; })());

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
