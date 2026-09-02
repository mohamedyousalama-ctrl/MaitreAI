// ============================================================================
// PROOF — Khalid answers the phone.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-call-greeting.test.ts
//
// THE DEFECT. The call screen opened straight into "listening": Khalid said nothing and the
// visitor had to speak first into a silent line. Nobody answers a phone that way, and a
// restaurant owner shown that screen sees a product waiting to be talked at.
//
// It was also the worst possible first second for everything else on that screen — the
// no-speech clock starts immediately, so a visitor who hesitates (which is what a person
// does when a line goes quiet) burned the one re-prompt before the conversation began.
//
// WHAT THIS FILE GUARDS. Three things, in order of how much they would cost:
//   1. The greeting text is OURS. `/api/demo/speak` will only say something the server
//      signed; a greeting the browser could choose is the text-to-speech oracle that whole
//      design exists to prevent.
//   2. It is subject to the SAME gate as any reply — no price, no order number, no link —
//      because it is minted through `demoVoiceTicket`, not around it.
//   3. Every failure path is the OLD behaviour: the call opens listening. A greeting is
//      worth adding; it is not worth a call that will not start.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KHALID_VOICE } from "../lib/ai/tts/voice-registry.ts";

const SECRET = "proof-secret-that-is-comfortably-over-32-chars";
process.env.DEMO_SPEECH_SECRET = SECRET;
process.env.TTS_ADAPTER = "elevenlabs";
process.env.ELEVENLABS_API_KEY = "el-key-for-the-proof";
process.env.ELEVENLABS_VOICE_ID = KHALID_VOICE.voiceId;
delete process.env.ELEVENLABS_TTS_MODEL;

const { demoCallGreeting, DEMO_CALL_GREETING } = await import("../lib/demo/call-greeting.ts");
const { verifySpeechTicket } = await import("../lib/demo/speech-ticket.ts");
const { voiceHardZeroReason } = await import("../lib/messaging/voice-budget.ts");
const { toSpokenText } = await import("../lib/ai/tts/spoken-text.ts");

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

console.log("\n── HE SAYS SOMETHING, AND IT IS PLAYABLE ───────────────────────");
{
  const g = demoCallGreeting("sess-1");
  ok("a greeting is minted", g !== null);
  ok("…with words", (g?.text ?? "").trim().length > 0);
  ok("…and a URL the player can fetch", String(g?.url ?? "").startsWith("/api/demo/speak?t="));
  ok("…bound to the session that will redeem it", String(g?.url ?? "").includes("&s=sess-1"));

  // THE URL MUST ACTUALLY REDEEM. A greeting that cannot be played is silence with extra
  // steps, and it would look like a working feature in every log we keep.
  const t = new URL(`https://x.test${g?.url}`).searchParams.get("t");
  const v = verifySpeechTicket(t, { sid: "sess-1" });
  ok("the ticket verifies on its own session", v.ok === true);
  ok("…and carries the greeting we published, not something else",
    v.ok && v.payload.text === g?.text);
  ok("…in the registry's voice", v.ok && v.payload.voiceId === KHALID_VOICE.voiceId);
}

