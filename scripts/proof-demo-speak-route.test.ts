// ============================================================================
// PROOF — the streaming endpoint, DRIVEN. Not read.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-demo-speak-route.test.ts
//
// WHY THIS FILE EXISTS. `/api/demo/speak` is a public, unauthenticated GET that can cause a
// paid synthesis in our registered voice. Its controls were covered only by IDENTIFIER
// PRESENCE — `/isDemoHost/.test(source)`, `/rateLimit\(/.test(source)` — and an audit drove
// five mutations straight through the full 222-file suite:
//
//   • the host gate wrapped in `if (false && …)`      — the identifier is still there
//   • refusals answering 500 instead of 204            — nothing read the status
//   • `format: "mp3"` → `"ogg_opus"`                   — SILENCE on every iPhone
//   • the per-IP allowance raised to 1000
//   • the `/stream` suffix dropped                     — the latency fix becomes a no-op
//
// The last two are the whole commit being undone with CI green. A guard asserted by the
// presence of its own name is not asserted at all: that is the lesson this repo has now
// paid for in a comment, a variable name and a function name. So this file CALLS the route.
//
// NO PROVIDER IS EVER CONTACTED. `fetch` is replaced for the whole file and every call is
// recorded, so the assertions can be about what would have gone on the wire.
// ============================================================================

import { KHALID_VOICE } from "../lib/ai/tts/voice-registry.ts";

const SECRET = "proof-secret-that-is-comfortably-over-32-chars";
process.env.DEMO_SPEECH_SECRET = SECRET;
process.env.TTS_ADAPTER = "elevenlabs";
process.env.ELEVENLABS_API_KEY = "el-key-for-the-proof";
process.env.ELEVENLABS_VOICE_ID = KHALID_VOICE.voiceId;
delete process.env.ELEVENLABS_TTS_MODEL;

const { signSpeechTicket } = await import("../lib/demo/speech-ticket.ts");
const { __setTestAdminClient } = await import("../lib/supabase/admin.ts");
const { ttsCostUsd } = await import("../lib/ai/tts/pricing.ts");
const { GET } = await import("../app/api/demo/speak/route.ts");

// ── A FAKE LEDGER ───────────────────────────────────────────────────────────
//
// The purpose-built injection seam in lib/supabase/admin.ts, used here for the block that
// makes the money VISIBLE. Without it `createAdminClient()` returns null in a proof, the
// whole replay-ledger branch is dead, and four separate one-line changes to it each survive
// the entire suite: never marking a fetch a repeat, booking `cost_usd: 0`, dropping
// `mustWrite` for an unchecked insert, and deferring the write past the response (where a
// serverless function may never run it). Each of those makes a paid synthesis invisible to
// `lib/monitoring/sweep.ts`, which is the only spend monitor there is.
type LedgerRow = Record<string, unknown>;
const ledger: LedgerRow[] = [];
let ledgerFails = false;
__setTestAdminClient({
  from(table: string) {
    const builder: Record<string, unknown> = {};
    builder.insert = (row: LedgerRow) => {
      if (!ledgerFails) ledger.push({ __table: table, ...row });
      return builder;
    };
    // `mustWrite(..., { exactRows: 1 })` reads `data` and `error` off the awaited builder.
    builder.select = () => builder;
    // A REAL WRITE TAKES TIME, and that is what makes the ordering observable. Resolving on
    // a microtask makes "written before the response" and "written after it" indistinguishable
    // to any assertion — so a write deferred into a floating promise, which a serverless
    // function may kill before it runs, looks identical to one that was awaited.
    builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      new Promise((r) => setTimeout(r, 15))
        .then(() =>
          ledgerFails
            ? { data: null, error: { message: "ledger unavailable" } }
            : { data: [{ id: "row-1" }], error: null },
        )
        .then(res, rej);
    return builder;
  },
});

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

// ── the provider, replaced ──────────────────────────────────────────────────
type Call = { url: string; body: Record<string, unknown> };
const calls: Call[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  if (!/api\.elevenlabs\.io/.test(url)) throw new Error(`a proof must not contact ${url}`);
  calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
  return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
    status: 200, headers: { "content-type": "audio/mpeg" },
  });
}) as typeof fetch;

const SPEAKABLE = "هلا والله، عندنا كبسة دجاج طازة. تحب أضيفها؟";
let ipCounter = 0;
/** A fresh IP each time, so one scenario's rate-limit use cannot leak into the next. */
const freshIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;

const call = async (opts: {
  ticket?: string | null; sid?: string | null; host?: string | null; ip?: string;
}): Promise<Response> => {
  const qs = new URLSearchParams();
  if (opts.ticket) qs.set("t", opts.ticket);
  if (opts.sid) qs.set("s", opts.sid);
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? freshIp() };
  if (opts.host !== null) headers.host = opts.host ?? "getkivo.io";
  return GET(new Request(`https://getkivo.io/api/demo/speak?${qs}`, { headers }));
};

