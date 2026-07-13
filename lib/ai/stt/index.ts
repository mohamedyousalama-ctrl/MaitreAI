// ============================================================================
// MaitreAI — STT adapter resolver (Sprint 9, S9-6)
// Selection (env flip, zero code change to switch providers):
//   STT_ADAPTER = mock | openai | groq | deepgram  (explicit), else auto:
//   GROQ_API_KEY → groq, OPENAI_API_KEY → openai, else mock.
// Default is mock so the voice path works end-to-end with no spend until a real
// provider is provisioned + selected (owner approval — new paid key).
// WO-VOICE-DEEPGRAM-SPIKE: `deepgram` is EXPLICIT-ONLY (STT_ADAPTER=deepgram) — it is
// deliberately NOT in the auto-fallback chain, so provisioning DEEPGRAM_API_KEY alone
// never changes the default; the spike is opt-in.
// ============================================================================

import type { SttAdapter } from "./types";
import { mockSttAdapter } from "./mock";
import { openaiSttAdapter } from "./openai";
import { groqSttAdapter } from "./groq";
import { deepgramSttAdapter } from "./deepgram";
import type { SttAdapterName } from "./types";

export function getSttAdapter(): SttAdapter {
  const sel = (process.env.STT_ADAPTER || "").toLowerCase();
  if (sel === "openai") return openaiSttAdapter;
  if (sel === "groq") return groqSttAdapter;
  if (sel === "deepgram") return deepgramSttAdapter;
  if (sel === "mock") return mockSttAdapter;
  if (process.env.GROQ_API_KEY) return groqSttAdapter;
  if (process.env.OPENAI_API_KEY) return openaiSttAdapter;
  return mockSttAdapter;
}

// S7 — the MOCK adapter returns a FABRICATED transcript (a fake order). It must
// never reach the agent as the customer's real words in production. Mock transcripts
// are allowed ONLY in dev/test, or when explicitly opted in for a demo
// (ENABLE_MOCK_STT=true) — safe-by-default in prod, mirroring the S1
// ENABLE_MOCK_PAYMENTS pattern. Real adapters (openai/groq) are unaffected; callers
// gate on this only when the resolved adapter is "mock".
export function mockSttAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_STT === "true";
}

export type SttHealthStatus = "working" | "not-configured" | "test-mode-on" | "unverified";

export interface SttHealthReadout {
  adapterName: SttAdapterName;
  status: SttHealthStatus;
  explicitAdapter: boolean;
  mockTranscriptMode: {
    enabled: boolean;
    status: "working" | "test-mode-on";
  };
  aiTimeout: {
    enabled: boolean;
    status: "working" | "not-configured";
  };
}

function hasProviderKey(name: SttAdapterName): boolean {
  if (name === "openai") return !!process.env.OPENAI_API_KEY;
  if (name === "groq") return !!process.env.GROQ_API_KEY;
  if (name === "deepgram") return !!process.env.DEEPGRAM_API_KEY;
  return false;
}

export function readSttHealth(): SttHealthReadout {
  const rawSelection = (process.env.STT_ADAPTER ?? "").trim().toLowerCase();
  const explicitAdapter = rawSelection === "openai" || rawSelection === "groq" || rawSelection === "deepgram" || rawSelection === "mock";
  const adapterName = getSttAdapter().name;
  const production = process.env.NODE_ENV === "production";
  const mockTranscriptEnabled = adapterName === "mock" && mockSttAllowed();
  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS);
  const aiTimeoutEnabled = Number.isFinite(timeoutMs) && timeoutMs > 0;

  let status: SttHealthStatus;
  if (production && !rawSelection) {
    status = "unverified";
  } else if (mockTranscriptEnabled) {
    status = "test-mode-on";
  } else if (adapterName === "mock") {
    status = "not-configured";
  } else {
    status = hasProviderKey(adapterName) ? "working" : "not-configured";
  }

  return {
    adapterName,
    status,
    explicitAdapter,
    mockTranscriptMode: {
      enabled: mockTranscriptEnabled,
      status: mockTranscriptEnabled ? "test-mode-on" : "working",
    },
    aiTimeout: {
      enabled: aiTimeoutEnabled,
      status: aiTimeoutEnabled ? "working" : "not-configured",
    },
  };
}

export type { SttAdapter, SttResult } from "./types";