console.log("\n── THE WORDS ARE OURS, AND THEY PASS THE SAME GATE ─────────────");
{
  // Minted THROUGH `demoVoiceTicket`, not around it — so the greeting is held to every rule
  // a reply is held to. A future edit that put a price or a link in it mints nothing, and
  // the call starts silent rather than speaking a figure nobody can check.
  ok("the greeting is speakable by the product's own rule",
    voiceHardZeroReason(DEMO_CALL_GREETING, { safetyHold: false, isReceipt: false }) === null);
  ok("…it names no price", !/\d|ريال|ر\s*\.?\s*س/.test(DEMO_CALL_GREETING));
  ok("…no link", !/https?:|www\.|رابط/.test(DEMO_CALL_GREETING));
  ok("…and no order number", !/رقم\s*\d/.test(DEMO_CALL_GREETING));

  // SHORT, because the microphone is not listening while it plays: every extra word is a
  // word the visitor could be talking over and losing.
  ok(`it is short enough to talk after, not over (${DEMO_CALL_GREETING.length} chars)`,
    DEMO_CALL_GREETING.length <= 90);
  // It has to survive the ear-rendering pass with its meaning intact.
  ok("…and it survives being rendered for the ear", toSpokenText(DEMO_CALL_GREETING).trim().length > 20);

  // IT ANSWERS LIKE A PERSON: names the place (a caller needs to know they dialled right),
  // names him, and ENDS ON A QUESTION so the floor is handed over rather than left open.
  ok("it names the restaurant", DEMO_CALL_GREETING.includes("مطعم"));
  ok("it names Khalid", DEMO_CALL_GREETING.includes("خالد"));
  ok("…and it hands the floor over with a question", DEMO_CALL_GREETING.trim().endsWith("؟"));

  // A POISONED GREETING MINTS NOTHING. Driven rather than assumed, because "the constant is
  // clean today" is not the property — the property is that the gate is in the path.
  const { demoVoiceTicket } = await import("../lib/demo/speech-ticket.ts");
  for (const bad of ["تفضل الرابط https://pay.example.com", "الإجمالي 45 ريال", "   "]) {
    ok(`a greeting like «${bad.slice(0, 26)}» would mint nothing`,
      demoVoiceTicket(bad, { inboundWasVoice: true, sid: null }).speechUrl === null);
  }
}

