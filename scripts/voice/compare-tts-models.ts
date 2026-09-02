// ============================================================================
// MaitreAI — TTS MODEL BAKE-OFF. The same voice, the same words, the same settings,
// through a different model — and a stopwatch on the only number that matters.
//
// WHY THIS EXISTS. Production logs (2 Sep 2026) measured `eleven_v3` taking 1430-2489ms
// to send its FIRST BYTE, five times out of five. That is the delay a founder reported
// from an iPhone as "the voice lags the script". It is entirely provider-side: no change
// in the browser touches it, and the client-side fix that looked obvious was a no-op.
//
// WHAT IT DELIBERATELY HOLDS STILL. Only the MODEL varies. Voice id, voice settings,
// language_code, output format and the spoken-text normalisation all come from the same
// places the live path uses (`lib/ai/tts/voice-registry`, `toSpokenText`), because a
// comparison that changes two things at once cannot answer either question. If this used
// its own settings the audio would differ for reasons that have nothing to do with speed.
//
// WHAT IT IS NOT. Not production code, not a route, and not reachable from any customer
// path — same rule as the rest of scripts/voice/ ("Data only — no production code").
// KIV-313 pins `eleven_v3` as part of the VOICE ACCEPTANCE and lib/ai/tts/elevenlabs.ts
// REFUSES a model that disagrees. That guard is untouched and must stay untouched: this
// harness exists to produce the evidence a model review would need, not to route around
// the review. Nothing here changes what any customer hears.
//
// IT DISCOVERS THE MODELS RATHER THAN NAMING THEM. Model ids are the provider's to define
// and ours to look up. Asking /v1/models first means the table below can never contain a
// model this account cannot actually use, and never invents an id that looks plausible.
//
// THIS SPENDS REAL MONEY — one synthesis per model per line. Keep LINES short.
//
// Usage (needs the key; it is never read from anywhere but the environment):
//   ELEVENLABS_API_KEY=… node --import ./scripts/ts-ext-loader.mjs \
//     --experimental-strip-types scripts/voice/compare-tts-models.ts
//
//   # list the account's Arabic-capable models and exit, spending nothing:
//   ELEVENLABS_API_KEY=… node … scripts/voice/compare-tts-models.ts --list
//
// Output: ./voice-bakeoff/<model>__<line-id>.mp3 plus a timing table on stdout.
// ============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { KHALID_VOICE } from "../../lib/ai/tts/voice-registry";
import { toSpokenText } from "../../lib/ai/tts/spoken-text";

const KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
const OUT_DIR = "voice-bakeoff";

/** The lines. Short on purpose — this is a latency and timbre check, not a QA pass, and
 *  every character is billed once per model. Two are the real thing: the call greeting a
 *  visitor actually hears first, and a price line, which is where a rushed model most
 *  audibly mangles numerals. */
const LINES: ReadonlyArray<{ id: string; text: string }> = [
  { id: "greeting", text: "هلا والله، معك خالد من مطعم الديرة. وش أقدر أخدمك؟" },
  { id: "price", text: "الإجمالي 101.2 ريال، ويوصلك خلال 45 دقيقة." },
  { id: "warmth", text: "أبشر، سجّلت طلبك. تحب أضيف لك شي ثاني؟" },
];

interface ProviderModel {
  model_id: string;
  name?: string;
  can_do_text_to_speech?: boolean;
  languages?: Array<{ language_id?: string }>;
}

