// ============================================================================
// PROOF — WHEN THE FIRST ENGINE HEARS NOTHING, A SECOND ONE GETS THE SAME BYTES.
//
// Run:
//   node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//     scripts/proof-stt-fallback.test.ts
//
// An iPhone has never completed a turn on this product: iOS Safari records
// `audio/mp4; codecs=mp4a.40.2`, Deepgram nova-3 answers 200 with an EMPTY transcript on
// 130 KB of real speech, and the demo route turns that into a 422 the caller hears as
// silence. A header fix was tried and production disproved it — both attempts empty. This
// proves the replacement.
//
// EVERY CASE DRIVES THE REAL SEAM. `transcribeAudioBytes` / `transcribeWhatsAppVoice` are
// called with the real adapters and the real resolver; only `globalThis.fetch` is
// stubbed, at the provider boundary. So this exercises the actual candidate list, the
// actual key gating, the actual multipart filename and the actual cost merge — not a
// hand-built double that agrees with the test by construction.
// ============================================================================

import { transcribeAudioBytes, transcribeWhatsAppVoice } from "../lib/messaging/voice.ts";
import {
  availableFallbackAdapters,
  isEmptyTranscript,
  transcribeWithFallback,
  STT_FALLBACK_TIMEOUT_MS,
} from "../lib/ai/stt/fallback.ts";

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean, detail?: unknown) {
  if (condition) { pass++; return; }
  fail++;
  console.log("  FAIL", name, detail === undefined ? "" : detail);
}

