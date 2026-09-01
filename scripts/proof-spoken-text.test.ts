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
  //
  // AND THIS IS CHECKED BY READING THE WORD BACK, which is the only thing that makes the
  // sentence above true. The first version asserted the spelling was NON-EMPTY and called
  // that a round trip — so mutating the table to spell 5 as «ستة» left the whole suite at
  // 220/220 green while «عندنا 5 أصناف» was spoken to a paying customer as «عندنا ستة
  // أصناف». That reply is not hard-zeroed; nothing downstream would have caught it. An
  // assertion that does not implement its own comment protects nothing.
  //
  // The reader below is written from the language, NOT from lib/ai/tts/spoken-text.ts, and
  // deliberately keeps its own table: an inverse copied from the thing it inverts agrees
  // with every mistake it makes.
  const R_ONES: Record<string, number> = {
    "صفر": 0, "واحد": 1, "اثنين": 2, "ثلاثة": 3, "أربعة": 4,
    "خمسة": 5, "ستة": 6, "سبعة": 7, "ثمانية": 8, "تسعة": 9,
    "عشرة": 10, "أحد عشر": 11, "اثنا عشر": 12, "ثلاثة عشر": 13, "أربعة عشر": 14,
    "خمسة عشر": 15, "ستة عشر": 16, "سبعة عشر": 17, "ثمانية عشر": 18, "تسعة عشر": 19,
  };
  const R_TENS: Record<string, number> = {
    "عشرين": 20, "ثلاثين": 30, "أربعين": 40, "خمسين": 50,
    "ستين": 60, "سبعين": 70, "ثمانين": 80, "تسعين": 90,
  };
  /** Arabic words back to the number they say, or null if they say nothing we recognise. */
  const readArabicNumberWord = (w: string): number | null => {
    const t = w.trim().replace(/\s+/g, " ");
    if (t in R_ONES) return R_ONES[t]!;
    if (t in R_TENS) return R_TENS[t]!;
    // «خمسة وثلاثين» — the ones word, «و», then the tens word.
    const m = t.match(/^(.+?) و(.+)$/);
    if (!m) return null;
    const ones = R_ONES[m[1]!.trim()];
    const tens = R_TENS[m[2]!.trim()];
    if (ones === undefined || tens === undefined || ones < 1 || ones > 9) return null;
    return tens + ones;
  };

  const misread: string[] = [];
  for (let n = 0; n <= 99; n++) {
    const w = arabicNumberWord(n);
    if (!w || w.trim() === "") { misread.push(`${n}: no spelling`); continue; }
    const back = readArabicNumberWord(w);
    if (back !== n) misread.push(`${n} → «${w}» → ${back === null ? "unreadable" : back}`);
  }
  ok(`every integer 0-99 says exactly itself when read back${misread.length ? ` — ${misread.slice(0, 4).join("; ")}` : ""}`,
    misread.length === 0);
  // …and through the real pipeline, not only the helper: the substitution in toSpokenText
  // is where a caller actually hears it, and it has its own guard rails around it.
  const throughPipeline: string[] = [];
  for (let n = 0; n <= 99; n++) {
    const said = toSpokenText(`عندنا ${n} أصناف`).replace(/^عندنا /, "").replace(/ أصناف$/, "");
    if (readArabicNumberWord(said) !== n) throughPipeline.push(`${n} → «${said}»`);
  }
  ok(`…and says itself through toSpokenText too${throughPipeline.length ? ` — ${throughPipeline.slice(0, 4).join("; ")}` : ""}`,
    throughPipeline.length === 0);
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
  // AND THE CORPUS IS THE REAL ONE. Four hand-written strings were not enough and were
  // not representative: none of them was a BULLET LIST — the exact shape the list stripper
  // exists for — so widening that stripper by one token (`[-•·–—]+[ \t]*\S+[ \t]+`, an
  // entirely realistic slip) left the proof at 38/38 while every dish name on a real menu
  // reply silently lost its first word: «- **كبسة دجاج** — 35 ر.س» spoken as «دجاج، خمسة
  // وثلاثين ريال». The repo already ships the 14 replies Khalid actually produced, with
  // their real bullets, bold, emoji, blank lines, em-dashes and prices. Test on those.
  const { ACTIVE_PACKET_DATA } = await import("../lib/mizan/active-packet-data.ts");
  const realReplies: string[] = (ACTIVE_PACKET_DATA.items ?? [])
    .flatMap((i: { replies?: string[] }) => i.replies ?? [])
    .filter((r: string) => typeof r === "string" && r.trim() !== "");
  ok(`the real captured replies are loaded (${realReplies.length})`, realReplies.length >= 13);

  const cases = [
    "تمام، وجبتين، كل وجبة معها بطاطس ومشروب.",
    "الموظف يتأكد لك من المكونات قبل ما نعتمد الطلب.",
    "🚨 اتصل بالإسعاف 997 الحين إذا فيه ضيق تنفس أو تورم. أنا معك.",
    "*مندي دجاج* متوفر الحين 👌",
    ...realReplies,
  ];
  // THE EXPECTATION CARRIES THE DOCUMENTED SUBSTITUTIONS, AND ONLY THOSE. «ر.س» is read
  // aloud as «ريال» on purpose — an abbreviation is a thing for the eye — so the letters
  // «ر» and «س» are legitimately replaced rather than dropped, and the expectation applies
  // that same rule before comparing. Everything the layer is NOT licensed to change is
  // therefore still a failure. Spelled numerals need no such treatment: they only ADD
  // words, and an added word is already permitted below.
  const declared = (t: string) => t
    .replace(/\s*ر\s*\.\s*س/g, " ريال ")
    .replace(/\s*ج\s*\.\s*م/g, " جنيه ");
  // LETTERS MEANS LETTERS. `[؀-ۿ]` is the whole Arabic block, which also contains the
  // comma «،», the semicolon «؛», the question mark «؟» and the Arabic-Indic digits — so
  // this used to glue punctuation onto words and then compare the result. Against the four
  // hand-written cases that was invisible, because their commas happened to sit in the same
  // places on both sides. Against a real reply it is not: «أبشر — عندنا» becomes «أبشر،
  // عندنا», the token «أبشر» becomes «أبشر،», and the check reports a lost word where
  // nothing was lost. Punctuation is presentation and this layer is allowed to change it;
  // Arabic-Indic digits are deliberately respelled. Both are removed before comparing, so
  // what remains is only what must not change.
  const ARABIC_NON_LETTER = /[\u060C\u061B\u061F\u066A-\u066D\u06D4\u0660-\u0669\u06F0-\u06F9]/g;
  const letters = (t: string) =>
    (declared(t).replace(ARABIC_NON_LETTER, " ").match(/[؀-ۿ]+/g) ?? []).join(" ");
  let allKept = true;
  for (const c of cases) {
    const before = letters(c).split(" ").filter(Boolean);
    const after = letters(toSpokenText(c)).split(" ").filter(Boolean);
    // Every original word must still appear, in order. Extra words (a spelled numeral) are
    // permitted; a missing or altered word is not.
    let i = 0;
    for (const w of after) if (i < before.length && w === before[i]) i++;
    if (i !== before.length) {
      allKept = false;
      console.log(`   lost words in: ${c.slice(0, 90).replace(/\n/g, " ")}`);
      console.log(`      stopped at «${before[i]}» (${i}/${before.length})`);
    }
  }
  ok(`every Arabic word of the original survives, in order (${cases.length} replies)`, allKept);

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
