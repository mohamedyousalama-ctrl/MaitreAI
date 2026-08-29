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

  // (a) HEALTHY: the visitor gets ElevenLabs' actual bytes, and no other host is touched.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
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
      out.spend!.chars === "تفضل، وش تحب تطلب؟".length &&
      Math.abs(out.spend!.costUsd - out.spend!.chars * TTS_RATE_PER_CHAR[`elevenlabs:${KHALID_VOICE.model}`]) < 1e-9);
  });

  // (b) ELEVENLABS DOWN: refuse, and — the finding this replaces — never BUY the onyx
  // synthesis we would only discard. OPENAI_API_KEY is present and onyx would succeed.
  hosts = []; paths = []; bodies = []; stub(401);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
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
      const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
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
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
    ok("a padded model still prices, and the ledger still sees the spend",
      out.audioBase64 !== null && out.spend !== null && out.spend!.costUsd > 0);
    ok("the padded model is trimmed before it reaches the provider",
      bodies.length === 1 && bodies[0].includes(`"${KHALID_VOICE.model}"`));
  });
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: `  ${KHALID_VOICE.voiceId}  ` }, async () => {
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
    ok("a padded voice id is trimmed, not requested as %20%20ID%20%20",
      out.audioBase64 !== null && paths.length === 1 && paths[0].includes(`/${KHALID_VOICE.voiceId}`));
  });
  // A padded `mock` must resolve to the mock, NOT fall through to key inference and buy an
  // OpenAI onyx synthesis on an unauthenticated page.
  hosts = []; paths = []; bodies = []; stub(200);
  await withEnvAsync({ TTS_ADAPTER: "  mock  ", OPENAI_API_KEY: "sk-present" }, async () => {
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
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
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
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

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-voice-out: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
