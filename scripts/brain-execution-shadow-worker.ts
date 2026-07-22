// ============================================================================
// WO-BRAIN-0B explicit shadow worker entrypoint.
//
// This file is intentionally opt-in and unscheduled. It does not touch the live
// webhook, call WhatsApp, call lib/ai, mutate orders, or produce customer output.
// The PM applies 0103 before any database-backed invocation; until then this
// entrypoint is a stopped-by-default harness around the execution worker.
//
// Run:
//   RUN_BRAIN_EXECUTION_SHADOW_WORKER=1 node --import ./scripts/ts-ext-loader.mjs \
//     --experimental-strip-types scripts/brain-execution-shadow-worker.ts
// ============================================================================

import { MemoryBrainExecutionStore, runBrainShadowWorkerOnce } from "../lib/brain/execution/index";

if (process.env.RUN_BRAIN_EXECUTION_SHADOW_WORKER !== "1") {
  console.log("BRAIN execution shadow worker: skipped (set RUN_BRAIN_EXECUTION_SHADOW_WORKER=1 to invoke explicitly)");
  process.exit(0);
}

const store = new MemoryBrainExecutionStore();
const result = await runBrainShadowWorkerOnce(store);
console.log("BRAIN execution shadow worker:", result);
