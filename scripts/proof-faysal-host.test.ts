// ============================================================================
// فيصل / Faysal — PROOF that the demo hostname is a one-page host.
//
// WHY THIS FILE EXISTS. The link handed to a clinic manager is short, permanent,
// public and forwardable. The deployment behind it is the WHOLE product: the
// operator console, the Wesaya storefront, ~36 API families, the cron entrypoint.
// The only thing standing between that hostname and all of it is the `faysal`
// branch in middleware.ts. A branch is not a guarantee; a proof is. So this file
// drives the REAL exported `middleware()` — not a copy of its logic — over a grid
// of paths and asserts, path by path, that exactly three of them answer and every
// other one is a hard 404.
//
// The request stand-in is duck-typed (`headers.get` + a `nextUrl` that clones)
// because Next's own NextRequest does not populate `nextUrl` outside the Next
// runtime. Everything the branch actually reads — the Host header, the pathname,
// url.clone() — is real, and the response is a real NextResponse, so what is
// asserted here is the shipped control flow and the shipped status codes.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-faysal-host.test.ts
// ============================================================================

import { hostMapping } from "@/lib/domains";
import { middleware } from "@/middleware";

let pass = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else failures.push(name);
};

// --- The request stand-in -------------------------------------------------
function nextUrlLike(href: string): any {
  const u: any = new URL(href);
  u.clone = () => nextUrlLike(u.href);
  return u;
}
function req(host: string, path: string): any {
  return { headers: new Headers({ host }), nextUrl: nextUrlLike(`https://${host}${path}`) };
}

type Verdict =
  | { kind: "rewrite"; to: string }
  | { kind: "redirect"; to: string; status: number }
  | { kind: "next" }
  | { kind: "status"; status: number };

function read(res: any): Verdict {
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) return { kind: "rewrite", to: new URL(rewrite).pathname };
  if (res.status >= 300 && res.status < 400 && res.headers.get("location"))
    return { kind: "redirect", to: new URL(res.headers.get("location")).pathname, status: res.status };
  if (res.headers.get("x-middleware-next") === "1") return { kind: "next" };
  return { kind: "status", status: res.status };
}

const call = async (host: string, path: string) => read(await middleware(req(host, path)));

const FAYSAL_HOSTS = ["faysal.maitre.chat", "faysal.getkivo.io"];

// --- 1. The map itself ----------------------------------------------------
for (const h of FAYSAL_HOSTS) {
  ok(`${h} is a faysal host`, hostMapping(h)?.kind === "faysal");
  ok(`${h.toUpperCase()} (case) is a faysal host`, hostMapping(h.toUpperCase())?.kind === "faysal");
  ok(`${h}:443 (port) is a faysal host`, hostMapping(`${h}:443`)?.kind === "faysal");
}
// A near-miss hostname must NOT inherit the demo host's behaviour.
for (const h of ["maitre.chat", "getkivo.io", "www.maitre.chat", "faysal.maitre.chat.evil.com", "xfaysal.maitre.chat", "faysal.example.com"]) {
  ok(`${h} is NOT a faysal host`, hostMapping(h)?.kind !== "faysal");
}

// --- 2. The three paths that answer --------------------------------------
for (const host of FAYSAL_HOSTS) {
  const root = await call(host, "/");
  ok(`${host} "/" rewrites`, root.kind === "rewrite");
  ok(`${host} "/" rewrites to /faysal`, root.kind === "rewrite" && root.to === "/faysal");

  const page = await call(host, "/faysal");
  ok(`${host} "/faysal" redirects`, page.kind === "redirect");
  ok(`${host} "/faysal" redirects to "/"`, page.kind === "redirect" && page.to === "/");

  for (const p of ["/api/faysal/turn", "/api/faysal/reset"]) {
    const r = await call(host, p);
    ok(`${host} ${p} passes through`, r.kind === "next");
  }
}

// --- 3. Everything else is 404 -------------------------------------------
// Deliberately includes: the console, auth, the other tenant's storefront, the
// cron entrypoint, admin, every API family that is NOT Faysal's two endpoints,
// path-traversal shapes, prefix look-alikes, and case variants (the pathname
// comparison is exact on purpose — /API/FAYSAL/TURN must not open the endpoint).
const MUST_404 = [
  "/dashboard", "/login", "/logout", "/signup", "/menu", "/cod", "/deliveries",
  "/order/wesaya", "/demo", "/maitre", "/settings", "/onboarding",
  "/api/orders", "/api/admin", "/api/admin/tenants", "/api/cron/retry-jobs",
  "/api/whatsapp", "/api/agent/promo", "/api/demo", "/api/health", "/api/session",
  "/api/storefront", "/api/customers", "/api/brain", "/api/knowledge", "/api/monitor",
  "/api/faysal", "/api/faysal/", "/api/faysal/turn/", "/api/faysal/turn/x",
  "/api/faysal/other", "/api/faysalx/turn", "/api/faysal/../orders",
  "/API/FAYSAL/TURN", "/Api/Faysal/Turn", "/FAYSAL", "/faysal/",
  "/faysal/anything", "/_next/data/x.json", "/robots.txt", "/sitemap.xml", "/",
].filter((p) => p !== "/");

for (const host of FAYSAL_HOSTS) {
  for (const p of MUST_404) {
    const r = await call(host, p);
    ok(`${host} ${p} → 404`, r.kind === "status" && r.status === 404);
  }
}

// The 404 must not be indexable and must not be cached.
{
  const res: any = await middleware(req("faysal.maitre.chat", "/dashboard"));
  ok("404 carries noindex", (res.headers.get("x-robots-tag") ?? "").includes("noindex"));
  ok("404 is no-store", (res.headers.get("cache-control") ?? "").includes("no-store"));
}

// --- 4. No regression on the hosts that already existed ------------------
{
  const store = await call("wesayachicken.com", "/");
  ok("wesaya storefront root still rewrites to /order/wesaya", store.kind === "rewrite" && store.to === "/order/wesaya");

  const op = await call("console.wesayachicken.com", "/");
  ok("operator root still redirects to /login", op.kind === "redirect" && op.to === "/login");

  // An unmapped host must fall through untouched — never into the faysal branch.
  const other = await call("maitre.chat", "/dashboard");
  ok("unmapped host is not 404'd by the faysal branch", other.kind !== "status");

  // And a NON-root path on a storefront host must still fall through (checkout).
  const checkout = await call("wesayachicken.com", "/api/orders");
  ok("storefront non-root still falls through", checkout.kind !== "status");
}

// --- Report ---------------------------------------------------------------
console.log(`proof-faysal-host: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
