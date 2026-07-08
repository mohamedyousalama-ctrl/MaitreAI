// ============================================================================
// MIZAN — attach VOICE to the hosted reviewer packet (WO-MIZAN-VOICE). Run:
//   node scripts/mizan/mizan-voice.mjs
//     env: ELEVENLABS_API_KEY, VOICE_A[, VOICE_B, VOICE_C], NEXT_PUBLIC_SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY  (synthesizes + uploads, then re-emits)
//   or, to re-emit from ALREADY-hosted clips without re-synthesizing/spending:
//     MIZAN_VOICE_URLS=<path-to-voice-urls.json> node scripts/mizan/mizan-voice.mjs
//
// Renders Khalid's SAME captured replies (byte-identical text — no rewriting) in the
// PRODUCTION voice (ElevenLabs EL-custom-A = Voice A, model eleven_flash_v2_5), plus a
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
const MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5"; // NB: underscores (the dotted id is rejected by the API)
const COMPARE_SCENARIO = "S9-01"; // short, warm, native greeting — no tenant name

/** Parse the generated TS literal module back into an object. */
function readActivePacket() {
  const txt = readFileSync(DATA_TS, "utf8");
  const s = txt.indexOf("{");
  const e = txt.lastIndexOf("}");
  return JSON.parse(txt.slice(s, e + 1));
}
const replyText = (it) => (it.replies || []).filter((r) => r && r.trim()).join("\n").trim();

async function synth(text, voiceId) {
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
