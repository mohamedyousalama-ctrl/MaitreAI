// ============================================================================
// MaitreAI — decoding the demo's spoken reply on the client.
//
// This lives outside the React component because it is the part that can SILENTLY DROP a
// reply: a malformed payload, an empty string, or a wrong MIME each end with the visitor
// getting no audio and no explanation. Inside the component it was reachable only by
// source-text assertions, which stayed green while mutations disabled the branch entirely.
// Here it is a pure function that a proof can drive with real bytes.
// ============================================================================

/** ElevenLabs returns opus in an ogg container (`output_format=opus_48000_64`). Defaulting
 *  to audio/mpeg mislabels those bytes and is itself a decode failure. */
export const DEMO_AUDIO_DEFAULT_MIME = "audio/ogg";

export interface DecodedReplyAudio {
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
}

/** base64 -> bytes, or null when there is nothing playable. Never throws: the text reply
 *  must survive any audio problem, because the text is what the visitor actually needs. */
export function decodeReplyAudio(b64: unknown, mime: unknown): DecodedReplyAudio | null {
  if (typeof b64 !== "string" || b64.length === 0) return null;
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }
  if (bin.length === 0) return null;
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = typeof mime === "string" && mime.trim() ? mime.trim() : DEMO_AUDIO_DEFAULT_MIME;
  return { bytes, type };
}
