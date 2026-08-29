// ============================================================================
// PROOF — the demo's hands-free voice call (KIV-308 option A).
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-demo-call-loop.test.ts
//
// The call screen's two real decisions are "when did they stop talking?" and "what do we do
// with this response?". Inside a React component both are reachable only through a
// microphone and a network, so in practice neither would ever be driven — and this repo has
// been bitten four times by an assertion that matched a NAME instead of a BEHAVIOUR. Both
// are pure functions in lib/demo/call-loop.ts, and this file drives them with real
// waveforms and real status codes.
// ============================================================================

import {
  newVadState, vadStep, callResponseAction,
  SPEECH_RMS, HANGOVER_MS, NO_SPEECH_MS,
} from "../lib/demo/call-loop.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fails.push(label); console.log(`  FAIL ${label}`); }
};

/** Drive the detector over a scripted waveform: [rms, durationMs] pairs, sampled every
 *  60ms exactly as the component does. Returns the verdict and when it landed. */
function drive(script: Array<[number, number]>, maxMs = 20_000): { verdict: string; at: number } {
  const t0 = 1_000_000;
  const state = newVadState(t0);
  let now = t0;
  for (const [rms, dur] of script) {
    const until = now + dur;
    while (now < until) {
      const v = vadStep(state, rms, now, maxMs);
      if (v !== "listening") return { verdict: v, at: now - t0 };
      now += 60;
    }
  }
  return { verdict: "listening", at: now - t0 };
}

const LOUD = SPEECH_RMS + 0.05;
const QUIET = SPEECH_RMS - 0.02;

console.log("\n── 1. END OF SPEECH ─────────────────────────────────────────────");

// The ordinary case: someone says a sentence and stops.
{
  const r = drive([[QUIET, 300], [LOUD, 1500], [QUIET, 3000]]);
  ok("a sentence followed by a real pause ends the turn", r.verdict === "spoke");
  ok(`…and it ends about ${HANGOVER_MS}ms after they stopped, not instantly`,
    r.at >= 300 + 1500 + HANGOVER_MS - 120 && r.at <= 300 + 1500 + HANGOVER_MS + 120);
}

// THE FAILURE PEOPLE ACTUALLY NOTICE. A pause between words must not cut them off. This is
// the assertion that would have caught a hangover set to, say, 300ms.
{
  const r = drive([[LOUD, 900], [QUIET, 600], [LOUD, 900], [QUIET, 500], [LOUD, 800], [QUIET, 3000]]);
  ok("a natural pause MID-SENTENCE does not end the turn", r.verdict === "spoke");
  ok("…and the turn ends only after the LAST word, not the first pause",
    r.at > 900 + 600 + 900 + 500 + 800);
}
for (const gap of [200, 500, 800, 1000]) {
  const r = drive([[LOUD, 600], [QUIET, gap], [LOUD, 600], [QUIET, 3000]]);
  ok(`a ${gap}ms gap is a pause, not the end of a turn`,
    r.verdict === "spoke" && r.at > 600 + gap + 600);
}

// A SILENT ROOM MUST NEVER UPLOAD. A clip of silence still costs a transcription and still
// burns one of the visitor's turns.
{
  const r = drive([[QUIET, 20_000]]);
  ok("a silent room yields `silent`, never `spoke`", r.verdict === "silent");
  ok(`…and gives up at ${NO_SPEECH_MS}ms rather than holding the microphone open`,
    r.at >= NO_SPEECH_MS - 120 && r.at <= NO_SPEECH_MS + 120);
}
// …and it must not wait out the full ceiling to say so.
{
  const r = drive([[QUIET, 60_000]], 30_000);
  ok("silence is reported before the hard ceiling, not at it", r.at < 30_000);
}

// SOMEONE WHO TALKS PAST THE CEILING IS STILL HEARD. Discarding a long answer because the
// visitor was verbose is worse than a slightly long clip.
{
  const r = drive([[LOUD, 60_000]], 6_000);
  ok("continuous speech past the ceiling is sent, not discarded", r.verdict === "spoke");
  ok("…and it is cut at the ceiling", r.at >= 6_000 - 120 && r.at <= 6_000 + 120);
}
// But a ceiling reached with NO speech has nothing to send.
{
  const r = drive([[QUIET, 60_000]], 3_000);
  ok("the ceiling with no speech at all is `cutoff`, not `spoke`", r.verdict === "cutoff");
}

// The threshold is a threshold: exactly-at is not above.
{
  const r = drive([[SPEECH_RMS, 20_000]]);
  ok("rms exactly at the floor is not speech", r.verdict === "silent");
  const r2 = drive([[SPEECH_RMS + 0.001, 2000], [QUIET, 3000]]);
  ok("rms just above the floor is speech", r2.verdict === "spoke");
}

