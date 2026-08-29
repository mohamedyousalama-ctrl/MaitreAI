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
import { demoVoiceProviderPinned, demoVoiceReply, DEMO_TTS_MAX_CHARS } from "../lib/demo/voice-out.ts";

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
withEnv({ TTS_ADAPTER: "elevenlabs", ELEVENLABS_API_KEY: "el-key", ELEVENLABS_VOICE_ID: "vid" }, () => {
  ok("pinned, key AND voice id → speaks", demoVoiceProviderPinned());
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
    ok("an ordinary reply is not suppressed by the hard-zero gate",
      plain.skipped === "mock_pinned");
    ok("a deliberately pinned `mock` reports itself, not a false misconfiguration",
      plain.skipped === "mock_pinned");
  });
}

// ── 2c. SPEND IS REPORTED, because the demo is the one surface anyone can call ───
{
  const mod = read("lib/demo/voice-out.ts");
  const route = read("app/api/demo/voice/route.ts");
  // The route already writes STT cost to agent_runs and says why: "the one surface anyone
  // can call was the one surface the spend monitor could not see". TTS is the same money.
  ok("the wrapper carries the provider's cost back to the caller",
    /costUsd: result\.costUsd/.test(mod));
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

  const stub = (elStatus: number) => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      hosts.push(new URL(url).host);
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
    ELEVENLABS_VOICE_ID: "KhalidCustomVoice01", OPENAI_API_KEY: "sk-present",
  };
  const SPEAK = { inboundWasVoice: true, safetyHold: false, isReceipt: false };

  // (a) HEALTHY: the visitor gets ElevenLabs' actual bytes, and no other host is touched.
  hosts = []; stub(200);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply("تفضل، وش تحب تطلب؟", SPEAK);
    ok("a healthy turn returns the provider's real audio to the visitor",
      out.audioBase64 !== null && Buffer.from(out.audioBase64!, "base64").toString() === EL_BYTES);
    ok("a healthy turn reports the spend it actually incurred",
      out.spend !== null && out.spend!.costUsd > 0 && out.spend!.adapter === "elevenlabs");
    ok("only ElevenLabs is contacted on a healthy turn",
      hosts.length === 1 && hosts[0] === "api.elevenlabs.io");
  });

  // (b) ELEVENLABS DOWN: refuse, and — the finding this replaces — never BUY the onyx
  // synthesis we would only discard. OPENAI_API_KEY is present and onyx would succeed.
  hosts = []; stub(401);
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
    hosts = []; stub(200);
    await withEnvAsync(PINNED, async () => {
      const out = await demoVoiceReply(text, opts);
      ok(`${name} contacts no provider at all`, hosts.length === 0 && out.audioBase64 === null);
    });
  }

  // (d) A STOCK ElevenLabs voice id is refused before the network — the likely paste error.
  hosts = []; stub(200);
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
  await withEnvAsync({ ...PINNED, ELEVENLABS_TTS_MODEL: "eleven_multilingual_v2" }, async () => {
    ok("a known, priced model is accepted", demoVoiceProviderPinned());
  });

  // (f) Whitespace is not configuration.
  await withEnvAsync({ ...PINNED, ELEVENLABS_API_KEY: " " }, async () => {
    ok("a whitespace-only key is a misconfiguration, not a key", !demoVoiceProviderPinned());
  });
  await withEnvAsync({ ...PINNED, ELEVENLABS_VOICE_ID: "  " }, async () => {
    ok("a whitespace-only voice id is refused", !demoVoiceProviderPinned());
  });

  // (g) A zero-width-only reply is blank to a reader and billable to a provider.
  hosts = []; stub(200);
  await withEnvAsync(PINNED, async () => {
    const out = await demoVoiceReply("\u200b\u200b", SPEAK);
    ok("a zero-width-only reply is empty, not billable", out.skipped === "empty" && hosts.length === 0);
  });

  // (h) The docstring promises this never throws.
  const noOpts = await demoVoiceReply("تمام");
  ok("a missing options argument does not throw", noOpts.skipped === "not_triggered");

  globalThis.fetch = realFetch;
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
  ok("the provider that ANSWERED is verified, not the one we asked for",
    /result\.adapter !== "elevenlabs"/.test(mod));
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
      /if\s*\(\s*data\.replyAudio/.test(cl) && /atob\(data\.replyAudio/.test(cl) &&
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
