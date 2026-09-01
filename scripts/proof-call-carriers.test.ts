// ============================================================================
// PROOF — a call never goes dead, and never speaks a protected value.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-call-carriers.test.ts
//
// THE DEFECT, from the Founder's own call: he asked «كم سعر الكبسة؟» — the single most
// common question a restaurant caller asks — and heard three seconds of thinking, then
// nothing, then the microphone reopening. Every reply carrying a money figure is text-only
// by product rule. On WhatsApp that is invisible, because the text is already in the
// customer's hand. On a phone call it is DEAD AIR, and the demo looks broken while behaving
// exactly as designed.
//
// THE RULE ITSELF IS NOT RELAXED HERE, and that is the property this file exists to hold:
// the authoritative reply — the one carrying the price, the total, the link, the order
// number — is still never synthesized. What is spoken is a fixed acknowledgement that
// contains no protected value at all.
// ============================================================================

import { callCarrierFor, ALL_CARRIER_REASONS } from "../lib/demo/call-carriers.ts";
import { voiceHardZeroReason } from "../lib/messaging/voice-budget.ts";
import { toSpokenText } from "../lib/ai/tts/spoken-text.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

console.log("\n── THE CALLER HEARS SOMETHING ON EVERY SPEAKABLE HARD-ZERO TURN ─");
{
  for (const reason of ALL_CARRIER_REASONS) {
    const c = callCarrierFor(reason);
    ok(`«${reason}» produces a spoken acknowledgement`, typeof c === "string" && c.length > 0);
  }
  ok("all three categories are covered", ALL_CARRIER_REASONS.length === 3);
}

console.log("\n── AND IT NEVER CARRIES THE THING THE RULE PROTECTS ────────────");
{
  // The whole point. A carrier that leaked a price would be worse than the silence it
  // replaced, because it would look like the rule was working.
  for (const reason of ALL_CARRIER_REASONS) {
    const c = callCarrierFor(reason)!;
    ok(`«${reason}» contains no digit in any script`, !/[0-9٠-٩۰-۹]/.test(c));
    ok(`«${reason}» contains no currency token`, !/ر\.?\s?س|ريال|جنيه|SAR/i.test(c));
    ok(`«${reason}» contains no link`, !/https?:|www\.|رابط|لينك/i.test(c));
    // And through the product's own gate — the same function that made the original reply
    // text-only. A carrier that trips it would be refused before synthesis anyway; this
    // asserts it does not, so the caller genuinely hears it.
    ok(`«${reason}» passes voiceHardZeroReason on its own merits`,
      voiceHardZeroReason(c, { safetyHold: false, isReceipt: false }) === null);
  }
}

console.log("\n── A SAFETY HOLD STAYS COMPLETELY SILENT ───────────────────────");
{
  // NOT an oversight, and not a category we forgot. Speaking a soothing sentence over a turn
  // whose entire purpose is that a human must check something is the wrong instinct, and
  // «997» must never be synthesized — the one sentence in this product where a mis-heard
  // digit has a physical consequence.
  ok("a safety hold produces NO carrier", callCarrierFor("safety_hold") === null);
  ok("…and it is not in the carrier table at all",
    !ALL_CARRIER_REASONS.includes("safety_hold" as never));

  // TWO INDEPENDENT REASONS, AND BOTH ARE REQUIRED.
  //
  // Today the absence of the key is what returns null, so deleting the by-name guard
  // changes nothing and no behavioural test can see it — driven and confirmed. That does
  // NOT make the guard decorative: it is what holds the line the day someone adds a
  // `safety_hold` entry to the table without reading the header, which is the realistic
  // way this breaks. The dangerous state needs BOTH mistakes, so both are pinned, and the
  // second is pinned by reading because no input can reach it while the first holds.
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const carrierSrc = readFileSync(resolve(process.cwd(), "lib/demo/call-carriers.ts"), "utf8");
  const carrierCode = carrierSrc.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");
  ok("…and the by-name refusal is still there to hold that line",
    /if \(reason === "safety_hold"\) return null;/.test(carrierCode));
  ok("…placed BEFORE the table is consulted, or it would not help",
    carrierCode.indexOf('reason === "safety_hold"') < carrierCode.indexOf("CARRIERS[reason"));
}

console.log("\n── UNKNOWN REASONS FAIL CLOSED, TO SILENCE ─────────────────────");
{
  ok("null is silence", callCarrierFor(null) === null);
  ok("undefined is silence", callCarrierFor(undefined) === null);
  ok("a reason nobody listed is silence, not an invented sentence",
    callCarrierFor("some_future_reason" as never) === null);
  ok("an empty string is silence", callCarrierFor("" as never) === null);
}

console.log("\n── THE CARRIER SURVIVES THE SPEECH LAYER UNCHANGED IN MEANING ──");
{
  // It is synthesized through the same pipeline as any reply, so it passes through
  // toSpokenText. A carrier that lost its words there would be a silent regression.
  for (const reason of ALL_CARRIER_REASONS) {
    const c = callCarrierFor(reason)!;
    const spoken = toSpokenText(c);
    ok(`«${reason}» still has words after the speech layer`, /[؀-ۿ]/.test(spoken));
    ok(`«${reason}» gains no digit from the speech layer`, !/[0-9]/.test(spoken));
  }
}

