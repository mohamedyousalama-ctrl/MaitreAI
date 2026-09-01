// ============================================================================
// PROOF — the chat microphone is not a phone call, and the route can tell.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-call-channel.test.ts
//
// THE REGRESSION. `/api/demo/voice` has two callers and they send byte-identical bodies:
// the press-and-hold microphone in the CHAT composer, and the full-screen CALL overlay. For
// one release the route had no discriminator at all, so every chat voice note was handled
// as a phone call. A visitor holding the mic while looking straight at the thread was told
// by the system prompt that they were "HOLDING A PHONE TO THEIR EAR" and "cannot see
// anything", and `presentation` — the category list, the item list, the quantity buttons,
// the confirm/cancel rail, the demo's flagship affordance — was withheld from the one
// surface that actually draws it. Prices were spoken there too, under a waiver that was
// argued for the call screen and silently applied to a chat bubble.
//
// Nothing failed. Every proof stayed green, because every proof asserted the CALL
// behaviour and the route had exactly one behaviour.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPhoneCallChannel, CALL_CHANNEL_VALUE } from "../lib/demo/call-channel.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

console.log("\n── ONLY THE CALL SAYS IT IS A CALL ─────────────────────────────");
{
  ok("the call literal is recognised", isPhoneCallChannel("call") === true);
  ok("…and it is the exported constant, not a second spelling",
    isPhoneCallChannel(CALL_CHANNEL_VALUE) === true);
}

console.log("\n── AND EVERYTHING ELSE IS A CHAT VOICE NOTE ────────────────────");
{
  // THE DEFAULT DIRECTION IS THE WHOLE SAFETY OF THIS SWITCH. The note is what this route
  // did before any call work existed; the call is the mode that REMOVES things from the
  // screen. A client one deploy behind, a proxy that drops an unknown part, a typo — all
  // must land on the surface that still works, never on the one that strips the rail.
  for (const raw of [
    null, undefined, "", "   ", "note", "chat", "voice", "voice_call",
    "Call", "CALL", " call", "call ", "calling", "cal", "true", "1",
    0, 1, true, false, {}, [], ["call"], { channel: "call" },
  ]) {
    ok(`«${JSON.stringify(raw) ?? String(raw)}» is a chat note`, isPhoneCallChannel(raw) === false);
  }
  // A File/Blob part, which is what a multipart field is when a client sends the wrong kind.
  ok("a Blob part is a chat note", isPhoneCallChannel(new Blob(["call"])) === false);
}

console.log("\n── THE ROUTE ASKS THE QUESTION, AND ASKS IT ONCE ───────────────");
{
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  ok("the route reads a channel field off the body", /form\.get\("channel"\)/.test(code));
  ok("…through the shared decision, not a second inline comparison",
    /isPhoneCall\s*=\s*isPhoneCallChannel\(form\.get\("channel"\)\)/.test(code));
  // A second, differently-spelled comparison is how the two surfaces drift apart again.
  ok("…and nothing else in the route compares a channel string by hand",
    (code.match(/===\s*"call"/g) ?? []).length === 0);
  ok("the decision starts as FALSE, so a parse failure is a chat note",
    /let isPhoneCall\s*=\s*false;/.test(code));
}

console.log("\n── ALL FOUR CALL-ONLY BEHAVIOURS ARE BEHIND THAT ONE ANSWER ────");
{
  // Four things change on a call. Every one of them must be conditioned, because three out
  // of four is a chat surface that is still half a phone call — and that is harder to
  // notice than the original bug.
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  ok("1. the voice-call prompt is call-only",
    /channel:\s*isPhoneCall\s*\?\s*"voice_call"\s*:\s*undefined/.test(code));
  ok("…and no unconditional voice_call declaration survives",
    !/channel:\s*"voice_call"/.test(code));

  ok("2. spoken prices are call-only",
    /spokenPricesAllowed:\s*isPhoneCall/.test(code));
  ok("…and the waiver is never handed out unconditionally",
    !/spokenPricesAllowed:\s*true/.test(code));

  ok("3. the figure-free carrier is call-only",
    /if\s*\(isPhoneCall\s*&&\s*spoken\.skipped/.test(code));

  // 4. BOTH presentation exits — the model turn and the deterministic quantity rail.
  const gated = (code.match(/isPhoneCall\s*\n?\s*\?\s*presentationForCall\(/g) ?? []).length;
  ok(`4. both presentation exits are gated on the channel (${gated} found)`, gated === 2);
  ok("…and presentationForCall is never reached on a chat note",
    (code.match(/presentationForCall\(/g) ?? []).length === gated);
}

console.log("\n── THE CALL SCREEN SENDS IT; THE CHAT MICROPHONE DOES NOT ──────");
{
  // The route defaulting correctly is only half of it: if NOBODY sends the field, the call
  // silently becomes a chat note and every call-only behaviour is off with no error
  // anywhere. And if the CHAT sends it, the original bug is back with a longer body.
  const ui = readFileSync(resolve(process.cwd(), "app/demo/DemoPhone.tsx"), "utf8");
  const code = ui.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  const sends = (code.match(/fd\.append\("channel",\s*"call"\)/g) ?? []).length;
  ok(`exactly one caller declares the call channel (${sends} found)`, sends === 1);

  // WHICH ONE. Both POSTs build an `fd`; the call is the one that carries an AbortController
  // (a call can be hung up mid-turn, a note cannot), so the declaration must sit in that
  // block. Anchored by proximity rather than by line number, which moves with any edit.
  const at = code.indexOf('fd.append("channel", "call")');
  const callPost = code.indexOf("abort.current = new AbortController()");
  ok("…and it is the call overlay's POST, not the composer's",
    at > 0 && callPost > at && callPost - at < 400);

  // The chat composer's POST is the one WITHOUT it. Located by its own multipart body and
  // checked to carry no channel field at all.
  const composer = code.indexOf('fd.append("audio", blob, "note.webm")');
  ok("the chat microphone's POST exists and is a different block",
    composer > 0 && Math.abs(composer - at) > 400);
  const composerBlock = composer > 0 ? code.slice(composer, composer + 900) : "";
  ok("…and it declares no channel, so it stays a chat note",
    composerBlock.length > 0 && !/fd\.append\("channel"/.test(composerBlock));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-channel: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
