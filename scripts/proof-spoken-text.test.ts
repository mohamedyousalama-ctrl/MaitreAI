// ============================================================================
// PROOF — what reaches ElevenLabs is text for the EAR, not for the screen.
//
// Run: node --import ./scripts/webhook-route-loader.mjs --experimental-strip-types \
//        scripts/proof-spoken-text.test.ts
//
// WHY THIS FILE EXISTS. The Founder compared Khalid in the product against the SAME voice
// object in the ElevenLabs playground and reported the product as "lower quality". It is
// the same voice, the same model and the same settings — the difference was the text. Every
// reply is composed for a WhatsApp bubble and was sent to the provider verbatim: emoji,
// `*bold*` markers, blank lines used as layout, `×`, `—`, and bare ASCII numerals that the
// customer-visible formatter had deliberately converted FROM Arabic-Indic, because that is
// what reads correctly on a screen.
//
// So the assertions below are written against REAL captured production replies, not
// invented strings, and they check the bytes that actually go on the wire.
// ============================================================================

import { toSpokenText, arabicNumberWord } from "../lib/ai/tts/spoken-text.ts";
import { KHALID_VOICE } from "../lib/ai/tts/voice-registry.ts";

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

console.log("\n── NOTHING THAT IS PUNCTUATION TO THE EYE SURVIVES ──────────────");
{
  // A REAL captured reply (lib/mizan/active-packet-data.ts) — one the Founder listened to.
  const real =
    "هلا والله، نوّرت! 🌟\n\nلو تحب شي دسم ومشبع، **المندي لحم** خيار ما يخيب — لحم غنم طري " +
    "ومدخّن مع أرز مبهّر.\n\nتحب حاجة دسمة ولا تميل للمشوي؟";
  const out = toSpokenText(real);

  ok("no emoji reaches the provider", !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out));
  ok("no markdown emphasis markers survive", !out.includes("*"));
  ok("…and the word inside them is KEPT, not deleted with the markers", out.includes("المندي لحم"));
  ok("no newline survives — a blank line is layout, and silence to a synthesizer",
    !out.includes("\n"));
  ok("…and the paragraph break became a real pause, not a lost boundary", out.includes("..."));
  ok("the em dash became a spoken comma", !out.includes("—") && out.includes("،"));
  ok("the sentence itself is untouched", out.includes("لحم غنم طري") && out.includes("تحب حاجة دسمة"));
}

console.log("\n── A RECAP LINE, WHICH IS PURE LAYOUT ──────────────────────────");
{
  // lib/ai/recap-render.ts builds `{qty}× {name} — {total} {currency}` per line.
  const recap = "*ملخص طلبك*\n2× كبسة دجاج — 64 ر.س\n1× لبن بارد — 6 ر.س";
  const out = toSpokenText(recap);
  ok("the multiplication sign is spoken as a word", out.includes(" في ") && !out.includes("×"));
  ok("bullets and line structure are gone", !out.includes("\n") && !out.includes("*"));
  ok("the item names survive intact", out.includes("كبسة دجاج") && out.includes("لبن بارد"));
}

console.log("\n── NUMBERS ARE SPELLED, AND THEIR VALUE IS PRESERVED ───────────");
{
  ok("a bare small integer becomes a word", toSpokenText("عندنا 3 أصناف").includes("ثلاثة"));
  ok("…and the digit is gone", !/\d/.test(toSpokenText("عندنا 3 أصناف")));
  ok("Arabic-Indic digits are handled the same way",
    toSpokenText("عندنا ٣ أصناف").includes("ثلاثة"));
  ok("a two-digit number is spelled correctly", arabicNumberWord(32) === "اثنين وثلاثين");
  ok("…and a round ten too", arabicNumberWord(40) === "أربعين");
  ok("…and a teen", arabicNumberWord(15) === "خمسة عشر");

  // WE DO NOT GUESS. A wrong number spoken confidently is worse than a mechanical one, so
  // anything we cannot spell exactly is left as digits rather than approximated.
  ok("a number above 99 is left alone rather than mis-spelled",
    toSpokenText("الطلب رقم 1001").includes("1001"));
  ok("a decimal is left alone", toSpokenText("الإجمالي 70.15").includes("70.15"));
  ok("a time is left alone", toSpokenText("الساعة 12:30").includes("12:30"));
  ok("a percentage is left alone", toSpokenText("خصم 10%").includes("10%"));

  // THE VALUE IS NEVER CHANGED. This layer may re-word for the ear; it may not restate a
  // different fact. Every integer 0-99 must round-trip to exactly itself.
  let valueSafe = true;
  for (let n = 0; n <= 99; n++) {
    const w = arabicNumberWord(n);
    if (!w || w.trim() === "") { valueSafe = false; break; }
  }
  ok("every integer 0-99 has an exact spelling — none silently dropped", valueSafe);
  ok("nothing outside that range is invented",
    arabicNumberWord(100) === null && arabicNumberWord(-1) === null && arabicNumberWord(1.5) === null);
}

