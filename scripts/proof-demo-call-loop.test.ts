// ============================================================================
// PROOF — the demo's hands-free voice call (KIV-308 option A).
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-demo-call-loop.test.ts
//
// THIS FILE EXISTS IN ITS CURRENT FORM BECAUSE ITS FIRST VERSION DID NOT WORK.
//
// That version drove the two pure functions in lib/demo/call-loop.ts and read the component
// with regexes. Two independent adversarial reviews then broke the feature while keeping it
// green — fourteen mutations survived between them, and TWO survived the entire 215-file
// suite: inverting the capability probe (so the honest panel shows exactly when the voice
// works, and the call screen opens exactly when it does not), and deleting the microphone
// release from hangUp() (so the mic stays open after the visitor hangs up). Both were
// "covered" by assertions matching text inside a function that nothing called.
//
// Two lessons, both already written down in this repo and both re-learned here:
//   * an assertion on a NAME, or on text in an uncalled function, protects nothing;
//   * a test whose inputs are defined in terms of the constant under test — the old
//     `LOUD = SPEECH_RMS + 0.05` — cannot constrain that constant at all.
//
// So section 3 EXECUTES the real CallScreen out of the real DemoPhone.tsx, against
// instrumented browser APIs, and asserts what the component actually did.
// ============================================================================

import {
  newVadState, vadStep, callResponseAction,
  ABSOLUTE_FLOOR, SPEECH_RATIO, HANGOVER_MS, NO_SPEECH_MS, CALIBRATION_MS, FLOOR_MAX,
} from "../lib/demo/call-loop.ts";
import { makeRuntime, loadCallScreen, installBrowser, visibleText, findByLabel } from "./call-screen-harness.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fails.push(label); console.log(`  FAIL ${label}`); }
};

/** Drive the detector over a scripted waveform: [rms, durationMs] pairs, sampled every
 *  60ms exactly as the component does. */
function drive(script: Array<[number, number]>, maxMs = 20_000): { verdict: string; at: number; threshold: number } {
  const t0 = 1_000_000;
  const state = newVadState(t0);
  let now = t0;
  for (const [rms, dur] of script) {
    const until = now + dur;
    while (now < until) {
      const v = vadStep(state, rms, now, maxMs);
      if (v !== "listening") return { verdict: v, at: now - t0, threshold: state.threshold };
      now += 60;
    }
  }
  return { verdict: "listening", at: now - t0, threshold: state.threshold };
}

/** A quiet room, then speech, then quiet. `room` and `speech` are ABSOLUTE rms values —
 *  never expressed in terms of the threshold, or the threshold goes untested. */
const turn = (room: number, speech: number, speechMs = 1500) =>
  drive([[room, CALIBRATION_MS + 60], [speech, speechMs], [room, 4000]]);

console.log("\n── 1. END OF SPEECH ─────────────────────────────────────────────");

// ── ABSOLUTE VALUES. The previous version defined its inputs as SPEECH_RMS ± a constant,
// so setting the floor to 0.9 (no human voice reaches it) or 0.000001 (silence is speech)
// left every waveform assertion green. These are real rms levels.
ok("a normal speaker in a quiet room is heard", turn(0.005, 0.15).verdict === "spoke");
ok("a QUIET speaker in a quiet room is heard too — the call must not end on them",
  turn(0.004, 0.030).verdict === "spoke");
ok("a very loud speaker is heard", turn(0.005, 0.60).verdict === "spoke");
// The failure the old constant produced: a busy restaurant, which is the room this product
// is SOLD INTO. A fixed 0.045 floor latched on the hum, never saw quiet again, and uploaded
// the full 20-second ceiling to the transcriber on every single turn.
ok("a noisy room does NOT latch on its own hum",
  drive([[0.05, CALIBRATION_MS + 60], [0.05, 19_000]]).verdict === "silent");
ok("…and in that same noisy room, real speech over the hum is still heard",
  turn(0.05, 0.30).verdict === "spoke");
ok("…and that turn ends on the hangover, not at the 20s ceiling",
  turn(0.05, 0.30).at < 5000);
