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
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-carriers: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
