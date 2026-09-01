// ============================================================================
// Proof: the demo speaks, in the voice we chose, or it does not speak at all.
//
// Khalid could hear on the demo and never answer aloud — `synthesizeVoiceReply` had
// exactly ONE caller in the repo, lib/messaging/respond-and-send.ts, the WhatsApp path.
//
// THE TRAP THIS FILE EXISTS FOR. lib/ai/tts/index.ts getTtsAdapter() falls back silently:
// with no ELEVENLABS_API_KEY and a present OPENAI_API_KEY — which production has — it
// selects OpenAI `onyx`, an American male voice, and reports no error. On a sales page
// that means a prospect hears a stranger read Najdi Arabic and nobody finds out. A demo
// that speaks in the wrong voice is worse than one that stays silent, because silence is
// visible and a wrong voice is not.
//
// Run: node --conditions=react-server --import ./scripts/webhook-route-loader.mjs --experimental-strip-types scripts/proof-demo-voice-out.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KHALID_VOICE, isAuthorizedVoice } from "@/lib/ai/tts/voice-registry";
import { TTS_RATE_PER_CHAR } from "@/lib/ai/tts/pricing";
import { demoVoiceProviderPinned, demoVoiceReply, demoVoiceSignalsFor, voiceMatchesPin, DEMO_TTS_MAX_CHARS } from "../lib/demo/voice-out.ts";
import { voiceSignalsForTurn, voiceHardZeroReason } from "../lib/messaging/voice-budget.ts";
import { decodeReplyAudio, DEMO_AUDIO_DEFAULT_MIME } from "../lib/demo/audio-payload.ts";

let pass = 0, fail = 0;
const ok = (name: string, condition: boolean) => {
  if (condition) pass++;
  else { fail++; console.log("  FAIL", name); }
};
// STATEMENTS ONLY. The previous version of this helper returned the raw file, so the
// file's own prose satisfied the checks written against it — the single assertion this
// whole module exists for ("a fallback is a refusal") was pinned by a substring that
// survived COMMENTING THE LINE OUT, while a behaviour-preserving reformat broke it. A
// source check may only ever look at code.
const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8")
    .split("\n")
    .filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

const ENV_KEYS = ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_TTS_MODEL", "OPENAI_API_KEY"] as const;
function withEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => void) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of ENV_KEYS) {
      const v = k in vars ? vars[k] : undefined;
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
  }
}

