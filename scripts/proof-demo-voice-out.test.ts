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
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const ENV_KEYS = ["TTS_ADAPTER", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "OPENAI_API_KEY"] as const;
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
  const cases: [string, Parameters<typeof demoVoiceReply>[1], string, string][] = [
    ["a TYPED turn is answered in text", { inboundWasVoice: false }, "تمام", "not_triggered"],
    ["an empty reply is not synthesized", { inboundWasVoice: true }, "   ", "empty"],
    ["an over-long reply falls back to text rather than an unbounded bill",
      { inboundWasVoice: true }, "ا".repeat(DEMO_TTS_MAX_CHARS + 1), "too_long"],
  ];
  for (const [name, opts, text, reason] of cases) {
    const out = await demoVoiceReply(text, opts);
    ok(`${name} (${reason})`, out.audioBase64 === null && out.skipped === reason);
  }
  // The cap is on the INPUT, before any provider is called — TTS bills per character and
  // this page is unauthenticated.
  ok("the character cap is a real bound", DEMO_TTS_MAX_CHARS > 0 && DEMO_TTS_MAX_CHARS <= 2000);
  await withEnvAsync({ OPENAI_API_KEY: "sk" }, async () => {
    const out = await demoVoiceReply("تمام، طلبك جاهز", { inboundWasVoice: true });
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
  // A fallback IS a refusal here: on WhatsApp any voice beats silence for a waiting
  // customer; on a sales page the voice IS the thing being demonstrated.
  ok("a fallback to onyx is treated as a failure, not a success",
    /if \(out\.fellBack\) return none\("synth_failed"\)/.test(mod));
  ok("a skip never blocks the text reply", /never blocks the reply/.test(route));
  ok("the route asks for voice only on a spoken turn", /inboundWasVoice: true/.test(route));

  const phone = read("app/demo/DemoPhone.tsx");
  ok("the client renders a play control for a spoken reply", /<SpokenReply url=\{m\.audioUrl\}/.test(phone));
  ok("the TEXT is still rendered alongside it — audio alone is unusable on a muted phone",
    /m\.audioUrl \? <SpokenReply[\s\S]{0,140}m\.text \?/.test(phone));
  ok("object URLs are revoked on unmount", /URL\.revokeObjectURL\(url\)/.test(phone));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} demo-voice-out: ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
