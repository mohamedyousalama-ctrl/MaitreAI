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

// WHAT A CALL ACTUALLY RECEIVES NOW, and what every scenario in this file was missing.
//
// A phone call's reply is delivered as `replyAudioUrl` — a signed URL the player fetches so
// playback starts while the provider is still speaking. The only fixture here sent
// `replyAudio` (inline base64), so NO assertion in the repo ever drove the streamed branch
// of the client. Driven: deleting `|| !!data.replyAudioUrl` from the client's
// `callResponseAction` call left the whole 222-file suite green while EVERY CALL DIED ON
// TURN ONE, telling a prospect the voice was broken.
const STREAMED_OK = {
  conversationId: "c1", transcript: "أبغى كبسة", reply: "تمام، كبسة وحدة",
  replyAudio: null,
  replyAudioUrl: "/api/demo/speak?t=TICKET&s=c1",
  replyAudioMime: "audio/mpeg", replyAudioSilence: "none",
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
  /** Fail only these play() attempts (1-indexed) — see the harness note. */
  playRejectTurns?: number[];
  /** Let these play() attempts resolve and then deliver nothing, forever. */
  playStallTurns?: number[];
  /** Let playback START and then starve after this many ms — no more progress, no end. */
  playStarveMs?: number;
  /** How long a reply takes to play. Needed for anything that happens DURING a reply. */
  playbackMs?: number;
}) {
  const rt = makeRuntime();
  const log = installBrowser({
    capabilities: opts.capabilities ?? true,
    rmsScript: opts.rmsScript ?? SPEAKS,
    server: opts.server ?? (() => ({ status: 200, body: AUDIO_OK })),
    serverDelayMs: opts.serverDelayMs ?? 0,
    playRejects: opts.playRejects ?? false,
    playRejectTurns: opts.playRejectTurns ?? null,
    playStallTurns: opts.playStallTurns ?? null,
    playStarveMs: opts.playStarveMs ?? null,
    playbackMs: opts.playbackMs ?? 0,
  });
  const CallScreen = loadCallScreen(rt.React);
  const pushed: Array<Record<string, unknown>> = [];
  let ended = false;
  const historyRef = { current: (opts.history ?? [{ from: "me", kind: "text", text: "سلام" }]) as Record<string, unknown>[] };
  const props = {
    convId: { current: null as string | null },
    onSession: () => {},
    // PUSHING APPENDS TO THE HISTORY, because in the real parent it does: `push` calls
    // setMsgs, an effect mirrors msgs into msgsRef, and msgsRef IS the historyRef handed to
    // this screen (DemoPhone.tsx:197-204, :627). A harness whose push and history were
    // disconnected could not observe the turn-to-turn memory of the conversation at all —
    // which is exactly how a filter that erased every reply Khalid SPOKE stayed green.
    push: (m: Record<string, unknown>) => { pushed.push(m); historyRef.current.push(m); return m; },
    historyRef,
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
    // BEFORE TEARDOWN. release() pauses the player on unmount, so a pause counted after it
    // is the harness cleaning up, not the visitor interrupting — and counting it made a
    // silent room look like a barge-in.
    paused: log.paused,
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
  // `seen` is returned so a failing assertion can SAY what was on the screen instead of
  // just that a string was absent. A screen assertion that fails with no screen in the
  // message costs a full instrumented re-run to diagnose.
  return { log, pushed, ended, props, text, everSaw, atHangup, seen };
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

  // AND KHALID REMEMBERS WHAT HE SAID OUT LOUD.
  //
  // The filter kept `kind === "text" || from === "me"`, and a reply Khalid SPEAKS is pushed
  // as `kind: "voice"` — so every spoken answer was stripped from the history sent on the
  // next turn. He asks «كم وحدة تبي؟», the caller answers, and the model has no record of
  // asking: he re-asks, re-offers the menu, and cannot honour "repeat that". Invisible on
  // WhatsApp (where replies are text) and ruinous on a call, which is why it survived.
  //
  // Driven on the SECOND turn's payload, because turn one cannot show it. The reply the
  // fixture speaks on turn one must appear as an assistant message on turn two.
  const hist2 = (r.log.voiceRequests[1] ?? []).find((f: string[]) => f[0] === "history")?.[1] ?? "";
  ok("turn two carries a history at all", hist2 !== "" && hist2 !== "[]");
  ok("…and it contains the reply Khalid SPOKE on turn one",
    hist2.includes("تمام، كبسة وحدة"));
  ok("…as an assistant turn, not attributed to the visitor",
    /"role"\s*:\s*"assistant"\s*,\s*"content"\s*:\s*"تمام، كبسة وحدة"/.test(hist2));
  // …and the visitor's own spoken turn is still there, as the user.
  ok("…and the visitor's transcribed words are still carried as the user",
    /"role"\s*:\s*"user"\s*,\s*"content"\s*:\s*"أبغى كبسة"/.test(hist2));

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

  // ── THE VISITOR MAY INTERRUPT ─────────────────────────────────────────────
  //
  // "The conversation should be continuous, not send and receive." The microphone used to
  // be CLOSED for the whole of Khalid's reply — the AudioContext was created and destroyed
  // around each recording — so a caller who heard the wrong answer in the first two seconds
  // had to sit through all of it. That is a walkie-talkie, not a phone call.
  //
  // The `rmsScript` here never falls quiet, so the room is still loud while the reply plays:
  // that is a visitor talking over Khalid. What must happen is that the player is PAUSED and
  // a new turn begins — not that the call ends.
  {
    // THE ACTUAL SCENARIO, in order: the room is quiet while the detector calibrates, the
    // visitor speaks, they stop long enough for the turn to end (the hangover is 1100ms, so
    // ~19 samples at the 60ms cadence), and then they START TALKING AGAIN while the reply
    // plays. A first attempt never went quiet at all, so the turn never ended, nothing was
    // ever uploaded and no reply ever played — the assertion reported "no interruption" for
    // a call that had not reached the point where interrupting is possible.
    const LOUD = [
      ...Array(7).fill(0.005),   // calibrate the room
      ...Array(10).fill(0.20),   // the visitor speaks
      ...Array(22).fill(0.004),  // …and stops, long enough to end the turn (>1100ms)
      ...Array(20).fill(0.30),   // …then talks OVER the reply — the interruption
      ...Array(25).fill(0.004),  // …and stops again, so the next turn can complete
    ];
    // THE SCRIPT WRAPS, so it has to be a whole realistic exchange rather than an ending
    // state. A first version finished on the loud block: every subsequent turn then
    // calibrated and spoke with no quiet stretch anywhere, ran to the 20-second ceiling,
    // and the test hung for minutes per turn. That was the fixture, not the component —
    // but it is also exactly what a caller in a permanently noisy room would experience.
    const r = await runScreen({ ms: 8000, rmsScript: LOUD, playbackMs: 900 });
    ok(`speech over the reply pauses it (${r.atHangup.paused} pauses)`, r.atHangup.paused >= 1);

    // THE FLOOR MUST COME BACK, AND THAT IS THE ASSERTION THAT WAS MISSING.
    //
    // The three checks here used to be: it paused, the call did not end, and no broken-voice
    // message appeared. Every one of them is ALSO TRUE OF A CALL THAT FROZE — pausing
    // satisfies the first, and a call that never reaches any ending satisfies the other two
    // by never getting there. Driven: deleting `settle?.(true)` from the barge watcher (the
    // exact first-version bug the component's own comment describes, where `pause()` fires
    // neither `ended` nor `error` so the playback promise never settles) left this file at
    // 108/108 PASS while the real call died on the visitor's first interruption —
    // microphone shut, nothing playing, nothing to end it but hanging up.
    //
    // A negative cannot catch a freeze, because a freeze is the absence of everything. Only
    // a POSITIVE can: after being interrupted, the screen must START LISTENING AGAIN.
    //
    // And this one does not test the fixture. `recorderStarts` counts the top of `runTurn`,
    // which needs no further speech from the waveform — a second complete UPLOAD would need
    // another calibrate-speak-stop cycle and that was the right thing to refuse. Handing the
    // floor back is barge-in's entire promise, so it is the thing to require.
    ok(`…and the floor comes back — it listens again after the interruption (${r.log.recorderStarts} turns)`,
      r.log.recorderStarts >= 2);
    ok("…and the call is still live, not ended by the interruption",
      !r.everSaw("انتهت المحادثة"));
    ok("…and it is not reported as a broken voice",
      !r.everSaw("الصوت مو شغّال"));
  }

  // AND A QUIET ROOM DOES NOT INTERRUPT ANYTHING. The two failures are not symmetric:
  // failing to interrupt costs a few seconds, a false interruption cuts Khalid off
  // mid-word on every turn and makes him look broken. The barge threshold is deliberately
  // well above the end-of-speech threshold for this reason.
  {
    const SPEAK_THEN_QUIET = [...Array(7).fill(0.005), ...Array(10).fill(0.20), ...Array(200).fill(0.004)];
    const r = await runScreen({ ms: 9000, rmsScript: SPEAK_THEN_QUIET, playbackMs: 900 });
    ok(`a quiet room never interrupts the reply (${r.atHangup.paused} pauses)`, r.atHangup.paused === 0);
  }

  // ── ONE SILENT TURN IS A PAUSE, NOT A DROPPED LINE ────────────────────────
  //
  // Eight seconds of quiet ENDED the call outright, on the first pause — so a visitor who
  // stopped to think, or who waited to be greeted, killed the demo on turn one and was told
  // so in text they were not looking at. A person says "hello?" once before hanging up.
  {
    const SILENT_ROOM = Array(400).fill(0.003);
    const r = await runScreen({ ms: 20_000, rmsScript: SILENT_ROOM });
    ok("a silent room does not upload anything", r.log.voiceRequests.length === 0);
    // TWO LISTENING TURNS, NOT ONE. This is the whole change, and nothing else can see it:
    // the microphone stream is opened once and reused, so `tracksOpened` is 1 either way,
    // and the give-up message appears in both cases — a mutation that ended the call on the
    // first silence passed every other assertion here.
    ok(`…and it listens a SECOND time before giving up (${r.log.recorderStarts} turns)`,
      r.log.recorderStarts >= 2);
    ok("…but a second consecutive silence does end it, rather than looping forever",
      r.everSaw("ما سمعت شي"));
  }

  // ── THE STREAMED DELIVERY, WHICH IS WHAT A REAL CALL GETS ────────────────
  {
    const streamed = await runScreen({ ms: 11_000, server: () => ({ status: 200, body: STREAMED_OK }) });
    ok("a streamed reply is played, not read as a broken voice",
      streamed.log.played.some((u: string) => u.includes("/api/demo/speak")));
    ok("…and the call keeps going", !streamed.everSaw("انتهت المحادثة"));
    ok("…and is never reported as a broken voice", !streamed.everSaw("الصوت مو شغّال"));
    ok(`…and the loop continues (${streamed.log.voiceRequests.length} turns)`,
      streamed.log.voiceRequests.length >= 2);

    // NO OBJECT URL IS MINTED FOR IT, and none is revoked. `URL.revokeObjectURL` on an
    // ordinary HTTP URL is meaningless, and registering one in the revoke list would mean
    // the thread's cleanup pass runs against something it does not own.
    ok("no object URL is created for a streamed reply", streamed.log.urlsCreated.length === 0);
    ok("…and none is revoked", streamed.log.urlsRevoked.length === 0);
    ok("…and nothing is registered for revocation", streamed.props.audioUrls.current.length === 0);

    // THE THREAD KEEPS THE WORDS, NOT A URL THAT DIES IN A MINUTE. The ticket expires in 60
    // seconds; a bubble pressed after the call would answer 204, which a media element
    // renders as «الصوت ما اشتغل» — the exact symptom an earlier commit removed, and this
    // time for every bubble, permanently.
    const khalidBubbles = streamed.pushed.filter((m: { from: string }) => m.from === "khalid");
    ok(`Khalid's streamed replies are recorded in the thread (${khalidBubbles.length})`,
      khalidBubbles.length >= 1);
    ok("…as TEXT, with no player pointed at an expiring URL",
      khalidBubbles.every((m: { kind: string; audioUrl?: string }) =>
        m.kind === "text" && !m.audioUrl));
    ok("…and the words themselves are kept",
      khalidBubbles.every((m: { text?: string }) => (m.text ?? "").includes("كبسة")));
  }

  // …AND THE BUFFERED DELIVERY IS UNCHANGED, because the chat voice note still uses it.
  {
    const buffered = await runScreen({ ms: 9000, server: () => ({ status: 200, body: AUDIO_OK }) });
    const khalidBubbles = buffered.pushed.filter((m: { from: string }) => m.from === "khalid");
    ok("a buffered reply still becomes a playable bubble",
      khalidBubbles.some((m: { kind: string; audioUrl?: string }) => m.kind === "voice" && !!m.audioUrl));
    ok("…from an object URL the parent will clean up",
      buffered.props.audioUrls.current.length === buffered.log.urlsCreated.length &&
      buffered.log.urlsCreated.length > 0);
  }

  // A VOICE THAT WILL NOT PLAY IS SAID OUT LOUD — after one, not zero, forgiveness.
  //
  // The call must never loop in silence while the screen reads «يتكلم…», and it must never
  // dress a broken voice up as a safety rule. That has not changed. What HAS changed is
  // where the line sits: the reply's audio is now usually STREAMED, fetched by the player
  // as a separate request, so it has failure modes the turn itself does not — a ticket that
  // expired while the caller was being thought about, a rate limit, one dropped connection.
  // Ending a live demo in front of a prospect over one of those is a worse answer than a
  // person would give, and the reply is already on their screen as text.
  //
  // So: the first failure costs one spoken sentence and the call continues. A SECOND in a
  // row is a broken voice and ends the call honestly. `playRejects` fails EVERY turn, which
  // is the persistent case, so it must still end — and must take two turns to do it.
  {
    const blocked = await runScreen({ ms: 8000, playRejects: true });
    // THE END MESSAGE ITSELF, not the bare word «الصوت» — the one-failure note now contains
    // that word too, so the substring stopped telling "the call ended, the voice is broken"
    // apart from "one reply stumbled and we carried on".
    ok(`a persistently rejected play() still ends the call (${blocked.log.voiceRequests.length} turns)`,
      blocked.everSaw("الصوت مو شغّال"));
    // ASSERTED ON THE SENTENCE THE COMPONENT ACTUALLY RENDERS.
    //
    // This used to check for «سياسة» — a word that appears NOWHERE in DemoPhone.tsx or
    // anywhere under lib/demo (`grep -c` → 0), so the assertion could not fail and was
    // green while the screen really did explain a broken voice as the product's safety
    // guarantee: «الرسائل اللي فيها حساسية أو مبالغ أو إيصال نعرضها مكتوبة دايماً» shown for
    // a reply like «تمام، كبسة وحدة», which has no allergen, no amount and no receipt in it.
    // On the page that sells that guarantee to restaurant owners.
    //
    // The strings below are the ones in the component. If either is renamed, this fails —
    // which is the point.
    ok("…and never borrows the safety-rule sentence to explain it",
      !blocked.everSaw("حساسية أو مبالغ أو إيصال"));
    ok("…and never claims the reply was withheld on purpose",
      !blocked.everSaw("هذي نعرضها مكتوبة"));
    ok("…but does say, in our own words, that the voice stumbled",
      blocked.everSaw("الصوت تعثّر"));
    // THE FORGIVENESS IS REAL, NOT A COMMENT. If the first failure ended the call as before,
    // exactly one turn would ever be uploaded; absorbing it means a second turn happens.
    ok(`…but it forgives the first failure and tries once more (${blocked.log.voiceRequests.length} turns)`,
      blocked.log.voiceRequests.length >= 2);
    // …AND IT DOES NOT FORGIVE FOREVER. A call that keeps uploading while nothing can be
    // heard is the silent loop this assertion has always existed to forbid.
    ok(`…and does not loop indefinitely (${blocked.log.voiceRequests.length} turns)`,
      blocked.log.voiceRequests.length <= 3);
  }

  // …AND "TWO IN A ROW" MEANS IN A ROW.
  //
  // A counter that never resets turns "two consecutive failures" into "two failures ever",
  // so a call that lost one sentence on turn 2 would die on a second blip twenty turns
  // later — for a voice that has been working the whole time. Driven: removing the reset
  // survived every other assertion in this file, because `playRejects` fails EVERY turn and
  // therefore cannot tell a run from a total. This fails the 1st and 3rd playbacks with a
  // good one between them, which is the shape that separates them.
  {
    // ONE FORGIVEN FAILURE MUST ALSO NOT BORROW THE SAFETY SENTENCE. This is the path a
    // visitor is most likely to hit — one bad fetch in an otherwise working call — and it
    // is the one where a fabricated explanation does the most damage, because the call then
    // CARRIES ON as if the product had demonstrated something it did not.
    const forgiven = await runScreen({ ms: 6000, playRejectTurns: [1] });
    ok("a single forgiven failure never shows the safety-rule sentence",
      !forgiven.everSaw("حساسية أو مبالغ أو إيصال"));
    ok("…and says the voice stumbled instead", forgiven.everSaw("الصوت تعثّر"));
    ok("…and the call keeps going", !forgiven.everSaw("انتهت المحادثة"));
  }

  // A STREAM THAT STARTS AND THEN STOPS ARRIVING MUST NOT FREEZE THE CALL.
  //
  // The playback wait has three exits — `ended`, `error`, a rejected `play()` — and a
  // stalled stream hits NONE of them. That state was unreachable while the audio was a
  // local blob (`play()` either worked or failed at once) and became reachable the moment
  // the player started fetching a URL: a slow provider, a hung route sitting until its 60s
  // ceiling, a body that stalls without closing. Driven before the fix, the screen sat on
  // «يتكلم…» indefinitely with the microphone shut and nothing to end it but hanging up —
  // the same shape as the barge-in freeze, arriving from the network instead of the mic.
  //
  // 15s of wall clock: the first turn has to reach playback (calibrate, speak, the 1100ms
  // hangover, upload), THEN the component's 7s no-progress ceiling has to expire, and the
  // recovery it triggers has to render. At 11s the stall fired on the way out and the
  // recovery landed after the window closed — the freeze assertions passed and the one
  // about what the caller is TOLD failed, which is the window being too short rather than
  // the component being wrong. Deliberately not shortened by making the ceiling
  // configurable: a timeout proven at a value the product does not use is not proven.
  {
    // A QUIET ROOM, ON PURPOSE. The first attempt used the default waveform and the
    // assertion about what the caller is TOLD failed while the freeze assertions passed —
    // because a stalled playback lasts seven seconds, and on a noisy script the barge-in
    // watcher fires inside that window, settles the promise as an INTERRUPTION and hands
    // the floor back. That is correct behaviour (a visitor who talks over dead air should
    // be heard) and it is not the case under test: it rescues the very freeze this exists
    // to prove is survivable on its own. The caller has to say nothing, which is exactly
    // what a person does while waiting for someone to start speaking.
    const STALL_ROOM = [
      ...Array(7).fill(0.005),    // calibrate
      ...Array(10).fill(0.20),    // the visitor speaks
      ...Array(22).fill(0.004),   // …and stops, ending the turn
      ...Array(200).fill(0.003),  // …then waits in silence while nothing arrives
    ];
    const stalled = await runScreen({ ms: 15_000, playStallTurns: [1], rmsScript: STALL_ROOM });
    // THE ANTI-FREEZE PROPERTY IS THAT THE FLOOR COMES BACK, not that another turn is
    // uploaded. A first version asserted a second upload and failed at 1 — correctly: the
    // room is deliberately silent after the stall, and a silent turn uploads NOTHING by
    // design (that is its own assertion elsewhere). Requiring an upload here would have been
    // testing the waveform, and the same mistake the barge-in block already made once.
    ok(`a stalled stream does not freeze the call — it listens again (${stalled.log.recorderStarts} turns)`,
      stalled.log.recorderStarts >= 2);
    ok("…and does not end stuck on «يتكلم…»", !stalled.text.includes("يتكلم…"));
    ok(`…and the caller is told the voice stumbled, not that a rule withheld it ` +
       `[${[...new Set(stalled.seen)].slice(-4).join(" ⏵ ").slice(0, 220)}]`,
      stalled.everSaw("الصوت تعثّر") && !stalled.everSaw("حساسية أو مبالغ أو إيصال"));
    ok("…and one stall does not end the call", !stalled.everSaw("الصوت مو شغّال"));
    // …and it is LISTENING again, which is the state a frozen call can never reach. The
    // warm close after two silences is not asserted here: it needs two 8s no-speech windows
    // AFTER the 7s stall, which is past this scenario's clock — and it already has its own
    // block above. Asserting it here would have been a scenario testing another scenario's
    // property with a window too short to see it.
  }

  // …AND A NOISY ROOM DOES NOT HIDE A SILENT CALL.
  //
  // The stall exit alone was not enough, and a quiet-room test could never show it. The
  // microphone is open during those seven seconds and the barge watcher is live, so ambient
  // noise — a restaurant, a café, a table of people, which is where this page is actually
  // shown — settles the playback promise as an INTERRUPTION before the stall timer fires.
  // `played` was then true, the `barged` branch returned above the failure branch, and the
  // call ran on: driven, FIVE turns, zero audio ever produced, the visitor told nothing and
  // the call never ending. A barge only counts as an interruption if there was something to
  // interrupt.
  {
    const NOISY = [
      ...Array(7).fill(0.005),   // calibrate
      ...Array(10).fill(0.20),   // the visitor speaks
      ...Array(22).fill(0.004),  // …and stops, ending the turn
      ...Array(40).fill(0.25),   // …then the room is loud while nothing plays
    ];
    const noisy = await runScreen({ ms: 20_000, playStallTurns: [1, 2, 3, 4, 5], rmsScript: NOISY });
    ok("a call that never makes a sound ends honestly, even in a loud room",
      noisy.everSaw("الصوت مو شغّال"));
    ok("…rather than running on turn after turn in silence",
      noisy.log.voiceRequests.length <= 3);
    ok("…and never blames a safety rule for it",
      !noisy.everSaw("حساسية أو مبالغ أو إيصال"));
  }

  // A STREAM THAT STARTS AND THEN STARVES IS NOT A REPLY.
  //
  // The harder half of the same failure, and the one that defeated two earlier signals. A
  // boolean latched on `playing` says "heard" forever after the first frame — but `playing`
  // only means the browser started the clock, so a body that delivers enough to begin and
  // then stops counts as a delivered reply. A minimum on `currentTime` catches that and
  // breaks something worse: a barge needs only 4 x 60ms, so a prompt interruption into a
  // perfectly good reply falls under any threshold worth setting and is scored as a failure.
  //
  // What separates them is RECENCY — is the element moving RIGHT NOW. Driven here in a loud
  // room, so ambient noise settles the promise as a barge before the stall ceiling and the
  // recency check is the only thing that can tell the difference.
  {
    const NOISY = [
      ...Array(7).fill(0.005), ...Array(10).fill(0.20), ...Array(22).fill(0.004),
      ...Array(40).fill(0.25),
    ];
    const starved = await runScreen({ ms: 32_000, playStarveMs: 400, rmsScript: NOISY });
    ok("a stream that starts and then starves still ends the call honestly",
      starved.everSaw("يبدو إن الصوت ما يوصل زين"));
    ok("…without claiming the voice is broken, which it cannot know",
      !starved.everSaw("الصوت مو شغّال"));
    ok(`…rather than running on indefinitely (${starved.log.voiceRequests.length} turns)`,
      starved.log.voiceRequests.length <= 6);
    ok("…and never blames a safety rule for it",
      !starved.everSaw("حساسية أو مبالغ أو إيصال"));
  }

  // AND A LONG REPLY THAT IS GENUINELY PLAYING IS NEVER CUT OFF.
  //
  // The stall ceiling is seven seconds and a reply can legitimately run longer than that, so
  // the claim the comment makes — "it bounds SILENCE, not duration" — rests entirely on the
  // timer re-arming from progress events. That was unprovable until the harness's audio
  // element started reporting `playing` and `timeupdate` the way a real one does; before, a
  // nine-second reply and a nine-second stall were the same thing to every scenario here.
  {
    // Speak once, then stay quiet for the whole nine seconds of playback — a caller
    // listening. `QUIET_ROOM` alone never produces a "spoke" verdict, so nothing is ever
    // uploaded and nothing plays: the first version asserted this against a call that had
    // not reached the point where a reply exists.
    const LISTENING = [
      ...Array(7).fill(0.005),    // calibrate
      ...Array(10).fill(0.20),    // the visitor speaks
      ...Array(22).fill(0.004),   // …and stops, ending the turn
      ...Array(220).fill(0.003),  // …then listens in silence for the whole reply
    ];
    const long = await runScreen({ ms: 16_000, playbackMs: 9000, rmsScript: LISTENING });
    ok(`a nine-second reply outlives the seven-second stall ceiling (${long.log.played.length} played)`,
      long.log.played.length >= 1 && !long.everSaw("الصوت تعثّر"));
    ok("…and is never reported as a broken voice", !long.everSaw("الصوت مو شغّال"));
  }

  // AND A REAL INTERRUPTION IS STILL A REAL INTERRUPTION. The counter must distinguish
  // "noise during dead air" from "the visitor spoke over an audible reply" — treating the
  // second as a failure would end a working call on the visitor's second interruption.
  {
    const LOUD = [
      ...Array(7).fill(0.005), ...Array(10).fill(0.20), ...Array(22).fill(0.004),
      ...Array(20).fill(0.30), ...Array(25).fill(0.004),
    ];
    const real = await runScreen({ ms: 12_000, rmsScript: LOUD, playbackMs: 900 });
    ok(`interrupting an audible reply is never counted as a failure (${real.atHangup.paused} pauses)`,
      real.atHangup.paused >= 1 && !real.everSaw("الصوت مو شغّال"));
    ok("…and the visitor is not told the voice stumbled", !real.everSaw("الصوت تعثّر"));
  }

  // AND A WORKING VOICE IN A LOUD ROOM IS NEVER CALLED BROKEN.
  //
  // The counter above cannot tell "the stream is starving" from "the room is loud and the
  // barge detector trips a few hundred milliseconds into every reply" — driven, a perfectly
  // good six-second reply in a persistently noisy room produces the SAME four thin turns as
  // a starved one. So the call may end, but it must not tell a restaurant owner sitting in
  // a restaurant that the product is broken. Adding a discriminator was tried and reopens
  // the starvation hole; the fix is the sentence, not the logic.
  {
    const LOUD_THROUGHOUT = [
      ...Array(7).fill(0.005), ...Array(10).fill(0.20), ...Array(22).fill(0.004),
      ...Array(60).fill(0.28),
    ];
    const noisyButFine = await runScreen({ ms: 24_000, playbackMs: 6000, rmsScript: LOUD_THROUGHOUT });
    ok("a working reply in a loud room is never called a broken voice",
      !noisyButFine.everSaw("الصوت مو شغّال"));
    ok("…and if the call does end, it says only what is true of both causes",
      !noisyButFine.everSaw("انتهت المحادثة") || noisyButFine.everSaw("يبدو إن الصوت ما يوصل زين"));
  }

  {
    const flaky = await runScreen({ ms: 9000, playRejectTurns: [1, 3] });
    ok(`two NON-consecutive failures do not end the call (${flaky.log.voiceRequests.length} turns)`,
      !flaky.everSaw("الصوت مو شغّال") && !flaky.everSaw("انتهت المحادثة"));
    ok("…and it is still going, not stuck", flaky.log.voiceRequests.length >= 3);
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