// ── 1. THE SILENT-ONYX TRAP ──────────────────────────────────────────────────
withEnv({ OPENAI_API_KEY: "sk-present" }, () => {
  ok("no TTS config at all → the demo refuses to speak", !demoVoiceProviderPinned());
});
withEnv({ ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: "vid", OPENAI_API_KEY: "sk-present" }, () => {
  // getTtsAdapter() used to pick ElevenLabs here by inference. Inference is gone entirely
  // now — see the note in lib/ai/tts/index.ts — because it is exactly the mechanism that
  // silently picks a different voice when a key is missing or wrongly scoped.
  ok("keys present but TTS_ADAPTER unset → still refuses; inference is never trusted",
    !demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "elevenlabs", OPENAI_API_KEY: "sk-present" }, () => {
  ok("pinned to elevenlabs but NO key → refuses rather than falling back to onyx",
    !demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", OPENAI_API_KEY: "sk" }, () => {
  ok("pinned with a key but NO voice id → refuses; an unpinned voice is a wrong voice",
    !demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId }, () => {
  ok("pinned, key AND the REGISTERED voice id → speaks", demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: "vid" }, () => {
  ok("…but an unregistered voice id refuses, key or no key", !demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "openai", OPENAI_API_KEY: "sk-present" }, () => {
  ok("pinning OPENAI is refused — onyx is never the demo's voice, even deliberately",
    !demoVoiceProviderPinned());
});
withEnv({ TTS_ADAPTER: "mock" }, () => {
  ok("`mock` is a legitimate pin (tests/local): no cost, and no wrong voice", demoVoiceProviderPinned());
});

// ── 2. WHEN IT STAYS SILENT — and it must never throw ────────────────────────
{
  const SPEAKABLE = { inboundWasVoice: true, safetyHold: false, isReceipt: false };
  const cases: [string, Parameters<typeof demoVoiceReply>[1], string, string][] = [
    ["a TYPED turn is answered in text", { ...SPEAKABLE, inboundWasVoice: false }, "تمام", "not_triggered"],
    ["an empty reply is not synthesized", SPEAKABLE, "   ", "empty"],
    ["an over-long reply falls back to text rather than an unbounded bill",
      SPEAKABLE, "ا".repeat(DEMO_TTS_MAX_CHARS + 1), "too_long"],
  ];
  for (const [name, opts, text, reason] of cases) {
    const out = await demoVoiceReply(text, opts);
    ok(`${name} (${reason})`, out.audioBase64 === null && out.skipped === reason);
  }
  // The cap is on the INPUT, before any provider is called — TTS bills per character and
  // this page is unauthenticated.
  // A bound of 2000 was permitted here while the code sets 600 — 3.3x the real ceiling, so
  // the assertion would have waved through a tripling of the demo's worst-case TTS bill.
  // The number is pinned to what the arithmetic in lib/demo/config.ts was actually run for.
  ok("the character cap is the bound the day's cost was computed against",
    DEMO_TTS_MAX_CHARS === 600);
  await withEnvAsync({ OPENAI_API_KEY: "sk" }, async () => {
    const out = await demoVoiceReply("تمام، طلبك جاهز", SPEAKABLE);
    ok("an unpinned provider skips instead of guessing a voice", out.skipped === "provider_unpinned");
  });
}
async function withEnvAsync(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of ENV_KEYS) {
      const v = k in vars ? vars[k] : undefined;
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] as string;
    }
  }
}

// ── 2b. HARD-ZERO: the four categories that are TEXT-ONLY on any channel ─────
// lib/messaging/voice-budget.ts rules these text-only for the product, and
// voiceHardZeroReason is PURE — no tenant, no flag, no I/O — so there was never a reason
// for the demo to skip it. It matters MORE here than on WhatsApp: the allergen gate is
// the thing this page exists to demonstrate, and speaking that reply would show the
// feature off in the one modality the product forbids for it.
//
// The provider is PINNED for this whole section, so a suppression that failed to fire
// would attempt real synthesis — these assertions cannot pass by the demo being silent
// for some unrelated reason. `mock` pins without cost.
{
  await withEnvAsync({ TTS_ADAPTER: "mock" }, async () => {
    const speak = { inboundWasVoice: true, safetyHold: false, isReceipt: false };
    const suppressed: [string, Parameters<typeof demoVoiceReply>[1], string, string][] = [
      ["an allergen/safety reply is never spoken — a TTS render is a new mis-hearing surface",
        { ...speak, safetyHold: true }, "عندنا مكسرات في الطبق", "safety_hold"],
      ["a receipt is never spoken — the record of truth is the text",
        { ...speak, isReceipt: true }, "طلبك رقم ١٠٠٦ تم", "receipt"],
      ["a money figure is never spoken — a misheard amount is a wrong charge",
        speak, "المجموع 120 ريال", "money_figure"],
      ["a payment link is never spoken — a link must be tappable, not audio",
        speak, "تفضل رابط الدفع", "payment_link"],
    ];
    for (const [name, opts, text, reason] of suppressed) {
      const out = await demoVoiceReply(text, opts);
      ok(name, out.audioBase64 === null && out.skipped === reason);
    }
    // SAFETY OUTRANKS EVERYTHING: a safety turn that also names a price is suppressed as
    // safety, not as money — the reason the Founder reads must be the real one.
    const both = await demoVoiceReply("فيه مكسرات، والمجموع 120 ريال",
      { ...speak, safetyHold: true, isReceipt: true });
    ok("safety outranks receipt and money in the reported reason", both.skipped === "safety_hold");
    // And the control: an ordinary reply under the SAME pinned provider is NOT suppressed,
    // so the four assertions above are about the categories and not about the config.
    const plain = await demoVoiceReply("تفضل، وش تحب تطلب؟", speak);
    ok("an ordinary reply is not suppressed, and a pinned `mock` reports itself rather "
      + "than a misconfiguration that is not true", plain.skipped === "mock_pinned");
  });
}

// ── 2c. SPEND IS REPORTED, because the demo is the one surface anyone can call ───
{
  const mod = read("lib/demo/voice-out.ts");
  const route = read("app/api/demo/voice/route.ts");
  // The route already writes STT cost to agent_runs and says why: "the one surface anyone
  // can call was the one surface the spend monitor could not see". TTS is the same money.
  ok("a silent turn reports no spend", /spend: null/.test(mod));
  ok("the route writes TTS cost into the ledger sweep.ts reads",
    /trigger: "voice_tts"/.test(route) && /cost_usd: spoken\.spend\.costUsd/.test(route));
  // Behavioural: a suppressed turn must not report spend it never incurred.
  await withEnvAsync({ TTS_ADAPTER: "mock" }, async () => {
    const out = await demoVoiceReply("المجموع 120 ريال",
      { inboundWasVoice: true, safetyHold: false, isReceipt: false });
    ok("a suppressed turn reports no spend", out.spend === null);
  });
}

// ── 2d. BEHAVIOURAL: what the visitor ACTUALLY receives, over a stubbed network ──
// Every assertion above this point reads source text or exercises the skip branches. None
// of them could tell you whether a visitor gets ElevenLabs audio, onyx audio, or nothing —
// the shipped proof reported 20/20 with the feature entirely dead AND with onyx reaching
// the visitor. These drive the real code path and inspect the bytes and the hosts called.
{
  const EL_BYTES = "ELEVENLABS-AUDIO-BYTES";
  const ONYX_BYTES = "ONYX-AUDIO-BYTES";
  const realFetch = globalThis.fetch;
  let hosts: string[] = [];
  // THE PATH, not only the host. Recording the host alone left the pinned VOICE ID
  // unverified on the wire: an adapter defaulting `opts?.voiceId || "<stock Rachel>"` still
  // called api.elevenlabs.io, so every host assertion passed while a stock female voice
  // read Najdi Arabic to a visitor.
  let paths: string[] = [];
  let bodies: string[] = [];

  const stub = (elStatus: number) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      hosts.push(new URL(url).host);
      paths.push(new URL(url).pathname);
      if (init && typeof init.body === "string") bodies.push(init.body);
      const body = url.includes("elevenlabs.io") ? EL_BYTES : ONYX_BYTES;
      const okStatus = url.includes("elevenlabs.io") ? elStatus : 200;
      return {
        ok: okStatus >= 200 && okStatus < 300,
        status: okStatus,
        text: async () => "stub",
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      } as unknown as Response;
    }) as typeof fetch;
  };
  // A real custom voice id — a STOCK id is refused, which is itself asserted below.
  const PINNED = {
    TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key",
    ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId, OPENAI_API_KEY: "sk-present",
  };
  const SPEAK = { inboundWasVoice: true, safetyHold: false, isReceipt: false };

  // THE SAMPLE IS PART OF THE TEST. Every wire assertion used to run against one 18-character
  // string with no «ق» in it — so a review dropped the pronunciation dictionary EXACTLY when
  // the reply contains «قهوة», attached the banned broad-qaf dictionary whenever «ق» appears,
  // and corrupted the voice settings only for bodies over 30 characters. All three stayed
  // green, because the one sample triggered none of them. This one is long, and it contains
  // the very word the frozen dictionary exists to fix.
  const REPLY = "تفضل، وش تحب تطلب اليوم؟ عندنا قهوة عربية طازجة، وكبسة لحم، وبروست دجاج — كل شي جاهز الحين.";

  // (a) HEALTHY: the visitor gets ElevenLabs' actual bytes, and no other host is touched.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("a healthy turn returns the provider's real audio to the visitor",
      out.audioBase64 !== null && Buffer.from(out.audioBase64!, "base64").toString() === EL_BYTES);
    ok("a healthy turn reports the spend it actually incurred",
      out.spend !== null && out.spend!.costUsd > 0 && out.spend!.adapter === "elevenlabs");
    ok("only ElevenLabs is contacted on a healthy turn",
      hosts.length === 1 && hosts[0] === "api.elevenlabs.io");
    ok("THE PINNED VOICE ID is the one actually requested on the wire",
      paths.length === 1 && paths[0].includes(KHALID_VOICE.voiceId));
    ok("the priced model is the one actually sent to the provider",
      bodies.length === 1 && bodies[0].includes(KHALID_VOICE.model));

    // ── THE PIN ITSELF, AGAINST LITERALS FROM THE HANDOFF ────────────────────
    // Every other assertion here compares the request to KHALID_VOICE — and KHALID_VOICE to
    // NOTHING. An adversarial review repointed the registry at a different ElevenLabs voice
    // and the whole 215-file suite stayed green: the one control this work exists to install
    // was pinned by no assertion at all. These are the values copied from KIV-313, written
    // out, so that changing the voice is a test failure and not a silent substitution.
    ok("the registered voice is the one KIV-313 handed over",
      KHALID_VOICE.voiceId === "pYDa2s34YCzHjbn4DnXP");
    ok("…under the name it was accepted as", KHALID_VOICE.name === "Khalid kivo");
    ok("…on the model it was accepted under", KHALID_VOICE.model === "eleven_v3");
    ok("…with the qualified one-word dictionary, by id and version",
      KHALID_VOICE.pronunciationDictionary.id === "rv3aw4bY6zoL4iWxJlDk" &&
      KHALID_VOICE.pronunciationDictionary.versionId === "AuNrVOZsoDPTqDl8wlFw");
    ok("…and the settings the Founder listened to",
      KHALID_VOICE.settings.stability === 0.5 &&
      KHALID_VOICE.settings.similarity_boost === 0.75 &&
      KHALID_VOICE.settings.style === 0 &&
      KHALID_VOICE.settings.speed === 1 &&
      KHALID_VOICE.settings.use_speaker_boost === true);
    ok("and the voice on the wire is that literal id, not merely 'whatever is registered'",
      paths[0].includes("/pYDa2s34YCzHjbn4DnXP"));

    // ── KIV-313 §10 — THE ACCEPTED CONFIGURATION, ON THE WIRE ────────────────
    // The Founder listened to «Khalid kivo» at a SPECIFIC configuration and accepted THAT.
    // Before this, the request body was `{text, model_id}` — no voice_settings at all — so
    // ElevenLabs applied whatever was saved on the voice object at render time. The voice
    // "verified at stability 0.50" was therefore verified only for as long as nobody
    // touched a dashboard slider, and nothing here would have noticed if they had.
    const sent = JSON.parse(bodies[0]) as {
      voice_settings?: Record<string, unknown>;
      pronunciation_dictionary_locators?: Array<Record<string, unknown>>;
    };
    ok("voice_settings are sent explicitly, not left to the saved object",
      !!sent.voice_settings);
    ok("stability is the accepted 0.50 — NOT the unselected 0.40/0.30 captures",
      sent.voice_settings?.stability === 0.5);
    ok("similarity_boost is the accepted 0.75", sent.voice_settings?.similarity_boost === 0.75);
    ok("style is the accepted 0", sent.voice_settings?.style === 0);
    ok("speed is the accepted 1.00", sent.voice_settings?.speed === 1);
    ok("speaker boost matches the saved object", sent.voice_settings?.use_speaker_boost === true);

    // The ONE proven pronunciation correction, «قهوة» → ɡahwa. Without the locator the
    // word was mispronounced on every render, which is the single fix the handoff froze.
    const loc = sent.pronunciation_dictionary_locators ?? [];
    ok("the pronunciation dictionary is attached to the request", loc.length === 1);
    ok("…and it is the qualified one-word dictionary, by id and version",
      loc[0]?.pronunciation_dictionary_id === KHALID_VOICE.pronunciationDictionary.id &&
      loc[0]?.version_id === KHALID_VOICE.pronunciationDictionary.versionId);
    // KIV-313 is explicit that the old broad 18-rule qaf dictionary must NOT come back: it
    // was never qualified for this voice and introduced many errors. One locator, not two.
    ok("no second dictionary rides along — no blanket ق→g rule", loc.length < 2);

    // Provenance, recorded where an auditor can read it: this voice is a synthetic Voice
    // Design, not a donor recording or a clone. That is the fact G0-R turns on.
    ok("the registered voice is synthetic by provenance", KHALID_VOICE.provenance === "generated");
    // CHARS ARE WHAT WENT ON THE WIRE, NOT WHAT WENT IN THE BUBBLE. This asserted
    // `chars === REPLY.length`, which was true only while the provider was handed the
    // WhatsApp text verbatim. It is now handed the SPOKEN rendering — emoji and markdown
    // removed, numerals spelled — so the reply length is no longer what anyone is billed
    // for. Pinning the old number would have made the ledger disagree with the invoice, in
    // whichever direction the rendering happened to move; asserted against the request body
    // so the ledger can only ever be right.
    const wireText = String(sent.text ?? "");
    ok("the reported spend is the model+chars the provider was actually given",
      out.spend !== null && out.spend!.model === KHALID_VOICE.model &&
      out.spend!.chars === wireText.length &&
      Math.abs(out.spend!.costUsd - out.spend!.chars * TTS_RATE_PER_CHAR[`elevenlabs:${KHALID_VOICE.model}`]) < 1e-9);
    ok("…and the wire text really is the spoken rendering, not the bubble text",
      wireText !== REPLY && !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(wireText));
  });

  // (b) ELEVENLABS DOWN: refuse, and — the finding this replaces — never BUY the onyx
  // synthesis we would only discard. OPENAI_API_KEY is present and onyx would succeed.
  // A 5xx, NOT ONLY A 401. The failure stub tested one status, so an adapter that RETRIES
  // on a server error — with a different model, no settings and no dictionary — went
  // undetected: the retry never fired, because 401 is not 5xx. Every failure class must
  // reach the same refusal, and none may reach a second request.
  for (const status of [500, 502, 503, 429, 422]) {
    hosts = []; paths = []; bodies = []; stub(status);
    await withEnvAsync(PINNED, async () => {
      const out = await demoVoiceReply(REPLY, SPEAK);
      ok(`an ElevenLabs ${status} yields no audio and no retry`,
        out.audioBase64 === null && out.skipped === "synth_failed" && hosts.length === 1);
      ok(`…and never reaches another provider on a ${status}`,
        hosts.every((h) => h === "api.elevenlabs.io"));
    });
  }

  hosts = []; paths = []; bodies = []; stub(401);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("an ElevenLabs failure yields NO audio — onyx never reaches the visitor",
      out.audioBase64 === null && out.skipped === "synth_failed");
    ok("and OpenAI is never CALLED, so the discarded onyx synthesis is never billed",
      !hosts.some((h) => h.includes("openai")));
    ok("a failed turn reports no spend", out.spend === null);
  });

  // (c) The suppression and cap branches must not reach the network at all.
  for (const [name, text, opts] of [
    ["a hard-zero (money) turn", "المجموع 120 ريال", SPEAK],
    ["an over-cap turn", "ا".repeat(DEMO_TTS_MAX_CHARS + 1), SPEAK],
    ["a typed turn", "تمام", { ...SPEAK, inboundWasVoice: false }],
  ] as const) {
    hosts = []; paths = []; bodies = []; stub(200);
    await withEnvAsync(PINNED, async () => {
      const out = await demoVoiceReply(text, opts);
      ok(`${name} contacts no provider at all`, hosts.length === 0 && out.audioBase64 === null);
    });
  }

  // (d) A STOCK ElevenLabs voice id is refused before the network — the likely paste error.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: "21m00Tcm4TlvDq8ikWAM" }, async () => {
    const out = await demoVoiceReply("تفضل", SPEAK);
    ok("ElevenLabs' stock 'Rachel' is refused — a stock voice is never the designed Khalid",
      out.skipped === "provider_unpinned" && hosts.length === 0);
  });
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: "pNInz6obpgDQGcFmaJgB" }, async () => {
    ok("stock 'Adam' (American male) is refused too", !demoVoiceProviderPinned());
  });

  // (e) A model we cannot PRICE is refused: ttsCostUsd returns 0 for an unknown model, so
  // an unrecognised one does not merely cost more — it makes the spend invisible again.
  await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: "eleven_turbo_v9_unpriced" }, async () => {
    ok("an unpriced model is refused — one env var must not blind the spend monitor",
      !demoVoiceProviderPinned());
  });
  // KIV-313 §3 — `eleven_v3` is part of what was ACCEPTED, not a preference. An env value
  // that agrees is a no-op confirmation; one that disagrees is an unreviewed model change,
  // and it must fail closed in the pin AND in the adapter, not be approved by one and
  // rejected by the other.
  await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: KHALID_VOICE.model }, async () => {
    ok("an env model that AGREES with the registry is accepted", demoVoiceProviderPinned());
  });
  for (const other of ["eleven_multilingual_v2", "eleven_flash_v2.5", "eleven_turbo_v2"]) {
    await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: other }, async () => {
      ok(`an unreviewed model swap to ${other} is refused by the pin`, !demoVoiceProviderPinned());
    });
    hosts = []; paths = []; bodies = []; stub(200);
    await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: other }, async () => {
      const out = await demoVoiceReply(REPLY, SPEAK);
      ok(`…and the provider is never contacted for ${other}`,
        out.audioBase64 === null && hosts.length === 0);
    });
  }

  // (f) Whitespace is not configuration.
  await withEnvAsync({ ...PINNED, ELEVENLABS_API_KEY: " " }, async () => {
    ok("a whitespace-only key is a misconfiguration, not a key", !demoVoiceProviderPinned());
  });
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: "  " }, async () => {
    ok("a whitespace-only voice id is refused", !demoVoiceProviderPinned());
  });

  // (g) A zero-width-only reply is blank to a reader and billable to a provider.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply("\u200b\u200b", SPEAK);
    ok("a zero-width-only reply is empty, not billable", out.skipped === "empty" && hosts.length === 0);
  });

  // (h2) TRIM MUST BE AGREED ACROSS FILES. When one file trimmed an env value and another
  // read it raw, the two saw different strings: one stray space in ELEVENLABS_TTS_MODEL
  // passed the price check here and priced at $0 in the adapter, taking the entire
  // synthesis off the spend ledger. Money spent, nothing recorded.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: `  ${KHALID_VOICE.model}  ` }, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("a padded model still prices, and the ledger still sees the spend",
      out.audioBase64 !== null && out.spend !== null && out.spend!.costUsd > 0);
    ok("the padded model is trimmed before it reaches the provider",
      bodies.length === 1 && bodies[0].includes(`"${KHALID_VOICE.model}"`));
  });
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: `  ${KHALID_VOICE.voiceId}  ` }, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("a padded voice id is trimmed, not requested as %20%20ID%20%20",
      out.audioBase64 !== null && paths.length === 1 && paths[0].includes(`/${KHALID_VOICE.voiceId}`));
  });
  // A padded `mock` must resolve to the mock, NOT fall through to key inference and buy an
  // OpenAI onyx synthesis on an unauthenticated page.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ TTS_ADAPTER: "  mock  ", OPENAI_API_KEY: "sk-present" }, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("a padded `mock` pin stays mock and contacts NO provider",
      out.skipped === "mock_pinned" && hosts.length === 0);
  });

  // (h3) A 200 with an empty body is not a success. Without this check it was reported as
  // audio, with spend, for bytes that do not exist.
  hosts = []; paths = []; bodies = [];
  globalThis.fetch = (async () => ({
    ok: true, status: 200, text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as Response) as typeof fetch;
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply(REPLY, SPEAK);
    ok("an empty 200 is a failure, not silent audio with a bill",
      out.audioBase64 === null && out.skipped === "synth_failed" && out.spend === null);
  });

  // (h) The docstring promises this never throws.
  const noOpts = await demoVoiceReply("تمام");
  ok("a missing options argument does not throw", noOpts.skipped === "not_triggered");

  globalThis.fetch = realFetch;
}

