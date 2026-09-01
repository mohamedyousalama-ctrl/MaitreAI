// ============================================================================
// PROOF — the streamed voice speaks only what we signed, and nothing else.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs \
//        --experimental-strip-types scripts/proof-speech-ticket.test.ts
//
// WHAT THIS IS GUARDING. A phone call used to wait for the WHOLE synthesis before a single
// byte played — measured 1807-5472ms of a caller holding a phone to their ear and hearing
// nothing. Streaming fixes it, and on an iPhone streaming has exactly one shape: an <audio>
// element pointed at a URL, because iOS Safari has no MediaSource. An <audio> element
// issues a plain GET. It cannot POST a reply, and it cannot be trusted to carry one.
//
// So the dangerous version of this feature is one line away from the safe one. `/speak?
// text=…` is a free, unauthenticated text-to-speech oracle on a public marketing page, in
// our name, on our card, in our registered voice — routing around every control in this
// repo, because all of them live on the POST path an <audio> element never touches. Anyone
// could make Khalid say anything and screenshot it.
//
// The ticket is what makes that impossible: it CONTAINS the text, signed, and the streaming
// route speaks that and nothing else.
// ============================================================================

import { createHmac } from "node:crypto";
import { KHALID_VOICE } from "../lib/ai/tts/voice-registry.ts";

// THE SECRET IS SET EXPLICITLY so the forgery cases below can be built with the same key.
// Without a known key there is no way to construct "a perfectly valid signature over text
// we must refuse", which is the single most important case in this file.
const SECRET = "proof-secret-that-is-comfortably-over-32-chars";
process.env.DEMO_SPEECH_SECRET = SECRET;
process.env.TTS_ADAPTER = "elevenlabs";
process.env.ELEVENLABS_API_KEY = "el-key-for-the-proof";
process.env.ELEVENLABS_VOICE_ID = KHALID_VOICE.voiceId;
delete process.env.ELEVENLABS_TTS_MODEL;

const {
  signSpeechTicket, verifySpeechTicket, speechTicketsAvailable, demoVoiceTicket,
  SPEECH_TICKET_TTL_MS,
} = await import("../lib/demo/speech-ticket.ts");
const { demoVoiceReply, DEMO_TTS_MAX_CHARS } = await import("../lib/demo/voice-out.ts");
const { toSpokenText } = await import("../lib/ai/tts/spoken-text.ts");

let pass = 0;
const fails: string[] = [];
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; } else { fails.push(label); console.log(`  FAIL ${label}`); }
};

