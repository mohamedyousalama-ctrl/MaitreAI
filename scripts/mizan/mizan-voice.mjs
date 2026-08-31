// ============================================================================
// MIZAN — attach VOICE to the hosted reviewer packet (WO-MIZAN-VOICE). Run:
//   node scripts/mizan/mizan-voice.mjs
//     env: ELEVENLABS_API_KEY, VOICE_A[, VOICE_B, VOICE_C], NEXT_PUBLIC_SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY  (synthesizes + uploads, then re-emits)
//   or, to re-emit from ALREADY-hosted clips without re-synthesizing/spending:
//     MIZAN_VOICE_URLS=<path-to-voice-urls.json> node scripts/mizan/mizan-voice.mjs
//
// Renders Khalid's SAME captured replies (byte-identical text — no rewriting) in the
// PRODUCTION voice (ElevenLabs EL-custom-A = Voice A, model eleven_v3 (pinned by lib/ai/tts/voice-registry.ts)), plus a
// 3-voice comparison of ONE short greeting (A/B/C) for the "which sounds most Saudi?"
// pick. Uploads mp3s (web/iOS/WhatsApp-playable — same voice as prod, browser-safe
// container) to the public `mizan-khalid-audio` bucket under unguessable random names,
// then re-emits lib/mizan/active-packet-data.ts with: audioUrl per item, a spoken_dialect
// rubric dimension, a voice_compare item, and a fresh run-unique packetId. HOLD-on-failure:
// a synth error aborts (never substitutes a different voice — "real ElevenLabs or HOLD").
// ============================================================================
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { uniqueHostedPacketId } from "./mizan-packet-id.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_TS = join(here, "..", "..", "lib", "mizan", "active-packet-data.ts");
const BUCKET = "mizan-khalid-audio";
const REGISTRY_TS = new URL("../../lib/ai/tts/voice-registry.ts", import.meta.url);
const { ALLOWED_VOICE_ID, REGISTERED_MODEL } = (() => {
  const src = readFileSync(REGISTRY_TS, "utf8");
  // ANCHORED ON THE NAMED EXPORT, not on "the first match in the file". A plain
  // /voiceId:\s*"…"/ took whichever entry appeared first, so registering a second voice
  // ABOVE KHALID_VOICE would have silently repinned this script to it.
  const block = src.slice(src.indexOf("export const KHALID_VOICE"));
  const id = block.match(/voiceId:\s*"([A-Za-z0-9]+)"/);
  const model = block.match(/model:\s*"([A-Za-z0-9_.]+)"/);
  if (!id || !model) throw new Error("HOLD — cannot read KHALID_VOICE from voice-registry.ts");
  return { ALLOWED_VOICE_ID: id[1], REGISTERED_MODEL: model[1] };
})();

// THE MODEL IS PART OF WHAT WAS ACCEPTED, HERE TOO. This was an unchecked operator
// override defaulting to eleven_v3 (pinned by lib/ai/tts/voice-registry.ts), while the registry pins eleven_v3 and the
// product adapter refuses anything else. So reviewers in the public bucket were scoring
// «Khalid kivo» rendered under a model the Founder never accepted — and .env.example tells
// operators that ELEVENLABS_TTS_MODEL "is refused", which was true of the adapter and false
// of this script. An override that AGREES is a no-op; one that disagrees is refused.
const MODEL = (() => {
  const requested = (process.env.ELEVENLABS_TTS_MODEL || "").trim();
  if (requested && requested !== REGISTERED_MODEL) {
    throw new Error(
      `HOLD — ELEVENLABS_TTS_MODEL="${requested}" does not match the registered model ` +
        `("${REGISTERED_MODEL}"). A model change needs its own review (KIV-313 §3).`
    );
  }
  return REGISTERED_MODEL;
})();
const COMPARE_SCENARIO = "S9-01"; // short, warm, native greeting — no tenant name

/** Parse the generated TS literal module back into an object. */
function readActivePacket() {
  const txt = readFileSync(DATA_TS, "utf8");
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  return JSON.parse(txt.slice(s, e + 1));
}
const replyText = (it) => (it.replies || []).filter((r) => r && r.trim()).join("\n").trim();

// ── THE RELEASE REGISTRY APPLIES HERE TOO ──────────────────────────────────
//
// This script is a raw fetch to ElevenLabs with an operator-supplied VOICE_A/B/C, and it
// uploads the result to a PUBLIC Supabase bucket that MizanReviewClient plays to reviewers.
// It therefore both GENERATES and EXPOSES a voice — the two things the G0-R ruling still
// forbids for a legacy or donor-derived object — and it did so entirely outside
// lib/ai/tts/voice-registry.ts, which lives in TypeScript the product imports and this
// script does not.
//
// A review drove this with the identified quarantined object and got 13 syntheses and 13
// public uploads before the script's own HOLD could fire. The claim that "the allow list of
// one enforces the rule in code" was true of the product and false of this file. Now it is
// true of both.
//
// Read from the registry rather than copied, so the two cannot drift; a proof asserts the
// extraction still works and still yields the registered id.

