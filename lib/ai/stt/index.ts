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
import {
  assertMockSttAllowed,
  MockSttProductionError,
  mockSttAllowed,
  mockSttBlockedInProduction,
  isMockSttProductionError,
} from "./guard";
import { availableFallbackAdapters } from "./fallback";

export function resolveSttAdapterName(): SttAdapterName {
  const sel = (process.env.STT_ADAPTER || "").toLowerCase();
  if (sel === "openai") return "openai";
  if (sel === "groq") return "groq";
  if (sel === "deepgram") return "deepgram";
  if (sel === "mock") return "mock";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export function getSttAdapter(): SttAdapter {
  const name = resolveSttAdapterName();
  if (name === "openai") return openaiSttAdapter;
  if (name === "groq") return groqSttAdapter;
  if (name === "deepgram") return deepgramSttAdapter;
  assertMockSttAllowed("getSttAdapter");
  return mockSttAdapter;
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
  /** WHICH ENGINES CAN RESCUE A TURN THE PRIMARY HEARS NOTHING ON, by name — never a key.
   *
   *  This exists because the question was only answerable by making a call and reading the
   *  logs. Deepgram cannot decode the container iOS Safari records: it answers 200 with an
   *  empty transcript, and lib/ai/stt/fallback.ts hands those bytes to Whisper instead — but
   *  ONLY if a second provider key is present, and nothing said whether one was. An empty
   *  list here means every iPhone call still ends in silence, which is a thing an operator
   *  should be able to see before a prospect does. */
  fallbackAdapters: string[];
  /** "working" when a rescue is possible, "not-configured" when the primary is on its own. */
  fallbackStatus: "working" | "not-configured";
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
  const adapterName = resolveSttAdapterName();
  const production = process.env.NODE_ENV === "production";
  const mockTranscriptEnabled = adapterName === "mock" && mockSttAllowed();
  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS);
  const aiTimeoutEnabled = Number.isFinite(timeoutMs) && timeoutMs > 0;

  let status: SttHealthStatus;
  if (mockSttBlockedInProduction(adapterName)) {
    status = "not-configured";
  } else if (production && !rawSelection) {
    status = "unverified";
  } else if (mockTranscriptEnabled) {
    status = "test-mode-on";
  } else if (adapterName === "mock") {
    status = "not-configured";
  } else {
    status = hasProviderKey(adapterName) ? "working" : "not-configured";
  }

  const fallbackAdapters = availableFallbackAdapters(adapterName);

  return {
    adapterName,
    status,
    explicitAdapter,
    fallbackAdapters,
    fallbackStatus: fallbackAdapters.length > 0 ? "working" : "not-configured",
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
export { mockSttAllowed, isMockSttProductionError, MockSttProductionError };