// A single loud sample (a door slam) still arms the detector — and then the hangover ends
// the turn, so the worst case is one short clip, not a stuck microphone.
{
  const r = drive([[LOUD, 60], [QUIET, 5000]]);
  ok("a one-sample transient cannot hold the microphone open forever", r.verdict === "spoke");
}

console.log("\n── 2. WHAT TO DO WITH A RESPONSE ────────────────────────────────");

// A CAP IS AN ANSWER. A hands-free loop makes turns far faster than typing does, so a
// refusal must END the call. Retrying would let the CLIENT decide how much money an
// unauthenticated page may spend, and that is the one party that must never hold it.
ok("429 ends the call — the loop never retries into a cap",
  callResponseAction(429, true).kind === "end" &&
  (callResponseAction(429, true) as { reason: string }).reason === "rate_limited");
ok("…and 429 ends it even when audio came back",
  callResponseAction(429, true).kind === "end");
ok("503 ends the call", callResponseAction(503, false).kind === "end");
for (const s of [400, 401, 404, 411, 413, 422, 500, 502]) {
  ok(`${s} ends the call rather than looping`, callResponseAction(s, true).kind === "end");
}

// NO AUDIO IS NOT A FAILURE — it is the product rule working. Safety, money, payment-link
// and receipt replies are text-only, and ending the call on those would stop the demo
// precisely when it is demonstrating the guarantee it exists to show.
ok("a 200 WITH audio is spoken", callResponseAction(200, true).kind === "speak");
ok("a 200 with NO audio shows the text and keeps going, not an error",
  callResponseAction(200, false).kind === "show_text");
ok("…and it is labelled as deliberate, not as a fault",
  (callResponseAction(200, false) as { note: string }).note === "text_only");
for (const s of [200, 201, 204, 299]) {
  ok(`${s} is treated as success`, callResponseAction(s, true).kind === "speak");
}

console.log("\n── 3. THE CAPABILITY PROBE GATES THE WHOLE SCREEN ───────────────");
// The call screen must not offer itself when the server cannot both hear and speak: a
// screen that listens, thinks, then answers with silence reads as a dropped call, which
// KIV-308 names the worst outcome available here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const cap = readFileSync(resolve(process.cwd(), "app/api/demo/capabilities/route.ts"), "utf8");
ok("the probe requires BOTH halves — ears and voice",
  /voiceIn && voiceOut/.test(cap));
ok("the probe is host-gated like the demo routes themselves",
  /isDemoHost\(req\.headers\.get\("host"\)\)/.test(cap));
ok("the probe is never cached — it flips with configuration",
  /"Cache-Control": "no-store"/.test(cap));
ok("the probe discloses one boolean and no provider detail",
  /voiceCall: voiceIn && voiceOut/.test(cap) &&
  !/ELEVENLABS_API_KEY|voiceId|apiKey/.test(cap));

const phone = readFileSync(resolve(process.cwd(), "app/demo/DemoPhone.tsx"), "utf8");
const callScreen = phone.slice(phone.indexOf("function CallScreen("), phone.indexOf("const Dot = ("));
ok("the screen falls back to the honest panel when the probe says no",
  /setPhase\("unavailable"\)/.test(phone) &&
  /المكالمة الصوتية غير مفعّلة في التجربة/.test(phone));
// NO FAKE CONNECTION, AT ALL. Not "a duration that starts once a turn completes" — none.
// A counting duration on a call-styled screen reads as a connected call whenever it starts,
// and this is a half-duplex voice conversation. proof-public-demo-hardening asserts the
// same absence from the other side; both must agree or the guard is one edit from gone.
ok("the call screen has no duration counter of any kind",
  !/setSecs|callDuration|mmss/.test(callScreen));
// `mmss` DOES exist in this file — it renders the length of a voice NOTE in the thread,
// which is a recording's real duration and nothing to do with a call. Scoping matters:
// a whole-file scan would fail on it and push the next reader to delete the assertion.
ok("…while the voice-note player keeps its own duration", /mmss\(recSecs\)/.test(phone));
// Scoped to the CALL SCREEN. A whole-file scan for «متصل الآن» also catches the chat
// header's ordinary online indicator at the top of the thread, which is a legitimate
// WhatsApp affordance and not a claim that a call connected — the first version of this
// assertion failed on it, which would have taught the next reader to delete the assertion
// rather than the fake.
ok("the call screen calls itself a voice conversation, not a phone call",
  /محادثة صوتية/.test(callScreen) &&
  !/>\s*متصل الآن/.test(callScreen) &&
  !/رنين|يرن/.test(callScreen));
ok("…and the chat header's own online indicator is untouched",
  /\{typing \? "يكتب…" : "متصل الآن"\}/.test(phone));
// The microphone must come back on every exit path.
ok("hanging up releases the microphone and the audio context",
  /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(phone) && /audioCtx\.current\?\.close\(\)/.test(phone));

console.log(`\n${fails.length ? "FAIL" : "PASS"} demo-call-loop: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
