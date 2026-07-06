// ============================================================================
// MaitreAI — TTS pricing (WO-VOICE-2). APPROXIMATE published per-CHARACTER rates
// (USD), confirm on the provider dashboards before go-live. Used to log per-note
// synthesis cost to agent_runs so the voice-budget guard has real numbers. A
// spend-ceiling guard is a fast-follow once real costs accumulate.
// ============================================================================

export const TTS_RATE_PER_CHAR: Record<string, number> = {
  // ElevenLabs — flash_v2.5 = 0.5 credit/char; Creator $22 / 100k credits ⇒
  // ~$0.00022/credit ⇒ ~$0.00011/char (the ~2× cheaper/faster tier, §0.6).
  "elevenlabs:eleven_flash_v2.5": 0.00011,
  "elevenlabs:eleven_multilingual_v2": 0.00022,
  // OpenAI gpt-4o-mini-tts (the onyx fallback) — ~$0.015 / 1k chars ≈ 0.000015/char.
  "openai:gpt-4o-mini-tts": 0.000015,
};

export function ttsCostUsd(providerModel: string, chars: number): number {
  const rate = TTS_RATE_PER_CHAR[providerModel];
  if (!rate || !chars || chars < 0) return 0;
  return Number((chars * rate).toFixed(6));
}
