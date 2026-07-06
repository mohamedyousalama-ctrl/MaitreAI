// ============================================================================
// MaitreAI — Mock TTS adapter (WO-VOICE-2). Deterministic, free, no network.
// The DEFAULT so the outbound-voice path works end-to-end with zero spend until a
// real provider + ElevenLabs voice id are provisioned + selected. Returns empty
// audio bytes (the caller in test mode never actually transmits).
// ============================================================================

import type { TtsAdapter } from "./types";

export const mockTtsAdapter: TtsAdapter = {
  name: "mock",
  async synthesize(text) {
    return {
      audio: Buffer.from([]),
      mime: "audio/ogg",
      model: "mock-tts",
      adapter: "mock",
      chars: String(text ?? "").length,
      costUsd: 0,
    };
  },
};

// S7 parity with STT: never let the mock (silent) audio masquerade as a real voice
// note in production. Mock TTS is allowed only in dev/test or when explicitly
// opted in (ENABLE_MOCK_TTS=true) — safe-by-default in prod.
export function mockTtsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_TTS === "true";
}
