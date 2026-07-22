import type { SttAdapterName } from "./types";

export const MOCK_STT_PRODUCTION_ERROR_CODE = "MOCK_STT_PRODUCTION_BLOCKED";

export class MockSttProductionError extends Error {
  readonly code = MOCK_STT_PRODUCTION_ERROR_CODE;

  constructor(context: string) {
    super(`${MOCK_STT_PRODUCTION_ERROR_CODE}: mock STT is disabled in production without ENABLE_MOCK_STT=true (${context})`);
    this.name = "MockSttProductionError";
  }
}

// The MOCK adapter returns a fabricated transcript. It is allowed only outside
// production or when an operator explicitly opts in for a demo.
export function mockSttAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_STT === "true";
}

export function mockSttBlockedInProduction(adapterName: SttAdapterName): boolean {
  return adapterName === "mock" && !mockSttAllowed();
}

export function assertMockSttAllowed(context: string): void {
  if (!mockSttAllowed()) {
    const error = new MockSttProductionError(context);
    console.error("[stt] CRITICAL mock_stt_production_blocked", {
      code: error.code,
      context,
      nodeEnv: process.env.NODE_ENV ?? null,
      enableMockStt: process.env.ENABLE_MOCK_STT === "true",
      hasGroqKey: !!process.env.GROQ_API_KEY,
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
      sttAdapter: process.env.STT_ADAPTER ?? null,
    });
    throw error;
  }
}

export function isMockSttProductionError(error: unknown): error is MockSttProductionError {
  return (
    error instanceof MockSttProductionError ||
    (typeof error === "object" &&
      error !== null &&
      ((error as { code?: unknown }).code === MOCK_STT_PRODUCTION_ERROR_CODE ||
        (error as { name?: unknown }).name === "MockSttProductionError"))
  );
}