for (const room of [0.002, 0.01, 0.03, 0.05, 0.08]) {
  const t = turn(room, Math.max(0.12, room * 4));
  ok(`room ${room}: speech heard, turn ends promptly (threshold ${t.threshold.toFixed(3)})`,
    t.verdict === "spoke" && t.at < 5000);
}
// The calibrated threshold must actually track the room, and never fall below the floor.
ok("the threshold is the room times the ratio, floored",
  Math.abs(turn(0.02, 0.4).threshold - 0.02 * SPEECH_RATIO) < 1e-9 &&
  turn(0.0001, 0.4).threshold === ABSOLUTE_FLOOR);
ok("a room noisier than the clamp does not push the threshold arbitrarily high",
  turn(0.5, 0.9).threshold <= FLOOR_MAX * SPEECH_RATIO + 1e-9);
// SOMEONE WHO TALKS FROM THE VERY FIRST INSTANT. Without a clamp they would calibrate the
// room to their own voice and never be heard. An audit showed the clamp only NARROWED that:
// at FLOOR_MAX 0.06 the threshold could pin at 0.15, so an immediate talker below that was
// still lost and the call ended at 8s with «ما سمعت شي». Driven at real speech levels, not
// at one comfortable value 1.7x above the pin.
for (const level of [0.09, 0.12, 0.15, 0.25, 0.4]) {
  ok(`a visitor talking from the first instant at rms ${level} is heard`,
    drive([[level, 2000], [0.005, 4000]]).verdict === "spoke");
}
// And when the opening window WAS contaminated by speech, the floor must fall once a real
// pause arrives — otherwise the whole turn is judged against a threshold measured off the
// visitor's own voice.
{
  // The case that NEEDS the correction: an immediate talker QUIETER than the pinned
  // threshold. Calibration measures their voice (0.08), the threshold pins above it, and
  // without the downward correction nothing they say for the rest of the turn is ever
  // heard — the call ends at 8s on a person who was talking the whole time.
  const r = drive([[0.08, 400], [0.004, 1500], [0.08, 800], [0.004, 3000]]);
  ok("an immediate talker quieter than the pinned threshold is still heard",
    r.verdict === "spoke");
  ok("…because the floor corrects downward at the first real pause",
    r.threshold <= ABSOLUTE_FLOOR + 1e-9);
}
// …but it must NOT keep moving once speech is under way, or it drifts up into the speech
// and cuts them off mid-sentence.
ok("the threshold stops moving once a turn is under way",
  drive([[0.004, CALIBRATION_MS + 60], [0.2, 900], [0.004, 600], [0.2, 900], [0.004, 3000]]).at
    > CALIBRATION_MS + 900 + 600 + 900);

// THE FAILURE PEOPLE NOTICE. A pause between words must not cut them off.
{
  const r = drive([[0.005, CALIBRATION_MS + 60], [0.2, 900], [0.005, 600],
                   [0.2, 900], [0.005, 500], [0.2, 800], [0.005, 3000]]);
  ok("a natural pause MID-SENTENCE does not end the turn", r.verdict === "spoke");
  ok("…and the turn ends only after the LAST word", r.at > 900 + 600 + 900 + 500 + 800);
}
for (const gap of [200, 500, 800, 1000]) {
  const r = drive([[0.005, CALIBRATION_MS + 60], [0.2, 600], [0.005, gap], [0.2, 600], [0.005, 3000]]);
  ok(`a ${gap}ms gap is a pause, not the end of a turn`, r.verdict === "spoke" && r.at > 600 + gap + 600);
}
ok(`the hangover is ${HANGOVER_MS}ms — long enough for Arabic running speech`,
  HANGOVER_MS >= 900 && HANGOVER_MS <= 1500);