// ── environment + network, saved and restored ────────────────────────────────
const ENV_KEYS = [
  "NODE_ENV", "STT_ADAPTER", "DEEPGRAM_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY",
  "ENABLE_MOCK_STT", "DEEPGRAM_STT_MODEL", "GROQ_STT_MODEL", "OPENAI_STT_MODEL",
  "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

function restore() {
  for (const k of ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

/** iOS Safari's container, verbatim from a production log line. */
const IPHONE_MIME = "audio/mp4; codecs=mp4a.40.2";
const IPHONE_BYTES = Buffer.alloc(130_000, 7); // 130 KB, the size that failed for real

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let warnings: string[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
/** Deepgram's success-shaped nothing: 200, empty transcript, confidence 0. */
const DG_EMPTY = { results: { channels: [{ alternatives: [{ transcript: "", confidence: 0 }] }] }, metadata: { duration: 6 } };
const dgWords = (t: string) => ({ results: { channels: [{ alternatives: [{ transcript: t, confidence: 0.94 }] }] }, metadata: { duration: 6 } });
const whisper = (t: string) => ({ text: t, duration: 6, segments: [{ avg_logprob: -0.2, no_speech_prob: 0.01 }] });

/** Install a provider-boundary stub. `routes` maps a URL substring to a handler. */
function stubNetwork(routes: Array<[string, (init: RequestInit) => Response | Promise<Response>]>) {
  calls = [];
  warnings = [];
  console.warn = (...a: unknown[]) => { warnings.push(a.map(String).join(" ")); };
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    for (const [needle, handler] of routes) if (url.includes(needle)) return handler(init);
    throw new Error(`proof: unstubbed request to ${url}`);
  }) as typeof fetch;
}

const hits = (needle: string) => calls.filter((c) => c.url.includes(needle)).length;

function baseEnv() {
  process.env.NODE_ENV = "production";           // the shape production actually runs in
  process.env.STT_ADAPTER = "deepgram";
  process.env.DEEPGRAM_API_KEY = "dg-test";
  delete process.env.ENABLE_MOCK_STT;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

async function main() {
  // ── A. THE IPHONE TURN IS RECOVERED, AND COSTS EXACTLY TWO CALLS ───────────
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json(whisper("أبغى كبسة"))],
    ]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("A1 the words come back", r.text === "أبغى كبسة", r.text);
    ok("A2 the row names the engine whose words were used", r.adapter === "groq", r.adapter);
    ok("A3 exactly one call to each provider", hits("api.deepgram.com") === 1 && hits("api.groq.com") === 1,
      calls.map((c) => c.url.slice(0, 40)));
    // 6s at deepgram nova-3 ($0.0043/min) + 6s at groq turbo ($0.00067/min).
    const expected = Number(((6 / 60) * 0.0043).toFixed(6)) + Number(((6 / 60) * 0.00067).toFixed(6));
    ok("A4 spend is SUMMED, not replaced — the turn paid for both", Math.abs(r.costUsd - expected) < 1e-9,
      { got: r.costUsd, expected });
    ok("A5 it says so in the log", warnings.some((w) => w.includes("[stt/fallback]") && w.includes("RECOVERED")), warnings);
  }

  // ── B. THE MECHANISM: WHISPER IS HANDED A NAMED .m4a FILE ──────────────────
  // This is the whole reason a second engine can succeed where the first cannot —
  // Deepgram is TOLD what the bytes are, Whisper is handed a file whose extension names
  // the container. If this regresses, the fallback silently becomes another 400.
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json(whisper("سلام"))],
    ]);
    await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    const groqCall = calls.find((c) => c.url.includes("api.groq.com"))!;
    const fd = groqCall.init.body as FormData;
    const file = fd.get("file") as File;
    ok("B1 the upload is named for the container iOS records", file?.name === "audio.m4a", file?.name);
    ok("B2 the bytes are the caller's, unmodified", file?.size === IPHONE_BYTES.length, file?.size);
    ok("B3 the language hint survives the handover", fd.get("language") === "ar", fd.get("language"));
    // Deepgram is still told the container, with the codec parameter stripped.
    const dgCall = calls.find((c) => c.url.includes("api.deepgram.com"))!;
    ok("B4 deepgram still gets the stripped container",
      (dgCall.init.headers as Record<string, string>)["Content-Type"] === "audio/mp4",
      dgCall.init.headers);
  }

  // ── C. A WORKING TURN NEVER PAYS TWICE ─────────────────────────────────────
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(dgWords("أبغى مندي"))],
      ["api.groq.com", () => { throw new Error("proof: the fallback must not run on a working turn"); }],
    ]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("C1 the primary's words are returned untouched", r.text === "أبغى مندي" && r.adapter === "deepgram", r);
    ok("C2 exactly one provider call", calls.length === 1, calls.length);
    ok("C3 nothing is logged on a healthy turn", warnings.length === 0, warnings);
  }

  // ── D. THE DISPROVEN DEEPGRAM RETRY IS GONE ────────────────────────────────
  // It used to fire a SECOND deepgram POST with no Content-Type on every empty result.
  // Production proved it never recovers anything; leaving it in would be a round trip of
  // dead air on the one turn already failing.
  {
    baseEnv(); // no groq, no openai
    stubNetwork([["api.deepgram.com", () => json(DG_EMPTY)]]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("D1 one deepgram call on an empty transcript, not two", hits("api.deepgram.com") === 1, hits("api.deepgram.com"));
    ok("D2 the empty result still reaches the caller (the 422 path is intact)",
      r.text === "" && r.adapter === "deepgram", r);
    ok("D3 an unconfigured environment SAYS it cannot recover",
      warnings.some((w) => w.includes("NO fallback engine is configured") && w.includes("GROQ_API_KEY")), warnings);
  }

  // ── E. THE MOCK IS UNREACHABLE ─────────────────────────────────────────────
  // lib/ai/stt/mock.ts returns a FIXED invented Arabic sentence. Reaching it from here
  // would make Khalid confidently answer something the customer never said.
  {
    ok("E1 the mock is not a fallback candidate, with or without keys",
      !availableFallbackAdapters("deepgram").includes("mock") &&
      !availableFallbackAdapters("groq").includes("mock"), availableFallbackAdapters("deepgram"));
    baseEnv();
    process.env.ENABLE_MOCK_STT = "true"; // even when the mock is explicitly allowed
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json(whisper(""))],   // the second engine hears nothing either
    ]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("E2 no invented transcript appears when both engines hear nothing",
      r.text === "" && !r.text.includes("تفريغ تجريبي"), r.text);
    ok("E3 two engines and no words is reported as a silent clip, not a broken decoder",
      warnings.some((w) => w.includes("probably silent")), warnings);
  }

  // ── F. THE FALLBACK IS NEVER THE THING THAT FAILS THE TURN ─────────────────
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    process.env.OPENAI_API_KEY = "oa-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json({ error: { message: "rate limited" } }, 429)],
      ["api.openai.com", () => json(whisper("لقيمات"))],
    ]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("F1 a throwing candidate does not reject the turn — the next one is tried",
      r.text === "لقيمات" && r.adapter === "openai", r);
    ok("F2 the failure is named in the log", warnings.some((w) => w.includes("groq failed")), warnings);
  }
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json({ error: { message: "boom" } }, 500)],
    ]);
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    ok("F3 every candidate failing still returns the primary's empty result, not an exception",
      r.text === "" && r.adapter === "deepgram", r);
  }

  // ── G. THE SECOND CALL IS BOUNDED ──────────────────────────────────────────
  // Nothing else in this seam has a deadline, and the call screen posts with no timeout of
  // its own, so a provider that accepts the connection and never answers would leave a
  // caller holding a silent phone forever. This drives a REAL hang and waits it out.
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", (init) => new Promise<Response>((_res, rej) => {
        const s = init.signal!;
        // A REAL in-flight request holds the event loop open; a bare promise does not, and
        // Node's AbortSignal.timeout uses an UNREF'D timer on purpose. Without this the
        // process would simply exit here — the proof would end mid-run and report success.
        const keepAlive = setTimeout(() => {}, 30_000);
        s.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          rej(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        });
      })],
    ]);
    const t0 = Date.now();
    const r = await transcribeAudioBytes(IPHONE_BYTES, IPHONE_MIME);
    const waited = Date.now() - t0;
    ok("G1 a hanging fallback is abandoned, and the turn still returns",
      r.text === "" && r.adapter === "deepgram", r);
    ok("G2 it is abandoned at the deadline, not at some other time",
      waited >= STT_FALLBACK_TIMEOUT_MS - 250 && waited < STT_FALLBACK_TIMEOUT_MS + 2_000,
      { waited, deadline: STT_FALLBACK_TIMEOUT_MS });
    const dgCall = calls.find((c) => c.url.includes("api.deepgram.com"))!;
    ok("G3 the FIRST attempt is left unbounded — a slow primary is still the turn's best hope",
      dgCall.init.signal === undefined, dgCall.init.signal);
    const gqCall = calls.find((c) => c.url.includes("api.groq.com"))!;
    ok("G4 the deadline reaches the provider request itself, not just the wrapper",
      gqCall.init.signal instanceof AbortSignal, gqCall.init.signal);
  }

  // ── H. NO BYTES, NO SPEND ──────────────────────────────────────────────────
  // transcribeWhatsAppVoice substitutes an empty buffer when the media download fails.
  // Paying a second provider to confirm that zero bytes contain no words has no upside.
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    stubNetwork([["api.groq.com", () => json(whisper("لا يجب أن يحدث"))]]);
    const out = await transcribeWithFallback("deepgram", Buffer.alloc(0), { mimeType: IPHONE_MIME });
    ok("H1 an empty clip is not sent to a second engine", out === null && calls.length === 0, calls.length);
  }

  // ── I. WHATSAPP SHARES THE BEHAVIOUR, BECAUSE IT SHARES THE SEAM ───────────
  // Both public voice surfaces end in the same call. A fix that reached only the demo
  // would leave the paying tenants' path with the older behaviour.
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-test";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
    stubNetwork([
      ["graph.facebook.com", () => json({ url: "https://lookaside.example/media", mime_type: "audio/ogg" })],
      ["lookaside.example", () => new Response(new Uint8Array(IPHONE_BYTES), { status: 200 })],
      ["api.deepgram.com", () => json(DG_EMPTY)],
      ["api.groq.com", () => json(whisper("وزيدها لبن"))],
    ]);
    const r = await transcribeWhatsAppVoice("media-id-1", "audio/ogg");
    ok("I1 a WhatsApp voice note gets the same second opinion",
      r.text === "وزيدها لبن" && r.adapter === "groq", r);
  }

  // ── J. THE HELPERS SAY WHAT THEY MEAN ──────────────────────────────────────
  {
    baseEnv();
    process.env.GROQ_API_KEY = "gq-test";
    process.env.OPENAI_API_KEY = "oa-test";
    ok("J1 the primary is never its own fallback",
      !availableFallbackAdapters("groq").includes("groq") &&
      !availableFallbackAdapters("openai").includes("openai"), availableFallbackAdapters("groq"));
    ok("J2 deepgram is never a fallback target — it is the engine being fallen back FROM",
      !availableFallbackAdapters("deepgram").includes("deepgram") &&
      !availableFallbackAdapters("groq").includes("deepgram"), availableFallbackAdapters("groq"));
    ok("J3 both keyed engines are offered, fastest first",
      JSON.stringify(availableFallbackAdapters("deepgram")) === JSON.stringify(["groq", "openai"]),
      availableFallbackAdapters("deepgram"));
    delete process.env.GROQ_API_KEY;
    ok("J4 an unkeyed engine is not offered",
      JSON.stringify(availableFallbackAdapters("deepgram")) === JSON.stringify(["openai"]),
      availableFallbackAdapters("deepgram"));
    ok("J5 whitespace is not a transcript",
      isEmptyTranscript({ text: "   \n\t " }) && isEmptyTranscript({ text: "" }) &&
      isEmptyTranscript(null) && isEmptyTranscript(undefined) && isEmptyTranscript({}) &&
      !isEmptyTranscript({ text: "كبسة" }));
  }

  finished = true;
  restore();
  console.log(`\nproof-stt-fallback: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

// A HALF-RUN MUST NOT LOOK LIKE A PASS. Every case here is async, and an await that never
// settles drains the event loop and exits 0 with no summary — which the suite runner would
// score as green. This is the one line that makes that impossible.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.error("proof-stt-fallback: ENDED EARLY — the run never reached its summary");
    process.exitCode = 1;
  }
});

main().catch((e) => {
  finished = true;
  restore();
  console.error("proof-stt-fallback CRASHED", e);
  process.exit(1);
});