console.log("\n── ON A CALL, A PRICE IS SPOKEN — AND ONLY A PRICE ──────────────");
{
  // THE FOUNDER'S REPORT: "what Khalid said is not what is written in this screenshot."
  // He asked the price of the mandi; the screen showed the full reply with «بـ 30 ر.س»
  // and Khalid said the acknowledgement instead. Confirmed from production:
  // `hardZero: money_figure`, one model call, TTS ran on the carrier.
  //
  // The money rule is right for WhatsApp — a voice note sits in its own bubble, the text is
  // already in the customer's hand, and a mis-heard figure could become a wrong charge for
  // nothing gained. A CALL is not that shape: this screen displays the reply while the audio
  // plays, so the authoritative figure is visible and readable at the moment it is spoken.
  // Suppressing it there did not remove the risk, it just made Khalid dodge the question.
  const REPLY = "عندنا مندي دجاج بـ 30 ر.س. تحب أضيفه لطلبك؟";

  ok("on WhatsApp the price is still text-only — that channel is unchanged",
    voiceHardZeroReason(REPLY, { safetyHold: false, isReceipt: false }) === "money_figure");
  ok("on a call the price may be spoken",
    voiceHardZeroReason(REPLY, { safetyHold: false, isReceipt: false, spokenPricesAllowed: true }) === null);

  // AND IT WAIVES NOTHING ELSE. This is the whole risk of the change: a flag that quietly
  // opened the other three categories would be a safety regression wearing a UX fix.
  ok("a SAFETY HOLD is still silent on a call — not waivable",
    voiceHardZeroReason(REPLY, { safetyHold: true, isReceipt: false, spokenPricesAllowed: true }) === "safety_hold");
  ok("a RECEIPT is still silent on a call",
    voiceHardZeroReason(REPLY, { safetyHold: false, isReceipt: true, spokenPricesAllowed: true }) === "receipt");
  ok("a PAYMENT LINK is still silent on a call",
    voiceHardZeroReason("رابط الدفع جاهز https://pay.example/x", { safetyHold: false, isReceipt: false, spokenPricesAllowed: true }) === "payment_link");
  // …and the link check runs BEFORE the money waiver, so a reply carrying both is refused.
  ok("a reply with a link AND a price is still refused for the link",
    voiceHardZeroReason("ادفع 30 ر.س من رابط الدفع", { safetyHold: false, isReceipt: false, spokenPricesAllowed: true }) === "payment_link");

  // AND THE SPOKEN PRICE MUST SOUND LIKE A PRICE. «ر.س» is how it is WRITTEN; read as
  // letters it is noise, and a number that sounds right beside a currency that sounds like
  // nothing is worse than not saying it.
  const spoken = toSpokenText(REPLY);
  ok(`the currency is a spoken word, not two letters (${spoken})`,
    spoken.includes("ريال") && !spoken.includes("ر.س"));
  ok("…and the figure is spelled", spoken.includes("ثلاثين") && !/\d/.test(spoken));
  ok("…and the sentence break survives, so it is not run together",
    /ريال\s*\./.test(spoken));
}

console.log("\n── THE ROUTE ACTUALLY USES IT, AND ONLY WHEN SILENT ────────────");
{
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const src = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const code = src.split("\n").filter((l) => {
    const t = l.trimStart();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");

  ok("the route reaches for a carrier", /callCarrierFor\(/.test(code));
  // ONLY when there is no audio. A carrier spoken INSTEAD of a real reply would replace
  // Khalid's actual answer with an acknowledgement — the opposite defect, and a silent one.
  ok("…only on a turn that produced no audio",
    /if \(spoken\.skipped && !spoken\.audioBase64\)/.test(code));
  ok("…and only if the carrier itself synthesized, never a substitute voice",
    /if \(carrierAudio\.audioBase64\)/.test(code));

  // AND THE CALL PATH MUST STILL ASK FOR SPOKEN PRICES. Deleting that one line puts the
  // Founder's exact complaint straight back — Khalid answering «كم سعر المندي؟» with an
  // acknowledgement while the price sits visible on the same screen — and a driven mutation
  // confirmed nothing else in the suite notices. Anchored INSIDE the demoVoiceReply call so
  // a mention elsewhere cannot satisfy it, and paired with the safety signals so it is
  // visible that this sits alongside them rather than replacing them.
  const replyCall = (() => {
    const at = code.indexOf("demoVoiceReply(closed.reply");
    return at >= 0 ? code.slice(at, at + 500) : "";
  })();
  ok("the call path asks for spoken prices", /spokenPricesAllowed:\s*true/.test(replyCall));
  ok("…alongside the safety signals it does NOT waive",
    /safetyHold:\s*voiceSignals\.safetyHold/.test(replyCall) &&
    /isReceipt:\s*voiceSignals\.isReceipt/.test(replyCall));

  // …and ONLY the call path. The live WhatsApp path must never pass it: there the voice
  // note sits in its own bubble with no visible text beside it, which is the whole reason
  // the money rule exists.
  const ras = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
  ok("the live WhatsApp path never asks for spoken prices",
    !/spokenPricesAllowed/.test(ras));
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-carriers: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