// A silent room must never upload: a clip of silence still costs a transcription and still
// burns one of the visitor's turns.
{
  const r = drive([[0.002, 20_000]]);
  ok("a silent room yields `silent`, never `spoke`", r.verdict === "silent");
  ok(`…and gives up at ${NO_SPEECH_MS}ms rather than holding the microphone open`,
    r.at >= NO_SPEECH_MS - 120 && r.at <= NO_SPEECH_MS + 120);
  ok("silence is reported before the hard ceiling, not at it",
    drive([[0.002, 60_000]], 30_000).at < 30_000);
}
// Someone who talks past the ceiling is still heard; the ceiling with NO speech has
// nothing to send.
ok("continuous speech past the ceiling is sent, not discarded",
  drive([[0.005, CALIBRATION_MS + 60], [0.3, 60_000]], 6_000).verdict === "spoke");
ok("the ceiling with no speech at all is `cutoff`, not `spoke`",
  drive([[0.002, 60_000]], 3_000).verdict === "cutoff");
ok("a one-sample transient cannot hold the microphone open forever",
  drive([[0.005, CALIBRATION_MS + 60], [0.5, 60], [0.005, 5000]]).verdict === "spoke");
ok(`calibration is ${CALIBRATION_MS}ms — long enough to measure, short enough not to be felt`,
  CALIBRATION_MS >= 180 && CALIBRATION_MS <= 600);

console.log("\n── 2. WHAT TO DO WITH A RESPONSE ────────────────────────────────");

// A CAP IS AN ANSWER. Retrying would let the CLIENT decide how much money an
// unauthenticated page may spend, and that is the one party that must never hold it.
ok("429 ends the call — the loop never retries into a cap",
  callResponseAction(429, true).kind === "end" &&
  (callResponseAction(429, true) as { reason: string }).reason === "rate_limited");
// 503 is the demo being SWITCHED OFF, including by the Founder's own kill switch. Calling
// that «انقطع الاتصال» reports a product failure that did not happen.
ok("503 is reported as stopped, not as a dropped connection",
  (callResponseAction(503, false) as { reason: string }).reason === "stopped");
for (const s of [400, 401, 404, 411, 413, 422, 500, 502]) {
  ok(`${s} ends the call rather than looping`, callResponseAction(s, true).kind === "end");
}
ok("a 200 WITH audio is spoken", callResponseAction(200, true).kind === "speak");

// NO AUDIO — AND THE REASON DECIDES. Collapsing these two made every provider failure
// display the safety-rule explanation and kept the loop recording.
ok("a rule-based silence shows the text and keeps going",
  callResponseAction(200, false, "rule").kind === "show_text");
ok("…labelled as deliberate, not as a fault",
  (callResponseAction(200, false, "rule") as { note: string }).note === "text_only");
ok("an UNAVAILABLE voice ends the call instead of pretending a rule caused it",
  (callResponseAction(200, false, "unavailable") as { reason: string }).reason === "voice_unavailable");
// The conservative default: an older server that does not send the field must not have its
// silence dressed up as a product guarantee.
ok("an unexplained silence is NOT treated as a rule",
  callResponseAction(200, false).kind === "end" &&
  callResponseAction(200, false, "none").kind === "end");

console.log("\n── 3. THE COMPONENT, EXECUTED ───────────────────────────────────");

const QUIET_ROOM = Array(7).fill(0.005);
const SPEAKS = [...QUIET_ROOM, ...Array(10).fill(0.20), ...Array(18).fill(0.005)];
const AUDIO_OK = {
  conversationId: "c1", transcript: "أبغى كبسة", reply: "تمام، كبسة وحدة",
  replyAudio: Buffer.from("OGGBYTES").toString("base64"),
  replyAudioMime: "audio/ogg", replyAudioSilence: "none",
};

