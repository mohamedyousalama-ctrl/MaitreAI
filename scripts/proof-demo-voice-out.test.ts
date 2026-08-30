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
  // getTtsAdapter() WOULD pick ElevenLabs here by inference — but inference is exactly the
  // mechanism that silently picks onyx when the key is missing or wrongly scoped.
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
    ok("the reported spend is the model+chars the provider was actually given",
      out.spend !== null && out.spend!.model === KHALID_VOICE.model &&
      out.spend!.chars === REPLY.length &&
      Math.abs(out.spend!.costUsd - out.spend!.chars * TTS_RATE_PER_CHAR[`elevenlabs:${KHALID_VOICE.model}`]) < 1e-9);
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
    /adapter\.synthesize\(text, \{ voiceId: pinnedVoiceId \}\)/.test(mod));
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
  ok("the MIME defaults to ogg, not mpeg — the provider returns opus in an ogg container",
    decodeReplyAudio(b64, null)?.type === DEMO_AUDIO_DEFAULT_MIME && DEMO_AUDIO_DEFAULT_MIME === "audio/ogg");
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
    /demoVoiceReply\(/.test(fill));
  ok("…and its spend reaches the ledger like any other synthesis",
    /trigger: "voice_tts"/.test(fill));
}

// ── THE TWO LIVE-PATH GUARDS THAT NOTHING PINNED ────────────────────────────
{
  const ras = readFileSync(resolve(process.cwd(), "lib/messaging/respond-and-send.ts"), "utf8");
  // H3 — deleting this one line is the difference between ONE tenant speaking and all 13.
  // There is no second layer: decideVoiceSend is called with `enabled: true` hardcoded.
  ok("the WhatsApp voice note is gated on the tenant's own voice_notes flag",
    /isFeatureExplicitlyEnabled\("voice_notes"/.test(ras));
  const fn = ras.slice(ras.indexOf("export async function maybeSendVoiceNote"), ras.indexOf("/**\n * WO-MEDIA-GUARD"));
  // M-c — the provider has already billed; a WhatsApp transmit failure must not discard
  // our only record of the money.
  ok("the TTS spend row is written BEFORE the transmit check, not after",
    fn.indexOf('trigger: "voice_tts"') < fn.indexOf("const audioSend = await sendWhatsAppAudio"));
  ok("…and there is exactly one spend row per synthesis",
    (fn.match(/trigger: "voice_tts"/g) ?? []).length === 1);
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

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-voice-out: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