const mint = (sid: string | null = null) =>
  String(signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid }));

console.log("\n── A GOOD TICKET GETS AUDIO, AND THE RIGHT KIND OF IT ──────────");
{
  calls.length = 0;
  const res = await call({ ticket: mint() });
  ok("a valid ticket is answered 200", res.status === 200);
  ok("…as MP3, because Safari cannot decode Ogg Opus and this is a browser",
    res.headers.get("content-type") === "audio/mpeg");
  ok("…with a body to stream", res.body !== null);
  ok("…and seeking is explicitly refused, since a proxied stream cannot rewind",
    res.headers.get("accept-ranges") === "none");
  ok("…and it is never cached anywhere", /no-store/.test(res.headers.get("cache-control") ?? ""));

  ok("exactly one synthesis was bought", calls.length === 1);
  // THE STREAMING ENDPOINT, WHICH IS THE ENTIRE POINT. Dropping the `/stream` suffix leaves
  // a correct-sounding call that buffers the whole reply again — the latency fix silently
  // undone, with every other assertion still green.
  ok("…from the STREAMING endpoint", /\/stream\?/.test(calls[0]!.url));
  ok("…in mp3 at the registered bitrate", /output_format=mp3_44100_128/.test(calls[0]!.url));
  ok("…in the registry's voice", calls[0]!.url.includes(KHALID_VOICE.voiceId));
  ok("…on the accepted model", calls[0]!.body.model_id === KHALID_VOICE.model);
  ok("…speaking the ticket's own text", typeof calls[0]!.body.text === "string" &&
    String(calls[0]!.body.text).includes("كبسة"));
}

console.log("\n── AND EVERY REFUSAL IS SILENCE, NOT AN ERROR PAGE ─────────────");
{
  // 204, NEVER 4xx/5xx. The route's own comment says why: an error status invites a media
  // element to retry, and a retry loop is what turns a refusal into a bill. Nothing read the
  // status before, so answering 500 everywhere survived the whole suite.
  const cases: Array<[string, () => Promise<Response>]> = [
    ["no ticket at all", () => call({ ticket: null })],
    ["a junk ticket", () => call({ ticket: "not-a-real-ticket" })],
    ["a forged signature", () => call({ ticket: `${mint().split(".")[0]}.AAAA` })],
    ["a ticket for another session", () => call({ ticket: mint("sess-A"), sid: "sess-B" })],
    ["a session-bound ticket with no session", () => call({ ticket: mint("sess-A") })],
  ];
  for (const [label, run] of cases) {
    const res = await run();
    ok(`${label} → 204`, res.status === 204);
    ok(`…with no body`, res.body === null);
    ok(`…and a reason a developer can read`, (res.headers.get("x-kivo-silent") ?? "").length > 0);
  }
  const before = calls.length;
  await call({ ticket: "not-a-real-ticket" });
  ok("a refused request buys nothing", calls.length === before);
}

console.log("\n── THE HOST GATE IS LOAD-BEARING, NOT DECORATIVE ───────────────");
{
  // `if (false && !isDemoHost(...))` kept the identifier and the assertion that looked for
  // it, while opening the endpoint to any host. Driven now.
  for (const host of ["evil.example.com", "getkivo.io.evil.com", "", null]) {
    const res = await call({ ticket: mint(), host: host as string | null });
    ok(`host «${String(host)}» is refused`, res.status === 404);
  }
  const before = calls.length;
  await call({ ticket: mint(), host: "evil.example.com" });
  ok("…and buys nothing", calls.length === before);
  ok("a real demo host still works", (await call({ ticket: mint(), host: "www.getkivo.io" })).status === 200);
  ok("…and localhost, which is an allowlisted demo host",
    (await call({ ticket: mint(), host: "localhost:3000" })).status === 200);
}

console.log("\n── A TICKET IS NOT A SEASON PASS ───────────────────────────────");
{
  // Replay is per-ticket by definition, and an attacker rotating IPs walks around a per-IP
  // bound entirely — so the per-ticket cap is the one that actually bounds the bill.
  const t = mint();
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) seen.push((await call({ ticket: t })).status);
  const paid = seen.filter((s) => s === 200).length;
  // READ FROM THE ROUTE, not hardcoded: the allowance moved from 2 to 3 (iOS plausibly
  // spends one on a range probe, and a hardcoded 2 turned that into a 429 → a playback
  // failure → a stumble, our own limiter causing the worst outcome on the browser the whole
  // design was built around). The property is "a retry, not a flood", so the assertion
  // follows the constant and still caps how loose it may become.
  const { readFileSync } = await import("node:fs");
  const routeSrc = readFileSync(new URL("../app/api/demo/speak/route.ts", import.meta.url), "utf8");
  const allowance = Number((routeSrc.match(/SPEAK_PER_TICKET\s*=\s*(\d+)/) ?? [])[1] ?? NaN);
  ok(`the per-ticket allowance is small and stated (${allowance})`,
    Number.isFinite(allowance) && allowance >= 1 && allowance <= 3);
  ok(`one ticket buys at most that, not a flood (${paid} paid of 6)`, paid <= allowance);
  ok("…and the rest are refused", seen.filter((s) => s === 429).length >= 6 - allowance);

  // A DIFFERENT ticket from the same visitor is a different turn and must still work.
  ok("a fresh ticket is not punished for the last one's replays",
    (await call({ ticket: mint() })).status === 200);
}