console.log("\n── AND IT NEVER STOPS A CALL FROM STARTING ─────────────────────");
{
  // Every failure path must land on the behaviour that shipped before this existed: the
  // call opens listening. A greeting is worth adding; it is not worth a call that will not
  // start, and this is the direction to be wrong in.
  const savedKey = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  ok("no provider key → no greeting, not an error", demoCallGreeting("s") === null);
  process.env.ELEVENLABS_API_KEY = savedKey!;

  const savedSecret = process.env.DEMO_SPEECH_SECRET;
  const savedRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DEMO_SPEECH_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  ok("no signing key → no greeting, not an error", demoCallGreeting("s") === null);
  process.env.DEMO_SPEECH_SECRET = savedSecret!;
  if (savedRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedRole;

  ok("a session-less visitor still gets one", demoCallGreeting(null) !== null);
  ok("…and the good configuration works again", demoCallGreeting("s") !== null);
}

console.log("\n── IT HAS ITS OWN ROUTE, AND THE PROBE STAYS FREE ──────────────");
{
  const strip = (f: string) =>
    readFileSync(resolve(process.cwd(), f), "utf8")
      .split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
  const greet = strip("app/api/demo/greeting/route.ts");
  const cap = strip("app/api/demo/capabilities/route.ts");

  // THE MISTAKE THIS PINS. The greeting was first folded into `/api/demo/capabilities`,
  // because the call screen already calls it — no extra round trip. Two things made that
  // wrong, and `proof-demo-voice-out` caught it: that route's header promises ONE boolean
  // ("not which provider, not which voice"), and a speech ticket carries the registered voice
  // id in its payload — so one GET, with no call, would have leaked it. And its allowance is
  // FOUR TIMES the turn cap, granted because "the handler does no I/O", which minting a paid
  // synthesis makes false.
  ok("the capability probe mints nothing", !/demoCallGreeting\(/.test(cap));
  ok("…and still answers exactly one field", /\{ voiceCall: voiceIn && voiceOut \}/.test(cap));

  ok("the greeting has its own route", /demoCallGreeting\(/.test(greet));
  // ON THE TURN CAP, not the probe's. Every hit here books a synthesis.
  ok("…rate-limited on the same allowance as a turn",
    /rateLimit\(`demo-greet:\$\{ip\}`, DEMO_PER_IP_TURNS, DEMO_WINDOW_MS\)/.test(greet));
  ok("…host-gated like every other demo route", /isDemoHost/.test(greet));
  // ONLY when voice actually works. Minting for a visitor about to be told "unavailable"
  // books a synthesis for a screen that will never make a sound.
  ok("…and mints nothing when the voice is off",
    /if \(!demoVoiceAudible\(\)\)/.test(greet) &&
    greet.indexOf("if (!demoVoiceAudible())") < greet.indexOf("demoCallGreeting("));
  // The text is never taken from the request. That is the whole reason it is minted here.
  ok("…and no greeting text is read from the request",
    !/searchParams\.get\(\s*["'](greeting|text|say)["']\s*\)/.test(greet));
  ok("…only the session id is, and only to bind the ticket",
    /searchParams\.get\("s"\)/.test(greet));
  // A refusal is silence, not an error: an error would end the call before it starts.
  ok("…and a rate-limited caller gets a quiet null, never a failure",
    /\{ greeting: null \}, \{ status: 200/.test(greet));
}

console.log("\n── THE SCREEN SPEAKS BEFORE IT LISTENS ─────────────────────────");
{
  const ui = readFileSync(resolve(process.cwd(), "app/demo/DemoPhone.tsx"), "utf8");
  const code = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

  ok("the screen asks the greeting route for it",
    /fetch\(`\/api\/demo\/greeting\$\{q\}`/.test(code));
  ok("…only after the call is known to be possible",
    code.indexOf('setPhase("unavailable"); return;') < code.indexOf("/api/demo/greeting"));
  // AWAITED, and BEFORE the first turn. Firing it and forgetting opens the microphone while
  // he is still speaking, so the first thing it hears is Khalid — and `runTurn` before the
  // greeting is the old silent-line behaviour with an extra fetch.
  const at = code.indexOf("if (greeting?.url)");
  const firstTurn = code.indexOf("void runTurn();", at);
  ok("it plays the greeting before the first turn", at > 0 && firstTurn > at);
  ok("…and waits for it, so the microphone does not hear him", /await Promise\.race\(\[/.test(code.slice(at, firstTurn)));
  ok("…with a bounded wait, so a stalled greeting costs a pause and not the call",
    /setTimeout\(done, \d{4}\)/.test(code.slice(at, firstTurn)));
  ok("…and the text is shown while it plays, like every other spoken reply",
    /setLastText\(String\(greeting\.text/.test(code));
  ok("…using the element the visitor's tap unlocked, never a fresh one",
    /const el = player\.current \?\? new Audio\(\)/.test(code.slice(at, firstTurn)));
}

console.log("\n── THE GREETING IS BOUGHT, SO IT GOES ON THE LEDGER ────────────");
{
  // NOTHING HERE MENTIONED SPEND, AND THE MONEY WAS REAL.
  //
  // `demoCallGreeting` computed `out.spend` and dropped it on the next line; the route had no
  // database client at all, and the tenant-isolation report recorded that approvingly. But a
  // ticket is redeemed at /api/demo/speak, which treats the FIRST fetch as already paid for
  // by whoever minted it — true for a turn, because /api/demo/voice writes the row, and false
  // here. Every greeting on the one endpoint anyone on the internet can hit was an
  // ElevenLabs charge that lib/monitoring/sweep.ts could not see.
  const greetSrc = readFileSync(resolve(process.cwd(), "lib/demo/call-greeting.ts"), "utf8");
  ok("the mint returns its spend rather than dropping it",
    /spend:\s*out\.spend/.test(greetSrc));
  ok("…and the type says so, so a caller cannot ignore it silently",
    /spend:\s*DemoVoiceOut\["spend"\]/.test(greetSrc));

  const routeSrc = readFileSync(resolve(process.cwd(), "app/api/demo/greeting/route.ts"), "utf8");
  ok("the route writes an agent_runs row for it",
    /agent_runs/.test(routeSrc) && /trigger:\s*"voice_tts"/.test(routeSrc));
  ok("…with the real cost, model and adapter from the mint",
    /cost_usd:\s*greeting\.spend\.costUsd/.test(routeSrc) &&
    /model:\s*greeting\.spend\.model/.test(routeSrc) &&
    /adapter:\s*greeting\.spend\.adapter/.test(routeSrc));
  ok("…checked, so a silent zero-row insert is not mistaken for a write",
    /mustWrite<\{ id: string \}>/.test(routeSrc) && /exactRows:\s*1/.test(routeSrc));
  ok("…and NOT fail-closed, so a ledger outage cannot take the greeting down",
    /catch \(e\) \{\s*console\.error\("\[demo\/greeting\] TTS spend accounting failed"/.test(routeSrc));
  ok("…and no row is written when there was no spend to record",
    /greeting\?\.spend \? createAdminClient\(\) : null/.test(routeSrc));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-greeting: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
