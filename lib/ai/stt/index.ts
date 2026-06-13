// ============================================================================
// MaitreAI — STT adapter resolver (Sprint 9, S9-6)
// Selection (env flip, zero code change to switch providers):
//   STT_ADAPTER = mock | openai | groq  (explicit), else auto:
//   GROQ_API_KEY → groq, OPENAI_API_KEY → openai, else mock.
// Default is mock so the voice path works end-to-end with no spend until a real
// provider is provisioned + selected (owner approval — new paid key).
// ============================================================================

import type { SttAdapter } from "./types";
import { mockSttAdapter } from "./mock";
import { openaiSttAdapter } from "./openai";
import { groqSttAdapter } from "./groq";

export function getSttAdapter(): SttAdapter {
  const sel = (process.env.STT_ADAPTER || "").toLowerCase();
  if (sel === "openai") return openaiSttAdapter;
  if (sel === "groq") return groqSttAdapter;
  if (sel === "mock") return mockSttAdapter;
  if (process.env.GROQ_API_KEY) return groqSttAdapter;
  if (process.env.OPENAI_API_KEY) return openaiSttAdapter;
  return mockSttAdapter;
}

export type { SttAdapter, SttResult } from "./types";
