// ============================================================================
// WO-VOICE-DEEPGRAM-SPIKE (first duty) — RED-FIRST: imports GOLDEN_MESSAGE_IDS /
// buildManifestEntry / objectKeyFor / sha256Hex (absent on the pre-WO tree → ESM link
// fails → red). Proves the golden-set archival primitives + the route wiring: the
// 11-id golden set across 4 conversations, message-id object keys, sha256 integrity,
// and a token-authed (CRON_SECRET, closed-by-default) route that downloads via the
// existing WhatsApp adapter and writes a manifest.
//
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-voice-golden-archive.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  GOLDEN_BUCKET, GOLDEN_MESSAGE_IDS, GOLDEN_CONVERSATION_IDS, GOLDEN_CASE_PAIRS,
  isGoldenMessage, extForMime, objectKeyFor, sha256Hex, buildManifestEntry,
} from "../lib/voice/golden-archive.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// ══ LEG 1 — the golden set: 11 ids, 4 conversations, the paired case ═════════
{
  ok("LEG1: 11 golden message-ids (FR-VOICE-DEEP)", GOLDEN_MESSAGE_IDS.length === 11);
  ok("LEG1: the three known anchors are in the set",
    ["04c078ce", "1224f0c0", "b68666f5"].every((id) => GOLDEN_MESSAGE_IDS.includes(id)));
  ok("LEG1: the golden ids span 4 conversations (superset per-conversation)",
    GOLDEN_CONVERSATION_IDS.length === 4);
  ok("LEG1: the «مية وخمسين» pair is one case (1224f0c0 + bd6fb324)",
    GOLDEN_CASE_PAIRS.some(([a, b]) => a === "1224f0c0" && b === "bd6fb324"));
}

// ══ LEG 2 — isGoldenMessage prefix-matches the full uuid ═════════════════════
{
  ok("LEG2: a full golden uuid matches by prefix",
    isGoldenMessage("04c078ce-1111-2222-3333-444455556666") === true &&
    isGoldenMessage("a3f3643d-aaaa-bbbb-cccc-dddddddddddd") === true);
  ok("LEG2: a non-golden uuid does not match",
    isGoldenMessage("deadbeef-0000-0000-0000-000000000000") === false);
}

// ══ LEG 3 — object key + mime→ext mapping ════════════════════════════════════
{
  ok("LEG3: ogg/opus → ogg, mpeg → mp3, m4a → m4a, unknown → bin",
    extForMime("audio/ogg; codecs=opus") === "ogg" && extForMime("audio/mpeg") === "mp3" &&
    extForMime("audio/mp4") === "m4a" && extForMime("application/x-weird") === "bin");
  ok("LEG3: the object key IS the message-id + extension",
    objectKeyFor("04c078ce-1111-2222-3333-444455556666", "audio/ogg") === "04c078ce-1111-2222-3333-444455556666.ogg");
}

// ══ LEG 4 — sha256 integrity + manifest assembly ═════════════════════════════
{
  // Known vectors (verifies the digest is real, not a stub).
  ok("LEG4: sha256Hex('') is the empty-string vector",
    sha256Hex(new Uint8Array()) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  ok("LEG4: sha256Hex('abc') is the abc vector",
    sha256Hex(new TextEncoder().encode("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const bytes = new TextEncoder().encode("OggS-fake-audio");
  const golden = buildManifestEntry({
    messageId: "b68666f5-1111-2222-3333-444455556666", conversationId: "c016a121-7e56-4dc7-95cd-195b9d52a8fd",
    audioId: "1308962044641619", bytes, mime: "audio/ogg", sttConfidence: 0.675, archivedAt: "2026-07-12T23:00:00.000Z",
  });
  ok("LEG4: manifest entry carries key, size, sha256, golden flag, confidence",
    golden.objectKey === "b68666f5-1111-2222-3333-444455556666.ogg" &&
    golden.sizeBytes === bytes.byteLength && golden.sha256 === sha256Hex(bytes) &&
    golden.golden === true && golden.sttConfidence === 0.675 && golden.durationSec === null);
  const nonGolden = buildManifestEntry({
    messageId: "deadbeef-0000-0000-0000-000000000000", conversationId: "c016a121-7e56-4dc7-95cd-195b9d52a8fd",
    audioId: "999", bytes, mime: "audio/ogg", archivedAt: "2026-07-12T23:00:00.000Z",
  });
  ok("LEG4: a non-golden clip in the superset is archived but flagged golden:false", nonGolden.golden === false);
}

// ══ LEG 5 — route WIRING: token-authed, closed-by-default, WA adapter, manifest ══
{
  const r = read("app/api/admin/voice/archive-golden-set/route.ts");
  ok("WIRE: closed by default — no CRON_SECRET → not authorized",
    /const secret = process\.env\.CRON_SECRET;\s*if \(!secret\) return false;/.test(r));
  ok("WIRE: accepts Bearer (Vercel Cron) OR x-cron-secret (manual admin)",
    /Bearer \$\{secret\}/.test(r) && /x-cron-secret/.test(r));
  ok("WIRE: unauthorized requests get 401 (not open)", /"unauthorized" \}, \{ status: 401 \}/.test(r));
  ok("WIRE: downloads via the EXISTING WhatsApp adapter (no new credential path)",
    /downloadWhatsAppMedia\(audioId\)/.test(r));
  ok("WIRE: uploads to the private golden bucket, keyed by message-id",
    new RegExp(`storage\\.from\\(GOLDEN_BUCKET\\)\\.upload\\(entry\\.objectKey`).test(r) && GOLDEN_BUCKET === "voice-golden-set");
  ok("WIRE: writes manifest.json", /\.upload\("manifest\.json"/.test(r));
}

console.log(`\nWO-VOICE-GOLDEN-ARCHIVE PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