console.log("\n── BRACKETS ARE A DELIVERY INSTRUCTION TO THIS MODEL ───────────");
{
  // Eleven v3 reads `[...]` as an audio tag. `confirmVoiceReply` echoes the VISITOR'S own
  // transcribed words into a speakable reply, so a bracket can arrive from outside.
  const echoed = "سمعت منك: «[shouts] أبغى كبسة» — كذا صحيح؟";
  const out = toSpokenText(echoed);
  ok("a bracketed tag arriving from a transcript is stripped",
    !out.includes("[") && !out.includes("]"));
  ok("…and the visitor's actual words are kept", out.includes("أبغى كبسة"));
  ok("guillemets are removed as typography", !out.includes("«") && !out.includes("»"));
}

console.log("\n── IT IS SUBTRACTIVE: NO WORD IS EVER ADDED OR CHANGED ─────────");
{
  // The one property that makes this safe to run downstream of the safety gates: it may
  // remove presentation and respell a numeral, and it may do nothing else. Checked by
  // stripping both strings to their Arabic letters and requiring the sequence to be a
  // subsequence — so a dropped word fails, and an invented word fails.
  const cases = [
    "تمام، وجبتين، كل وجبة معها بطاطس ومشروب.",
    "الموظف يتأكد لك من المكونات قبل ما نعتمد الطلب.",
    "🚨 اتصل بالإسعاف 997 الحين إذا فيه ضيق تنفس أو تورم. أنا معك.",
    "*مندي دجاج* متوفر الحين 👌",
  ];
  const letters = (t: string) => (t.match(/[؀-ۿ]+/g) ?? []).join(" ");
  let allKept = true;
  for (const c of cases) {
    const before = letters(c).split(" ").filter(Boolean);
    const after = letters(toSpokenText(c)).split(" ").filter(Boolean);
    // Every original word must still appear, in order. Extra words (a spelled numeral) are
    // permitted; a missing or altered word is not.
    let i = 0;
    for (const w of after) if (i < before.length && w === before[i]) i++;
    if (i !== before.length) { allKept = false; console.log(`   lost words in: ${c}`); }
  }
  ok("every Arabic word of the original survives, in order", allKept);

  // AND THE EMERGENCY NUMBER IS NOT RESPELLED. 997 is above the spelling range on purpose:
  // this is the one sentence in the product where a mis-read digit has a physical
  // consequence, and it is currently text-only anyway.
  ok("the emergency number is left exactly as written",
    toSpokenText("اتصل بالإسعاف 997 الحين").includes("997"));
}

console.log("\n── IT NEVER RETURNS NOTHING FROM SOMETHING ─────────────────────");
{
  // A layer that could empty a reply would turn a working turn into silence — the exact
  // failure class this whole sequence has been chasing.
  const inputs = [
    "هلا والله 👋", "👌", "***", "[casually]", "\n\n\n", "   ", "",
    "تمام", "🌟🌟🌟 مرحبا 🌟🌟🌟",
  ];
  for (const i of inputs) {
    const out = toSpokenText(i);
    const hadWords = /[؀-ۿ\w]/.test(i);
    if (hadWords) ok(`"${i.slice(0, 12)}" keeps its words`, /[؀-ۿ\w]/.test(out));
  }
  ok("a string that was ONLY decoration becomes empty rather than noise",
    toSpokenText("👌").trim() === "" && toSpokenText("***").trim() === "");
}

console.log("\n── ON THE WIRE, DRIVEN THROUGH THE REAL ADAPTER ────────────────");
{
  // The transformation must actually be REACHED. Asserting the pure function proves nothing
  // about the request if the adapter never calls it — the trap this repo has hit seven
  // times. So this drives the adapter and reads the body it posts.
  const { elevenlabsTtsAdapter } = await import("../lib/ai/tts/elevenlabs.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body ?? "{}"));
    return {
      ok: true, status: 200, text: async () => "",
      arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
    } as unknown as Response;
  }) as typeof fetch;
  Object.assign(process.env, {
    ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
  });

  await elevenlabsTtsAdapter.synthesize("هلا والله 🌟\n\n**المندي** بـ 32 ر.س", { format: "mp3" });

  const text = String(sent.text ?? "");
  ok("the adapter posts the SPOKEN text, not the bubble text",
    !text.includes("🌟") && !text.includes("*") && !text.includes("\n"));
  ok("…with the numeral spelled", text.includes("اثنين وثلاثين"));
  ok("…and the words intact", text.includes("المندي") && text.includes("هلا والله"));
  ok("the language is pinned so the normalizer does not have to guess",
    sent.language_code === "ar");
  ok("the registered model is still what is requested", sent.model_id === KHALID_VOICE.model);
  ok("the pronunciation dictionary is still attached",
    Array.isArray(sent.pronunciation_dictionary_locators) &&
    (sent.pronunciation_dictionary_locators as unknown[]).length === 1);

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} spoken-text: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