console.log("\n── AND THE PER-IP CEILING IS REAL ──────────────────────────────");
{
  const ip = "198.51.100.77";
  let paid = 0;
  let blocked = 0;
  for (let i = 0; i < 70; i++) {
    const res = await call({ ticket: mint(), ip });
    if (res.status === 200) paid++;
    else if (res.status === 429) blocked++;
  }
  ok(`one IP cannot buy without limit (${paid} paid, ${blocked} refused of 70)`, blocked > 0);
  const { DEMO_PER_IP_TURNS } = await import("../lib/demo/config.ts");
  ok(`…and the ceiling is the same order as the turns that IP can already buy ` +
     `(${paid} vs ~${DEMO_PER_IP_TURNS * 2})`,
    paid <= DEMO_PER_IP_TURNS * 4);
}

console.log("\n── A SECOND FETCH IS MONEY, AND THE LEDGER SEES IT ─────────────");
{
  // THE GUARANTEE THE WHOLE REPLAY FIX RESTS ON. The turn that minted the ticket books ONE
  // synthesis; the durable cap counts TURNS and a replay consumes none, so a second fetch is
  // spend that nothing else in the system can ever see. Driven end to end against a fake
  // ledger, because asserting the block's presence is what let four separate one-line
  // regressions through.
  ledger.length = 0;
  const t = mint();
  const ip = "192.0.2.99";

  const first = await call({ ticket: t, ip });
  ok("the first fetch is served", first.status === 200);
  ok("…and writes NOTHING, because the mint already booked it",
    ledger.length === 0);

  const second = await call({ ticket: t, ip });
  ok("a repeat fetch is still served — the money is spent either way", second.status === 200);
  // BEFORE THE RESPONSE, NOT AFTER IT. Checked the instant `GET` resolves and with no
  // intervening await, because work scheduled after a serverless response is not guaranteed
  // to run at all — a write deferred into a floating promise is a row that may simply never
  // exist, and it reads identically to a correct one unless the ordering is asserted.
  ok(`…and the row is already written when the response is handed back (${ledger.length})`,
    ledger.length === 1);
  ok("…to the spend ledger", ledger[0]?.__table === "agent_runs");
  ok("…tagged as a synthesis", ledger[0]?.trigger === "voice_tts");
  ok("…naming the provider that will bill us", ledger[0]?.adapter === "elevenlabs");
  ok("…and the registered model", ledger[0]?.model === KHALID_VOICE.model);

  // THE REAL COST, NOT A PLACEHOLDER. A row that books $0 is worse than no row: it tells the
  // monitor the synthesis was free.
  const expected = ttsCostUsd(`elevenlabs:${KHALID_VOICE.model}`, calls[calls.length - 1]!.body.text as string
    ? String(calls[calls.length - 1]!.body.text).length : 0);
  ok(`…for what it actually cost, not zero (${ledger[0]?.cost_usd})`,
    typeof ledger[0]?.cost_usd === "number" && (ledger[0]?.cost_usd as number) > 0 &&
    Math.abs((ledger[0]?.cost_usd as number) - expected) < 1e-9);

  // AND A FAILED WRITE IS NOTICED, NOT SWALLOWED. Supabase RESOLVES on failure — it does not
  // throw — so an unchecked `.insert()` returns `{ data: null, error }` and carries on
  // silently. `mustWrite` is what turns that into something a human sees; without it the
  // money is gone AND nobody knows. Asserted through the log line, because a silent
  // no-op has no other observable difference.
  ledgerFails = true;
  const errors: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
  const rt = mint();
  const rip = "192.0.2.100";
  await call({ ticket: rt, ip: rip });          // first fetch — booked at mint, no write
  const third = await call({ ticket: rt, ip: rip }); // repeat — the write fails
  console.error = realError;
  ledgerFails = false;

  ok("a failed ledger write still serves the audio", third.status === 200);
  ok(`…and is reported, never swallowed (${errors.length} logged)`,
    errors.some((e) => e.includes("replay spend accounting failed")));
}

globalThis.fetch = realFetch;
__setTestAdminClient(undefined);

console.log(`\n${fails.length ? "FAIL" : "PASS"} demo-speak-route: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
