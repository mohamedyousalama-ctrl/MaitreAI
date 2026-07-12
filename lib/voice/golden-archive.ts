// ============================================================================
// MaitreAI — WO-VOICE-DEEPGRAM-SPIKE, first duty: golden-set audio archival.
// PURE, no I/O, no server-only imports (so it unit-tests under ts-ext-loader).
//
// WhatsApp inbound voice media is downloaded on-the-fly (lib/messaging/voice.ts) and
// NEVER persisted — the media URL behind an audio_id expires. FR-VOICE-DEEP's golden
// evaluation set is the only expiring asset in the Deepgram spike, so the archival
// route (app/api/admin/voice/archive-golden-set) copies every voice clip in the
// conversations that hold a golden id into the private `voice-golden-set` bucket,
// keyed by message-id, with a manifest. This module holds the pure pieces: the golden
// id set, the target conversations, the object-key + manifest builders, and sha256.
//
// SUPERSET RULE (founder): archive ALL voice clips in every conversation that holds a
// golden id (the set spans the day's testing across 4 conversations) — the 10/11 golden
// clips are then a guaranteed subset. The harness selects the golden cases from the
// manifest's `golden` flag later.
// ============================================================================

import { createHash } from "node:crypto";

export const GOLDEN_BUCKET = "voice-golden-set";

/** The FR-VOICE-DEEP golden evaluation set — message-id PREFIXES (first 8 chars of the
 *  messages.id uuid). 11 ids; the «مية وخمسين» pair (1224f0c0 + bd6fb324) is ONE case
 *  (see GOLDEN_CASE_PAIRS), so the harness treats them as a single paired scenario. */
export const GOLDEN_MESSAGE_IDS: readonly string[] = [
  "a3f3643d", "04c078ce", "57d5f6e9", "1224f0c0", "bd6fb324", "cc18d8c0",
  "2f18834d", "b68666f5", "c9be977b", "63e530aa", "b5583c6b",
] as const;

/** Golden ids that form a single paired case (the «مية وخمسين» number-correction pair). */
export const GOLDEN_CASE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["1224f0c0", "bd6fb324"],
];

/** Every conversation that holds at least one golden id — the archival superset spans
 *  ALL voice clips in each (not just the golden ones). Located across the day's testing. */
export const GOLDEN_CONVERSATION_IDS: readonly string[] = [
  "c016a121-7e56-4dc7-95cd-195b9d52a8fd", // 14 clips (5 golden)
  "091bb865-d0f7-4d21-900c-f5e976805c46", // 19 clips (4 golden)
  "b41988eb-eda5-4abd-b814-55ed39604462", // 14 clips (1 golden)
  "f095c714-5611-4a33-a8dd-b6afc2bd15c1", //  5 clips (1 golden)
] as const;

/** True when a full message-id (uuid) is a golden-set clip (prefix match). */
export function isGoldenMessage(messageId: string): boolean {
  const id = String(messageId ?? "");
  return GOLDEN_MESSAGE_IDS.some((prefix) => id.startsWith(prefix));
}

/** Map a mime type to a file extension for the object key (ogg/opus is the WA default). */
export function extForMime(mime: string | null | undefined): string {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("amr")) return "amr";
  if (m.includes("wav")) return "wav";
  return "bin";
}

/** The durable object key for a clip — the message-id (uuid) + extension (founder: the
 *  message-id IS the object key). Stable + collision-free (message ids are unique). */
export function objectKeyFor(messageId: string, mime: string | null | undefined): string {
  return `${messageId}.${extForMime(mime)}`;
}

/** Lowercase hex sha256 of the audio bytes — the integrity signal the manifest verifies. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface GoldenManifestEntry {
  messageId: string;
  conversationId: string;
  audioId: string;
  objectKey: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  /** Duration in seconds when the inbound meta carried it, else null (not always stored). */
  durationSec: number | null;
  sttConfidence: number | null;
  golden: boolean;
  archivedAt: string;
}

/** Assemble one manifest entry from a downloaded clip. Pure — the route supplies the
 *  bytes + timestamp (kept out of here so this stays deterministic/testable). */
export function buildManifestEntry(args: {
  messageId: string;
  conversationId: string;
  audioId: string;
  bytes: Uint8Array;
  mime: string;
  durationSec?: number | null;
  sttConfidence?: number | null;
  archivedAt: string;
}): GoldenManifestEntry {
  return {
    messageId: args.messageId,
    conversationId: args.conversationId,
    audioId: args.audioId,
    objectKey: objectKeyFor(args.messageId, args.mime),
    mime: args.mime,
    sizeBytes: args.bytes.byteLength,
    sha256: sha256Hex(args.bytes),
    durationSec: args.durationSec ?? null,
    sttConfidence: args.sttConfidence ?? null,
    golden: isGoldenMessage(args.messageId),
    archivedAt: args.archivedAt,
  };
}