// ── 2e. THE SIGNAL THE ROUTE FEEDS THE GATE — the 997 finding ────────────────
// The route used to derive "is this a safety turn?" from `escalate === true` and one model
// string. The ACTIVE ANAPHYLAXIS branch sets NEITHER — escalate:false, and a different
// model — so the reply telling a visitor to call an ambulance on 997 was synthesized and
// played aloud. Nothing in the 214-file suite asserted what the route passed, so setting
// both arguments to `false` left every proof green.
{
  const SAFE_TO_SPEAK = { stopReason: "end_turn", escalate: false, model: "claude", orderNumber: null };
  ok("an ordinary reply is speakable", (() => {
    const g = voiceSignalsForTurn(SAFE_TO_SPEAK);
    return !g.safetyHold && !g.isReceipt;
  })());

  // THE ONE THAT WAS SPOKEN. escalate:false and a model string the route did not check.
  const emergency = voiceSignalsForTurn({
    stopReason: "allergen_companion_emergency",
    escalate: false, model: "deterministic_allergen_companion", orderNumber: null,
  });
  ok("ACTIVE ANAPHYLAXIS is a safety turn even though escalate is false", emergency.safetyHold);

  for (const [why, stop, model] of [
    ["the deterministic allergen gate", "allergen_gate_notify", "deterministic_allergen_gate"],
    ["an allergy checkpoint", "allergy_checkpoint", "deterministic_allergen_companion"],
    ["the simple-allergy deflection", "allergy_simple_deflection", "deterministic_allergy_simple"],
    ["a calm hold", "allergy_calm_hold", "deterministic_allergy_calm_hold"],
    ["a calm hold in an emergency", "allergy_calm_hold_emergency", "deterministic_allergy_calm_hold"],
    ["a bulk handoff", "bulk_handoff", "claude"],
  ] as const) {
    ok(`${why} is a safety turn`,
      voiceSignalsForTurn({ stopReason: stop, escalate: false, model, orderNumber: null }).safetyHold);
  }

  ok("an order read back from a PREVIOUS turn is a receipt, even with no order number now",
    voiceSignalsForTurn({ stopReason: "dup_order_reference", escalate: false, model: "deterministic_dup_order", orderNumber: null }).isReceipt);
  ok("restating an old draft is a receipt",
    voiceSignalsForTurn({ stopReason: "old_draft_restatement", escalate: false, model: "x", orderNumber: null }).isReceipt);
  ok("an order closed on THIS turn is a receipt",
    voiceSignalsForTurn({ ...SAFE_TO_SPEAK, orderNumber: "1006" }).isReceipt);
  ok("an escalating turn is a safety turn", voiceSignalsForTurn({ ...SAFE_TO_SPEAK, escalate: true }).safetyHold);

  // FAIL CLOSED. A deterministic branch added next year is silent until someone lists it.
  ok("an UNKNOWN stop reason is treated as a safety turn, not spoken",
    voiceSignalsForTurn({ stopReason: "some_branch_invented_later", escalate: false, model: "x", orderNumber: null }).safetyHold);
  ok("an allergen model nobody listed is still a safety turn",
    voiceSignalsForTurn({ stopReason: "end_turn", escalate: false, model: "deterministic_allergen_something_new", orderNumber: null }).safetyHold);

  // THE ROUTE'S OWN MAPPING, EXECUTED. Four regexes on identifiers used to stand here, and
  // replacing the whole argument object with constants left them all matching, the suite
  // at 214/214, and the anaphylaxis reply synthesized. The mapping is now a function the
  // proof calls with a real emergency-shaped outcome.
  const emergencyOutcome = {
    stopReason: "allergen_companion_emergency", escalate: false,
    model: "deterministic_allergen_companion",
  };
  ok("the route's mapping marks the 997 emergency as a safety turn",
    demoVoiceSignalsFor(emergencyOutcome, { orderNumber: null }).safetyHold === true);
  ok("the route's mapping still lets an ordinary turn speak",
    demoVoiceSignalsFor({ stopReason: "end_turn", escalate: false, model: "claude" },
      { orderNumber: null }).safetyHold === false);
  ok("the route's mapping carries the closed order through as a receipt",
    demoVoiceSignalsFor({ stopReason: "end_turn", escalate: false, model: "claude" },
      { orderNumber: "1006" }).isReceipt === true);
  const vroute = read("app/api/demo/voice/route.ts");
  ok("the route uses that mapping on the REAL turn, not on constants",
    /demoVoiceSignalsFor\(out, closed\)/.test(vroute) && !/safetyHold: allergenGate/.test(vroute));
  // The audio must be synthesized from the SAME string the visitor reads. `out.reply` is
  // the pre-close text: it lacks the demo's "nothing was charged" line and carries
  // un-normalised digits, so speaking it makes the audio disagree with the bubble.
  ok("the spoken text is the one the visitor is shown", /demoVoiceReply\(closed\.reply/.test(vroute));
  // THE LIVE WHATSAPP PATH — the same defect, on the surface that matters more.
  const ras = read("lib/messaging/respond-and-send.ts");
  ok("the WhatsApp voice note derives its signals from the turn too",
    /voiceSignalsForTurn\(\{/.test(ras) && !/safetyHold: outcome\.escalate === true/.test(ras));
  // The ledger row is written for ANY real synthesis — gating it on a positive cost let a
  // mispriced model take 100% of the spend off the books.
  ok("the ledger write is not gated on a positive cost",
    /if \(spoken\.spend\) \{/.test(vroute) && !/spoken\.spend\.costUsd > 0/.test(vroute));
}

// ── 2e2. FIXES THAT WERE CLAIMED BUT PINNED BY NOTHING ──────────────────────
{
  const mod = read("lib/demo/voice-out.ts");
  ok("the validated voice id is PASSED to the adapter, not re-read by it",
    /adapter\.synthesize\(text, \{ voiceId: pinnedVoiceId, format: "mp3" \}\)/.test(mod));
  // AND THE BROWSER FORMAT IS PART OF THAT CALL. Ogg Opus — the WhatsApp voice-note
  // container, and the adapter's default — is undecodable in Safari, so the demo asking for
  // the default produced a paid, successful, delivered synthesis that made no sound on any
  // Apple device, with nothing wrong in any log. Pinned in the same expression as the voice
  // id because both are properties of THIS caller that the adapter cannot infer.
  ok("…and so is the browser-playable container",
    /format: "mp3"/.test(mod) && !/synthesize\(text, \{ voiceId: pinnedVoiceId \}\)/.test(mod));
  // The comparison itself is driven below; that its RESULT is acted on is source-anchored,
  // and deliberately so: no env configuration can make the value we ask for differ from
  // the value the adapter echoes, so only a lying adapter reaches the branch — which is
  // what the driven cases below supply. Deleting the call site left the suite green.
  ok("and the comparison actually gates the reply",
    /if \(!voiceMatchesPin\(result, pinnedVoiceId\)\) return refuse\("wrong_voice"\);/.test(mod));
  // Driven, not read: a lying adapter is the only thing that can make the value we ASKED
  // for differ from the value that ANSWERED, and no env configuration can produce one.
  const PIN = KHALID_VOICE.voiceId;
  ok("the pinned voice and provider are accepted",
    voiceMatchesPin({ adapter: "elevenlabs", voiceId: PIN }, PIN));
  ok("a different ElevenLabs voice is refused — right company, wrong person",
    !voiceMatchesPin({ adapter: "elevenlabs", voiceId: "21m00Tcm4TlvDq8ikWAM" }, PIN));
  ok("onyx wearing an elevenlabs label is refused on the voice id",
    !voiceMatchesPin({ adapter: "elevenlabs", voiceId: "onyx" }, PIN));
  ok("another provider is refused even with the right voice id",
    !voiceMatchesPin({ adapter: "openai", voiceId: PIN }, PIN));
  for (const missing of [undefined, null, ""]) {
    ok(`an adapter that reports no voice id at all is refused (${JSON.stringify(missing)})`,
      !voiceMatchesPin({ adapter: "elevenlabs", voiceId: missing }, PIN));
  }
  ok("a refusal after a paid synthesis still reports the spend",
    /const refuse = [\s\S]{0,120}spend: spentAnyway/.test(mod));
  // DRIVEN, NOT GREPPED. These five used to be asserted as `mod.includes(legacy)` — the
  // proof checked that voice-out.ts CONTAINED the id as text. That passes for a list that
  // nothing reads, and it went red the moment the 50-entry deny list was replaced by a
  // strictly stronger allow list, which is a proof failing on a change that improved the
  // thing it was protecting. Ask the guard instead.
  for (const legacy of ["29vD33N1CtxCmqQRPOHJ", "2EiwWnXFnvU5JabPnv8n", "5Q0t7uMcjvnagumLfvZi",
                        "GBv7mTt0atIp3Br8iCZE", "pMsXgVXv3BLzUgSXRplE",
                        // stock Rachel / Adam, the likely paste error
                        "21m00Tcm4TlvDq8ikWAM", "pNInz6obpgDQGcFmaJgB",
                        // the identified quarantined object (KIV-90/95)
                        "VuqFqWXHibJ61b9IiVJ7"]) {
    ok(`the unregistered voice ${legacy} is refused`, !isAuthorizedVoice(legacy));
    withEnv({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: legacy }, () => {
      ok(`…and the demo will not speak with it`, !demoVoiceProviderPinned());
    });
  }
  // Case and invisibles are normalised — for the RIGHT id, which is the case that matters:
  // a correct id pasted with a zero-width character must not be read as "unknown voice".
  ok("the registered id is matched despite a zero-width character",
    isAuthorizedVoice(`${KHALID_VOICE.voiceId.slice(0, 4)}\u200b${KHALID_VOICE.voiceId.slice(4)}`));
  ok("the registered id is matched case-insensitively",
    isAuthorizedVoice(KHALID_VOICE.voiceId.toLowerCase()));
  // …and normalising must not turn a WRONG id into an accepted one.
  ok("a near-miss id is still refused", !isAuthorizedVoice(KHALID_VOICE.voiceId.slice(0, -1) + "X"));
  ok("an empty id is refused", !isAuthorizedVoice("") && !isAuthorizedVoice(null));
}

// ── 2e3. THE EMERGENCY MUST OUTRANK THE GARBLE LADDER ───────────────────────
// A voice note saying «اتصلوا بالإسعاف» at STT confidence below 0.70 used to take the
// voice-garble ladder — «ما وصلني صوتك واضح، ممكن تكتبها لي؟», SPOKEN — and never reach
// the emergency override at all. A panicked, breathless caller IS the low-confidence case,
// and "please retype that" is the one answer that must never be given to them.
//
// The guard excluded `companionEmergency` and `calmEmergency`, which are the ungated
// detector filtered through two feature flags that are OFF on this tenant — so both were
// hard-false and guarded nothing. Source-anchored because the ladder is inline in a
// DB-bound turn; the ordering it pins is the whole point.
{
  const ct = read("lib/ai/customer-turn.ts");
  const guard = /const voiceGuardOn =[\s\S]{0,400}?;/.exec(ct)?.[0] ?? "";
  ok("the voice ladder is skipped when the UNGATED emergency detector fires",
    /!safetyEmergencyHit\.fired/.test(guard));
  ok("and it is not relying on the flag-gated views alone",
    guard.includes("!safetyEmergencyHit.fired") &&
    guard.indexOf("!safetyEmergencyHit.fired") < guard.indexOf("!companionEmergency.fired"));
}

// ── 2f. PRICES THAT WERE SPOKEN ─────────────────────────────────────────────
// Every string below was verified to be SYNTHESIZED AND PLAYED to a visitor.
{
  const spoken: [string, string][] = [
    ["Arabic-Indic digits — `\\d` never matched ٠-٩ at all", "الإجمالي: ٧٠.١٥ ر.س"],
    ["a quoted read-back, which the outbound formatter deliberately leaves un-normalised", "قصدك «كبسة بـ٧٠ ريال»؟"],
    ["a price with NO currency token", "الكبسة بـ70 والمندي بـ65، وش تختار؟"],
    ["the shape the prompt's own examples use", "بروست بـ45 + بطاطس بـ20 = 65"],
    // No keyword and no «بـ»: this fixture genuinely depends on ﷼ being in MONEY_RE.
    ["U+FDFC RIAL SIGN", "كبسة لحم 70.15 ﷼"],
    ["tatweel inside the currency word", "كبسة لحم بسعر 45 ريـال"],
    ["an Arabic-Indic Egyptian total", "المجموع ١٢٠ جنيه"],
  ];
  for (const [why, text] of spoken) {
    ok(`a price is text-only: ${why}`,
      voiceHardZeroReason(text, { safetyHold: false, isReceipt: false }) === "money_figure");
  }
  ok("an ordinary reply with no price is still speakable",
    voiceHardZeroReason("تفضل، وش تحب تطلب اليوم؟", { safetyHold: false, isReceipt: false }) === null);
  ok("a plain quantity is not mistaken for a price",
    voiceHardZeroReason("تمام، ضفت لك ٢ كبسة", { safetyHold: false, isReceipt: false }) === null);
  // THE OPPOSITE FAILURE. «ب» is also the ordinary preposition "in", so a rule matching
  // «ب» + digits read «بـ١٥ دقيقة» as a price and silenced one of the most common things a
  // restaurant says — on the LIVE WhatsApp path, not just the demo.
  for (const [why, text] of [
    ["a preparation time", "بيكون جاهز بـ١٥ دقيقة"],
    ["a lead time in days", "الحجز للمناسبات نحتاج بـ٣ أيام مقدماً"],
    ["an order number", "رقم الطلب ١٠٠٦، بانتظار تأكيد المطعم"],
    ["a phone number", "راسلنا واتساب ٠٥٠١٢٣٤٥٦٧"],
    ["a door number", "ندق عليك على الباب ٤ صح؟"],
    ["an office number", "التوصيل لمكتب ٢٠٥ تمام؟"],
    ["a driver ETA", "آسفين على التأخير، السائق قريب ٥ دقايق"],
    ["a quantity across a newline", "تمام، سجّلت لك الطلب\n٣ كبسات و٢ عصير"],
    ["a bare prep time", "يجهز خلال ٣٠ دقيقة"],
  ] as const) {
    ok(`not a price, still speakable: ${why}`,
      voiceHardZeroReason(text, { safetyHold: false, isReceipt: false }) === null);
  }
}

// ── 2g. THE CLIENT DECODE, driven with real bytes ───────────────────────────
{
  const b64 = Buffer.from("OGG-BYTES").toString("base64");
  const good = decodeReplyAudio(b64, "audio/ogg");
  ok("a valid payload decodes to the provider's actual bytes",
    !!good && Buffer.from(good.bytes).toString() === "OGG-BYTES");
  // MPEG, NOT OGG — AND THIS ASSERTION USED TO SAY THE OPPOSITE. It pinned audio/ogg with
  // the rationale "the provider returns opus in an ogg container", which was true of the
  // WhatsApp path and wrong for this one: this constant is the fallback for a BROWSER
  // player, and Safari cannot decode Ogg Opus. The demo now requests mp3, so a payload that
  // arrives without an explicit mime must be labelled mp3 or it is unplayable on every
  // Apple device — which is how a correct-looking assertion protected a silent demo.
  ok("the MIME defaults to mpeg — this is a browser player, and Safari cannot decode ogg",
    decodeReplyAudio(b64, null)?.type === DEMO_AUDIO_DEFAULT_MIME && DEMO_AUDIO_DEFAULT_MIME === "audio/mpeg");
  for (const [why, val] of [
    ["a null payload", null], ["an empty string", ""], ["a non-string", 42],
    ["malformed base64", "!!!not-base64!!!"],
  ] as const) {
    ok(`${why} yields no audio and does not throw`, decodeReplyAudio(val, "audio/ogg") === null);
  }
}

// ── 3. THE LINE THAT MUST NEVER BE COPIED FROM WHATSAPP ──────────────────────
{
  const mod = read("lib/demo/voice-out.ts");
  const route = read("app/api/demo/voice/route.ts");
  // respond-and-send.ts fires recordCriticalAlert on a TTS fallback, which EMAILS AND
  // WHATSAPPS THE FOUNDER. A stranger on a public page must never be able to page a human.
  // A CALL or an IMPORT, not a mention: both files name these functions in comments to
  // record WHY they are absent, and a bare substring test fails on its own documentation.
  const calls = (src: string, fn: string) =>
    new RegExp(`(?<!//[^\\n]*)\\b${fn}\\s*\\(`).test(
      src.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n")
    );
  const imports = (src: string, fn: string) => new RegExp(`import[^;]*\\b${fn}\\b[^;]*;`).test(src);
  for (const [label, fn] of [["raises a critical alert", "recordCriticalAlert"], ["sends WhatsApp audio", "sendWhatsAppAudio"]] as const) {
    ok(`the demo voice path never ${label}`,
      !calls(mod, fn) && !calls(route, fn) && !imports(mod, fn) && !imports(route, fn));
  }
  // THE FALLBACK IS NOT REFUSED — IT IS UNREACHABLE. synthesizeVoiceReply's only feature
  // is the onyx fallback, so calling it meant BUYING an onyx synthesis on every ElevenLabs
  // failure and discarding the bytes. Not importing it is a structural guarantee, and one
  // a comment cannot satisfy now that read() strips comments.
  ok("the fallback wrapper is not imported — onyx cannot be bought, let alone shipped",
    !/synthesizeVoiceReply/.test(mod));

  // This used to match the word "never blocks the reply" — which appears ONLY in a comment,
  // so it checked no code whatsoever. The real property has three parts, and the last two
  // are what mutations "route computes the audio and never returns it" and "client ignores
  // replyAudio" exploited to leave the feature dead behind a green proof.
  ok("the text reply is returned unconditionally, outside any audio branch",
    /reply: closed\.reply/.test(route));
  ok("the audio IS actually put on the wire (null when we stayed silent)",
    /replyAudio: spoken\.audioBase64/.test(route) && /replyAudioMime: spoken\.mime/.test(route));
  // The client has no DOM harness here, so this is structural — but it is anchored on the
  // BRANCH, not on the identifier. `/data\.replyAudio/` alone stayed green when the guard
  // was rewritten to `if (false)`, because the identifier still appeared further down in
  // the decode that had become unreachable. Anchoring on `if (` survives a reformat such as
  // `!= null` and dies when the branch is disabled.
  {
    const cl = read("app/demo/DemoPhone.tsx");
    ok("the client actually consumes the audio rather than dropping it",
      /decodeReplyAudio\(\s*data\.replyAudio/.test(cl) &&
      /createObjectURL\(new Blob\(\[decoded\.bytes\]/.test(cl) &&
      /audioUrl = url/.test(cl));
  }
  ok("the route asks for voice only on a spoken turn", /inboundWasVoice: true/.test(route));

  const phone = read("app/demo/DemoPhone.tsx");
  ok("the client renders a play control for a spoken reply", /<SpokenReply url=\{m\.audioUrl\}/.test(phone));
  ok("the TEXT is still rendered alongside it — audio alone is unusable on a muted phone",
    /m\.audioUrl \? <SpokenReply[\s\S]{0,140}m\.text \?/.test(phone));
  ok("object URLs are revoked on unmount", /URL\.revokeObjectURL\(url\)/.test(phone));
}

// ── EVERY GUARD BELOW WAS UNPROTECTED, AND AN AUDIT KILLED IT WITH 215/215 GREEN ──
{
  const { demoVoiceSilenceKind } = await import("../lib/demo/voice-out.ts");
  const { TTS_RATE_PER_CHAR } = await import("../lib/ai/tts/pricing.ts");
  const { voiceMayReadDialect, lookupVoice } = await import("../lib/ai/tts/voice-registry.ts");

  // B3 — demoVoiceSilenceKind, the headline fix of the previous round, had NO assertions
  // anywhere. Two mutations reopened the defect it was written to close, with the whole
  // suite green: reporting `synth_failed` as a product rule tells the visitor a safety
  // guarantee caused a provider outage AND keeps the loop recording; reporting `too_long`
  // the same way dresses a length cap as a safety promise.
  for (const rule of ["safety_hold", "money_figure", "payment_link", "receipt"] as const) {
    ok(`${rule} is a product RULE — show the text, keep talking`,
      demoVoiceSilenceKind(rule) === "rule");
  }
  for (const notRule of ["synth_failed", "wrong_voice", "provider_unpinned", "mock_pinned", "too_long", "empty"] as const) {
    ok(`${notRule} is UNAVAILABLE — never dressed up as a safety rule`,
      demoVoiceSilenceKind(notRule) === "unavailable");
  }
  ok("no skip reason at all is `none`", demoVoiceSilenceKind(null) === "none");

  // H5 — the eleven_v3 RATE was unpinned: the pin checks presence, never accuracy, so any
  // wrong-but-present number was accepted and `agent_runs.cost_usd` — the only figure the
  // spend sweep sums — was wrong by that factor. Read off the provider dashboard.
  ok("eleven_v3 is priced at the published $0.10 / 1K characters",
    TTS_RATE_PER_CHAR["elevenlabs:eleven_v3"] === 0.0001);
  ok("flash is priced at the published $0.05 / 1K characters",
    TTS_RATE_PER_CHAR["elevenlabs:eleven_flash_v2.5"] === 0.00005);
  ok("a 600-character reply — the demo cap — costs about six cents",
    Math.abs(600 * TTS_RATE_PER_CHAR["elevenlabs:eleven_v3"] - 0.06) < 1e-9);

  // B1 — A VOICE MAY ONLY READ ITS OWN DIALECT. «وصاية» is a LIVE Egyptian tenant with
  // voice_notes enabled; ELEVENLABS_VOICE_ID is a single global setting, so without this
  // guard her real customers receive Cairene Arabic in a synthetic Saudi voice the moment
  // a key exists — and no configuration could fix it, because exactly one voice is
  // registered.
  const khalid = lookupVoice(KHALID_VOICE.voiceId);
  ok("the registered voice declares the dialect it speaks", KHALID_VOICE.dialect === "saudi");
  ok("it may read for a SAUDI tenant", voiceMayReadDialect(khalid, "saudi"));
  ok("it may NOT read for an EGYPTIAN tenant — «وصاية» stays on text",
    !voiceMayReadDialect(khalid, "egyptian"));
  for (const d of [null, undefined, "", "  ", "levantine", "SAUDI "]) {
    const expected = String(d ?? "").trim().toLowerCase() === "saudi";
    ok(`dialect ${JSON.stringify(d)} → ${expected ? "may" : "may not"} be read aloud`,
      voiceMayReadDialect(khalid, d) === expected);
  }
  ok("an unregistered voice may read for nobody", !voiceMayReadDialect(null, "saudi"));
}

// ── B2 — EVERY EXIT THAT CAN RETURN AUDIO MUST SAY WHY IT DIDN'T ────────────
// The client's default for a missing `replyAudioSilence` is "unavailable", deliberately:
// an unexplained silence must never be dressed up as a product guarantee. That default is
// right, and it is exactly why omitting the field from ONE of the route's exits was so
// damaging. The deterministic quantity-fill exit — «كم قطعة تحب؟» → «خمسة», the most common
// spoken turn in the whole demo — returned audio:null with no reason, so the call ENDED on
// turn two or three of the flagship ordering flow telling a restaurant owner «الصوت مو
// شغّال». Structural, not spot-checked: any future exit that forgets the field fails here.
{
  const route = readFileSync(resolve(process.cwd(), "app/api/demo/voice/route.ts"), "utf8");
  const exits = [...route.matchAll(/return NextResponse\.json\(\{[\s\S]*?\n    \}\)/g)].map((m) => m[0]);
  const audioExits = exits.filter((e) => e.includes("replyAudio"));
  ok(`every exit that carries audio also carries its reason (${audioExits.length} found)`,
    audioExits.length >= 2 && audioExits.every((e) => e.includes("replyAudioSilence")));
  // …and the quantity-fill turn is SPOKEN, not silently skipped. Staying quiet there was
  // never a safety requirement: this branch is reached only when the phonetic safety probe
  // did NOT fire, having run with the real STT confidence of the real audio — a stronger
  // clearance than a model turn's stopReason, not a missing one.
  const fillStart = route.indexOf('if (filled.kind === "handled")');
  const fill = route.slice(fillStart, route.indexOf("} catch (e) {", fillStart));
  ok("the deterministic quantity-fill reply is synthesized, not skipped",
    /demoVoiceReply\(/.test(fill) || /demoVoiceTicket\(/.test(fill));
  ok("…by whichever delivery the channel uses, streamed on a call and buffered otherwise",
    /isPhoneCall && speechTicketsAvailable\(\)/.test(fill));
  ok("…and its spend reaches the ledger like any other synthesis",
    /trigger: "voice_tts"/.test(fill));
  // AND THE WRITE IS ACTUALLY GUARDED. `if (filledSpoken.spend)` wrapped in `if (false && …)`
  // survived the whole 222-file suite: the model exit's equivalent write is pinned, this one
  // was not, so ONE of the two exits could stop recording spend with CI green. That is the
  // "25 turns → $0.00" shape, and it is why the guard is asserted per exit rather than once.
  ok("…behind a condition, so a spend is never written for a turn that had none",
    /if \(filledSpoken\.spend\) \{/.test(fill));
  ok("…written through mustWrite, which fails closed rather than losing the row",
    /mustWrite</.test(fill) && /exactRows: 1/.test(fill));
  ok("…and the row carries the real cost, not a constant",
    /cost_usd: filledSpoken\.spend\.costUsd/.test(fill));
}

// ── THE TWO LIVE-PATH GUARDS THAT NOTHING PINNED ────────────────────────────
{
  const ras = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
  // THE CALL SITE, NOT JUST THE FUNCTION. A review pinned the guard's BODY by driving it,
  // then broke it from one line higher: passing a literal `"saudi"` as `tenantDialect`, or
  // deriving it from the registry so the guard compares the registry against itself, let an
  // EGYPTIAN tenant reach ElevenLabs at 215/215. Same shape as the defect it was fixing —
  // closed one level down, open one level up. Both the argument and the flag gate are
  // asserted on the CALL, inside the block that makes it.
  const callSite = ras.slice(ras.indexOf("void maybeSendVoiceNote(admin, {"), ras.indexOf("void maybeSendVoiceNote(admin, {") + 1400);
  ok("the tenant dialect passed to the guard is the one RESOLVED for this turn",
    /tenantDialect: outboundDialect/.test(callSite));
  // AND WHERE THAT VALUE COMES FROM. The property-name regex above is a same-line grep: a
  // review redefined `outboundDialect` one line ABOVE the slice as
  // `lookupVoice(envVoiceId())?.dialect ?? ""` — the guard comparing the registry against
  // itself — and every assertion here stayed green at 216/216 while an Egyptian tenant
  // spoke. Pin the definition, which is the thing that decides.
  const outboundDef = ras.slice(ras.indexOf("const outboundDialect ="), ras.indexOf("const outboundDialect =") + 200);
  ok("outboundDialect is resolved from the TENANT ROW, not from the registry",
    /const outboundDialect = resolveTenantDialect\(/.test(outboundDef));
  ok("…and there is exactly one definition of it, so none can shadow the other",
    (ras.match(/const outboundDialect =/g) ?? []).length === 1);
  ok("…and it is not a literal", !/tenantDialect: ["'`]/.test(callSite));
  // H3 — deleting this one line is the difference between ONE tenant speaking and all 13.
  // There is no second layer: decideVoiceSend is called with `enabled: true` hardcoded.
  const gate = ras.slice(Math.max(0, ras.indexOf("void maybeSendVoiceNote(admin, {") - 400), ras.indexOf("void maybeSendVoiceNote(admin, {"));
  ok("the voice note is gated on the tenant's own voice_notes flag, at the call",
    /isFeatureExplicitlyEnabled\("voice_notes", outcome\.features\)/.test(gate));
  // ASSERT THE SHAPE, NOT A LIST OF WEAKENINGS. The first version hunted for `… || true`
  // and missed `true || …` — the same weakening written the other way round, which let every
  // Saudi-dialect tenant speak regardless of its own flag, at 216/216. Enumerating the ways
  // to break something is always incomplete; pinning what it must LOOK like is not.
  ok("…and the gate is exactly a conjunction on that flag, with nothing beside it",
    /&& isFeatureExplicitlyEnabled\("voice_notes", outcome\.features\)\) \{/.test(gate));
  // The guard must not be conditioned on the environment: an audit disabled it with
  // `NODE_ENV !== "production" &&` and with `!process.env.VERCEL &&`, both green, both
  // meaning the protection existed everywhere EXCEPT where it matters.
  ok("the dialect guard is not conditioned on NODE_ENV or a deploy variable",
    !/NODE_ENV[\s\S]{0,80}voiceMayReadDialect/.test(ras) &&
    !/process\.env\.VERCEL[\s\S]{0,80}voiceMayReadDialect/.test(ras));
  const fn = ras.slice(ras.indexOf("export async function maybeSendVoiceNote"), ras.indexOf("/**\n * WO-MEDIA-GUARD"));
  // M-c — the provider has already billed; a WhatsApp transmit failure must not discard
  // our only record of the money.
  ok("…and the flag is re-checked INSIDE the function, where driving it can see",
    /isFeatureExplicitlyEnabled\("voice_notes", args\.features\)/.test(fn));
  // A CONFIG FAULT MUST BE VISIBLE. A 4xx correctly yields silence rather than a substitute
  // voice — and yielded it with no alert and not even a console line, so voice could be dead
  // for every live tenant with no signal anywhere. A log line, not an alert: this fires once
  // per turn, and recordCriticalAlert emails and WhatsApps a human.
  {
    // SCOPED TO THAT BRANCH. A wide window matched the `fellBack` alert that legitimately
    // follows it a few lines later, so the assertion failed against correct code — the
    // block boundary is the thing being asserted about, so take the block.
    const start = fn.indexOf("if (!tts) {");
    const branch = fn.slice(start, fn.indexOf("\n  }", start));
    ok("a synthesis that produced nothing is at least logged, with the tenant named",
      /console\.warn\(/.test(branch) && /restaurant=\$\{args\.restaurantId\}/.test(branch));
    // MATCH THE CALL, NOT THE WORD. `/recordCriticalAlert/` matched the branch's own
    // COMMENT explaining why it deliberately does not page — the assertion failed against
    // correct code because the code explains itself. The open paren is the call.
    ok("…and it is a log line, not a page — a bad key must not alert on every turn",
      !/recordCriticalAlert\(/.test(branch));
    // …while the FALLBACK, which does ship a wrong voice, still pages a human.
    ok("a fallback to another voice still raises a critical alert",
      /if \(tts\.fellBack\) \{[\s\S]{0,400}recordCriticalAlert\(/.test(fn));
  }
  ok("the TTS spend row is written BEFORE the transmit check, not after",
    fn.indexOf('trigger: "voice_tts"') < fn.indexOf("const audioSend = await sendWhatsAppAudio"));
  ok("…and there is exactly one spend row per synthesis",
    (fn.match(/trigger: "voice_tts"/g) ?? []).length === 1);
}

// ── NO PROVIDER IS INFERRED — DRIVEN ON THE LIVE PATH ───────────────────────
//
// A half-finished configuration must be SILENT, not merely pointed somewhere else. A first
// attempt removed the ElevenLabs inference and left the OpenAI line standing; production
// always has OPENAI_API_KEY, so a live WhatsApp turn with TTS_ADAPTER forgotten bought an
// `onyx` synthesis and TRANSMITTED it to a real customer, with the registry never consulted.
// Worse than the state it replaced, and 215/215 green. Asserted here on the live path, by
// which hosts were contacted.
{
  const { maybeSendVoiceNote } = await import("../lib/messaging/respond-and-send.ts");
  const { getTtsAdapter } = await import("../lib/ai/tts/index.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  const contacted: string[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    contacted.push(new URL(String(u)).host);
    return {
      ok: true, status: 200, text: async () => "",
      json: async () => ({ messages: [{ id: "m1" }] }),
      arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
    } as unknown as Response;
  }) as typeof fetch;
  const admin = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_safety_hold: false }, error: null }) }) }),
    insert: async () => ({ data: null, error: null }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  }) } as never;
  const turn = {
    restaurantId: "r", conversationId: "c", phone: "+966500000000",
    inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
    lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
    features: { voice_notes: true },
  };

  // The exact operator error the activation step invites: key and voice set, pin forgotten.
  for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) delete process.env[k];
  Object.assign(process.env, {
    ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
    OPENAI_API_KEY: "sk-present",
  });
  ok("with no pin, the adapter resolves to mock — no provider is inferred",
    getTtsAdapter().name === "mock");
  contacted.length = 0;
  await maybeSendVoiceNote(admin, turn);
  ok("a live turn with TTS_ADAPTER forgotten contacts NO voice provider",
    !contacted.some((h) => h.includes("elevenlabs") || h.includes("openai")));
  // WITH WHATSAPP ACTUALLY CONFIGURED. Without these two variables sendWhatsAppAudio
  // returns `skipped` before it ever fetches, so this assertion could not fail — it stayed
  // green under a mutation that was synthesizing onyx at the time. Its two siblings did
  // bite, so the protection was real; this line was decorative until now.
  Object.assign(process.env, { WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345" });
  contacted.length = 0;
  await maybeSendVoiceNote(admin, turn);
  ok("…and transmits no audio to the customer, even with WhatsApp configured",
    !contacted.some((h) => h.includes("graph.facebook.com")));

  // TTS_ADAPTER=openai IS AN ACCEPTED VALUE, and it used to be a complete registry bypass on
  // the live path: `onyx` synthesized and TRANSMITTED to a real customer, with a perfectly
  // correct ELEVENLABS_VOICE_ID beside it, `fellBack:false` so no alert, and the dialect
  // guard passing because the ElevenLabs voice it checks IS correct. The demo has refused
  // this since it was written; the path that reaches paying customers did not.
  process.env.TTS_ADAPTER = "openai";
  contacted.length = 0;
  await maybeSendVoiceNote(admin, turn);
  ok("TTS_ADAPTER=openai synthesizes nothing that reaches the customer",
    !contacted.some((h) => h.includes("graph.facebook.com")));

  // …and the same configuration WITH the pin does speak, so the guard is not simply off.
  process.env.TTS_ADAPTER = "elevenlabs";
  contacted.length = 0;
  await maybeSendVoiceNote(admin, turn);
  ok("…while the same configuration WITH the pin reaches ElevenLabs",
    contacted.filter((h) => h.includes("elevenlabs")).length === 1 &&
    !contacted.some((h) => h.includes("openai")));

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── B1, DRIVEN — THE GUARD'S WIRING, NOT JUST ITS HELPER ────────────────────
//
// The first version of this asserted `/voiceMayReadDialect\(/` against the function's
// source. A review then deleted the `return` from the guard — leaving the identifier, the
// log line and everything else in place — and the whole 215-file suite stayed green with
// tsc and lint clean. «وصاية» would have spoken Saudi on the first note. `false && …`
// survived it too.
//
// That is verbatim the trap this repo has written down five times: an assertion matching a
// NAME rather than a BEHAVIOUR. So maybeSendVoiceNote is now EXECUTED, with a fake admin
// client and an instrumented fetch, and the assertion is about which hosts were contacted.
{
  const { maybeSendVoiceNote } = await import("../lib/messaging/respond-and-send.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  const contacted: string[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    contacted.push(new URL(String(u)).host);
    return {
      ok: true, status: 200, text: async () => "",
      json: async () => ({ messages: [{ id: "m1" }] }),
      arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
    } as unknown as Response;
  }) as typeof fetch;

  // Minimal Supabase double: the function reads the conversation's hold flag and writes a
  // counter, a message row and a spend row. None of that is under test here.
  const admin = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_safety_hold: false }, error: null }) }) }),
    insert: async () => ({ data: null, error: null }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  }) } as never;

  Object.assign(process.env, {
    TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key",
    ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
  });
  delete process.env.ELEVENLABS_TTS_MODEL;

  const turn = {
    restaurantId: "r", conversationId: "c", phone: "+201000000000",
    inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
    lastInboundAtMs: Date.now(),
    // The tenant's own flag. The function re-checks it internally, so a fixture without it
    // is refused — which is the guard working, and is why these positive controls matter.
    features: { voice_notes: true },
  };

  contacted.length = 0;
  await maybeSendVoiceNote(admin, { ...turn, replyText: "أهلاً بيك، تحب تطلب إيه؟", tenantDialect: "egyptian" });
  const elEgypt = contacted.filter((h) => h.includes("elevenlabs")).length;
  ok("an EGYPTIAN tenant contacts NO voice provider — «وصاية» stays on text", elEgypt === 0);
  ok("…and no other provider is substituted for it either", contacted.length === 0);

  contacted.length = 0;
  await maybeSendVoiceNote(admin, { ...turn, replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi" });
  ok("a SAUDI tenant does reach ElevenLabs — the guard is not simply off",
    contacted.filter((h) => h.includes("elevenlabs")).length === 1);

  // THE FLAG, DRIVEN. Previously only a regex around the call site watched this, and a
  // review hoisted the read out of the `if` so it gated nothing — all 13 tenants able to
  // speak, at 216/216. Now it is inside the function, so it is covered the same way the
  // dialect guard is.
  contacted.length = 0;
  await maybeSendVoiceNote(admin, { ...turn, replyText: "هلا فيك", tenantDialect: "saudi", features: { voice_notes: false } });
  ok("a tenant whose voice_notes flag is OFF reaches no provider", contacted.length === 0);
  contacted.length = 0;
  await maybeSendVoiceNote(admin, { ...turn, replyText: "هلا فيك", tenantDialect: "saudi", features: null });
  ok("…and so does a tenant with no flags at all — explicit-only, never inferred",
    contacted.length === 0);

  for (const d of ["", "  ", "levantine", "EGYPTIAN"]) {
    contacted.length = 0;
    await maybeSendVoiceNote(admin, { ...turn, replyText: "هلا فيك", tenantDialect: d });
    ok(`dialect ${JSON.stringify(d)} reaches no provider`,
      contacted.filter((h) => h.includes("elevenlabs")).length === 0);
  }

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── F2, DRIVEN — THE CAPABILITY ROUTE ITSELF ────────────────────────────────
//
// The call-screen harness MOCKS /api/demo/capabilities, so nothing executed the real
// handler: inverting `voiceOut`, inverting `voiceIn`, removing the host gate and removing
// the rate limit all survived the full suite. That first one is the defect the previous
// round names by name and claims closed — it was closed one level down, in
// demoVoiceAudible(), and left open in the route that consumes it.
{
  const { GET } = await import("../app/api/demo/capabilities/route.ts");
  const env = { ...process.env };
  const req = (host: string, ip = "1.2.3.4") =>
    new Request("https://x/api/demo/capabilities", { headers: { host, "x-forwarded-for": ip } });
  const call = async (host: string, ip?: string) => {
    const r = await GET(req(host, ip));
    return { status: r.status, body: await r.json() as { voiceCall?: boolean } };
  };

  // BOTH HALVES ARE SET INDEPENDENTLY, or neither is tested. `voiceCall` is
  // `voiceIn && voiceOut`, so leaving STT unconfigured pins it false through the EARS and
  // makes the VOICE half unobservable — inverting `voiceOut` to `true` survived exactly
  // that way. Every case below fixes STT to a real adapter and varies only the voice,
  // except the two that deliberately test the ears.
  const set = (v: Record<string, string>) => {
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "STT_ADAPTER"]) delete process.env[k];
    Object.assign(process.env, { STT_ADAPTER: "groq", ...v });
  };

  set({});
  ok("nothing configured → the route reports it cannot hold a call",
    (await call("maitre-ai.vercel.app", "9.9.9.1")).body.voiceCall === false);
  set({ TTS_ADAPTER: "mock" });
  ok("a pinned mock → still cannot hold a call",
    (await call("maitre-ai.vercel.app", "9.9.9.2")).body.voiceCall === false);
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "21m00Tcm4TlvDq8ikWAM" });
  ok("an unregistered voice → still cannot hold a call",
    (await call("maitre-ai.vercel.app", "9.9.9.3")).body.voiceCall === false);

  // The POSITIVE case — without it, a probe hardwired to `false` would pass everything above.
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId });
  ok("a fully configured surface DOES report that it can hold a call",
    (await call("maitre-ai.vercel.app", "9.9.9.6")).body.voiceCall === true);
  // …and the ears half, varied on its own against that same working voice.
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId, STT_ADAPTER: "mock" });
  ok("a working voice with NO ears still cannot hold a call",
    (await call("maitre-ai.vercel.app", "9.9.9.7")).body.voiceCall === false);

  // The host gate, on the route rather than in a comment about it.
  for (const bad of ["evil.example.com", "maitre-ai.vercel.app.evil.com"]) {
    ok(`the probe 404s on ${bad}`, (await call(bad, "9.9.9.4")).status === 404);
  }
  ok("…and answers on the demo host", (await call("maitre-ai.vercel.app", "9.9.9.5")).status === 200);

  // The route must not become a disclosure surface. Its own header promises ONE boolean —
  // "not which provider, not which voice, not whether a key exists".
  {
    const r = await call("maitre-ai.vercel.app", "9.9.9.8");
    ok("the probe answers exactly one field", Object.keys(r.body).length === 1);
    ok("…named voiceCall, and nothing about the provider", "voiceCall" in r.body);
    const raw = JSON.stringify(r.body);
    ok("…leaking no provider, voice id or key state",
      !/elevenlabs|openai|voiceId|apiKey|key/i.test(raw));
  }
  // A cached `true` after the voice is switched off is exactly the silent call screen the
  // route exists to prevent.
  {
    const res = await GET(req("maitre-ai.vercel.app", "8.8.4.4"));
    // Read by iterating rather than `.get()`: under this loader the Headers implementation
    // is case-SENSITIVE, so `.get("cache-control")` returns "" for a header stored as
    // "Cache-Control" — which made this assertion fail against correct code. Matching the
    // name case-insensitively tests the response, not the test harness's header shim.
    const cc = [...res.headers.entries()]
      .find(([k]) => k.toLowerCase() === "cache-control")?.[1] ?? "";
    ok(`the probe is never cached (status ${res.status}, cache-control ${JSON.stringify(cc)})`,
      res.status === 200 && cc.includes("no-store"));
  }
  // The rate-limit bucket must be keyed on the CLIENT ADDRESS, not on a header a caller
  // chooses — an attacker-selected bucket is not a limit.
  {
    const ras2 = readFileSync(resolve(process.cwd(), "app/api/demo/capabilities/route.ts"), "utf8");
    ok("the rate limit uses the shared demo window, not a private one",
      /DEMO_WINDOW_MS/.test(ras2) && !/rateLimit\([^)]*\d{4,}\s*\)/.test(ras2));
    // DRIVEN, NOT GREPPED. `/x-forwarded-for/.test(src)` passed a mutation that merely put
    // `x-real-ip ||` in front of it — an attacker-chosen bucket, which is not a limit, and
    // is the exact defect the old assertion's own comment named. So: hold the real client
    // address fixed, rotate every other header a caller could pick, and require the limit
    // to still bite.
    let refusedWithRotatingHeaders = false;
    for (let i = 0; i < 300; i++) {
      const r = await GET(new Request("https://x/api/demo/capabilities", {
        headers: {
          host: "maitre-ai.vercel.app",
          "x-forwarded-for": "5.5.5.5",       // the real client, held FIXED
          "x-real-ip": `9.0.0.${i % 250}`,    // rotated
          "x-demo-client": `c${i}`,           // rotated
          "cf-connecting-ip": `8.0.0.${i % 250}`, // rotated
        },
      }));
      if (r.status === 429) { refusedWithRotatingHeaders = true; break; }
    }
    ok("one client cannot buy a fresh bucket by rotating headers it controls",
      refusedWithRotatingHeaders);
    // A missing Host header must 404, not fall through to a default that passes the gate.
    const noHost = await GET(new Request("https://x/api/demo/capabilities", { headers: { "x-forwarded-for": "9.9.9.10" } }));
    ok("a request with no Host header is refused, not defaulted", noHost.status === 404);
  }

  // The rate limit, driven until it actually refuses.
  let limited = 0;
  for (let i = 0; i < 200; i++) {
    if ((await call("maitre-ai.vercel.app", "9.9.9.99")).status === 429) { limited = i; break; }
  }
  ok(`the probe is rate limited (refused after ${limited} requests)`, limited > 0);

  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── H4 — THE CANONICAL VOICE ID, ON THE LIVE PATH ───────────────────────────
