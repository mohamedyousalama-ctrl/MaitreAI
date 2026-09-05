// ============================================================================
// MaitreAI — Speech-to-text adapter seam (Sprint 9, S9-6)
// Mirrors the LLM adapter seam: a provider behind one interface, env-selected,
// with a deterministic mock for tests. Swapping providers (or activating a real
// one) is an env flip — ZERO code change — exactly like the LLM + WhatsApp seams.
// ============================================================================

export type SttAdapterName = "mock" | "openai" | "groq" | "deepgram";

export interface SttTranscribeOptions {
  /** MIME type of the audio (WhatsApp voice notes are audio/ogg; opus). */
  mimeType?: string;
  /** BCP-47 language hint (e.g. "ar") to bias recognition. */
  languageHint?: string;
  /** WO-VOICE-QUALITY (b) — domain prompt-bias string (tenant menu + ordering words)
   *  seeded into Whisper's `prompt` parameter to steer recognition toward the
   *  restaurant's vocabulary. A soft bias, not a transcript. */
  prompt?: string;
  /** WO-VOICE-DEEPGRAM-SPIKE — Nova-3 native keyterm prompting: menu phrases boosted
   *  during recognition. Allergen words are NEVER included (buildDeepgramKeyterms). Only
   *  the deepgram adapter consumes this; other adapters ignore it. */
  keyterms?: string[];
  /** Deadline / cancellation for the provider request.
   *
   *  NOTHING BOUNDED STT BEFORE THIS. Every adapter called `fetch` with no signal, and the
   *  call screen posts to /api/demo/voice with no timeout of its own — so a provider that
   *  accepts the connection and never answers left a caller holding a silent phone with no
   *  ceiling at all. Optional and unset by the normal path (a first attempt that is slow is
   *  still the turn's best hope); the empty-transcript FALLBACK always sets one, because it
   *  adds a second network call to a turn that has already failed. */
  signal?: AbortSignal;
}

export interface SttResult {
  text: string;
  model: string;
  adapter: SttAdapterName;
  /** Transcription cost in USD (duration × provider rate); 0 when unknown/mock. */
  costUsd: number;
  /** Audio duration in seconds when the provider reports it. */
  durationSec?: number;
  /** WO-VOICE-1: transcription confidence in [0,1] when derivable
   *  (exp(min segment avg_logprob) for whisper verbose_json), else undefined.
   *  Feeds ONLY the fail-closed net's SECONDARY confidence tripwire — never the
   *  primary safety decision (measured garbles were often high-confidence). */
  confidence?: number;
}

export interface SttAdapter {
  name: SttAdapterName;
  transcribe(audio: Buffer, opts?: SttTranscribeOptions): Promise<SttResult>;
}

/**
 * The multipart filename to send with a transcription upload.
 *
 * WHY THIS EXISTS: OpenAI's and Groq's transcription endpoints select their
 * decoder from the FILENAME EXTENSION, not the Content-Type. Both adapters used
 * to hardcode "audio.ogg" while passing the real mime through as the blob type.
 * That was accidentally correct for the only source we had — WhatsApp genuinely
 * sends Ogg (adapters/whatsapp.ts defaults `audio/ogg`) — and silently wrong for
 * any other source. A browser MediaRecorder emits `audio/webm;codecs=opus` on
 * Chrome/Firefox and `audio/mp4` on Safari/iOS; both would be uploaded as
 * `.ogg` and rejected with a 400 "Invalid file format".
 *
 * NOT shared with `extForMime` in lib/voice/golden-archive.ts even though both
 * map mime → extension. That one names an ARCHIVE STORAGE OBJECT, where "bin" is
 * a perfectly good fallback for something unrecognised. Here an unrecognised
 * extension makes the provider reject the request, so the fallback must be a
 * container the provider accepts — and it must stay "ogg" so WhatsApp traffic is
 * byte-identical to before this fix. Same mapping, genuinely different failure
 * modes; merging them would force one of the two fallbacks to be wrong.
 */
export function sttUploadFilename(mime: string | null | undefined): string {
  const m = String(mime ?? "").toLowerCase();
  // webm FIRST: `audio/webm;codecs=opus` also contains "opus", and Ogg and WebM
  // are different containers — matching on the codec would mislabel it.
  if (m.includes("webm")) return "audio.webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "audio.m4a";
  if (m.includes("wav")) return "audio.wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio.mp3";
  if (m.includes("flac")) return "audio.flac";
  if (m.includes("amr")) return "audio.amr";
  // ogg/opus and anything unrecognised: keep the pre-fix behaviour exactly.
  return "audio.ogg";
}

/**
 * Read a provider's JSON body, tolerating junk but NEVER a cancellation.
 *
 * WHY THIS IS NOT `.catch(() => ({}))`, WHICH IS WHAT EVERY ADAPTER USED TO DO.
 * `fetch` resolves the moment the response HEADERS arrive. A provider that answers 200 and
 * then stops writing leaves `res.ok === true` and the failure entirely inside the body read
 * — so a bare catch turns an ABANDONED request into a successful empty transcript. Measured
 * against a real socket: headers sent, body stalled, `AbortSignal.timeout(700)` → `fetch`
 * resolves ok, `res.json()` rejects `TimeoutError`, the catch swallows it, and the adapter
 * returns `text: ""`.
 *
 * That is worse than the hang it was meant to bound, because of what happens next: the
 * fallback reads an empty transcript as "no words" and logs «the clip is probably silent» —
 * telling an operator the customer said nothing when the truth is that an engine hung. The
 * whole reason this seam exists is that an empty transcript is ambiguous; manufacturing a
 * fake one is the exact lie it was built to stop.
 *
 * A malformed or non-JSON body still degrades to `{}` — that is a provider quirk the callers
 * handle by reading `res.ok` and the parsed fields. A cancellation is not a quirk.
 */
export async function readSttJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "AbortError" || name === "TimeoutError") throw e;
    return {};
  }
}
