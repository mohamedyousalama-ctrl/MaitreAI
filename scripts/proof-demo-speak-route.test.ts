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
const { GET } = await import("../app/api/demo/speak/route.ts");

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
  ok(`one ticket buys at most a retry, not a flood (${paid} paid of 6)`, paid <= 2);
  ok("…and the rest are refused", seen.filter((s) => s === 429).length >= 4);

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

globalThis.fetch = realFetch;

console.log(`\n${fails.length ? "FAIL" : "PASS"} demo-speak-route: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