async function runScreen(opts: {
  capabilities?: boolean;
  server?: (n: number) => { status: number; body?: unknown };
  rmsScript?: number[];
  history?: unknown[];
  ms?: number;
  hangUpAfterMs?: number;
  /** Press the hangup BUTTON rather than unmounting — they are different code paths. */
  pressHangUpAfterMs?: number;
  serverDelayMs?: number;
  /** The element the opening tap unlocked, as the parent supplies it. */
  player?: unknown;
  /** Make every play() reject with NotAllowedError — Safari's autoplay refusal. */
  playRejects?: boolean;
}) {
  const rt = makeRuntime();
  const log = installBrowser({
    capabilities: opts.capabilities ?? true,
    rmsScript: opts.rmsScript ?? SPEAKS,
    server: opts.server ?? (() => ({ status: 200, body: AUDIO_OK })),
    serverDelayMs: opts.serverDelayMs ?? 0,
    playRejects: opts.playRejects ?? false,
  });
  const CallScreen = loadCallScreen(rt.React);
  const pushed: Array<Record<string, unknown>> = [];
  let ended = false;
  const props = {
    convId: { current: null as string | null },
    onSession: () => {},
    push: (m: Record<string, unknown>) => { pushed.push(m); return m; },
    historyRef: { current: (opts.history ?? [{ from: "me", kind: "text", text: "سلام" }]) as unknown[] },
    audioUrls: { current: [] as string[] },
    // THE ELEMENT THE OPENING TAP UNLOCKED. Supplied by the parent because Safari only
    // permits playback it can attribute to a gesture, and that permission is long gone by
    // the time a turn has audio: a fresh `new Audio()` per turn was rejected on every turn
    // of every call for every Apple visitor, while the server logged a clean 200.
    // `null` here on purpose — CallScreen must still work when the parent gave it nothing,
    // which is what a non-Safari browser and the pre-unlock path both look like.
    player: { current: (opts.player ?? null) as unknown },
    onEnd: () => { ended = true; },
  };
  // SAMPLE WHAT THE VISITOR SAW OVER TIME, not only at the end. A call screen moves through
  // listening → thinking → speaking on its own, so a single final snapshot asserts whatever
  // phase the clock happened to stop in — which is a coin toss, not a test.
  const seen: string[] = [];
  const sampler = setInterval(() => { seen.push(visibleText(rt.tree).join(" | ")); }, 150);
  rt.mount(() => CallScreen(props));
  if (opts.hangUpAfterMs != null) {
    await new Promise((r) => setTimeout(r, opts.hangUpAfterMs));
    rt.unmount();
  }
  if (opts.pressHangUpAfterMs != null) {
    await new Promise((r) => setTimeout(r, opts.pressHangUpAfterMs));
    const btn = findByLabel(rt.tree, "إنهاء") as { onClick?: () => void } | null;
    if (!btn?.onClick) throw new Error("no hangup button rendered");
    btn.onClick();
  }
  await new Promise((r) => setTimeout(r, opts.ms ?? 5200));
  const text = visibleText(rt.tree).join(" | ");
  clearInterval(sampler);
  // SNAPSHOT BEFORE TEARDOWN. The unmount below releases everything, so counters read
  // AFTER it always balance — which silently forgave a hangUp() that released nothing.
  // What a hangup must guarantee is that the microphone is back BEFORE the component is
  // ever unmounted, because on a real page nothing unmounts it.
  const atHangup = {
    tracksOpened: log.tracksOpened, tracksStopped: log.tracksStopped,
    ctxOpened: log.ctxOpened, ctxClosed: log.ctxClosed,
    requests: log.voiceRequests.length, played: log.played.length,
  };
  const everSaw = (needle: string) => seen.some((t) => t.includes(needle)) || text.includes(needle);
  // ALWAYS TEAR DOWN before returning. Leaving a scenario's loop running let it keep
  // recording, uploading and opening AudioContexts into the NEXT scenario's counters —
  // which is how this harness first "found" a request issued after hangup and a leaked
  // audio context. Neither was real: instrumented properly, the component runs its mount
  // effect exactly once, closes every context it opens, and issues nothing after teardown.
  // A test double that bleeds between cases invents defects as readily as it hides them.
  rt.unmount();
  await new Promise((r) => setTimeout(r, 120));
  return { log, pushed, ended, props, text, everSaw, atHangup };
}

