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

export interface TtsSynthesizeOptions {
  /** Provider voice id (ElevenLabs) — read from config, never hardcoded. */
  voiceId?: string;
  /** BCP-47 language hint. */
  languageHint?: string;
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
}

export interface TtsAdapter {
  name: TtsAdapterName;
  synthesize(text: string, opts?: TtsSynthesizeOptions): Promise<TtsResult>;
}
