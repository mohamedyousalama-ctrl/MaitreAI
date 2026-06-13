// ============================================================================
// MaitreAI — STT pricing (Sprint 9, S9-6)
// APPROXIMATE published per-minute rates (USD), to confirm against the provider
// dashboards before go-live. Used to log transcription cost to agent_runs.
// ============================================================================

export const STT_RATE_PER_MIN: Record<string, number> = {
  // OpenAI audio transcriptions
  "openai:whisper-1": 0.006,
  "openai:gpt-4o-transcribe": 0.006,
  "openai:gpt-4o-mini-transcribe": 0.003,
  // Groq-hosted Whisper (OpenAI-compatible endpoint) — markedly cheaper
  "groq:whisper-large-v3": 0.00185, // ~$0.111/hr
  "groq:whisper-large-v3-turbo": 0.00067, // ~$0.04/hr
};

export function sttCostUsd(providerModel: string, durationSec?: number): number {
  if (!durationSec) return 0;
  const rate = STT_RATE_PER_MIN[providerModel];
  if (!rate) return 0;
  return Number(((durationSec / 60) * rate).toFixed(6));
}