const SPEAKABLE = "هلا والله، عندنا كبسة دجاج طازة. تحب أضيفها؟";
const b64u = (b: Buffer) => b.toString("base64url");
/** Mint a ticket over ANY payload with the real key — the forger's position. */
const forge = (payload: unknown): string => {
  const body = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${b64u(createHmac("sha256", SECRET).update(body).digest())}`;
};

console.log("\n── A TICKET WE SIGNED ROUND-TRIPS ──────────────────────────────");
{
  ok("the feature is configured", speechTicketsAvailable() === true);
  const t = signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid: "sess-1" });
  ok("a speakable reply mints a ticket", typeof t === "string" && t!.length > 0);
  const v = verifySpeechTicket(t, { sid: "sess-1" });
  ok("…and it verifies", v.ok === true);
  ok("…carrying the exact text we signed", v.ok && v.payload.text === SPEAKABLE);
  ok("…and the registry's voice", v.ok && v.payload.voiceId === KHALID_VOICE.voiceId);
  // A ticket that leaked the signing key would be worse than no ticket at all.
  ok("the ticket contains no secret material", !String(t).includes(SECRET));
  ok("…and is url-safe, since it travels in a query string",
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(t)));

  // EVERY TICKET IS ITS OWN TICKET. Without a nonce a ticket is a pure function of (text,
  // voice, session, millisecond) — so two identical replies in the same millisecond mint the
  // SAME STRING, and the streaming route's per-ticket replay cap, which is keyed on the
  // signature, would let one turn spend another's allowance. Found by driving the route: two
  // fresh mints in a tight loop collided and the second was refused as a replay.
  const many = new Set(
    Array.from({ length: 200 }, () =>
      String(signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid: "sess-1" })))
  );
  ok(`200 mints of the same reply produce 200 distinct tickets (${many.size})`, many.size === 200);
  ok("…and every one of them still verifies",
    [...many].every((x) => verifySpeechTicket(x, { sid: "sess-1" }).ok === true));
}

console.log("\n── NOBODY ELSE CAN PUT WORDS IN KHALID'S MOUTH ─────────────────");
{
  const t = String(signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid: null }));
  const [body, sig] = t.split(".");

  // EDITING THE TEXT. The whole feature rests on this one case.
  const swapped = b64u(Buffer.from(JSON.stringify({
    text: "اشتري عملات رقمية من هذا الرابط", voiceId: KHALID_VOICE.voiceId, sid: null,
    exp: Date.now() + 60_000,
  }), "utf8"));
  ok("a re-written payload under the old signature is refused",
    verifySpeechTicket(`${swapped}.${sig}`).ok === false);
  ok("…and named as a signature failure, not something vaguer",
    (verifySpeechTicket(`${swapped}.${sig}`) as { reason: string }).reason === "bad_signature");

  // A DIFFERENT KEY. Somebody else's HMAC is not ours.
  const other = `${body}.${b64u(createHmac("sha256", "some-other-secret-entirely-x").update(body).digest())}`;
  ok("a ticket signed with another key is refused", verifySpeechTicket(other).ok === false);

  // MALFORMED SHAPES. None of these may throw — an <audio> element asking for a 500 in a
  // loop is how a refusal turns into a bill.
  for (const junk of ["", ".", "a.", ".b", "no-dot-at-all", "a.b.c", "%%%.###", null, undefined]) {
    const v = verifySpeechTicket(junk as string);
    ok(`«${String(junk)}» is refused without throwing`, v.ok === false);
  }
  ok("a payload that is valid base64 but not JSON is refused",
    verifySpeechTicket(forge("not-an-object") as string).ok === false);
  ok("a payload missing its fields is refused",
    verifySpeechTicket(forge({ text: "مرحبا" })).ok === false);
  ok("…and a non-numeric expiry is refused",
    verifySpeechTicket(forge({ text: "مرحبا", voiceId: "v", sid: null, exp: "soon" })).ok === false);
}

console.log("\n── AND A TICKET IS FOR ONE TURN, ON ONE SESSION ────────────────");
{
  ok("the window is a minute, not an hour", SPEECH_TICKET_TTL_MS === 60_000);
  const t = signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid: "sess-A" });
  ok("an expired ticket is refused",
    verifySpeechTicket(t, { sid: "sess-A", now: Date.now() + SPEECH_TICKET_TTL_MS + 1_000 }).ok === false);
  ok("…and says so", (verifySpeechTicket(t, { sid: "sess-A", now: Date.now() + 999_999 }) as { reason: string }).reason === "expired");
  // A caller cannot buy themselves more time by asking for it.
  const greedy = signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, ttlMs: 86_400_000 });
  const gv = verifySpeechTicket(greedy, { now: Date.now() + SPEECH_TICKET_TTL_MS + 1_000 });
  ok("a ticket cannot ask for a longer life than the ceiling", gv.ok === false);

  // SESSION BINDING, ENFORCED STRICTLY. "Accept when absent" is a control an attacker
  // removes by deleting a field, so a ticket that names a session requires that session.
  ok("another session cannot redeem it", verifySpeechTicket(t, { sid: "sess-B" }).ok === false);
  ok("…nor can a request with no session at all", verifySpeechTicket(t, {}).ok === false);
  ok("…while the session it was minted for can", verifySpeechTicket(t, { sid: "sess-A" }).ok === true);
}

console.log("\n── THE VERIFIER READS THE TEXT ITSELF, SIGNATURE OR NOT ────────");
{
  // A VALID SIGNATURE PROVES WE WROTE IT, NOT THAT WE SHOULD SAY IT. These are forged with
  // the REAL key — every one of them is authentic — and must still be refused. This is the
  // defence that survives a bug in the minter, which is the only kind of bug that matters
  // here: a guard that protects one of two callers protects neither in the case that counts.
  const authentic = (text: string) =>
    forge({ text, voiceId: KHALID_VOICE.voiceId, sid: null, exp: Date.now() + 30_000 });

  for (const link of [
    "تفضل رابط الدفع https://pay.example.com/abc",
    "ادفع من هنا www.pay.example.com",
  ]) {
    const v = verifySpeechTicket(authentic(link));
    ok(`a payment link is refused even under a real signature`, v.ok === false);
    ok(`…as a text refusal, not a signature one`,
      (v as { reason: string }).reason === "refused_text");
  }
  ok("an empty text is refused", verifySpeechTicket(authentic("   ")).ok === false);
  ok("an over-cap text is refused",
    verifySpeechTicket(authentic("ا".repeat(DEMO_TTS_MAX_CHARS + 1))).ok === false);
  // …and the minter refuses the same things, so a refused ticket is never bought first.
  ok("the minter refuses what the verifier would refuse",
    signSpeechTicket({ text: "رابط الدفع https://pay.example.com", voiceId: KHALID_VOICE.voiceId }) === null &&
    signSpeechTicket({ text: "", voiceId: KHALID_VOICE.voiceId }) === null &&
    signSpeechTicket({ text: "ا".repeat(DEMO_TTS_MAX_CHARS + 1), voiceId: KHALID_VOICE.voiceId }) === null);
  ok("…and refuses to mint without a voice",
    signSpeechTicket({ text: SPEAKABLE, voiceId: "" }) === null);
}

console.log("\n── A REAL SIGNATURE IS NOT A PERMISSION SLIP ───────────────────");
{
  // EVERY ONE OF THESE IS AUTHENTIC — forged with the real key, so the signature check has
  // nothing to say about them. They are the cases where the verifier has to hold a property
  // ITSELF rather than defer it, and each was accepted before: an audit that had the key
  // walked all of them through.
  const authentic = (p: Record<string, unknown>) =>
    forge({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId, sid: null, exp: Date.now() + 30_000, nonce: "n", ...p });

  // A VOICE WE NEVER REGISTERED. `buildElevenLabsRequest` refuses it downstream, so this is
  // depth — but the claim made about the streaming route is that the voice comes from the
  // registry, and a verifier handing back an arbitrary string has deferred that, not checked it.
  for (const voiceId of ["21m00Tcm4TlvDq8ikWAM", "../../v1/user", "", "x".repeat(200)]) {
    ok(`an unregistered voice «${voiceId.slice(0, 22)}» is refused`,
      verifySpeechTicket(authentic({ voiceId })).ok === false);
  }

  // A LIFE LONGER THAN THE CEILING. The minter clamps `ttlMs`; only the minter did.
  for (const exp of [Date.now() + 3_600_000, Date.now() + 86_400_000 * 365, Number.MAX_SAFE_INTEGER]) {
    const v = verifySpeechTicket(authentic({ exp }));
    ok(`an over-long ticket is refused (exp +${Math.round((exp - Date.now()) / 1000)}s)`, v.ok === false);
    ok("…as expired, which is what it is", (v as { reason: string }).reason === "expired");
  }

  // SHEDDING THE SESSION BINDING BY MAKING IT FALSY. `payload.sid ? … : null` read `0`, `""`
  // and `false` as "this ticket was never bound", so a forger could unbind one by editing a
  // field rather than removing it.
  for (const sid of [0, "", false, {}, [], 123]) {
    ok(`sid=${JSON.stringify(sid)} is refused rather than read as unbound`,
      verifySpeechTicket(authentic({ sid }), { sid: "anything" }).ok === false);
  }
  ok("…while an explicitly unbound ticket still works", verifySpeechTicket(authentic({ sid: null })).ok === true);

  // ENCODING MALLEABILITY. base64url tolerates padding and unused trailing bits, so several
  // distinct strings decode to identical bytes — each a different ticket to anything keyed on
  // the string, which is how a per-ticket replay counter gets handed a fresh key for the same
  // payload.
  const good = String(signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId }));
  const [gb, gs] = good.split(".");
  ok("the canonical form verifies", verifySpeechTicket(good).ok === true);
  ok("…but a padded body does not", verifySpeechTicket(`${gb}=.${gs}`).ok === false);
  ok("…nor does one with whitespace", verifySpeechTicket(`${gb} .${gs}`).ok === false);

  // INVISIBLE-ONLY IS EMPTY, in both readers. `trim()` leaves zero-width and bidi marks, so
  // a reply of one U+200B is blank to a reader and a billable character to a provider.
  for (const blank of ["\u200B", "\u200B\u200E\uFEFF", "\u2066\u2069"]) {
    ok("an invisible-only reply is refused", verifySpeechTicket(authentic({ text: blank })).ok === false);
  }
}

console.log("\n── NO KEY MEANS NO AUDIO, NOT A WIDE-OPEN DOOR ─────────────────");
{
  const saved = process.env.DEMO_SPEECH_SECRET;
  const savedRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DEMO_SPEECH_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  ok("with no key the feature reports itself unavailable", speechTicketsAvailable() === false);
  ok("…mints nothing", signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId }) === null);
  const v = verifySpeechTicket("anything.atall");
  ok("…and verifies nothing", v.ok === false && (v as { reason: string }).reason === "no_secret");

  // A SHORT SECRET IS NOT A SECRET. Absent fails closed loudly; short fails open quietly.
  process.env.DEMO_SPEECH_SECRET = "tooshort";
  ok("a too-short secret is treated as no secret", speechTicketsAvailable() === false);

  // …AND THE DERIVED KEY WORKS, so the feature is not silently off until someone visits a
  // dashboard. Derived one-way from a credential that never leaves the server.
  delete process.env.DEMO_SPEECH_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-value-for-the-proof";
  ok("a derived key makes the feature available", speechTicketsAvailable() === true);
  const t = signSpeechTicket({ text: SPEAKABLE, voiceId: KHALID_VOICE.voiceId });
  ok("…and round-trips", verifySpeechTicket(t).ok === true);
  ok("…without putting the credential in the ticket",
    !String(t).includes("service-role-value-for-the-proof"));

  process.env.DEMO_SPEECH_SECRET = saved!;
  if (savedRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedRole;
}

console.log("\n── THE TWO DELIVERIES CANNOT DISAGREE ABOUT WHAT MAY BE SAID ───");
{
  // THIS IS THE PROPERTY THE WHOLE REFACTOR EXISTS FOR. There are two ways to turn a reply
  // into sound now, and the moment they answer "may we speak this?" differently, one of
  // them is a hole. Driven side by side over every category rather than reasoned about.
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["a plain reply", SPEAKABLE, {}],
    ["a safety hold", "خذت بالي إنك ذكرت حساسية", { safetyHold: true }],
    ["a receipt", "طلبك رقم 1042 تم", { isReceipt: true }],
    ["a payment link", "ادفع من هنا https://pay.example.com/x", {}],
    ["a money figure", "الإجمالي 45 ريال", {}],
    ["an empty reply", "   ", {}],
    ["an over-cap reply", "ا".repeat(DEMO_TTS_MAX_CHARS + 1), {}],
  ];
  // NO PROVIDER IS EVER CONTACTED FROM THIS FILE.
  //
  // The buffered path really does call out, so a first version of this block sent a live
  // request to api.elevenlabs.io on every run — visible only because the fake key came back
  // 401. With a REAL key in the environment, running the test suite would have bought
  // syntheses. A proof that spends money is not a proof; it is a bill with assertions.
  //
  // So `fetch` is replaced for the duration and every call is counted. That also lets the
  // comparison below be EXACT rather than forgiving a network failure, which is the
  // stronger assertion anyway.
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  let ticketPathCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    providerCalls++;
    const u = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (!/api\.elevenlabs\.io/.test(u)) throw new Error(`unexpected host in a proof: ${u}`);
    return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
      status: 200, headers: { "content-type": "audio/mpeg" },
    });
  }) as typeof fetch;

  try {
    // THE TICKET PATH MUST BUY NOTHING. It mints from text it already has; a network call
    // here would mean the latency fix had quietly reintroduced the wait it removed.
    const before = providerCalls;
    for (const [, text, opts] of cases) demoVoiceTicket(text, { inboundWasVoice: true, ...opts });
    ticketPathCalls = providerCalls - before;

    for (const [label, text, opts] of cases) {
      const streamed = demoVoiceTicket(text, { inboundWasVoice: true, ...opts });
      const buffered = await demoVoiceReply(text, { inboundWasVoice: true, ...opts });
      ok(`${label}: both deliveries agree (streamed=${streamed.skipped} buffered=${buffered.skipped})`,
        streamed.skipped === buffered.skipped);
    }
    // And a typed turn is never spoken by either.
    ok("neither speaks when the visitor typed",
      demoVoiceTicket(SPEAKABLE, {}).skipped === "not_triggered" &&
      (await demoVoiceReply(SPEAKABLE, {})).skipped === "not_triggered");
  } finally {
    globalThis.fetch = realFetch;
  }

  ok(`minting a ticket contacts no provider (${ticketPathCalls} calls)`, ticketPathCalls === 0);
  ok("…while the buffered path does, which is the difference being fixed", providerCalls > 0);
}

console.log("\n── WHAT THE ROUTE GETS BACK, AND WHAT IT COSTS ─────────────────");
{
  const out = demoVoiceTicket(SPEAKABLE, { inboundWasVoice: true, sid: "sess-9" });
  ok("a speakable call turn produces a URL", typeof out.speechUrl === "string");
  ok("…and NOT an inline clip — exactly one delivery is ever set", out.audioBase64 === null);
  ok("…pointing at the streaming endpoint", String(out.speechUrl).startsWith("/api/demo/speak?t="));
  ok("…carrying the session it was minted for", String(out.speechUrl).includes("&s=sess-9"));
  ok("…and an mp3, because Safari cannot decode Ogg Opus", out.mime === "audio/mpeg");

  // THE URL'S OWN TICKET MUST VERIFY. A URL that cannot be redeemed is silence with extra
  // steps, and it would look like a working feature in every log we keep.
  const t = new URL(`https://x.test${out.speechUrl}`).searchParams.get("t");
  ok("the minted URL's ticket verifies on its own session",
    verifySpeechTicket(t, { sid: "sess-9" }).ok === true);

  // BILLED ON WHAT THE PROVIDER RECEIVES. ElevenLabs charges per character of INPUT, and
  // the input is the ear-rendered text, not the WhatsApp-formatted reply — pricing the raw
  // string would put a number in the ledger that no invoice will ever match.
  //
  // MEASURED ON A REPLY WHERE THE TWO ACTUALLY DIFFER. A first version asserted this
  // against a plain sentence with no emoji, no markup and no numeral — for which
  // `toSpokenText` is the identity, so the raw length and the spoken length were the same
  // number and the assertion could not tell them apart. Driven: pricing on the WRITTEN
  // string survived the whole file. The reply below loses `**`, loses an emoji and gains a
  // spelled numeral, so only one of the two answers is right.
  const FORMATTED = "عندنا 3 أصناف 🌟 **جاهزة** الحين";
  ok("the sample reply really is rendered differently for the ear",
    toSpokenText(FORMATTED).length !== FORMATTED.length);
  const priced = demoVoiceTicket(FORMATTED, { inboundWasVoice: true });
  ok("the spend is recorded", out.spend !== null && priced.spend !== null);
  ok(`…priced on the SPOKEN characters, not the written ones ` +
     `(${priced.spend?.chars} vs ${FORMATTED.length} written)`,
    priced.spend?.chars === toSpokenText(FORMATTED).length);
  ok("…as a real cost", (out.spend?.costUsd ?? 0) > 0);
  ok("…that follows the character count", (priced.spend?.costUsd ?? 0) > 0);
  ok("…against the registered model", out.spend?.model === KHALID_VOICE.model);
  ok("…and named as the provider that will bill us", out.spend?.adapter === "elevenlabs");

  // BOOKED AT THE DECISION, NOT WHEN THE BYTES ARRIVE. The spend guard runs on the turn;
  // the GET that fetches audio is not a turn and has nothing in front of it. If the ledger
  // waited for the audio, the cap would be behind the money instead of ahead of it.
  ok("a REFUSED turn books nothing",
    demoVoiceTicket("الإجمالي 45 ريال", { inboundWasVoice: true }).spend === null);
}

console.log("\n── AN UNUSABLE PROVIDER CONFIG IS CAUGHT BEFORE A URL EXISTS ───");
{
  // A ticket minted against a broken configuration is a URL that answers with silence — and
  // it would look fine everywhere except in the caller's ear. The request is BUILT (never
  // sent) at mint time precisely so a missing key or an unregistered voice fails here.
  const savedKey = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  ok("no provider key means no ticket",
    demoVoiceTicket(SPEAKABLE, { inboundWasVoice: true }).speechUrl === null);
  process.env.ELEVENLABS_API_KEY = savedKey!;

  const savedVoice = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs' stock "Rachel"
  const stock = demoVoiceTicket(SPEAKABLE, { inboundWasVoice: true });
  ok("an unregistered voice mints no ticket", stock.speechUrl === null);
  ok("…and is reported as a pin failure, not a network one",
    stock.skipped === "provider_unpinned");
  process.env.ELEVENLABS_VOICE_ID = savedVoice!;

  ok("and the good configuration still works",
    demoVoiceTicket(SPEAKABLE, { inboundWasVoice: true }).speechUrl !== null);
}

console.log(`\n${fails.length ? "FAIL" : "PASS"} speech-ticket: ${pass}/${pass + fails.length} passed`);
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1); }