function assertRegisteredVoice(voiceId, label) {
  const v = String(voiceId ?? "").trim();
  if (v !== ALLOWED_VOICE_ID) {
    throw new Error(
      `HOLD — ${label}="${v.slice(0, 32)}" is not in the voice release registry ` +
        `(expected ${ALLOWED_VOICE_ID}). No synthesis, no upload, no voice substitution.`
    );
  }
}

async function synth(text, voiceId) {
  // BEFORE the network, before any money, and before anything reaches a public bucket.
  assertRegisteredVoice(voiceId, "voice id");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL }),
  });
  if (!res.ok) throw new Error(`HOLD — ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 160)} (no voice substitution)`);
  return Buffer.from(await res.arrayBuffer());
}
async function upload(prefix, bytes) {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const path = `${prefix}/${randomBytes(16).toString("hex")}.mp3`;
  const res = await fetch(`${SB}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "audio/mpeg", "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return `${SB}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Produce { items: {scenarioId: url}, comparison: { text, clips:[{voice,url}] } } either
 *  from a pre-hosted map (MIZAN_VOICE_URLS) or by synthesizing + uploading fresh. */
async function resolveUrls(packet) {
  if (process.env.MIZAN_VOICE_URLS) {
    return JSON.parse(readFileSync(process.env.MIZAN_VOICE_URLS, "utf8"));
  }
  const voices = { A: process.env.VOICE_A, B: process.env.VOICE_B, C: process.env.VOICE_C };
  if (!voices.A) throw new Error("VOICE_A not set");
  // Refuse the whole RUN, not each synthesis: a run that would hold on its third voice has
  // already generated and published the first two.
  for (const [k, v] of Object.entries(voices)) if (v) assertRegisteredVoice(v, `VOICE_${k}`);
  const items = {};
  for (const it of packet.items) {
    const text = replyText(it);
    if (!text) throw new Error(`HOLD — empty reply for ${it.scenarioId} (a failed capture must be re-captured, not shipped)`);
    items[it.scenarioId] = await upload("k", await synth(text, voices.A));
    console.log(`clip ${it.scenarioId} ✓`);
  }
  const cmp = packet.items.find((i) => i.scenarioId === COMPARE_SCENARIO);
  const text = replyText(cmp);
  const clips = [];
  for (const v of ["A", "B", "C"]) {
    if (!voices[v]) throw new Error(`VOICE_${v} not set (needed for the 3-voice comparison)`);
    clips.push({ voice: v, url: await upload("c", await synth(text, voices[v])) });
    console.log(`comparison ${v} ✓`);
  }
  return { items, comparison: { sourceScenarioId: COMPARE_SCENARIO, text, clips } };
}

function emit(packet, urls) {
  // Canonical A,B,C order — the client shuffles DISPLAY per reviewer and stores the
  // canonical index (1=A/2=B/3=C) as voice_pick, so the winner is unambiguous.
  const byVoice = Object.fromEntries(urls.comparison.clips.map((c) => [c.voice, c.url]));
  const items = packet.items.map((it) => ({
    ...it,
    audioUrl: urls.items[it.scenarioId] || null,
    // Add the spoken-dialect voice dimension alongside the untouched text dimensions.
    dimensions: it.dimensions.includes("spoken_dialect") ? it.dimensions : [...it.dimensions, "spoken_dialect"],
  }));
  items.push({
    scenarioId: "VOICE-COMPARE",
    suiteId: 0,
    suiteName: "اختيار الصوت الأنسب",
    kind: "voice_compare",
    region: null,
    frame: null,
    turns: [],
    replies: [],
    prompt: "أي صوت يحس سعودي أكثر؟",
    compareText: urls.comparison.text,
    voiceClips: [byVoice.A, byVoice.B, byVoice.C], // canonical order; NEVER labeled A/B/C in the UI
    dimensions: ["voice_pick"],
    scale: 3,
  });
  const out = {
    packetId: uniqueHostedPacketId((packet.packetId || "mizan-panel").replace(/-\d{6}-[0-9a-f]{4}$/, "")),
    benchmark: packet.benchmark,
    unseeded: false,
    minReviewers: packet.minReviewers,
    note: packet.note,
    suites: packet.suites,
    voiceModel: MODEL,
    items,
  };
  const header = `// ============================================================================
// MaitreAI — MIZAN ACTIVE PACKET DATA (WO-MIZAN-VOICE) — GENERATED, do not hand-edit.
//
// Khalid's captured replies (text) PLUS a production-voice (ElevenLabs EL-custom-A,
// model ${MODEL}) mp3 rendering of each — audioUrl per item, hosted in the public
// mizan-khalid-audio bucket under unguessable names. Reviewers score text AND voice
// (the added spoken_dialect dimension). A final voice_compare item renders one greeting
// in 3 candidate voices for the "which sounds most Saudi?" pick. Regenerate with:
//   node scripts/mizan/mizan-voice.mjs   (see the header there).
// ============================================================================

export const ACTIVE_PACKET_DATA = ${JSON.stringify(out, null, 2)} as const;
`;
  writeFileSync(DATA_TS, header);
  console.log(`\nMIZAN voice packet → lib/mizan/active-packet-data.ts (${items.length} items incl. voice_compare, packetId ${out.packetId})`);
}

const packet = readActivePacket();
const urls = await resolveUrls(packet);
emit(packet, urls);