// ElevenLabs voice ids are CASE-SENSITIVE. The registry lookup is deliberately tolerant so
// a correct id pasted with odd case or a zero-width character is not read as "unknown" —
// but the adapter must then send the REGISTERED spelling, or that tolerance becomes a 404
// in production. The demo passes the canonical id explicitly, so only the WhatsApp path
// (which passes no voiceId at all) was exposed, and nothing pinned it.
{
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => new TextEncoder().encode("B").buffer } as unknown as Response;
  }) as typeof fetch;
  const env = { ...process.env };
  const { elevenlabsTtsAdapter } = await import("../lib/ai/tts/elevenlabs.ts");
  for (const typed of [
    KHALID_VOICE.voiceId.toLowerCase(),
    KHALID_VOICE.voiceId.toUpperCase(),
    `  ${KHALID_VOICE.voiceId}  `,
    `${KHALID_VOICE.voiceId.slice(0, 4)}\u200b${KHALID_VOICE.voiceId.slice(4)}`,
  ]) {
    urls.length = 0;
    process.env.ELEVENLABS_API_KEY = "el-key";
    process.env.ELEVENLABS_VOICE_ID = typed;
    delete process.env.ELEVENLABS_TTS_MODEL;
    const r = await elevenlabsTtsAdapter.synthesize("قهوة عربية", undefined);
    ok(`a voice id typed as ${JSON.stringify(typed.slice(0, 12))}… goes on the wire CANONICALLY`,
      urls.length === 1 && urls[0]!.includes(`/${KHALID_VOICE.voiceId}?`));
    ok(`…and is echoed back canonically, so the pin check cannot mismatch`,
      r.voiceId === KHALID_VOICE.voiceId);
  }
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── "CAN THIS SURFACE SPEAK" IS NOT "IS THIS CONFIGURATION DELIBERATE" ──────
// The demo's capability probe used demoVoiceProviderPinned() as "can speak". That function
// says YES for a pinned `mock` — correctly, because a pinned mock is a considered choice —
// but the mock produces NO AUDIO. So with TTS_ADAPTER=mock the call screen opened, listened,
// thought, and went silent, and then told the visitor that safety/money/receipt rules were
// why, on a reply containing none of those. A fabricated demonstration of the one guarantee
// the page exists to sell, on every turn.
{
  const { demoVoiceAudible } = await import("../lib/demo/voice-out.ts");
  const env = { ...process.env };
  const set = (v: Record<string, string>) => {
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_API_KEY"]) delete process.env[k];
    Object.assign(process.env, v);
  };
  set({ TTS_ADAPTER: "mock" });
  ok("a pinned mock is a deliberate configuration…", demoVoiceProviderPinned() === true);
  ok("…but it is NOT audible, so the call screen must not offer itself", demoVoiceAudible() === false);
  set({ TTS_ADAPTER: "  MOCK  " });
  ok("…and a padded, upper-cased mock is caught the same way", demoVoiceAudible() === false);
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId });
  ok("a real pinned voice IS audible", demoVoiceAudible() === true);
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: "21m00Tcm4TlvDq8ikWAM" });
  ok("an unregistered voice is not audible", demoVoiceAudible() === false);
  set({});
  ok("nothing configured is not audible", demoVoiceAudible() === false);
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── A REFUSAL MUST NOT BECOME A DIFFERENT PROVIDER'S VOICE ──────────────────
// The voice guard was moved into the adapter so it would cover the WhatsApp path as well
// as the demo. It did the opposite there: synthesizeVoiceReply's fallback law caught the
// refusal like any outage and bought an OpenAI `onyx` synthesis, so pinning the G0-R
// QUARANTINED object sent an American male voice reading Najdi Arabic to a real customer.
// A guard that answers "we do not know whose voice this is" by generating a different
// voice is a fail-OPEN on "while G0-R is BLOCKED: no provider voice generation".
{
  const { synthesizeVoiceReply, isVoiceGovernanceRefusal } = await import("../lib/ai/tts/index.ts");
  const realFetch = globalThis.fetch;
  const contacted: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    contacted.push(new URL(String(input)).host);
    return {
      ok: true, status: 200, text: async () => "stub",
      arrayBuffer: async () => new TextEncoder().encode("BYTES").buffer,
    } as unknown as Response;
  }) as typeof fetch;

  const env = { ...process.env };
  const set = (v: Record<string, string>) => {
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_API_KEY"]) delete process.env[k];
    Object.assign(process.env, v);
  };

  for (const bad of [
    "VuqFqWXHibJ61b9IiVJ7",   // the identified quarantined object (KIV-90/95)
    "21m00Tcm4TlvDq8ikWAM",   // stock Rachel
    "pYDa2s34YCzHjbn4DnX",    // one character short — a typo
  ]) {
    contacted.length = 0;
    set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: bad, OPENAI_API_KEY: "sk-present" });
    const out = await synthesizeVoiceReply("قهوة عربية طازجة وكبسة لحم", { voiceId: bad });
    ok(`a refused voice (${bad.slice(0, 8)}…) yields NO audio on the WhatsApp path`, out === null);
    ok(`…and buys nothing from ANY provider — no onyx substitute`, contacted.length === 0);
  }

  // A 4xx IS A MISCONFIGURATION, NOT AN OUTAGE, and no other voice fixes it. A revoked key,
  // a plan without eleven_v3, an unknown dictionary locator, an exhausted quota — each is
  // PERMANENT until a human changes something, so answering it by buying an OpenAI voice
  // ships an American male reading Arabic to a real customer on EVERY turn, forever, while
  // paging the Founder each time. There is no circuit breaker; there does not need to be
  // one if the substitution never happens.
  for (const status of [400, 401, 403, 404, 422, 429]) {
    contacted.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const host = new URL(String(input)).host;
      contacted.push(host);
      if (host === "api.elevenlabs.io") return { ok: false, status, text: async () => "nope" } as unknown as Response;
      return {
        ok: true, status: 200, text: async () => "",
        arrayBuffer: async () => new TextEncoder().encode("ONYX").buffer,
      } as unknown as Response;
    }) as typeof fetch;
    set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId, OPENAI_API_KEY: "sk-present" });
    const out = await synthesizeVoiceReply("قهوة عربية طازجة", { voiceId: KHALID_VOICE.voiceId });
    ok(`an ElevenLabs ${status} yields NO audio — onyx is never substituted`, out === null);
    ok(`…and OpenAI is never contacted on a ${status}`, !contacted.some((h) => h.includes("openai")));
  }

  // A GENUINE OUTAGE STILL FALLS BACK. The fallback law exists for a provider that is DOWN,
  // and narrowing it must not delete it: a customer waiting on an order is better served by
  // any voice than by silence.
  contacted.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const host = new URL(String(input)).host;
    contacted.push(host);
    if (host === "api.elevenlabs.io") return { ok: false, status: 503, text: async () => "down" } as unknown as Response;
    return {
      ok: true, status: 200, text: async () => "stub",
      arrayBuffer: async () => new TextEncoder().encode("ONYX").buffer,
    } as unknown as Response;
  }) as typeof fetch;
  set({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId, OPENAI_API_KEY: "sk-present" });
  const outage = await synthesizeVoiceReply("قهوة عربية طازجة", { voiceId: KHALID_VOICE.voiceId });
  ok("a real ElevenLabs OUTAGE still falls back — the law is narrowed, not removed",
    outage !== null && outage.fellBack === true);

  ok("a governance refusal is recognised by its marker, not by prose",
    isVoiceGovernanceRefusal("ElevenLabs TTS refused: voice X is quarantined"));
  ok("…and an outage is NOT, so the fallback law still applies to it",
    !isVoiceGovernanceRefusal("ElevenLabs TTS 503: upstream unavailable") &&
    !isVoiceGovernanceRefusal("fetch failed"));

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── THE ROLLOUT ITSELF, DRIVEN — three ways the live path failed at activation ──
//
// All three were found by driving the real `maybeSendVoiceNote` over an instrumented
// network on the commit that was about to be merged and have the key set against it. Each
// is reachable by an ORDINARY operator action, not a contrived one, which is why they are
// asserted by DRIVING rather than by reading the source.
{
  const { maybeSendVoiceNote } = await import("../lib/messaging/respond-and-send.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };

  /** Drive one turn and report what was contacted, transmitted and recorded. */
  async function turnWith(
    vars: Record<string, string | undefined>
  ): Promise<{ hosts: string[]; transmitted: string | null; ledger: { trigger: string; adapter: string; cost: number }[] }> {
    const hosts: string[] = [];
    let transmitted: string | null = null;
    const ledger: { trigger: string; adapter: string; cost: number }[] = [];
    globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const host = new URL(String(u)).host;
      hosts.push(host);
      // READ THE BYTES BACK OUT. Asserting only that graph.facebook.com was contacted
      // cannot tell Khalid's voice from onyx, and onyx reaching a customer is the whole
      // failure — so the audio actually uploaded is captured and identified.
      if (host.includes("graph.facebook.com") && init?.body instanceof FormData) {
        const f = (init.body as FormData).get("file");
        if (f && typeof (f as Blob).text === "function") transmitted = await (f as Blob).text();
      }
      return {
        ok: true, status: 200, text: async () => "",
        json: async () => ({ messages: [{ id: "m1" }], id: "media-1" }),
        arrayBuffer: async () =>
          new TextEncoder().encode(host.includes("openai") ? "OPENAI-ONYX-AUDIO" : "ELEVENLABS-AUDIO").buffer,
      } as unknown as Response;
    }) as typeof fetch;

    const admin = { from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_safety_hold: false }, error: null }) }) }),
      insert: async (rowArg: unknown) => {
        const r = rowArg as { trigger?: string; adapter?: string; cost_usd?: number };
        if (table === "agent_runs" && r?.trigger === "voice_tts") {
          ledger.push({ trigger: r.trigger, adapter: String(r.adapter), cost: Number(r.cost_usd ?? 0) });
        }
        return { data: null, error: null };
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }) } as never;

    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) delete process.env[k];
    Object.assign(process.env, {
      OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await maybeSendVoiceNote(admin, {
      restaurantId: "r", conversationId: "c", phone: "+966500000000",
      inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
      lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
      features: { voice_notes: true },
    });
    return { hosts, transmitted, ledger };
  }

  // (1) A MISSING KEY MUST NOT BUY ONYX.
  //
  // `TTS_ADAPTER=elevenlabs` with the key not yet saved, mistyped, or rotated to empty
  // threw "ELEVENLABS_API_KEY not set" — a bare message carrying neither marker — so
  // `synthesizeVoiceReply` read it as an OUTAGE and applied the fallback law, transmitting
  // an American male voice reading Najdi Arabic to a real customer on every turn. This is
  // reachable in the ordinary window between saving TTS_ADAPTER and saving the key, which
  // is exactly the sequence an operator follows during activation.
  for (const [label, key] of [["unset", undefined], ["empty", ""], ["whitespace", "   "]] as const) {
    const r = await turnWith({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId });
    ok(`ELEVENLABS_API_KEY ${label} buys no OpenAI voice`, !r.hosts.some((h) => h.includes("openai")));
    ok(`…and transmits nothing to the customer (${label})`, r.transmitted === null);
  }
  // The same for a missing voice id, which is the other half of the same window.
  {
    const r = await turnWith({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: undefined });
    ok("ELEVENLABS_VOICE_ID unset buys no OpenAI voice", !r.hosts.some((h) => h.includes("openai")));
    ok("…and transmits nothing to the customer", r.transmitted === null);
  }
  // AND A GENUINE OUTAGE STILL FALLS BACK, so the tag above did not delete the fallback
  // law. Without this the three assertions above would pass on a build that never speaks.
  {
    const hosts: string[] = [];
    let transmitted: string | null = null;
    globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
      const host = new URL(String(u)).host;
      hosts.push(host);
      if (host.includes("graph.facebook.com") && init?.body instanceof FormData) {
        const f = (init.body as FormData).get("file");
        if (f && typeof (f as Blob).text === "function") transmitted = await (f as Blob).text();
      }
      const down = host.includes("elevenlabs");
      return {
        ok: !down, status: down ? 503 : 200, text: async () => "upstream unavailable",
        json: async () => ({ messages: [{ id: "m1" }], id: "media-1" }),
        arrayBuffer: async () => new TextEncoder().encode("OPENAI-ONYX-AUDIO").buffer,
      } as unknown as Response;
    }) as typeof fetch;
    const admin = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_safety_hold: false }, error: null }) }) }),
      insert: async () => ({ data: null, error: null }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }) } as never;
    Object.assign(process.env, {
      TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
      OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    await maybeSendVoiceNote(admin, {
      restaurantId: "r", conversationId: "c", phone: "+966500000000",
      inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
      lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
      features: { voice_notes: true },
    });
    ok("a real 5xx OUTAGE still falls back and still transmits — the fallback law survives",
      transmitted === "OPENAI-ONYX-AUDIO");
  }

  // (2) THE SPELLINGS THE REGISTRY TOLERATES ON PURPOSE MUST SPEAK.
  //
  // `lookupVoice` folds case and strips invisibles so that a correct id pasted from a
  // dashboard is not read as an unknown voice. The adapter then puts the registry's
  // CANONICAL spelling on the wire and echoes that back — so comparing it against the raw
  // env string refused the RIGHT voice AFTER paying for it, on every turn, forever, with
  // the log naming the one variable that was correct. The demo hit this and fixed it; the
  // live path had the unfixed copy.
  for (const [label, spelling] of [
    ["canonical", KHALID_VOICE.voiceId],
    ["lowercase", KHALID_VOICE.voiceId.toLowerCase()],
    ["zero-width space", `${KHALID_VOICE.voiceId}​`],
    ["left-to-right mark", `‎${KHALID_VOICE.voiceId}`],
    ["soft hyphen", `${KHALID_VOICE.voiceId}­`],
    ["padded", `  ${KHALID_VOICE.voiceId}  `],
  ] as const) {
    const r = await turnWith({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: spelling });
    ok(`a ${label} voice id speaks rather than paying and refusing`, r.transmitted === "ELEVENLABS-AUDIO");
    ok(`…and reached ElevenLabs exactly once (${label})`, r.hosts.filter((h) => h.includes("elevenlabs")).length === 1);
  }
  // AND AN UNREGISTERED ID IS STILL REFUSED, so the comparison was not simply deleted.
  for (const bad of ["21m00Tcm4TlvDq8ikWAM", `${KHALID_VOICE.voiceId.slice(0, -1)}X`, "VuqFqWXHibJ61b9IiVJ7"]) {
    const r = await turnWith({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: bad });
    ok(`${bad.slice(0, 10)}… still reaches no provider and no customer`,
      !r.hosts.some((h) => h.includes("elevenlabs") || h.includes("openai")) && r.transmitted === null);
  }

  // (3) A SYNTHESIS WE PAID FOR IS ON THE LEDGER, EVEN WHEN WE THEN REFUSE IT.
  //
  // The pin refusal used to return ABOVE the `agent_runs` insert, so a refused synthesis
  // was billed by the provider and then vanished from our own record: driven at 25 turns,
  // 25 paid syntheses produced 0 ledger rows and $0.00. Money the daily-budget alert
  // cannot see is the spend nobody catches.
  {
    const r = await turnWith({ TTS_ADAPTER: "openai", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId });
    ok("TTS_ADAPTER=openai still transmits nothing to the customer", r.transmitted === null);
    ok("…but the synthesis it paid for IS recorded on the ledger",
      r.ledger.length === 1 && r.ledger[0]!.adapter === "openai" && r.ledger[0]!.cost > 0);
  }
  // …and the ordinary success path still records exactly one row, not two — the spend
  // insert moved, and a move is where a duplicate gets left behind.
  {
    const r = await turnWith({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId });
    ok("a successful turn records exactly one spend row", r.ledger.length === 1 && r.ledger[0]!.adapter === "elevenlabs");
  }

  // (4) AND THE CAP MUST BOUND A CONFIGURATION THAT PAYS AND REFUSES.
  //
  // `voice_notes_sent` is the only thing limiting how much voice work one conversation can
  // cause in a day, and the refusal path used to leave it untouched — so a paying-and-
  // refusing configuration repeated on EVERY triggering turn, forever, with the cap
  // switched off. Driven over a STATEFUL conversation row, so only the code under test can
  // advance the counter: a fixed row would let this pass no matter what the code did.
  {
    const CAP = 10, TURNS = 20;
    for (const [label, vars, expectTransmit] of [
      ["a refusing configuration (TTS_ADAPTER=openai)", { TTS_ADAPTER: "openai" }, false],
      ["the correct configuration", { TTS_ADAPTER: "elevenlabs" }, true],
    ] as const) {
      const row = { voice_notes_day: null as string | null, voice_notes_sent: 0, voice_cost_usd: 0, is_safety_hold: false };
      let billed = 0, transmitted = 0;
      globalThis.fetch = (async (u: RequestInfo | URL) => {
        const host = new URL(String(u)).host;
        if (host.includes("elevenlabs") || host.includes("openai")) billed++;
        // THE SEND LEG ONLY. A delivered voice note is TWO calls to graph.facebook.com —
        // upload to /media, then post to /messages — so counting the host double-counts
        // every note and makes the cap look breached when it is holding exactly.
        if (host.includes("graph.facebook.com") && new URL(String(u)).pathname.endsWith("/messages")) transmitted++;
        return {
          ok: true, status: 200, text: async () => "",
          json: async () => ({ messages: [{ id: "m1" }], id: "media-1" }),
          arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
        } as unknown as Response;
      }) as typeof fetch;
      const admin = { from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
        insert: async () => ({ data: null, error: null }),
        update: (patch: Record<string, unknown>) => ({ eq: async () => { Object.assign(row, patch); return { data: null, error: null }; } }),
      }) } as never;
      for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]) delete process.env[k];
      Object.assign(process.env, {
        ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
        OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
        ...vars,
      });
      for (let i = 0; i < TURNS; i++) {
        await maybeSendVoiceNote(admin, {
          restaurantId: "r", conversationId: "c", phone: "+966500000000",
          inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
          lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
          features: { voice_notes: true },
        });
      }
      ok(`${label}: ${TURNS} turns bill at most the daily cap (billed ${billed})`, billed <= CAP);
      ok(`…and the counter actually advanced to the cap (${row.voice_notes_sent})`, row.voice_notes_sent === CAP);
      ok(`…and it ${expectTransmit ? "delivered" : "delivered nothing"} (transmitted ${transmitted})`,
        expectTransmit ? transmitted === CAP : transmitted === 0);
      // AND THE COST IS ACTUALLY ACCUMULATED. Nothing in this repo asserted on
      // `conversations.voice_cost_usd` — hard-coding the accumulated value to 0 left the
      // whole 216-file suite green, so the per-conversation cost record was defended by
      // nobody. It is the only place the money spent on ONE conversation is written down.
      const { ttsCostUsd } = await import("../lib/ai/tts/pricing.ts");
      const perCall = ttsCostUsd(
        vars.TTS_ADAPTER === "openai" ? "openai:gpt-4o-mini-tts" : `elevenlabs:${KHALID_VOICE.model}`,
        "هلا فيك، وش تحب تطلب؟".length
      );
      ok(`…and the conversation's cost record accumulated it (${row.voice_cost_usd} = ${CAP}×${perCall})`,
        perCall > 0 && Math.abs(row.voice_cost_usd - CAP * perCall) < 1e-9);
    }
  }

  // (5) A SYNTHESIS THAT COST NOTHING MUST NOT BURN A REAL CONVERSATION'S BUDGET.
  //
  // The first version of the cap fix advanced the counter on EVERY refusal, which was wider
  // than its own justification. With `TTS_ADAPTER` unset or `mock`, nothing is billed and no
  // audio can exist — yet ten such turns consumed a live conversation's entire daily budget,
  // so an operator who then fixed the configuration got silence from that conversation for
  // the rest of the UTC day. During an activation, that is indistinguishable from the voice
  // being broken, and it is caused by the guard rather than by the fault.
  for (const [label, vars] of [
    ["TTS_ADAPTER unset", { TTS_ADAPTER: undefined }],
    ["TTS_ADAPTER=mock", { TTS_ADAPTER: "mock" }],
    ["TTS_ADAPTER typo", { TTS_ADAPTER: "elevenlab" }],
  ] as const) {
    const row = { voice_notes_day: null as string | null, voice_notes_sent: 0, voice_cost_usd: 0, is_safety_hold: false };
    const writes = { ledger: 0, convo: 0 };
    const warned: string[] = [];
    const realWarn = console.warn;
    console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(" ")); };
    globalThis.fetch = (async () => ({
      ok: true, status: 200, text: async () => "",
      json: async () => ({ messages: [{ id: "m1" }], id: "media-1" }),
      arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
    } as unknown as Response)) as typeof fetch;
    const admin = { from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
      insert: async (r: unknown) => {
        if (table === "agent_runs" && (r as { trigger?: string })?.trigger === "voice_tts") writes.ledger++;
        return { data: null, error: null };
      },
      update: (patch: Record<string, unknown>) => ({ eq: async () => { if (table === "conversations") writes.convo++; Object.assign(row, patch); return { data: null, error: null }; } }),
    }) } as never;
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]) delete process.env[k];
    Object.assign(process.env, {
      ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
      OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
      ...vars,
    });
    for (let i = 0; i < 12; i++) {
      await maybeSendVoiceNote(admin, {
        restaurantId: "r", conversationId: "c", phone: "+966500000000",
        inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
        lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
        features: { voice_notes: true },
      });
    }
    // WHICH GUARD PRODUCED THE ZERO? `voice_notes_sent === 0` on its own proves nothing:
    // it passes identically if the code returned at the feature flag, the dialect guard,
    // the deploy-safe row read, or decideVoiceSend — a reviewer forced the dialect guard to
    // return unconditionally, turned 22 assertions in this file red, and these three stayed
    // green. Since aafcb5b the correct behaviour is ALSO zero writes, so the write counters
    // cannot distinguish it either. The refusal's own log line can: it is emitted at the pin
    // check and nowhere else, so seeing it proves the turn ran the whole way down and CHOSE
    // not to count, rather than never arriving.
    ok(`${label} reaches the pin refusal rather than returning earlier`,
      warned.some((w) => w.includes("refusing a synthesis that is not the registered voice")));
    ok(`${label} costs nothing and so burns none of the daily budget (${row.voice_notes_sent})`,
      row.voice_notes_sent === 0);
    // AND IT WRITES NOTHING AT ALL. Not burning the counter is only half the fix: without
    // the early return, the mock adapter — the DEFAULT, and what every unconfigured
    // environment runs — wrote a $0 ledger row AND a conversations row on every triggering
    // turn forever, where burning the counter had at least bounded it to the cap. Free,
    // invisible, unbounded write amplification with no reader.
    ok(`…and writes no rows at all (${writes.ledger} ledger, ${writes.convo} conversation)`,
      writes.ledger === 0 && writes.convo === 0);
    console.warn = realWarn;
  }

  // (5b) A REAL PROVIDER CALL OUR PRICE TABLE DOES NOT KNOW IS STILL REAL MONEY.
  //
  // The cap gate was briefly `costUsd > 0`, and that was worse than the bug it fixed.
  // `ttsCostUsd` returns 0 for any model absent from TTS_RATE_PER_CHAR, and
  // `OPENAI_TTS_MODEL` is env-overridable to a real OpenAI model — so `tts-1-hd` produced
  // genuinely billed syntheses priced at $0, read as "never billed", and the cap never
  // advanced: 40 real calls against a cap of 10. That is the "unpriced model becomes a
  // false $0" trap already recorded against this project. Our price table is an ESTIMATE
  // and can never be the gate on whether money was spent; whether a provider was called can.
  {
    const CAP = 10;
    const row = { voice_notes_day: null as string | null, voice_notes_sent: 0, voice_cost_usd: 0, is_safety_hold: false };
    let providerCalls = 0;
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      const host = new URL(String(u)).host;
      if (host.includes("openai") || host.includes("elevenlabs")) providerCalls++;
      return {
        ok: true, status: 200, text: async () => "",
        json: async () => ({ messages: [{ id: "m1" }], id: "media-1" }),
        arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
      } as unknown as Response;
    }) as typeof fetch;
    const admin = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
      insert: async () => ({ data: null, error: null }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { Object.assign(row, patch); return { data: null, error: null }; } }),
    }) } as never;
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]) delete process.env[k];
    Object.assign(process.env, {
      // A real OpenAI model that TTS_RATE_PER_CHAR does not carry → ttsCostUsd returns 0.
      TTS_ADAPTER: "openai", OPENAI_TTS_MODEL: "tts-1-hd",
      ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
      OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    const { ttsCostUsd } = await import("../lib/ai/tts/pricing.ts");
    ok("…the scenario is real: this model genuinely prices at $0",
      ttsCostUsd("openai:tts-1-hd", 100) === 0);
    for (let i = 0; i < 40; i++) {
      await maybeSendVoiceNote(admin, {
        restaurantId: "r", conversationId: "c", phone: "+966500000000",
        inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
        lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
        features: { voice_notes: true },
      });
    }
    ok(`a real provider call priced at $0 is still capped (calls ${providerCalls})`, providerCalls <= CAP);
    ok(`…and the counter advanced on it (${row.voice_notes_sent})`, row.voice_notes_sent === CAP);
    delete process.env.OPENAI_TTS_MODEL;
  }

  // (6) A FAILED TRANSMIT STILL COSTS WHAT THE SYNTHESIS COST, so it must count too.
  //
  // A bad WHATSAPP_ACCESS_TOKEN or a failing /media endpoint billed ElevenLabs on every
  // triggering turn and delivered nothing, uncapped, for as long as it lasted — the spend
  // row was recorded but the cap never advanced. Same defect as the refusal path, one exit
  // further down, and pre-existing rather than introduced here.
  {
    const CAP = 10;
    const row = { voice_notes_day: null as string | null, voice_notes_sent: 0, voice_cost_usd: 0, is_safety_hold: false };
    let billed = 0;
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      const host = new URL(String(u)).host;
      if (host.includes("elevenlabs")) billed++;
      // Meta's media upload fails; the synthesis above already happened and was paid for.
      const failing = host.includes("graph.facebook.com");
      return {
        ok: !failing, status: failing ? 500 : 200, text: async () => "media upload failed",
        json: async () => ({}),
        arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
      } as unknown as Response;
    }) as typeof fetch;
    const admin = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
      insert: async () => ({ data: null, error: null }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { Object.assign(row, patch); return { data: null, error: null }; } }),
    }) } as never;
    for (const k of ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"]) delete process.env[k];
    Object.assign(process.env, {
      TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
      OPENAI_API_KEY: "sk-present", WHATSAPP_ACCESS_TOKEN: "wa-token", WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    for (let i = 0; i < 20; i++) {
      await maybeSendVoiceNote(admin, {
        restaurantId: "r", conversationId: "c", phone: "+966500000000",
        inboundWasVoice: true, userMessage: "أيوه", safetyHold: false, isReceipt: false,
        lastInboundAtMs: Date.now(), replyText: "هلا فيك، وش تحب تطلب؟", tenantDialect: "saudi",
        features: { voice_notes: true },
      });
    }
    ok(`a failing WhatsApp transmit is bounded by the cap too (billed ${billed})`, billed <= CAP);
    ok(`…and the counter advanced despite nothing being delivered (${row.voice_notes_sent})`,
      row.voice_notes_sent === CAP);
  }

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── AN EMPTY PIN MATCHES NOTHING, ON ITS OWN ────────────────────────────────
//
// `voiceMatchesPin({adapter:"elevenlabs", voiceId:null}, "")` answered TRUE: "we could not
// identify the voice" and "the voice is the registered one" were the same answer. Both
// callers happen to establish a registered voice first, so it was unreachable — which is
// exactly why it needs its own assertion. This is the comparison the entire voice guarantee
// rests on; it must fail closed by itself, not because of what another function checked.
{
  ok("an empty pin matches nothing, even from an elevenlabs-claiming adapter",
    !voiceMatchesPin({ adapter: "elevenlabs", voiceId: null }, "") &&
    !voiceMatchesPin({ adapter: "elevenlabs", voiceId: "" }, "") &&
    !voiceMatchesPin({ adapter: "elevenlabs", voiceId: undefined }, ""));
  ok("…while the registered voice against the registered pin still matches",
    voiceMatchesPin({ adapter: "elevenlabs", voiceId: KHALID_VOICE.voiceId }, KHALID_VOICE.voiceId));
}

// ── A FAILED ACTIVATION MUST SAY WHY, ON THE DEMO SURFACE TOO ───────────────
//
// This was found in production, on the founder's first real call. The whole chain worked —
// speech recognised, reply composed, text delivered — and ElevenLabs threw. The only
// evidence anywhere was `[demo/voice] spoken reply skipped { reason: 'synth_failed' }`,
// because the catch took no binding and dropped the error. A revoked key, a plan without
// the pinned model, a pronunciation dictionary the account cannot reach, an output format
// above the tier and an exhausted quota are five different fixes, and that line cannot tell
// them apart. The demo is the surface that gets configured FIRST, so it fails first.
{
  const { demoVoiceReply } = await import("../lib/demo/voice-out.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  const warned: string[] = [];
  const realWarn = console.warn;

  async function synthFailingWith(status: number, body: string): Promise<string[]> {
    warned.length = 0;
    console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(" ")); };
    globalThis.fetch = (async () => ({
      ok: false, status, text: async () => body,
      json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response)) as typeof fetch;
    Object.assign(process.env, {
      TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key",
      ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
    });
    // `inboundWasVoice: true` is REQUIRED, and omitting it is how this block first passed
    // for the wrong reason: demoVoiceReply returns `not_triggered` before any provider is
    // reached, so every "it refused" assertion was green while the synthesis never ran.
    // The skip reason is asserted for exactly that — `synth_failed` proves it got there.
    const out = await demoVoiceReply("هلا فيك، وش تحب تطلب؟", { inboundWasVoice: true });
    console.warn = realWarn;
    ok(`a ${status} refuses to speak, and REACHED the synthesis to do it (${out.skipped})`,
      out.audioBase64 === null && out.skipped === "synth_failed");
    return [...warned];
  }

  // The five causes an operator actually hits, each of which needs a DIFFERENT fix.
  const dictionaryMissing = await synthFailingWith(400, '{"detail":{"status":"pronunciation_dictionary_not_found","message":"dictionary rv3aw4bY6zoL4iWxJlDk not found"}}');
  ok("a missing pronunciation dictionary is named in the log",
    dictionaryMissing.some((w) => w.includes("synthesis threw") && w.includes("pronunciation_dictionary_not_found")));

  const badKey = await synthFailingWith(401, '{"detail":{"status":"invalid_api_key"}}');
  ok("a rejected key is named in the log", badKey.some((w) => w.includes("synthesis threw") && w.includes("invalid_api_key")));

  const quota = await synthFailingWith(429, '{"detail":{"status":"quota_exceeded"}}');
  ok("an exhausted quota is named in the log", quota.some((w) => w.includes("synthesis threw") && w.includes("quota_exceeded")));

  const tier = await synthFailingWith(400, '{"detail":{"status":"invalid_output_format","message":"opus_48000_64 requires a higher tier"}}');
  ok("an output format above the tier is named in the log",
    tier.some((w) => w.includes("synthesis threw") && w.includes("invalid_output_format")));

  // AND THE THREE ARE DISTINGUISHABLE FROM EACH OTHER — the whole point. Before this, all
  // five produced the identical single line and an operator had nothing to act on.
  ok("…and the four causes produce four DIFFERENT log lines",
    new Set([dictionaryMissing, badKey, quota, tier].map((w) =>
      w.find((l) => l.includes("synthesis threw")) ?? "")).size === 4);

  // BOUNDED AND SINGLE-LINE. The provider body is attacker-adjacent input to a log.
  const huge = await synthFailingWith(400, `{"detail":"${"A".repeat(5000)}\nSECOND LINE"}`);
  const line = huge.find((w) => w.includes("synthesis threw")) ?? "";
  ok("the logged reason is clipped and stays on one line",
    line.length < 420 && !line.includes("\n"));

  // A 2xx WITH AN EMPTY BODY IS A DIFFERENT FAULT WITH THE SAME NAME, and must not send
  // someone hunting a key that is fine.
  warned.length = 0;
  console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(" ")); };
  globalThis.fetch = (async () => ({
    ok: true, status: 200, text: async () => "",
    json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response)) as typeof fetch;
  const empty = await demoVoiceReply("هلا فيك", { inboundWasVoice: true });
  console.warn = realWarn;
  ok("an empty 2xx body is reported as no-audio, not as a thrown error",
    empty.audioBase64 === null && empty.skipped === "synth_failed" &&
    warned.some((w) => w.includes("returned no audio")) &&
    !warned.some((w) => w.includes("synthesis threw")));

  globalThis.fetch = realFetch;
  console.warn = realWarn;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

// ── THE CONTAINER EACH SURFACE ACTUALLY GETS, ON THE WIRE ───────────────────
//
// Found in production, on the founder's second real call. The key was right, the synthesis
// SUCCEEDED, the bytes were delivered, every log line was clean — and the page was silent.
// The demo was serving Ogg Opus, the WhatsApp voice-note container, which **Safari cannot
// decode**. iOS has no non-Safari engine, so that is every iPhone and iPad visitor to a page
// whose entire purpose is being shown to a restaurant owner on their phone.
//
// Nothing detected it because nothing FAILED: our side did everything right and the browser
// quietly declined to play the result. Driven here on the URL and the response mime, per
// surface, because the two must differ and a single default cannot serve both.
{
  const { elevenlabsTtsAdapter } = await import("../lib/ai/tts/elevenlabs.ts");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  Object.assign(process.env, {
    ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: KHALID_VOICE.voiceId,
  });

  async function askFor(format?: "mp3" | "ogg_opus"): Promise<{ url: string; mime: string }> {
    let url = "";
    globalThis.fetch = (async (u: RequestInfo | URL) => {
      url = String(u);
      return {
        ok: true, status: 200, text: async () => "",
        arrayBuffer: async () => new TextEncoder().encode("AUDIO").buffer,
      } as unknown as Response;
    }) as typeof fetch;
    const r = await elevenlabsTtsAdapter.synthesize("هلا فيك", format ? { format } : undefined);
    return { url, mime: r.mime };
  }

  const browser = await askFor("mp3");
  ok("a browser caller gets mp3 ON THE WIRE, not just in a comment",
    browser.url.includes("output_format=mp3_44100_128"));
  ok("…and the bytes are labelled audio/mpeg, which Safari can actually play",
    browser.mime === "audio/mpeg");

  const whatsapp = await askFor("ogg_opus");
  ok("a WhatsApp caller still gets ogg opus, which is what a voice note must be",
    whatsapp.url.includes("output_format=opus_48000_64") && whatsapp.mime === "audio/ogg");

  // THE DEFAULT MUST STAY OGG. WhatsApp is the caller that must not change, and it passes
  // no format — so a default flipped to mp3 would silently reshape every voice note sent to
  // a real customer while this file stayed green on the two explicit cases above.
  const defaulted = await askFor(undefined);
  ok("the DEFAULT is ogg opus, so the WhatsApp path is unchanged by this",
    defaulted.url.includes("output_format=opus_48000_64") && defaulted.mime === "audio/ogg");

  // AND THE TWO SURFACES MUST DIFFER. One shared container is exactly the bug: whichever
  // one it is, the other surface is broken.
  ok("…and the two surfaces genuinely differ", browser.mime !== whatsapp.mime);

  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-voice-out: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
