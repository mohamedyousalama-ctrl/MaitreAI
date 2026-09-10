// ============================================================================
// فيصل / Faysal — PROOF that the demo hostname is a one-page host.
//
// WHY THIS FILE EXISTS. The link handed to a clinic manager is short, permanent,
// public and forwardable. The deployment behind it is the WHOLE product: the
// operator console, the Wesaya storefront, ~36 API families, the cron entrypoint.
// The only thing standing between that hostname and all of it is the `faysal`
// branch in middleware.ts. A branch is not a guarantee; a proof is.
//
// The security property is `config.matcher ∧ the faysal branch`, and BOTH halves
// are proved here. A path excluded by the matcher never reaches the branch at all,
// so asserting only that the branch 404s it would leave the half that decides
// whether the branch even runs unproven — and a later matcher exclusion, or a new
// catch-all route, would open a silent hole with every branch assertion still green.
// So each forbidden path is asserted TWICE: the matcher matches it, AND the
// middleware 404s it.
//
// The forbidden list is DERIVED from the app tree (every app/**/route.ts and
// app/**/page.tsx on disk, minus the paths the demo is allowed), not typed out by
// hand, so it cannot drift as routes are added. A hand-written list of awkward
// shapes is appended on top.
//
// ON MODELLING THE MATCHER AS A BARE RegExp. Next does not compile config.matcher
// verbatim — getMiddlewareMatchers splices in an optional `_next/data/<id>` prefix
// and an optional `.json` suffix before path-to-regexp. For THIS matcher (one
// entry, trailing `.*`, no basePath, no i18n) the two models were compared across
// every path asserted below and disagreed nowhere: the extra optional groups are
// absorbed by the trailing `.*`. That equivalence is a property of this matcher's
// shape, not a general one, so section 2 pins the shape — one entry, and a
// next.config with neither basePath nor i18n — rather than deep-importing a Next
// build internal, which would be its own fragility.
//
// The request stand-in is duck-typed (`headers.get` + a `nextUrl` that clones)
// because Next's own NextRequest does not populate `nextUrl` outside the Next
// runtime. Everything the branch actually reads — the Host header, the pathname,
// the query string, url.clone() — is real, and the response is a real NextResponse
// (see REAL_NEXT_SERVER in scripts/webhook-route-hooks.mjs), so what is asserted
// here is the shipped control flow and the shipped status codes.
//
// Run (the env var is REQUIRED — the project's next/server stub has no
// NextResponse.rewrite, and without it this file dies inside middleware.ts):
//   REAL_NEXT_SERVER=1 node --import ./scripts/webhook-route-loader.mjs \
//     --experimental-strip-types scripts/proof-faysal-host.test.ts
// ============================================================================

import { readdirSync } from "node:fs";
import { hostMapping } from "@/lib/domains";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { middleware, config } from "@/middleware";

let pass = 0;
const failures: string[] = [];
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else failures.push(name);
};

// --- Preconditions --------------------------------------------------------
// Without REAL_NEXT_SERVER=1 the loader hands middleware.ts the project's minimal
// next/server stub, which has no `rewrite`. The failure then surfaces as
// "NextResponse.rewrite is not a function" INSIDE middleware.ts and reads like a
// product bug. Say what it actually is, before a single assertion runs.
{
  const { NextResponse } = await import("next/server");
  if (typeof (NextResponse as any).rewrite !== "function") {
    console.error(
      "proof-faysal-host: next/server is the stub, not the real module. Re-run with " +
        "REAL_NEXT_SERVER=1 (see the header of this file and scripts/webhook-route-hooks.mjs).",
    );
    process.exit(1);
  }
}

// Section 5 reads what an UNMAPPED host does, and on those hosts the middleware
// hands off to updateSession, which the stand-in cannot satisfy. That path is only
// skipped when Supabase is unconfigured, so the meaning of this file must not
// depend on ambient env: refuse to run rather than quietly assert something else.
if (isSupabaseConfigured()) {
  console.error(
    "proof-faysal-host: refusing to run with Supabase env configured — section 5 " +
      "would drive updateSession() with a stand-in request. Unset the Supabase vars.",
  );
  process.exit(1);
}

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
  | { kind: "rewrite"; to: string; search: string }
  | { kind: "redirect"; to: string; search: string; status: number }
  | { kind: "next" }
  | { kind: "status"; status: number };

function read(res: any): Verdict {
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) {
    const u = new URL(rewrite);
    return { kind: "rewrite", to: u.pathname, search: u.search };
  }
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc) {
    const u = new URL(loc);
    return { kind: "redirect", to: u.pathname, search: u.search, status: res.status };
  }
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