// (a) THE HAPPY PATH — and the two things it must carry.
{
  const r = await runScreen({ ms: 11_000 });
  ok("the screen probes capabilities before opening a microphone", r.log.capabilityRequests === 1);
  ok("a turn reaches /api/demo/voice", r.log.voiceRequests.length >= 1);

  // HISTORY TRAVELS. Without it a hands-free CONVERSATION has no memory of its own previous
  // turn — and the session-scoped allergen collector, which reads history, returns nothing,
  // degrading the durable kitchen note from a declared allergy to «غير محدد». The mic-note
  // path has carried history since that defect was fixed there; the call screen shipped
  // without it, on the one surface where memory is the entire feature.
  const fields = (r.log.voiceRequests[0] ?? []).map((f: string[]) => f[0]);
  ok("the clip carries the conversation history", fields.includes("history"));
  const hist = (r.log.voiceRequests[0] ?? []).find((f: string[]) => f[0] === "history")?.[1] ?? "";
  ok("…and the history is the real thread, not an empty array",
    hist.includes("سلام") && hist !== "[]");

  ok("the reply is played", r.log.played.length >= 1);

  // ── THE ELEMENT THE TAP UNLOCKED IS THE ONE THAT PLAYS ────────────────────
  //
  // Found in production, after the key and the container were both already fixed. Safari
  // only permits audio it can attribute to a user gesture, and that permission expires
  // seconds after the tap. A call turn spends far longer than that before it has anything
  // to play — capability probe, microphone prompt, the visitor actually speaking, then a
  // network round trip — so `new Audio(url).play()` was rejected on every turn of every
  // call for every Apple visitor, while the server logged a clean 200 and the page said
  // only that the voice was not working.
  //
  // An element played DURING a gesture stays unlocked, so the parent creates one inside the
  // click and this screen reuses it. Asserted by CONSTRUCTION COUNT, because "it played"
  // is true in a permissive test environment either way — the whole defect is invisible
  // except in the one browser that enforces the rule.
  {
    const provided = { url: undefined as string | undefined, _src: "", played: [] as string[],
      onended: null as null | (() => void), onerror: null as null | (() => void), error: null, muted: false,
      get src() { return this._src; }, set src(v: string) { this._src = v; },
      async play() { this.played.push(this._src); queueMicrotask(() => this.onended?.()); },
      pause() {} };
    const withPlayer = await runScreen({ ms: 5200, player: provided });
    ok("with an unlocked element supplied, the screen constructs NO new Audio",
      withPlayer.log.audioConstructed === 0);
    ok("…and every turn played through that same element",
      provided.played.length >= 1 && provided.played.every((u) => u.startsWith("blob:demo/")));
    ok("…and it played the object URL created for that turn, not a stale one",
      provided.played[provided.played.length - 1] === withPlayer.log.urlsCreated[provided.played.length - 1]);
  }

  // AND IT STILL WORKS WITH NOTHING SUPPLIED, so a browser that never needed unlocking —
  // and the path before the parent has created one — is not broken by the fix.
  {
    const none = await runScreen({ ms: 3000, player: null });
    ok("with no element supplied the screen still plays", none.log.played.length >= 1);
  }

  // ── THE PARENT MUST UNLOCK ON THE TAP, AND ONLY THE TAP WILL DO ───────────
  //
  // SOURCE-LEVEL, AND SAID PLAINLY: this harness mounts CallScreen, not the parent, so the
  // parent's half of the fix is checked by reading. That is the weaker kind of test this
  // file exists to warn about, and it is recorded as a known gap rather than dressed up —
  // removing `unlockPlayer()` from the click reproduces the Safari bug and nothing here
  // executes it. What is pinned is the part a regex can genuinely establish: that the
  // unlock happens in the SAME handler that opens the screen (an unlock anywhere else is
  // outside the gesture and therefore useless), and that it plays a decodable source
  // rather than an empty one, which would fire `error` and leave the element locked.
  {
    const src = readFileSync(resolve(process.cwd(), "app/demo/DemoPhone.tsx"), "utf8");
    ok("the call button unlocks the player in the same handler that opens the screen",
      /onClick=\{\(\) => \{ unlockPlayer\(\); setInCall\(true\); \}\}/.test(src));
    // TWO SEPARATE FACTS, not one window. The first version spanned both with a bounded
    // `[\s\S]{0,120}`, so adding a comment between them failed an assertion about code
    // that had not changed — a distance check masquerading as a behaviour check.
    ok("…and the unlock plays a real, decodable source, not an empty one",
      /const SILENT_MP3\s*=\s*\n?\s*"data:audio\/mpeg;base64,[A-Za-z0-9+/=]{200,}"/.test(src) &&
      /el\.src = SILENT_MP3;/.test(src) &&
      /unlockPlayer = useCallback\([\s\S]*?el\.play\(\)/.test(src));
    // AND IT MUST NEVER LEAVE THE ELEMENT MUTED. A version of this set `muted = true`
    // before play() and cleared it only in the promise callbacks, so a play() that never
    // settled — the exact call Safari may leave hanging — kept the element muted for the
    // whole call: every reply "played", fired onended, and made no sound. The frame is
    // silent by construction, so nothing here has any reason to touch `muted`.
    ok("…and the unlock never mutes the element it is unlocking",
      !/el\.muted/.test(src));
    ok("…and the unlocked element is handed to the call screen",
      /player=\{unlockedPlayer\}/.test(src));
  }

  // A REJECTED play() ENDS THE CALL HONESTLY rather than looping in silence. This is the
  // Safari behaviour itself: the call must say the voice is not working, not keep listening
  // while claiming a safety rule caused the quiet.
  {
    const blocked = await runScreen({ ms: 5200, playRejects: true });
    ok("a rejected play() ends the call rather than looping silently",
      blocked.log.voiceRequests.length === 1);
    ok("…and the visitor is told the voice is not working, not fed a safety-rule excuse",
      blocked.everSaw("الصوت") && !blocked.everSaw("سياسة"));
  }
  // OBJECT URLs SURVIVE THE CALL. Revoking the previous turn's URL destroyed audio the
  // THREAD was still rendering: every call bubble but the last played "الصوت ما اشتغل"
  // when pressed, because the player only fetches on press.
  ok("no object URL is revoked while the thread still renders it", r.log.urlsRevoked.length === 0);
  ok("…and every URL minted is registered with the parent for cleanup",
    r.props.audioUrls.current.length === r.log.urlsCreated.length);
  ok("the loop continues to a second turn", r.log.voiceRequests.length >= 2);
  ok("…without re-prompting for the microphone", r.log.micPrompts === 1);
  ok("the turn is recorded in the thread", r.pushed.some((m) => m.text === "تمام، كبسة وحدة"));
}

// (b) THE PROBE GATES THE SCREEN. Inverting it survived the whole suite before.
{
  const r = await runScreen({ capabilities: false, ms: 1200 });
  ok("probe says no → NO microphone is ever opened", r.log.micPrompts === 0);
  ok("probe says no → no turn is ever uploaded", r.log.voiceRequests.length === 0);
  ok("probe says no → the honest panel is shown",
    r.text.includes("المكالمة الصوتية غير مفعّلة في التجربة"));
}
{
  const r = await runScreen({ capabilities: true, ms: 1200 });
  ok("probe says yes → the honest panel is NOT shown",
    !r.text.includes("المكالمة الصوتية غير مفعّلة في التجربة"));
  ok("probe says yes → the microphone opens", r.log.micPrompts === 1);
}

// (c) HANGUP RELEASES THE MICROPHONE. Deleting release() from hangUp() survived the whole
// suite before, leaving the recording indicator lit on a stranger's phone.
{
  // UNMOUNTING is one path. Keep the clock running afterwards: nothing may resume.
  const r = await runScreen({ hangUpAfterMs: 900, ms: 2500 });
  ok("unmounting stops every microphone track",
    r.log.tracksStopped === r.log.tracksOpened && r.log.tracksOpened >= 1);
  ok("unmounting closes every AudioContext",
    r.log.ctxClosed === r.log.ctxOpened && r.log.ctxOpened >= 1);
  ok("…and no turn is uploaded after it", r.log.voiceRequests.length === 0);
}
{
  // PRESSING THE BUTTON is a DIFFERENT path, and the one a visitor actually uses. Asserting
  // only the unmount left `hangUp()` untested: deleting release() from it kept every
  // assertion green while the microphone stayed open on a stranger's phone, with the
  // recording indicator lit, after they had hung up.
  const r = await runScreen({ pressHangUpAfterMs: 900, ms: 2500 });
  ok("pressing hang up stops every microphone track — before any unmount",
    r.atHangup.tracksStopped === r.atHangup.tracksOpened && r.atHangup.tracksOpened >= 1);
  ok("pressing hang up closes every AudioContext — before any unmount",
    r.atHangup.ctxClosed === r.atHangup.ctxOpened && r.atHangup.ctxOpened >= 1);
  ok("pressing hang up tells the parent the call is over", r.ended === true);
  ok("…and no turn is uploaded after it", r.atHangup.requests === 0);
}

// (c2) HANGING UP WHILE KHALID IS THINKING. This is the state a visitor is most likely to
// hang up in, because it is the slowest — and it is the one where the loop itself will NOT
// clean up: the post-fetch path returns on `!live.current` without releasing anything, so
// hangUp() is the only thing that can hand the microphone back. Deleting release() from
// hangUp() passed every other assertion here, because the listening path's own teardown
// happened to cover for it.
{
  const r = await runScreen({ serverDelayMs: 2500, pressHangUpAfterMs: 3200, ms: 3000 });
  ok("a request is in flight when the visitor hangs up", r.atHangup.requests === 1);
  ok("hanging up MID-REQUEST stops every microphone track, with no unmount to help",
    r.atHangup.tracksStopped === r.atHangup.tracksOpened && r.atHangup.tracksOpened >= 1);
  ok("…and still closes every AudioContext", r.atHangup.ctxClosed === r.atHangup.ctxOpened);
  ok("…and the loop does not resume when the response lands",
    r.atHangup.requests === 1 && r.atHangup.played === 0);
}

// (d) A CAP ENDS THE CALL — driven, not reasoned about.
{
  const r = await runScreen({ server: () => ({ status: 429, body: {} }), ms: 6000 });
  ok("a 429 stops the loop after exactly one upload", r.log.voiceRequests.length === 1);
  ok("…and releases the microphone", r.log.tracksStopped === r.log.tracksOpened);
  ok("…and tells the visitor to keep typing", r.everSaw("كمّل معي بالكتابة"));
}

// (e) A RULE-BASED SILENCE CONTINUES; AN UNAVAILABLE VOICE STOPS. Before, both continued,
// and both blamed the safety rule — a fabricated demonstration of the one guarantee this
// page exists to sell, on a reply containing no allergen, no amount and no receipt.
{
  const r = await runScreen({
    server: () => ({ status: 200, body: { ...AUDIO_OK, replyAudio: null, replyAudioSilence: "rule" } }),
    ms: 13_000,
  });
  ok("a rule-based silence keeps the conversation going", r.log.voiceRequests.length >= 2);
  ok("…and explains, at the time, that this one is written on purpose",
    r.everSaw("نعرضها مكتوبة"));
}
{
  const r = await runScreen({
    server: () => ({ status: 200, body: { ...AUDIO_OK, replyAudio: null, replyAudioSilence: "unavailable" } }),
    ms: 6000,
  });
  ok("an unavailable voice stops the loop after one turn", r.log.voiceRequests.length === 1);
  ok("…and does NOT blame the safety rule for it", !r.everSaw("حساسية"));
  ok("…and says the voice is not working", r.everSaw("الصوت مو شغّال"));
  ok("…and releases the microphone", r.log.tracksStopped === r.log.tracksOpened);
}

// (f) A SILENT ROOM NEVER UPLOADS.
{
  const r = await runScreen({ rmsScript: Array(200).fill(0.003), ms: 9500 });
  ok("a silent room uploads nothing at all", r.log.voiceRequests.length === 0);
  ok("…and hands the microphone back", r.log.tracksStopped === r.log.tracksOpened);
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} demo-call-loop: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
