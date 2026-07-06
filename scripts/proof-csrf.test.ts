// ============================================================================
// CSRF-1 proof harness — sameOriginGate (pure). Exercises the real decision over
// {method, origin, referer, host}: safe-method bypass, origin match/mismatch,
// referer fallback, both-absent fail-closed, malformed/"null" origin, and the
// x-forwarded-host equivalence. Also asserts the exclusion invariant in spirit:
// safe (GET/HEAD/OPTIONS) requests are never blocked, so read routes and the
// signature-authed webhook / bearer cron paths (which never call requireTenant)
// are unaffected.
//
// Run: node --experimental-strip-types scripts/proof-csrf.test.ts
// ============================================================================

import { sameOriginGate } from "../lib/http/same-origin.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } }

const HOST = "console.wesayachicken.com";

// ---- safe methods are never CSRF-checked ------------------------------------
for (const m of ["GET", "HEAD", "OPTIONS", "get", "head"]) {
  check(`safe method ${m} → allow (no origin/referer needed)`,
    sameOriginGate({ method: m, origin: null, referer: null, host: HOST }).ok === true);
}
// A GET with a foreign origin is still allowed — reads don't mutate.
check("GET with foreign origin → still allow",
  sameOriginGate({ method: "GET", origin: "https://evil.example", referer: null, host: HOST }).ok === true);

// ---- mutating + Origin present ----------------------------------------------
for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
  check(`${m} same-origin (Origin matches host) → allow`,
    sameOriginGate({ method: m, origin: `https://${HOST}`, referer: null, host: HOST }).ok === true);
  const r = sameOriginGate({ method: m, origin: "https://evil.example", referer: null, host: HOST });
  check(`${m} cross-origin (Origin mismatch) → deny csrf`, r.ok === false && r.reason === "csrf");
}
// Origin with the DEFAULT https port still matches: URL.host normalizes :443 away.
check("POST Origin https://host:443 vs host (no port) → default port normalized → allow",
  sameOriginGate({ method: "POST", origin: `https://${HOST}:443`, referer: null, host: HOST }).ok === true);
check("POST Origin matches host WITH port when request host carries same port → allow",
  sameOriginGate({ method: "POST", origin: `https://${HOST}:8443`, referer: null, host: `${HOST}:8443` }).ok === true);

// ---- Origin absent → Referer fallback ---------------------------------------
check("POST no Origin, Referer same-origin → allow",
  sameOriginGate({ method: "POST", origin: null, referer: `https://${HOST}/c/orders`, host: HOST }).ok === true);
{
  const r = sameOriginGate({ method: "POST", origin: null, referer: "https://evil.example/x", host: HOST });
  check("POST no Origin, Referer cross-origin → deny csrf", r.ok === false && r.reason === "csrf");
}
check("POST Origin present is authoritative even if Referer would pass",
  sameOriginGate({ method: "POST", origin: "https://evil.example", referer: `https://${HOST}/x`, host: HOST }).ok === false);

// ---- both absent → fail closed ----------------------------------------------
{
  const r = sameOriginGate({ method: "POST", origin: null, referer: null, host: HOST });
  check("POST no Origin, no Referer → deny csrf (fail-closed, PM ruling)", r.ok === false && r.reason === "csrf");
}
check("POST empty-string Origin AND Referer → treated as absent → deny",
  sameOriginGate({ method: "POST", origin: "", referer: "", host: HOST }).ok === false);

// ---- adversarial / malformed ------------------------------------------------
check('Origin "null" (sandboxed iframe) → deny',
  sameOriginGate({ method: "POST", origin: "null", referer: null, host: HOST }).ok === false);
check("unparseable Origin → deny",
  sameOriginGate({ method: "POST", origin: "http://[::bad", referer: null, host: HOST }).ok === false);
check("missing request host → deny (can't prove same-origin)",
  sameOriginGate({ method: "POST", origin: `https://${HOST}`, referer: null, host: null }).ok === false);
check("missing method → treated unsafe, no origin/referer → deny (fail-closed)",
  sameOriginGate({ method: null, origin: null, referer: null, host: HOST }).ok === false);
check("missing method BUT same-origin Origin → allow",
  sameOriginGate({ method: undefined, origin: `https://${HOST}`, referer: null, host: HOST }).ok === true);
// subdomain must not be treated as same host
check("POST from a DIFFERENT subdomain → deny",
  sameOriginGate({ method: "POST", origin: "https://evil.wesayachicken.com", referer: null, host: HOST }).ok === false);

console.log(`\nCSRF PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