// --- 2. The matcher is a real regex and it is the one shipped -------------
ok("config.matcher has exactly one entry", Array.isArray(config.matcher) && config.matcher.length === 1);
{
  // basePath and i18n.locales are both spliced into the matcher source by Next before
  // compilation. Either would make the bare-RegExp model below silently diverge from
  // what Next actually routes, with every assertion still green. Pin their absence.
  const nextConfig: any = (await import("@/next.config.mjs")).default;
  ok("next.config sets no basePath", !nextConfig.basePath);
  ok("next.config sets no i18n locales", !nextConfig.i18n);
}
const MATCHER = new RegExp(`^${(config.matcher as string[])[0]}$`);
// Sanity: the exclusions the middleware comment relies on really are exclusions.
ok("matcher excludes /_next/static chunks", !MATCHER.test("/_next/static/chunks/a.js"));
ok("matcher excludes next/font media", !MATCHER.test("/_next/static/media/ReadexPro.abc.ttf"));
ok("matcher excludes /favicon.ico", !MATCHER.test("/favicon.ico"));
ok("matcher excludes .svg at any depth", !MATCHER.test("/logo-mark.svg"));
ok("matcher DOES match the demo root", MATCHER.test("/"));
ok("matcher DOES match the demo turn endpoint", MATCHER.test("/api/faysal/turn"));

// --- 3. The three paths that answer --------------------------------------
for (const host of FAYSAL_HOSTS) {
  const root = await call(host, "/");
  ok(`${host} "/" rewrites`, root.kind === "rewrite");
  ok(`${host} "/" rewrites to /faysal`, root.kind === "rewrite" && root.to === "/faysal");

  // The App Router's own RSC request rides the SAME pathname with a marker query.
  const rsc = await call(host, "/?_rsc=abc123");
  ok(`${host} RSC request on "/" still rewrites to /faysal`, rsc.kind === "rewrite" && rsc.to === "/faysal");
  ok(`${host} RSC marker survives the rewrite`, rsc.kind === "rewrite" && rsc.search === "?_rsc=abc123");

  const page = await call(host, "/faysal");
  ok(`${host} "/faysal" redirects`, page.kind === "redirect");
  ok(`${host} "/faysal" redirects to "/"`, page.kind === "redirect" && page.to === "/");
  ok(`${host} "/faysal" redirect is 307`, page.kind === "redirect" && page.status === 307);

  // A forwarded link must not carry a stranger's tracking parameters onward.
  const tracked = await call(host, "/faysal?utm_source=whatsapp&x=1");
  ok(`${host} "/faysal?utm…" still redirects to "/"`, tracked.kind === "redirect" && tracked.to === "/");
  ok(`${host} "/faysal?utm…" drops the query string`, tracked.kind === "redirect" && tracked.search === "");

  for (const p of ["/api/faysal/turn", "/api/faysal/reset"]) {
    ok(`${host} ${p} passes through`, (await call(host, p)).kind === "next");
    // Guards the exact-match comparison against being "fixed" into a startsWith:
    // a query string must not change the verdict either way.
    ok(`${host} ${p}?debug=1 passes through`, (await call(host, `${p}?debug=1`)).kind === "next");
  }
}

