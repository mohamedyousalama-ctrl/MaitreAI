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

import { callCarrierFor, ALL_CARRIER_REASONS, carrierIsSafeToSpeak } from "../lib/demo/call-carriers.ts";
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
    /spoken\.skipped && !spoken\.audioBase64/.test(code));
  // AND ONLY ON A CALL. The carrier exists because a caller holding a phone to their ear
  // hears nothing on a price turn. A visitor who pressed the microphone in the CHAT is
  // looking at the reply, so an acknowledgement in place of it is not a rescue — it is a
  // second voice note saying less than the bubble beside it.
  ok("…and only on a phone call, never on a chat voice note",
    /if \(isPhoneCall && spoken\.skipped && !spoken\.audioBase64 && !spoken\.speechUrl\)/.test(code));
  // BOTH DELIVERIES COUNT AS AUDIO. A call now normally receives `speechUrl` — a signed URL
  // the browser plays while the provider is still synthesizing — and not `audioBase64`.
  // Asking only about the inline field would fire a carrier over a perfectly good streamed
  // answer, so «كم سعر المندي؟» would be answered with «تمام، أرسلت لك التفاصيل» INSTEAD of
  // the price. That is the same defect the carrier was built to fix, arriving from the
  // other side.
  ok("…and it asks about BOTH deliveries, not just the inline one",
    /!spoken\.audioBase64 && !spoken\.speechUrl/.test(code) &&
    /carrierAudio\.audioBase64 \|\| carrierAudio\.speechUrl/.test(code));
  ok("…and only if the carrier itself produced audio, never a substitute voice",
    /if \(carrierAudio\.audioBase64 \|\| carrierAudio\.speechUrl\)/.test(code));

  // AND THE CALL PATH MUST STILL ASK FOR SPOKEN PRICES. Deleting that one line puts the
  // Founder's exact complaint straight back — Khalid answering «كم سعر المندي؟» with an
  // acknowledgement while the price sits visible on the same screen — and a driven mutation
  // confirmed nothing else in the suite notices. Anchored INSIDE the demoVoiceReply call so
  // a mention elsewhere cannot satisfy it, and paired with the safety signals so it is
  // visible that this sits alongside them rather than replacing them.
  // ANCHORED ON THE SHARED OPTIONS. The reply is now delivered two ways — buffered
  // (`demoVoiceReply`) or streamed (`demoVoiceTicket`) — and both are handed the SAME
  // `speakOpts` object. Pinning that object is what makes this assertion true of whichever
  // delivery runs, instead of true of one of them and silent about the other.
  const replyCall = (() => {
    const at = code.indexOf("const speakOpts = {");
    return at >= 0 ? code.slice(at, at + 500) : "";
  })();
  ok("both deliveries are handed the same options object", replyCall.length > 0);
  ok("…and the streamed delivery is the one the call uses",
    /streamTheCall\s*\n?\s*\?\s*demoVoiceTicket\(closed\.reply, \{ \.\.\.speakOpts/.test(code));
  ok("…with the buffered delivery kept for everything else",
    /:\s*await demoVoiceReply\(closed\.reply, speakOpts\)/.test(code));
  // Gated on the channel, not handed to everyone: the waiver is paid for by the CALL
  // SCREEN showing the reply while the audio plays, and a chat voice note never struck that
  // bargain. `isPhoneCall` is itself pinned in proof-call-channel.test.ts.
  ok("the call path asks for spoken prices", /spokenPricesAllowed:\s*isPhoneCall/.test(replyCall));
  ok("…and for the allergy sentence to be SAID, not swallowed",
    /spokenSafetyAllowed:\s*isPhoneCall/.test(replyCall));
  ok("…and never grants either waiver unconditionally",
    !/spokenSafetyAllowed:\s*true/.test(code));
  ok("…and never asks for them unconditionally", !/spokenPricesAllowed:\s*true/.test(code));
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

console.log("\n── THE CARRIER'S OWN GUARD, DRIVEN AGAINST A POISONED STRING ────");
{
  // THE GUARD WAS NEVER EXERCISED, AND ONE QUARTER OF IT DID NOTHING.
  //
  // `CARRIERS` is a module constant, so the only strings that ever reached these four
  // checks were the three we already know are clean. A guard tested only on inputs that
  // pass it is not tested. Underneath, `NUMBER_WORD` was anchored with `\b` — JavaScript's
  // word boundary is defined over [A-Za-z0-9_], so between two Arabic letters there is no
  // boundary and the pattern matched NOTHING it was written for. A carrier edited to
  // «تمام، اعتمدنا طلبك رقم مية وواحد» was spoken, while the header promised the check held
  // "even if someone later edits it carelessly" — the only case it exists for.
  //
  // The predicate is exported now so the poisoned strings can actually be fed to it.
  for (const poisoned of [
    "تمام، اعتمدنا طلبك رقم مية وواحد",     // spelled number — the case that was inert
    "تمام، الحساب صار خمسة وثلاثين",
    "أرسلت لك المبلغ، ألف تمام",
    "تمام، أرسلت لك التفاصيل ٤٥",           // Arabic-Indic digit
    "تمام، أرسلت لك التفاصيل 45",           // ASCII digit
    "تمام، المبلغ بالريال",                  // currency word
    "تمام، أرسلت لك رابط الدفع",             // link word
    "تفضل https://pay.example.com",
    "",                                      // nothing to say is not a carrier
    "   ",
  ]) {
    ok(`«${poisoned.slice(0, 34)}» is refused`, carrierIsSafeToSpeak(poisoned) === false);
  }

  // …AND IT STILL PASSES THE LINES WE ACTUALLY SHIP. A guard that refuses everything is the
  // same outage as one that refuses nothing, arriving from the other side — it would make
  // every price turn silent again, which is the defect the carrier was built to fix.
  for (const reason of ["money_figure", "payment_link", "receipt"] as const) {
    const line = callCarrierFor(reason);
    ok(`the shipped «${reason}» carrier exists`, typeof line === "string" && line.length > 0);
    ok(`…and passes its own guard`, line !== null && carrierIsSafeToSpeak(line) === true);
  }

  // THE ARTICLE FORM IS A NUMBER TOO. «الخمسة» is «خمسة» wearing «ال», and the lookbehind
  // treated «ال» as an ordinary letter — so «طلبك رقم الخمسة» passed the very guard written
  // to stop that sentence. The allergen gate's `termRegex` has tolerated the article since
  // it was written; this is the same fix one file later.
  for (const withArticle of [
    "تمام، اعتمدنا طلبك رقم الخمسة",
    "تمام، طلبك رقم المية جاهز",
    "تمام، اعتمدنا طلبك رقم الألف",
  ]) {
    ok(`«${withArticle.slice(0, 34)}» is refused`, carrierIsSafeToSpeak(withArticle) === false);
  }
  // Said plainly: tolerating the article also refuses «الواحد منهم» ("each of them"), where
  // no count is meant. That is the direction to be wrong in for a string WE author — three
  // fixed sentences, and a refusal shows up immediately as the shipped-carrier assertions
  // above going red, whereas a spoken order number does not show up at all.

  // AND ORDINARY ARABIC IS NOT A PRICE. «ر.س» is an abbreviation, and unanchored it matched
  // «رس» ANYWHERE — inside «أرسلت»، «رسالة»، «مدرسة»، «درس». The route's own comment uses
  // «تمام، أرسلت لك التفاصيل» as its example of a carrier, and that string was being
  // refused as if it carried a price. A refused carrier is the DEAD AIR this whole file
  // exists to remove, so a guard that fails toward silence on ordinary words is not strict,
  // it is broken.
  for (const ordinary of [
    "تمام، أرسلت لك التفاصيل",
    "تمام، رسالة وصلتك",
    "تمام، الدرس خلص",
  ]) {
    ok(`«${ordinary.slice(0, 30)}» is not mistaken for a price`, carrierIsSafeToSpeak(ordinary) === true);
  }
  // …while the abbreviation itself still is one, on both spellings.
  for (const money of ["السعر 35 ر.س", "السعر ر س", "المبلغ ريال", "المبلغ جنيه"]) {
    ok(`«${money}» is refused`, carrierIsSafeToSpeak(money) === false);
  }

  // AN UNRECOGNISED REASON IS SILENCE, INCLUDING THE ONES EVERY OBJECT ANSWERS TO. A plain
  // object literal returns a FUNCTION for `__proto__`, `constructor`, `toString` and
  // `valueOf`, so the docstring's "fail-closed on an unrecognised reason" held only because
  // the type system never let those through. A guarantee that depends on a type the runtime
  // never sees is not the guarantee that was written down.
  for (const weird of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
    ok(`«${weird}» produces silence, not a function`,
      callCarrierFor(weird as never) === null);
  }
}

console.log("\n── AN ALLERGY DISCLOSURE IS ANSWERED OUT LOUD, ON A CALL ───────");
{
  // WHAT SILENCE ACTUALLY DID. Every reply from the allergen gate is marked a safety turn,
  // and a safety turn was never spoken. On a CALL that meant: the caller says «عندي حساسية
  // من المكسرات», Khalid composes an honest, careful sentence — and says NOTHING AT ALL.
  // Dead air, at the one moment someone disclosed something that matters to them. It read to
  // the Founder as a broken product; it would read to a caller as being ignored.
  //
  // The waiver is the SAME bargain the price waiver strikes and stands on the same fact: the
  // call screen shows the reply while the audio plays, so the sentence is readable at the
  // moment it is spoken. Mis-hearing is bounded by the text being there. Silence is not.
  const NOTICE =
    "خذت بالي إنك ذكرت «المكسرات» 🙏 صحتك تهمّنا. ما أقدر أأكد من عندي إن الصنف يناسبك، " +
    "بس نقدر نكمّل، أو أوصلك بأحد الزملاء يتأكد لك — وش تحب؟";

  ok("on a call the allergy sentence is spoken",
    voiceHardZeroReason(NOTICE, {
      safetyHold: true, isReceipt: false, spokenPricesAllowed: true, spokenSafetyAllowed: true,
    }) === null);

  // AND NOWHERE ELSE. On WhatsApp the voice note sits in its own bubble with no text beside
  // it, which is the whole reason the rule exists.
  ok("on WhatsApp it is still text-only",
    voiceHardZeroReason(NOTICE, { safetyHold: true, isReceipt: false }) === "safety_hold");
  ok("…and the waiver must be asked for explicitly, never defaulted",
    voiceHardZeroReason(NOTICE, {
      safetyHold: true, isReceipt: false, spokenPricesAllowed: true,
    }) === "safety_hold");

  // NARROW ON PURPOSE. It waives the SAFETY NOTICE and nothing else — each other category is
  // decided independently and is untouched by this flag.
  ok("a receipt is still never spoken, even on a call",
    voiceHardZeroReason("تم، طلبك رقم 1042", {
      safetyHold: false, isReceipt: true, spokenSafetyAllowed: true,
    }) === "receipt");
  ok("a payment link is still never spoken, even on a call",
    voiceHardZeroReason("ادفع من هنا https://pay.example.com/x", {
      safetyHold: false, isReceipt: false, spokenSafetyAllowed: true,
    }) === "payment_link");
  ok("…and a money figure still needs its OWN waiver",
    voiceHardZeroReason("الإجمالي 45 ريال", {
      safetyHold: false, isReceipt: false, spokenSafetyAllowed: true,
    }) === "money_figure");
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} call-carriers: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
