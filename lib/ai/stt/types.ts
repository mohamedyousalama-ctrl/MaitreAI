// ============================================================================
// MaitreAI — Speech-to-text adapter seam (Sprint 9, S9-6)
// Mirrors the LLM adapter seam: a provider behind one interface, env-selected,
// with a deterministic mock for tests. Swapping providers (or activating a real
// one) is an env flip — ZERO code change — exactly like the LLM + WhatsApp seams.
// ============================================================================

export type SttAdapterName = "mock" | "openai" | "groq";

export interface SttTranscribeOptions {
  /** MIME type of the audio (WhatsApp voice notes are audio/ogg; opus). */
  mimeType?: string;
  /** BCP-47 language hint (e.g. "ar") to bias recognition. */
  languageHint?: string;
}

export interface SttResult {
  text: string;
  model: string;
  adapter: SttAdapterName;
  /** Transcription cost in USD (duration × provider rate); 0 when unknown/mock. */
  costUsd: number;
  /** Audio duration in seconds when the provider reports it. */
  durationSec?: number;
}

export interface SttAdapter {
  name: SttAdapterName;
  transcribe(audio: Buffer, opts?: SttTranscribeOptions): Promise<SttResult>;
}