async function listModels(): Promise<ProviderModel[]> {
  const res = await fetch("https://api.elevenlabs.io/v1/models", {
    headers: { "xi-api-key": KEY, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET /v1/models failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as ProviderModel[];
}

/** Arabic-capable text-to-speech models only. A model that cannot speak Arabic is not a
 *  candidate no matter how fast it is, and shipping the question "is it fast?" without
 *  "can it say this?" is how a bake-off produces a confident wrong answer. */
function candidates(all: ProviderModel[]): ProviderModel[] {
  return all.filter(
    (m) =>
      m.can_do_text_to_speech !== false &&
      (m.languages ?? []).some((l) => (l.language_id ?? "").toLowerCase().startsWith("ar"))
  );
}

/** One synthesis. Returns time-to-first-BYTE, not time-to-complete: on the call path the
 *  reply streams, so what a caller waits for is the first byte — which is exactly the
 *  number `[demo/speak] timing headers=…` reports in production, so the two are
 *  comparable. `headers` and `firstByte` are reported separately because a provider can
 *  answer fast and then think. */
async function synth(modelId: string, text: string): Promise<{
  headersMs: number; firstByteMs: number; totalMs: number; bytes: Buffer;
}> {
  // The SAME normalisation the live path applies. Skipping it would compare the models on
  // text no customer will ever be read: emoji, «×», bare numerals and markdown included.
  const body = toSpokenText(text);
  const t0 = Date.now();
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(KHALID_VOICE.voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: body,
        model_id: modelId,
        language_code: "ar",
        // STRAIGHT FROM THE REGISTRY. These are the settings the voice was ACCEPTED under;
        // retyping them here would make the comparison about my typing.
        voice_settings: {
          stability: KHALID_VOICE.settings.stability,
          similarity_boost: KHALID_VOICE.settings.similarity_boost,
          style: KHALID_VOICE.settings.style,
          use_speaker_boost: KHALID_VOICE.settings.use_speaker_boost,
        },
      }),
    }
  );
  const headersMs = Date.now() - t0;
  if (!res.ok || !res.body) {
    throw new Error(`${modelId}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
  const chunks: Uint8Array[] = [];
  let firstByteMs = -1;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) {
      if (firstByteMs < 0) firstByteMs = Date.now() - t0;
      chunks.push(value);
    }
  }
  return {
    headersMs,
    firstByteMs: firstByteMs < 0 ? headersMs : firstByteMs,
    totalMs: Date.now() - t0,
    bytes: Buffer.concat(chunks),
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

async function main(): Promise<void> {
  if (!KEY) {
    // NOT A FAILURE. The key lives in the deployment's environment and nowhere else; a
    // machine without it simply cannot run this, and saying so beats a stack trace.
    console.log(
      "ELEVENLABS_API_KEY is not set — nothing was synthesized and nothing was billed.\n" +
        "Run it where the key already lives, e.g.\n" +
        "  ELEVENLABS_API_KEY=… node --import ./scripts/ts-ext-loader.mjs " +
        "--experimental-strip-types scripts/voice/compare-tts-models.ts"
    );
    return;
  }

  const all = await listModels();
  const arabic = candidates(all);

  console.log(`\n=== Arabic-capable TTS models on this account (${arabic.length}/${all.length}) ===`);
  for (const m of arabic) {
    const here = m.model_id === KHALID_VOICE.model ? "  ← CURRENT (KIV-313)" : "";
    console.log(`  ${m.model_id.padEnd(32)} ${(m.name ?? "").slice(0, 40)}${here}`);
  }

  if (process.argv.includes("--list")) {
    console.log("\n--list: stopped before synthesizing. Nothing was billed.\n");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const rows: Array<{ model: string; ttfb: number[]; ok: number; failed: number }> = [];

  for (const m of arabic) {
    const row = { model: m.model_id, ttfb: [] as number[], ok: 0, failed: 0 };
    for (const line of LINES) {
      try {
        const r = await synth(m.model_id, line.text);
        row.ttfb.push(r.firstByteMs);
        row.ok += 1;
        const file = `${OUT_DIR}/${m.model_id}__${line.id}.mp3`;
        writeFileSync(file, r.bytes);
        console.log(
          `  ${m.model_id.padEnd(30)} ${line.id.padEnd(9)} ` +
            `headers=${String(r.headersMs).padStart(5)}ms firstByte=${String(r.firstByteMs).padStart(5)}ms ` +
            `total=${String(r.totalMs).padStart(5)}ms → ${file}`
        );
      } catch (e) {
        row.failed += 1;
        // A model that refuses is a RESULT, not a crash — an account without it, or a
        // model that will not take `language_code`, is exactly what this run is here to
        // discover. Recorded and carried on, so one refusal cannot hide every later row.
        console.log(`  ${m.model_id.padEnd(30)} ${line.id.padEnd(9)} FAILED: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    rows.push(row);
  }

  console.log(`\n=== TIME TO FIRST BYTE (median of ${LINES.length}), same voice, same settings ===`);
  const baseline = median(rows.find((r) => r.model === KHALID_VOICE.model)?.ttfb ?? []);
  for (const r of rows.sort((a, b) => median(a.ttfb) - median(b.ttfb))) {
    if (!r.ok) { console.log(`  ${r.model.padEnd(32)} — no successful synthesis`); continue; }
    const med = median(r.ttfb);
    const delta = baseline && r.model !== KHALID_VOICE.model
      ? `  (${med < baseline ? "-" : "+"}${Math.abs(baseline - med)}ms vs current)` : "";
    const mark = r.model === KHALID_VOICE.model ? "  ← CURRENT" : "";
    console.log(`  ${r.model.padEnd(32)} ${String(med).padStart(5)}ms${mark}${delta}`);
  }
  console.log(
    `\nAudio in ./${OUT_DIR}/ — listen before believing any of the numbers above.\n` +
      `Speed is only half the question; KIV-313 pins the model because it decides how Khalid SOUNDS.\n`
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
