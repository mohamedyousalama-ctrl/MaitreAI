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
  DEMO_GLOBAL_DAILY_TURNS, DEMO_PER_IP_TURNS, DEMO_MAX_AUDIO_BYTES, globalBucket, ipBucket,
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

// ── 5. the conversation is an EPHEMERAL, TENANT-VALIDATED demo session ─────
// This assertion used to read `conversationId is null` / `persistReply is false`, and
// that was the defect: passing null meant customer-turn's draft reload never ran, so
// the basket was not state and the agent could never close an order. It now passes a
// session id — and the controls that replace "it is always null" are asserted in full
// by scripts/proof-demo-order.test.ts (validation, alert suppression, TTL sweep).
ok("the route never hardcodes a null conversation any more", !/conversationId:\s*null/.test(route));
ok("the session id is RESOLVED server-side, never taken from the body as given",
  /resolveDemoSession\(admin,\s*body\.conversationId\)/.test(route) &&
  !/conversationId:\s*String\(body|conversationId:\s*body\.conversationId/.test(route));
ok("the reply row is persisted so the basket survives the turn", /persistReply:\s*true/.test(route));
ok("demoRun is still passed alongside it — the two are independent controls",
  /persistReply:\s*true[\s\S]{0,600}demoRun:\s*true/.test(route));

// ── 6. THE RESPONSE IS AN ALLOWLIST ────────────────────────────────────────
// CustomerTurnOutcome carries the raw tenant flag JSON and our unit economics.
// Both public routes return from the same CustomerTurnOutcome, so both need the
// SAME allowlist — asserted by one function called twice. (A hand-rolled second
// check on the voice route let a mutation returning `model: out.model` survive;
// this is that gap closed.)
const LEAKS = ["features", "costUsd", "usage", "agentRunId", "tier", "latencyMs", "perception", "draft", "toolNames"];
function assertPayloadAllowlist(label: string, src: string) {
  // EVERY success payload, not just the first. A route may now return early — the
  // deterministic typed-action rail answers a tap without a model call — and a single
  // `.exec()` matched only that new block, so the MAIN payload stopped being checked at
  // all the moment the rail was added. A leak guard that silently narrows its own scope is
  // worse than no guard, because the suite still reads green.
  const payloads = [...src.matchAll(/return NextResponse\.json\(\{\s*\n\s*ok: true[\s\S]*?\n\s*\}\);/g)].map((m) => m[0]);
  ok(`${label}: at least one success payload was found`, payloads.length > 0);
  payloads.forEach((payload, i) => {
    const where = `${label}[payload ${i + 1}/${payloads.length}]`;
    for (const leak of LEAKS) {
      ok(`${where}: the response never returns \`${leak}\``, !new RegExp(`(?<![A-Za-z0-9_])${leak}\\s*:`).test(payload));
    }
    ok(`${where}: \`model\` is never returned raw`, !/(?<![A-Za-z0-9_])model:/.test(payload));
  });
  // The allergen-gate boolean is DERIVED from `model`; it lives on the model-backed
  // payload, so it is asserted across the file rather than per-payload.
  ok(`${label}: the allergenGate boolean is derived, not the raw model id`,
    /allergenGate:\s*out\.model === "deterministic_allergen_gate"/.test(src));
  ok(`${label}: the error path does not leak the underlying exception text`,
    !/detail:\s*e instanceof Error/.test(src));
}
assertPayloadAllowlist("turn", route);

// ── 7. no user-controlled path segment ─────────────────────────────────────
// A trailing [param] would let `.../x.png` skip middleware entirely.
ok("the route path has no dynamic segment", !/app\/api\/demo\/turn\/\[/.test(route) &&
  readFileSync(resolve(ROOT, "app/api/demo/turn/route.ts"), "utf8").length > 0);

// ── 8. /demo is reachable at all ───────────────────────────────────────────
const mw = codeOf("lib/supabase/middleware.ts");
ok("/demo is in PUBLIC_PREFIXES (else it 307s to /login)", /PUBLIC_PREFIXES[^;]*"\/demo"/.test(mw));

// ── 9. A STRANGER'S WORDS ARE NOT KEPT ─────────────────────────────────────
// The demo is public, so the people typing into it are not any tenant's customers
// and their words are not ours to keep. `agent_runs.input`/`.output` and
// `conversation_signals.detail` (which carries the matched allergen term) are the
// three places a turn would otherwise persist verbatim text.
//
// The agent_runs ROW is still written, with cost. That is deliberate and is asserted
// below: lib/monitoring/sweep.ts sums agent_runs.cost_usd for the daily-spend alert,
// so dropping the row would blind the only spend monitor that exists — on the one
// surface anyone can call. Keep the accounting, drop the person.
const turn = codeOf("lib/ai/customer-turn.ts");

ok("the demo turn declares demoRun", /demoRun:\s*true/.test(route));
ok("CustomerTurnInput carries an optional demoRun flag", /demoRun\?:\s*boolean;/.test(turn));

// There are TWO agent_runs inserts and the ERROR one appears first in the file, so a
// lazy match lands on a block with no `output` and no `cost_usd`. Select the SUCCESS
// insert explicitly by the column only it has. (The first version of this assertion
// matched the wrong block and reported a false failure — pinned here so it stays fixed.)
const successInsert = [...turn.matchAll(/\.from\("agent_runs"\)\s*\n?\s*\.insert\(\{[\s\S]*?\n\s*\}\)/g)]
  .map((m) => m[0]).find((b) => /cost_usd:/.test(b)) ?? "";
ok("the agent_runs SUCCESS insert was found (the one carrying cost_usd)", successInsert.length > 0);
ok("it is genuinely the success insert, not the error insert", !/error:\s*message/.test(successInsert));
ok("the visitor's verbatim message is NOT written on a demo turn",
  /input:\s*input\.demoRun\s*\?\s*null\s*:\s*input\.userMessage/.test(successInsert));
ok("the reply is NOT written on a demo turn",
  /output:\s*input\.demoRun\s*\?\s*null\s*:\s*result\.reply/.test(successInsert));
ok("the COST is still written on a demo turn (the spend monitor must still see it)",
  /cost_usd:\s*cost/.test(successInsert));

ok("the error path also withholds the verbatim message on a demo turn",
  /input:\s*input\.demoRun\s*\?\s*null\s*:\s*input\.userMessage,\s*\n\s*error:/.test(turn));

ok("conversation_signals (which carries the matched allergen term) is skipped on a demo turn",
  /if\s*\(result\.signals\.length\s*&&\s*!input\.demoRun\)/.test(turn));

// The flag must be OPT-IN: normal tenant traffic keeps writing exactly as before.
ok("demoRun is opt-in — nothing defaults it to true",
  !/demoRun\s*=\s*true/.test(turn) && !/demoRun\s*\?\?\s*true/.test(turn));

// ── 10. THE DURABLE CAP ────────────────────────────────────────────────────
// Everything else is a speed bump. lib/rate-limit is a process-local Map that
// resets on cold start and is not shared across lambdas, so on serverless an
// attacker gets roughly (limit x warm instances). The database guard (migration
// 0119) is the only thing that actually bounds spend.
ok("the route calls the durable guard", /rpc\("kv_demo_try_consume"/.test(route));
ok("the guard runs BEFORE the model call",
  route.indexOf("kv_demo_try_consume") < route.indexOf("runCustomerTurn("));
ok("the guard FAILS CLOSED — a guard error refuses the turn, it does not spend",
  /if\s*\(guardErr\s*\|\|\s*!guard\)[\s\S]{0,200}status:\s*503/.test(route));
ok("a denied turn is refused", /if\s*\(!guard\.allowed\)/.test(route));
ok("a deliberately stopped demo is distinguishable from a quota trip",
  /guard\.reason === "disabled"/.test(route));
ok("the response never leaks the counts back to the caller",
  !/global_turns/.test(/return NextResponse\.json\(\s*\{ error: stopped[\s\S]*?\);/.exec(route)?.[0] ?? ""));

// Both ceilings must be real, and the global one must be the binding constraint —
// a per-IP limit alone is defeated by any number of source addresses.
ok("a global daily ceiling exists and is a sane number",
  Number.isInteger(DEMO_GLOBAL_DAILY_TURNS) && DEMO_GLOBAL_DAILY_TURNS > 0 && DEMO_GLOBAL_DAILY_TURNS <= 100_000);
ok("both ceilings are passed to the guard",
  /p_global_limit:\s*DEMO_GLOBAL_DAILY_TURNS/.test(route) && /p_ip_limit:\s*DEMO_PER_IP_TURNS/.test(route));
ok("the per-IP ceiling is tighter than the global one", DEMO_PER_IP_TURNS < DEMO_GLOBAL_DAILY_TURNS);

// Bucket keys decide WHEN a cap resets, so they are behaviour, not formatting.
const t1 = new Date("2026-08-28T14:31:00Z");
const t2 = new Date("2026-08-28T14:59:59Z");
const t3 = new Date("2026-08-28T15:00:00Z");
const t4 = new Date("2026-08-29T00:00:00Z");
ok("the global bucket is per UTC DAY", globalBucket(t1) === "global:2026-08-28" && globalBucket(t3) === "global:2026-08-28");
ok("the global bucket rolls at UTC midnight", globalBucket(t4) === "global:2026-08-29");
ok("the ip bucket is per UTC HOUR and includes the address",
  ipBucket("1.2.3.4", t1) === "ip:1.2.3.4:2026-08-28T14");
ok("the ip bucket holds across the hour", ipBucket("1.2.3.4", t1) === ipBucket("1.2.3.4", t2));
ok("the ip bucket rolls at the hour", ipBucket("1.2.3.4", t2) !== ipBucket("1.2.3.4", t3));
ok("different addresses get different buckets", ipBucket("1.2.3.4", t1) !== ipBucket("1.2.3.5", t1));

// ── 11. the migration's grants use the CORRECT idiom ───────────────────────
// 0113 revoked from PUBLIC only. That looked exclusive and was not: Supabase's
// default privileges grant EXECUTE on new public functions DIRECTLY to anon and
// authenticated, so revoking from PUBLIC never touches them. It shipped as a live
// hole and 0114 closed it. Both revokes are required; neither implies the other.
const mig = codeOf("supabase/migrations/0119_demo_spend_guard.sql");
ok("the guard function is revoked from PUBLIC", /revoke all on function public\.kv_demo_try_consume[^;]*from public;/.test(mig));
ok("the guard function is ALSO revoked from anon AND authenticated (the 0113 trap)",
  /revoke all on function public\.kv_demo_try_consume[^;]*from anon, authenticated;/.test(mig));
ok("only service_role is granted execute", /grant execute on function public\.kv_demo_try_consume[^;]*to service_role;/.test(mig));
for (const t of ["demo_usage_counters", "demo_controls"]) {
  ok(`${t} is revoked from anon AND authenticated (RLS does not gate TRUNCATE)`,
    new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated;`).test(mig));
  ok(`${t} has RLS enabled`, new RegExp(`alter table public\\.${t} enable row level security`).test(mig));
}

// ── 12. THE VOICE ROUTE — same controls, plus what audio specifically needs ────
// These assertions were rewritten after an audit showed the first version was regex
// theatre: it counted identifier occurrences and matched string literals, and would
// have passed on a route that did not work. Where a control is an ORDERING property,
// the ordering is now asserted; where a claim is about behaviour elsewhere in the
// tree, the assertion follows it there instead of matching a word in this file.
const voice = codeOf("app/api/demo/voice/route.ts");
const iVoice = (needle: string) => voice.indexOf(needle);

ok("the voice route gates on host in-handler too", /isDemoHost\(\s*req\.headers\.get\("host"\)\s*\)/.test(voice));
ok("it uses the same durable spend guard", /rpc\("kv_demo_try_consume"/.test(voice));
ok("the guard fails closed here too", /if\s*\(guardErr\s*\|\|\s*!guard\)[\s\S]{0,200}status:\s*503/.test(voice));
ok("the tenant is pinned, never from the request", /restaurantId:\s*DEMO_RESTAURANT_ID/.test(voice));
ok("no visitor audio or transcript is persisted", /demoRun:\s*true/.test(voice));
ok("the transcript is length-capped like typed text", /\.slice\(0,\s*DEMO_MAX_CHARS\)/.test(voice));
assertPayloadAllowlist("voice", voice);

// SIZE. STT bills per MINUTE, so audio is a sharper spend lever than text.
ok("the ceiling is a real, sane number",
  DEMO_MAX_AUDIO_BYTES > 0 && DEMO_MAX_AUDIO_BYTES <= 10 * 1024 * 1024);
// A missing, non-numeric or duplicated Content-Length must FAIL, not slip through:
// Number(null) is 0 and Number("abc") is NaN, and both compare false against a ceiling.
ok("a declared length is REQUIRED (chunked/absent cannot bypass the ceiling)",
  /\/\^\\d\+\$\/\.test\(rawLen/.test(voice) && /status:\s*411/.test(voice));
ok("a non-numeric declared length is refused rather than defaulting to 0",
  /Number\.isFinite\(declared\)/.test(voice));
ok("the declared-length check runs BEFORE the body is read",
  iVoice("content-length") < iVoice("formData()") && iVoice("status: 411") < iVoice("formData()"));
ok("what actually arrived is checked too (a declared length is a hint, not a promise)",
  /buf\.length\s*>\s*DEMO_MAX_AUDIO_BYTES/.test(voice));

// NEVER MOCK — and checked HERE, not delegated. assertMockSttAllowed permits the mock
// whenever NODE_ENV !== "production" (localhost is an allowlisted demo host), so relying
// on it alone rendered a FABRICATED sentence as the visitor's own words under `npm run dev`.
ok("the route refuses the mock adapter itself, not via the env-dependent guard",
  /resolveSttAdapterName\(\) === "mock"/.test(voice));
// getSttAdapter() calls assertMockSttAllowed internally and THROWS in production, so
// reading .name on it outside a try/catch turns a misconfigured prod env into an
// uncaught 500 rather than the honest 503. The pure resolver must be used.
ok("the mock check uses the PURE resolver, which cannot throw", !/getSttAdapter\(\)/.test(voice));
ok("the mock refusal happens BEFORE any transcription", iVoice('=== "mock"') < iVoice("transcribeAudioBytes("));
ok("a transcription failure is surfaced honestly, never faked", /error:\s*"stt_unavailable"/.test(voice));

// SPEND VISIBILITY. lib/monitoring/sweep.ts sums agent_runs.cost_usd for the daily
// alert. On a voice turn STT is the dominant cost; dropping it blinds the only spend
// monitor that exists, on the one surface anyone can call.
ok("the STT cost is recorded to agent_runs", /trigger:\s*"voice"[\s\S]{0,220}cost_usd:\s*sttCost\.costUsd/.test(voice));
ok("the cost write is CHECKED (a zero-row write must not pass silently)",
  /mustWrite[\s\S]{0,400}exactRows:\s*1/.test(voice));
ok("the accounting write still withholds the visitor's words",
  /trigger:\s*"voice",\s*\n\s*input:\s*null,\s*\n\s*output:\s*null,/.test(voice));
ok("failing to record spend refuses the turn rather than continuing blind",
  /spend accounting failed[\s\S]{0,160}status:\s*503/.test(voice));

// CONTEXT. The voice path was stateless while the typed path was not.
ok("voice turns carry the conversation history, not a hardcoded empty array",
  /history,/.test(voice) && !/history:\s*\[\]/.test(voice));
ok("that history goes through the SAME cap as typed turns", /capDemoHistory/.test(voice));

ok("the guard runs BEFORE the model call here too",
  iVoice("kv_demo_try_consume") < iVoice("runCustomerTurn("));
ok("the confidence signal reaches the fail-closed phonetic safety net",
  /sttConfidence/.test(voice) && /isVoiceTranscript:\s*true/.test(voice));

// The shared byte-based entry point must keep the mock guard.
const vlib = codeOf("lib/messaging/voice.ts");
ok("transcribeAudioBytes exists and asserts against the mock adapter",
  /export async function transcribeAudioBytes\(/.test(vlib) &&
  /assertMockSttAllowed\("transcribeAudioBytes"\)/.test(vlib));
ok("the original WhatsApp entry point is untouched",
  /export async function transcribeWhatsAppVoice\(/.test(vlib) && /downloadWhatsAppMedia\(mediaId\)/.test(vlib));

// ── 13. THE CLIENT — the public page had NO coverage at all ───────────────────
const phone = codeOf("app/demo/DemoPhone.tsx");
const page = codeOf("app/demo/page.tsx");

ok("the page gates on host server-side and 404s", /isDemoHost/.test(page) && /notFound\(\)/.test(page));
ok("the page is not indexable", /index:\s*false/.test(page));

// G0-R: the demo must not be able to reach provider VOICE GENERATION.
for (const [label, src] of [["client", phone], ["voice route", voice], ["page", page]] as const) {
  ok(`the ${label} cannot reach a TTS path`, !/lib\/ai\/tts|elevenlabs|ElevenLabs|speechSynthesis|\/api\/tts/.test(src));
}
ok("the call screen does not fake a connected call (no running duration)",
  !/setSecs|callDuration/.test(phone));

// THE MICROPHONE. getUserMedia is awaited, so a release during the permission prompt
// arrives before the recorder exists; and the mic BUTTON is unmounted the moment
// recording starts, so a release handler bound to it can never fire.
ok("a cancel token guards the await window", /wantRec/.test(phone));
ok("a release that beats the permission prompt hands the microphone back",
  /if\s*\(!wantRec\.current[\s\S]{0,140}getTracks\(\)\.forEach/.test(phone));
ok("release is listened for on the WINDOW, not on the button that unmounts",
  /window\.addEventListener\("pointerup"/.test(phone));
ok("pointercancel is handled (a phone call or system gesture mid-recording)",
  /window\.addEventListener\("pointercancel"/.test(phone));
ok("a throw from mr.stop() cannot skip the track teardown",
  /finally\s*\{[\s\S]{0,160}getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(phone));
ok("unmounting stops the timer and releases the microphone",
  /mounted\.current = false;[\s\S]{0,400}getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(phone));

// Hydration: clock() in a useState initializer renders UTC on the server and local
// time in the browser, which tears down and re-renders the whole root.
ok("the greeting timestamp is not computed during render",
  !/text: GREETING, at: clock\(\)/.test(phone));

// Honest failure surfaces. Scoped to the VOICE error branch specifically: the text
// branch already handles demo_unavailable, so a whole-file `includes` check passed
// even with the voice branch's handling deleted. (Caught by mutation N13.)
// Anchored on the voice response type, which only the voice handler declares.
const vStart = phone.indexOf("transcript?: string;");
const voiceBranch = vStart < 0 ? "" : phone.slice(vStart, vStart + 1400);
ok("the voice error branch was located", voiceBranch.length > 0);
for (const code of ["demo_unavailable", "audio_too_large", "rate_limited", "stt_unavailable", "stt_empty"]) {
  ok(`the VOICE branch explains \`${code}\` rather than saying "try again"`, voiceBranch.includes(code));
}
// The kill switch must not be described as something retrying will fix.
ok("a stopped demo is not reported to voice users as a retryable hiccup",
  /demo_unavailable[\s\S]{0,120}موقوفة/.test(phone));

// The animations referenced a keyframe name that has never existed.
const css = readFileSync(resolve(ROOT, "app/globals.css"), "utf8");
for (const kf of ["demoDot", "demoPulse"]) {
  ok(`@keyframes ${kf} is actually defined`, new RegExp(`@keyframes ${kf}\\b`).test(css));
  ok(`the client references ${kf}`, phone.includes(kf));
}
ok("no animation references the undefined bare `kv` keyframe", !/animation:\s*"kv\s/.test(phone));

// ── 14. THE DEMO MUST NOT PROMISE WHAT IT CANNOT DO ───────────────────────────
// On a demo turn conversationId is null, so the kitchen note is never written and no
// staff alert fires. The deterministic gate's reply used to claim both.
// Signature check, not position check — a later parameter (e.g. `denied`) must not
// break it, which the original `demoRun = false\n): RespondResult` regex did.
const gateSig = /function forcedAllergenSafetyResult\(([\s\S]*?)\): RespondResult/.exec(turn)?.[1] ?? "";
ok("the allergen gate signature was found", gateSig.length > 0);
ok("the allergen gate takes a demoRun flag", /demoRun = false/.test(gateSig));
// The safety gate must never be SUPPRESSED by a denial — «ما عندي حساسية من الجمبري بس
// عندي من المكسرات» is a denial and an affirmation at once. Only the CLAIM about what the
// customer said changes, because a live run caught Khalid answering «خذت بالي إنك ذكرت
// الحساسية» to someone who had just said the opposite.
ok("it also takes a denial flag, for wording only", /denied = false/.test(gateSig));
ok("a denial changes only the opener, never the safety substance",
  /const opener = denied/.test(turn) && /ما ذكرت حساسية/.test(turn));
ok("the denial detector requires a negator bound to a saying\/having verb",
  /isExplicitAllergyDenial/.test(turn));
ok("the 'I logged it for the kitchen and alerted the team' claim is dropped on a demo turn",
  /const recorded = demoRun\s*\n?\s*\?\s*\{ eg: "", sa: "" \}/.test(turn));
ok("the gate still offers the human OR continue choice on a demo turn",
  /أوصلك بموظف يتأكد لك/.test(turn));
ok("the flag-OFF gate call site passes the demo flag", /input\.demoRun === true/.test(turn));

// THE EMERGENCY PATH. «بلّغت الفريق فوراً» ("I alerted the team immediately") is true on a
// real conversation and FALSE on a demo turn, where recordCriticalAlert is gated on a
// conversationId that is null. Telling someone describing an ACTIVE medical emergency
// that help has been summoned when it has not is the worst sentence this system could
// produce. Fixing only the deterministic gate left this one behind.
const flow = codeOf("lib/ai/allergen-companion-flow.ts");
ok("emergencyReply takes a demoRun flag", /export function emergencyReply\(dialect: string, demoRun = false\)/.test(flow));
ok("the 'I alerted the team' claim is dropped on a demo turn", /if \(demoRun\) \{[\s\S]{0,400}\}/.test(flow));
// Scoped to the demoRun BLOCK ONLY. A window regex spanning past it matched the
// real-tenant branch's copy of the same phrase, so gutting the demo advice survived.
const demoBlock = /if \(demoRun\) \{([\s\S]*?)\n  \}/.exec(flow)?.[1] ?? "";
ok("the demoRun branch was located", demoBlock.length > 0);
ok("the demo variant still tells them to call emergency services",
  demoBlock.includes("الإسعاف"));
// A native review flagged «تواصل مع» (get in touch with — a department verb) in the
// SAUDI branch where the Egyptian branch already had the imperative. In an emergency
// the verb is «اتصل بـ», and a number beats an abstraction for a shaking hand.
ok("it uses the IMPERATIVE «اتصل بـ», not the corporate «تواصل مع»",
  demoBlock.includes("اتصل بالإسعاف") && !demoBlock.includes("تواصل مع"));
ok("it gives the ambulance NUMBER, in Western digits per the KSA rule",
  /اتصل بالإسعاف 997/.test(demoBlock));
ok("the demo variant still names the symptoms that mean 'call now'",
  demoBlock.includes("تنفس") && demoBlock.includes("تورم"));
// Word order is safety: a frightened person reads the first few words, so the
// INSTRUCTION must precede the symptom list, not follow it as a condition.
ok("the instruction LEADS — it is not buried behind a conditional",
  demoBlock.indexOf("اتصل بالإسعاف") < demoBlock.indexOf("تورم"));
ok("the demo variant does NOT claim the team was alerted",
  !demoBlock.includes("بلّغت الفريق"));
// The real-tenant branch keeps the staff-alert claim (there it is TRUE) — and it must
// carry the same corrected instruction, since a live customer's emergency is no less
// urgent than a demo visitor's.
ok("the real-tenant branch still states the team was alerted (true off-demo)",
  /بلّغت الفريق فوراً/.test(flow));
ok("the real-tenant branch also uses the imperative and the number",
  /اتصل بالإسعاف 997[\s\S]{0,120}بلّغت الفريق فوراً/.test(flow));
ok("no emergency branch in this file uses the corporate «تواصل مع»",
  !/تواصل مع الإسعاف/.test(flow) && !/تواصل مع الطوارئ/.test(flow));

// A COUNTRY-SPECIFIC NUMBER MUST NEVER CROSS DIALECTS. 997 is the SAUDI Red Crescent
// number; Egypt's ambulance is 123. A previous version put 997 in BOTH branches, so an
// Egyptian customer describing anaphylaxis was handed a number that does not reach an
// ambulance where they live — rendered ٩٩٧ in their own digits. Extract each branch and
// assert 997 appears in the Saudi one and NOWHERE else in the file.
const egEmergency = [...flow.matchAll(/\?\s*"(🚨[^"]+)"/g)].map((m) => m[1]);
const saEmergency = [...flow.matchAll(/:\s*"(🚨[^"]+)"/g)].map((m) => m[1]);
ok("both emergency branches were located", egEmergency.length >= 2 && saEmergency.length >= 2);
ok("the SAUDI branches carry 997", saEmergency.every((t) => t.includes("997")));
ok("NO Egyptian branch carries the Saudi number 997", egEmergency.every((t) => !t.includes("997")));
ok("no Egyptian branch carries any other bare emergency number either",
  egEmergency.every((t) => !/\b\d{3}\b/.test(t)));
ok("both branches still lead with the imperative «اتصل بالإسعاف»",
  [...egEmergency, ...saEmergency].every((t) => t.includes("اتصل بالإسعاف")));
for (const fn of ["companionEmergencyResult", "calmHoldResult"]) {
  ok(`${fn} threads demoRun through to the reply`,
    new RegExp(`function ${fn}\\([\\s\\S]{0,700}demoRun = false`).test(turn));
}
ok("every emergencyReply call in customer-turn passes the flag",
  (turn.match(/emergencyReply\(dialect\)/g) ?? []).length === 0);

// ── 14b. DENIAL OF DEMO — a junk request must not burn a paid slot ───────────
// The guard increments a GLOBAL counter on the way in. When it ran before the body was
// parsed, `POST {}` cost the sender nothing and still consumed one of the day's slots;
// ~1,000 of them, spread over an IPv6 /64 so no per-IP cap engages, took the demo dark
// until 00:00 UTC. Validation is free, so it must come FIRST — while the guard must
// still precede everything that actually spends.
// indexOf returns -1 when the needle is ABSENT, and -1 is less than any real index —
// so a naive `a < b` ordering assertion passes when `a` has been deleted outright.
// These throw the comparison away unless BOTH anchors actually exist.
const before = (label: string, src: string, a: string, b: string) => {
  const ia = src.indexOf(a), ib = src.indexOf(b);
  ok(`${label} [both anchors present]`, ia >= 0 && ib >= 0);
  ok(label, ia >= 0 && ib >= 0 && ia < ib);
};
const iTurn = (n: string) => route.indexOf(n);
before("turn: the body is validated BEFORE the guard is consumed", route, 'error: "bad_request"', "kv_demo_try_consume");
before("turn: the guard is still consumed BEFORE the model call", route, "kv_demo_try_consume", "runCustomerTurn(");
before("voice: the clip is validated BEFORE the guard is consumed", voice, 'error: "bad_request"', "kv_demo_try_consume");
before("voice: the guard is consumed BEFORE STT", voice, "kv_demo_try_consume", "transcribeAudioBytes(");
before("voice: the guard is consumed BEFORE the model call", voice, "kv_demo_try_consume", "runCustomerTurn(");
before("voice: the size ceiling still precedes reading the body", voice, "status: 411", "formData()");

// A demo turn is a perception call plus up to MAX_ITERATIONS model calls over a ~17k-token
// system prompt, and a voice turn adds a Whisper round-trip. On the platform default the
// function is killed mid-turn AFTER the slot and the provider spend are gone.
for (const [label, src] of [["turn", route], ["voice", voice]] as const) {
  ok(`${label}: an explicit maxDuration is set`, /export const maxDuration = \d+/.test(src));
}

// Migration 0120 — the database half of the same defect.
// codeOf strips // and /* */ but NOT SQL's `--`, and this migration's header quotes the
// very expression it removes. Strip -- lines so the assertions read CODE, not prose.
const sqlCode = (p: string) => readFileSync(resolve(ROOT, p), "utf8")
  .split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const mig120 = sqlCode("supabase/migrations/0120_demo_guard_counter_integrity.sql");
ok("0120 exists and replaces the guard", /create or replace function public\.kv_demo_try_consume/.test(mig120));
ok("0120 checks the per-IP cap BEFORE touching the global counter",
  mig120.indexOf("p_ip_bucket") < mig120.indexOf("p_global_bucket, 1"));
ok("a rejected per-IP turn refunds its own counter",
  /v_ip > p_ip_limit then[\s\S]{0,200}turns = turns - 1 where bucket = p_ip_bucket/.test(mig120));
ok("a rejected global turn refunds BOTH counters",
  /v_global > p_global_limit then[\s\S]{0,320}bucket = p_global_bucket;[\s\S]{0,160}bucket = p_ip_bucket/.test(mig120));
// The old `coalesce(v_enabled, 1) = 0` treated a MISSING controls row as enabled, so
// deleting the row left the demo running while an operator believed it was stopped.
ok("the kill switch FAILS CLOSED when the controls row is absent",
  /v_enabled is null or v_enabled = false/.test(mig120) && !/coalesce\(v_enabled/.test(mig120));
ok("0120 revokes from PUBLIC and from anon+authenticated (the 0113 trap)",
  /from public;/.test(mig120) && /from anon, authenticated;/.test(mig120));
ok("0120 grants execute only to service_role", /grant execute[\s\S]{0,120}to service_role;/.test(mig120));

// ── 14c. THE TOOL LAYER MUST NOT PROMISE WHAT A DEMO TURN CANNOT DO ─────────
// Three tool results described side effects that a demo turn never performs: the staff
// alert (recordCriticalAlert is gated on a null conversationId), the human transfer
// (the ownership flip and staff message live in respond-and-send, which the demo never
// reaches), and a registered order (no orders row is ever written). The escalate branch
// is the one the Founder's own escalate-to-human option lands on.
const tools = codeOf("lib/ai/tools.ts");
const respond = codeOf("lib/ai/respond.ts");
ok("ToolContext carries an optional demoRun flag", /demoRun\?:\s*boolean;/.test(tools));
ok("respond threads it into the tool context", /demoRun:\s*input\.demoRun === true/.test(respond));
ok("customer-turn passes it to respond", /respond\(\{ brain: ctx, demoRun: input\.demoRun === true/.test(turn));
ok("the human-transfer claim is conditional on demoRun",
  /ctx\.demoRun[\s\S]{0,220}ما أقدر أحوّلك لموظف فعلي/.test(tools));
ok("the staff-notified claim is conditional on demoRun",
  /ctx\.demoRun[\s\S]{0,220}في الاستخدام الحقيقي ينبّه فريق المطعم/.test(tools));
// WO-KHALID-ORDER changed this one's TRUTH, not its principle. A demo turn now DOES
// write a real orders row (is_test + source "demo"), so «ما ينحفظ طلب فعلي» — no real
// order is saved — became the lie. What must stay true is that the demo branch never
// claims money moved, and never invents an order number it cannot have.
ok("the order-registered claim is still conditional on demoRun",
  /ctx\.demoRun[\s\S]{0,240}تجريبي/.test(tools));
ok("the demo branch says plainly that no payment was taken", /بدون دفع فعلي/.test(tools));
ok("the demo branch does NOT hand the model an order number to invent",
  /لا تذكر رقم الطلب/.test(tools));
ok("the stale 'no real order is saved' claim is gone", !/ما ينحفظ طلب فعلي/.test(tools));
// Real tenants must be untouched: the original strings still exist as the else branch.
for (const [label, phrase] of [
  ["transfer", "حوّلت محادثتك لفريق المطعم"],
  ["notify", "سجّلت ملاحظتك ونبّهت فريق المطعم"],
  ["order", "تم تسجيل الطلب بانتظار تأكيد المطعم"],
] as const) {
  ok(`the real-tenant ${label} wording is unchanged`, tools.includes(phrase));
}
ok("demoRun is opt-in in the tool layer too", !/demoRun\s*=\s*true/.test(tools) && !/demoRun\s*\?\?\s*true/.test(tools));

// ── 15. THE SEED MUST NOT SILENTLY DISARM THE DEMO ───────────────────────────
// The seed upserts on the primary key, so whatever it writes REPLACES the live
// tenant's flags. It used to write `khalid_persona: false` while the demo runs it
// true — re-running it would have switched Khalid off on the public page with no
// error anywhere, and config.ts's own comment would have become false.
const seed = codeOf("scripts/seed-demo-ksa-tenant.mjs");
// RAW, not codeOf: the claim being checked lives in a doc comment, and codeOf strips
// comments (it must — the prose in this very file names the fields it bans).
const cfgRaw = readFileSync(resolve(ROOT, "lib/demo/config.ts"), "utf8");
ok("the seed targets the same pinned tenant the routes use", seed.includes(DEMO_RESTAURANT_ID));
ok("the seed enables khalid_persona, as config.ts claims", /khalid_persona:\s*true/.test(seed));
ok("config.ts still claims the persona is on (the two must agree)", /`khalid_persona`\s*on/.test(cfgRaw));
ok("the seed keeps the Saudi dialect the persona depends on", /dialect:\s*"saudi"/.test(seed));
// G0-R and real money: these must never be seeded onto a public tenant.
ok("the seed does NOT enable voice_notes (the outbound TTS path — G0-R)", !/voice_notes:\s*true/.test(seed));
ok("the seed does NOT enable psp_payments (real money on a public page)", !/psp_payments:\s*true/.test(seed));
// Held off deliberately so the flag-OFF deterministic gate fires the two-option wording.
for (const f of ["allergy_simple", "allergy_calm_hold", "allergy_companion_mode"]) {
  ok(`the seed does NOT enable ${f} (the deterministic gate must fire)`, !new RegExp(`${f}:\\s*true`).test(seed));
}

console.log(`\nPUBLIC-DEMO HARDENING PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
