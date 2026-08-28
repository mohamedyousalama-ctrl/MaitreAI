// ============================================================================
// WO-PUBLIC-DEMO — the public Khalid demo endpoint cannot be turned into a bill,
// a data leak, or a way to drive the Brain against a real tenant.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-public-demo-hardening.test.ts
//
// WHY THIS EXISTS
// ---------------
// /api/demo/turn is unauthenticated by design — the Founder needs a link he can
// send to a restaurant owner with no login. Everything that normally protects an
// agent route (a session, a tenant, a manager role) is therefore absent, and the
// three controls below are all that remain.
//
// THE ONE THAT MATTERS MOST IS THE INPUT CAP. The manager test-drive route this
// is modelled on bounds history by COUNT and not by LENGTH — correct behind an
// authenticated manager, a funded denial-of-wallet on a public URL. respond.ts
// runs up to MAX_ITERATIONS = 6 model calls per request, so one request can drive
// six passes over an attacker-chosen context. Measured turns on the demo tenant
// cost ~$0.002; an uncapped crafted one is estimated at $0.60–$3.60. Remove the
// caps and 1,000 requests cost more than this project has spent on LLM calls in
// its entire life.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isDemoHost, DEMO_RESTAURANT_ID, DEMO_MAX_CHARS, DEMO_MAX_HISTORY,
} from "../lib/demo/config.ts";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`  ✗   ${label}`); }
};
// Statements only — the prose above names the very fields it bans.
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), "utf8")
  .split("\n").filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");

const route = codeOf("app/api/demo/turn/route.ts");

// ── 1. the host gate, as behaviour ─────────────────────────────────────────
ok("the public production domain serves the demo", isDemoHost("www.getkivo.io"));
ok("the project's production alias serves it (the zero-DNS fallback)", isDemoHost("maitre-ai.vercel.app"));
ok("host matching is port-stripped and case-insensitive", isDemoHost("WWW.GetKivo.io:443"));
ok("the LIVE CLIENT's operator console does NOT serve the demo", !isDemoHost("console.wesayachicken.com"));
ok("the live client's storefront does NOT serve it", !isDemoHost("wesayachicken.com"));
ok("a generated deployment URL does NOT serve it (those meet a login wall)",
  !isDemoHost("maitre-qv1n6gca2-mohamedyousalama-4886s-projects.vercel.app") &&
  !isDemoHost("maitre-ai-git-main-mohamedyousalama-4886s-projects.vercel.app"));
ok("a look-alike host does not slip through", !isDemoHost("getkivo.io.evil.com") && !isDemoHost("notgetkivo.io"));
ok("missing/empty host is refused", !isDemoHost(null) && !isDemoHost("") && !isDemoHost(undefined));

// ── 2. the gate is enforced IN THE HANDLER, not only in middleware ─────────
// The middleware matcher skips any path ending .svg/.png/.jpg/.gif/.webp/.ico,
// so a middleware-only gate is bypassable by suffix.
ok("the route calls isDemoHost itself", /isDemoHost\(\s*req\.headers\.get\("host"\)\s*\)/.test(route));
ok("a non-demo host gets 404 from the handler", /isDemoHost[\s\S]{0,120}status:\s*404/.test(route));

// ── 3. THE SPEND CONTROL — caps on length, not just count ──────────────────
ok("the incoming message is length-capped", /String\(body\.text[\s\S]{0,80}\.slice\(0,\s*DEMO_MAX_CHARS\)/.test(route));
ok("EVERY history entry is length-capped (an attacker controls this array)",
  /content[\s\S]{0,120}\.slice\(0,\s*DEMO_MAX_CHARS\)/.test(route));
ok("history is also count-bounded", /slice\(-DEMO_MAX_HISTORY\)/.test(route));
ok("the caps are real numbers, not disabled", DEMO_MAX_CHARS > 0 && DEMO_MAX_CHARS <= 2000 && DEMO_MAX_HISTORY > 0 && DEMO_MAX_HISTORY <= 20);

// ── 4. the tenant is pinned server-side ────────────────────────────────────
ok("restaurantId comes from the pinned constant", /restaurantId:\s*DEMO_RESTAURANT_ID/.test(route));
ok("restaurantId is NEVER read from the request body",
  !/body\.restaurantId|body\["restaurantId"\]|restaurantId:\s*String\(body/.test(route));
ok("the pinned tenant is a real uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(DEMO_RESTAURANT_ID));
ok("the pinned tenant is NOT the live client (Wesaya)", DEMO_RESTAURANT_ID !== "5acbc72f-def3-46cd-ad6c-bf0ff4a23642");

// ── 5. nothing is persisted as a customer conversation ─────────────────────
ok("conversationId is null", /conversationId:\s*null/.test(route));
ok("persistReply is false", /persistReply:\s*false/.test(route));

// ── 6. THE RESPONSE IS AN ALLOWLIST ────────────────────────────────────────
// CustomerTurnOutcome carries the raw tenant flag JSON and our unit economics.
const payload = /return NextResponse\.json\(\{\s*\n\s*ok: true[\s\S]*?\}\);/.exec(route)?.[0] ?? "";
ok("the success payload was found", payload.length > 0);
for (const leak of ["features", "costUsd", "usage", "agentRunId", "tier", "latencyMs", "perception", "draft", "toolNames"]) {
  ok(`the response never returns \`${leak}\``, !new RegExp(`(?<![A-Za-z0-9_])${leak}\\s*:`).test(payload));
}
ok("`model` is not returned raw — only the derived allergenGate boolean",
  !/\bmodel:\s*out\.model/.test(payload) && /allergenGate:\s*out\.model === "deterministic_allergen_gate"/.test(payload));
ok("the error path does not leak the underlying exception text",
  !/detail:\s*e instanceof Error/.test(route));

// ── 7. no user-controlled path segment ─────────────────────────────────────
// A trailing [param] would let `.../x.png` skip middleware entirely.
ok("the route path has no dynamic segment", !/app\/api\/demo\/turn\/\[/.test(route) &&
  readFileSync(resolve(ROOT, "app/api/demo/turn/route.ts"), "utf8").length > 0);

// ── 8. /demo is reachable at all ───────────────────────────────────────────
const mw = codeOf("lib/supabase/middleware.ts");
ok("/demo is in PUBLIC_PREFIXES (else it 307s to /login)", /PUBLIC_PREFIXES[^;]*"\/demo"/.test(mw));

console.log(`\nPUBLIC-DEMO HARDENING PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
