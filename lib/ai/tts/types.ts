// ============================================================================
// MaitreAI — Text-to-speech adapter seam (WO-VOICE-2). Mirrors the STT + LLM
// seams: one interface, env-selected provider, deterministic mock default so the
// outbound-voice path works end-to-end with ZERO spend until a real provider +
// voice are provisioned (owner approval — paid key + ElevenLabs voice id).
//
// Khalid's reply is ALWAYS composed as TEXT first (every existing gate applies)
// and the text is ALWAYS sent; TTS is a PURELY ADDITIVE accompaniment — never a
// replacement. Safety / money / payment-link / receipt turns are text-only (see
// lib/messaging/voice-budget.ts). The vendor choice never touches a safety rule.
// ============================================================================

export type TtsAdapterName = "mock" | "elevenlabs" | "openai";

/** Which container the caller can actually PLAY.
 *
 *  `ogg_opus` is what WhatsApp wants for a voice note, and it was the only option — so the
 *  browser demo served Ogg Opus too, and **Safari cannot decode it**. The synthesis
 *  succeeded, the bytes arrived, and the page was silent, with nothing in any log because
 *  nothing failed on our side. iOS has no non-Safari engine, so that is every iPhone and
 *  iPad visitor to a page built to be shown to restaurant owners on their phones.
 *
 *  `mp3` plays everywhere — Safari, iOS, Chrome, Firefox, Android. The Mizan review script
 *  already chose it for exactly this reason ("web/iOS/WhatsApp-playable — browser-safe
 *  container"); the demo never got the same treatment. */
export type TtsAudioFormat = "ogg_opus" | "mp3";

export interface TtsSynthesizeOptions {
  /** Provider voice id (ElevenLabs) — read from config, never hardcoded. */
  voiceId?: string;
  /** BCP-47 language hint. */
  languageHint?: string;
  /** Container to request. Defaults to `ogg_opus` — the WhatsApp voice-note format, which
   *  is the caller that must not change. A BROWSER caller must ask for `mp3`. */
  format?: TtsAudioFormat;
}

export interface TtsResult {
  /** Synthesized audio bytes (empty for the mock). */
  audio: Buffer;
  /** Audio MIME (WhatsApp voice notes are audio/ogg; opus). */
  mime: string;
  model: string;
  adapter: TtsAdapterName;
  /** Character count billed (drives the per-note cost). */
  chars: number;
  /** Synthesis cost in USD (chars × provider rate); 0 for mock/unknown. */
  costUsd: number;
  /** The voice actually requested of the provider, echoed back so a caller can verify that
   *  the voice it VALIDATED is the voice that spoke. Without this the demo validated
   *  ELEVENLABS_VOICE_ID and then called synthesize() with no options, leaving the adapter
   *  to re-read the env var itself — so the value checked and the value used were never the
   *  same value, and a default injected in the adapter shipped a stock voice undetected.
   *  Null where the concept does not apply (mock). */
  voiceId?: string | null;
}

export interface TtsAdapter {
  name: TtsAdapterName;
  synthesize(text: string, opts?: TtsSynthesizeOptions): Promise<TtsResult>;
}
