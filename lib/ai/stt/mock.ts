// ============================================================================
// MaitreAI — Mock STT adapter (Sprint 9, S9-6)
// Deterministic, free, no network. Used in tests + when no STT key is set, so
// the full voice path (download → STT → Brain → transcript shown) works end-to
// -end with zero spend until a real provider is provisioned + selected.
// ============================================================================

import type { SttAdapter } from "./types";

export const mockSttAdapter: SttAdapter = {
  name: "mock",
  async transcribe() {
    return {
      text: "«تفريغ تجريبي» السلام عليكم، أبغى أطلب برجر كلاسيك",
      model: "mock-stt",
      adapter: "mock",
      costUsd: 0,
      durationSec: 0,
    };
  },
};
