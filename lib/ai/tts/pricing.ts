// ============================================================================
// MaitreAI — TTS pricing (WO-VOICE-2). APPROXIMATE published per-CHARACTER rates
// (USD), confirm on the provider dashboards before go-live. Used to log per-note
// synthesis cost to agent_runs so the voice-budget guard has real numbers. A
// spend-ceiling guard is a fast-follow once real costs accumulate.
// ============================================================================

export const TTS_RATE_PER_CHAR: Record<string, number> = {
  // READ OFF THE PROVIDER DASHBOARD, 30 Aug 2026 (ElevenAPI, "Model Pricing"), not derived.
  // Every previous entry here was 2.2x TOO HIGH because it was computed from a Creator
  // subscription's credit price ($22 / 100k credits) rather than the published per-character
  // API rate. This file's own header has said "confirm on the provider dashboards before
  // go-live" since it was written; that is now done, and the numbers below are the ones on
  // the dashboard divided by 1,000.
  //
  //   v3               $0.10 / 1K chars
  //   v3 Conversational $0.05 / 1K chars   (half price, ~280ms, tuned for realtime)
  //   v2 Multilingual  $0.10 / 1K chars
  //   Flash / Turbo    $0.05 / 1K chars
  "elevenlabs:eleven_v3": 0.0001,
  "elevenlabs:eleven_multilingual_v2": 0.0001,
  "elevenlabs:eleven_flash_v2.5": 0.00005,
  // OpenAI gpt-4o-mini-tts (the onyx fallback) - ~$0.015 / 1k chars = 0.000015/char.
  "openai:gpt-4o-mini-tts": 0.000015,
};
export function ttsCostUsd(providerModel: string, chars: number): number {
  const rate = TTS_RATE_PER_CHAR[providerModel];
  if (!rate || !chars || chars < 0) return 0;
  return Number((chars * rate).toFixed(6));
}
