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
  // eleven_v3 — the model «Khalid kivo» was accepted under (KIV-313). 1 credit/char, the
  // same tier as multilingual_v2 and 2× flash_v2.5.
  //
  // THIS RATE IS LOAD-BEARING, NOT DECORATION. `demoVoiceProviderPinned()` refuses any
  // model missing from this table, because `ttsCostUsd()` returns 0 for an unknown
  // provider:model — an unpriced model does not merely cost more, it reports its cost as
  // ZERO and takes the demo's whole spend off the monitor. So before this line existed,
  // setting ELEVENLABS_TTS_MODEL=eleven_v3 made the demo silent rather than expensive.
  // That was the right failure, and it is why the handoff could not have been integrated
  // without adding it here.
  //
  // Confirm against the dashboard before public activation — this file's header has said
  // "APPROXIMATE, confirm before go-live" since it was written, and for a per-character
  // rate on an unauthenticated page that confirmation is worth doing rather than assuming.
  "elevenlabs:eleven_v3": 0.00022,
  // OpenAI gpt-4o-mini-tts (the onyx fallback) — ~$0.015 / 1k chars ≈ 0.000015/char.
  "openai:gpt-4o-mini-tts": 0.000015,
};

export function ttsCostUsd(providerModel: string, chars: number): number {
  const rate = TTS_RATE_PER_CHAR[providerModel];
  if (!rate || !chars || chars < 0) return 0;
  return Number((chars * rate).toFixed(6));
}