// --- 4. Everything else is 404, matcher-reachable, on both hosts ----------
// (a) DERIVED from the app tree, so the list cannot go stale as routes are added.
const ALLOWED = new Set(["/", "/faysal", "/api/faysal/turn", "/api/faysal/reset"]);
const CATCH_ALL_ROUTES: string[] = [];
function routePathsOnDisk(): string[] {
  const out = new Set<string>();
  for (const rel of readdirSync("app", { recursive: true, encoding: "utf8" })) {
    const f = rel.replace(/\\/g, "/");
    const m = f.match(/^(.*)\/(route|page)\.tsx?$/) ?? (/^(route|page)\.tsx?$/.test(f) ? ["", "", ""] : null);
    if (!m) continue;
    const dir = m[1] ?? "";
    if (/\[\.\.\./.test(dir)) CATCH_ALL_ROUTES.push(dir); // [...slug] and [[...slug]]
    const url =
      "/" +
      dir
        .split("/")
        // Route groups are not URL segments. Parallel (@slot) and intercepting
        // ((.)foo) segments are NOT stripped here — this tree has none, and if any
        // appear they yield a phantom path that is still matcher-matched and still
        // 404'd, i.e. a false positive, never a false negative.
        .filter((seg) => seg && !/^\(.*\)$/.test(seg))
        .map((seg) => (seg.startsWith("[") ? "x" : seg)) // any dynamic segment → a literal
        .join("/");
    out.add(url);
  }
  return [...out].filter((p) => !ALLOWED.has(p));
}
const DERIVED = routePathsOnDisk();
ok("the app tree yielded a substantial forbidden list", DERIVED.length >= 60);
// THE ASSUMPTION THIS WALK RESTS ON. A catch-all route would answer paths ending in
// .png / .svg / .webp — which config.matcher EXCLUDES, so the middleware never runs
// and the faysal branch cannot 404 them. `/dashboard.svg` would then render that
// catch-all on the demo host with every assertion below still green. The walk cannot
// express that path (it substitutes one literal per dynamic segment), so the
// assumption is pinned here instead of left implied in a comment.
ok("no catch-all route exists (see the note above)", !CATCH_ALL_ROUTES.length);
ok("the derived list includes the console", DERIVED.includes("/dashboard"));
ok("the derived list includes the cron entrypoint", DERIVED.includes("/api/cron/retry-jobs"));
ok("the derived list includes the other tenant's storefront", DERIVED.some((p) => p.startsWith("/order")));

// (b) Awkward shapes a route file would never produce.
const HAND = [
  "/api/faysal", "/api/faysal/", "/api/faysal/turn/", "/api/faysal/turn/x",
  "/api/faysal/other", "/api/faysalx/turn", "/api/faysal//turn", "/api/faysal/%74urn",
  "/API/FAYSAL/TURN", "/Api/Faysal/Turn", "/FAYSAL", "/faysal/", "/faysal/anything",
  "/%2e%2e/api/orders", "/api/faysal/%2e%2e/orders",
  "/_next/data/x.json", "/sitemap.xml", "/manifest.webmanifest",
  "/fonts/ReadexPro.ttf", "/.env", "/.git/config",
];
const MUST_404 = [...DERIVED, ...HAND];

for (const host of FAYSAL_HOSTS) {
  for (const p of MUST_404) {
    ok(`matcher reaches ${p}`, MATCHER.test(p));
    const r = await call(host, p);
    ok(`${host} ${p} → 404`, r.kind === "status" && r.status === 404);
  }
}

// robots.txt says the opposite of a 404: a crawler reads a 404 as "allow all".
for (const host of FAYSAL_HOSTS) {
  const res: any = await middleware(req(host, "/robots.txt"));
  ok(`${host} /robots.txt is served`, res.status === 200);
  ok(`${host} /robots.txt disallows everything`, (await res.text()).includes("Disallow: /"));
}

// The page itself must carry the header half of its noindex promise: Vercel stamps
// x-robots-tag on generated preview URLs but not on a custom domain.
{
  const res: any = await middleware(req("faysal.maitre.chat", "/"));
  ok("the demo rewrite carries x-robots-tag", (res.headers.get("x-robots-tag") ?? "").includes("noindex"));
}

// The 404 must not be indexable and must not be cached.
{
  const res: any = await middleware(req("faysal.maitre.chat", "/dashboard"));
  ok("404 carries noindex", (res.headers.get("x-robots-tag") ?? "").includes("noindex"));
  ok("404 is no-store", (res.headers.get("cache-control") ?? "").includes("no-store"));
}

// --- 5. No regression on the hosts that already existed ------------------
{
  const store = await call("wesayachicken.com", "/");
  ok("wesaya storefront root still rewrites to /order/wesaya", store.kind === "rewrite" && store.to === "/order/wesaya");

  const op = await call("console.wesayachicken.com", "/");
  ok("operator root still redirects to /login", op.kind === "redirect" && op.to === "/login");

  // An unmapped host, and a NON-root path on a storefront host, must both fall
  // THROUGH — `next`, specifically, not merely "not a 404": a host that started
  // redirecting everything would satisfy a weaker assertion.
  ok("unmapped host falls through", (await call("maitre.chat", "/dashboard")).kind === "next");
  ok("storefront non-root falls through (checkout)", (await call("wesayachicken.com", "/api/orders")).kind === "next");
  ok("operator non-root falls through", (await call("console.wesayachicken.com", "/dashboard")).kind === "next");
}

// --- 6. The demo host is CLOSED, not opened, by a misconfigured prod ------
// The fail-closed 503 at the top of middleware.ts runs before the faysal branch,
// and that is deliberate: Faysal's durable daily spend ceiling is Supabase-backed
// (app/api/faysal/_engine/guard.ts), so prod with no Supabase env is a public
// endpoint with no wallet protection. This pins that ordering.
{
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    for (const p of ["/", "/faysal", "/api/faysal/turn"]) {
      const res: any = await middleware(req("faysal.maitre.chat", p));
      ok(`prod + no Supabase: ${p} closes with 503`, res.status === 503);
      // …and says so in the language the clinic manager reads. An English string on
      // an Arabic clinic demo is a worse failure than the outage it reports.
      ok(`prod + no Supabase: ${p} answers in Arabic`, /[\u0600-\u06FF]/.test(await res.text()));
    }
    {
      // Every other host keeps the operator-facing English text.
      const res: any = await middleware(req("console.wesayachicken.com", "/dashboard"));
      ok("prod + no Supabase: other hosts stay English", (await res.text()) === "Service not configured.");
    }
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
  ok("NODE_ENV restored", process.env.NODE_ENV === prev);
  ok("…and the demo answers again", (await call("faysal.maitre.chat", "/")).kind === "rewrite");
}

// --- Report ---------------------------------------------------------------
console.log(`proof-faysal-host: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures.slice(0, 25)) console.error(`  ✗ ${f}`);
  if (failures.length > 25) console.error(`  … and ${failures.length - 25} more`);
  process.exit(1);
}
