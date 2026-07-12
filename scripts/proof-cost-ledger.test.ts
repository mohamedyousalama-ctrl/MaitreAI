// ============================================================================
// WO-COST-1 (2/2) — red-first proof: the honest ledger prices ALL FOUR meters.
// The old ledger priced only fresh-in + out, so the report sample (813,860 in /
// 38,642 out) logged $3.02 while the cache read + cache WRITE meters went unpriced.
// costUsd now prices all four, so the true cost exceeds the $3.02 undercount.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-cost-ledger.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { costUsd, modelFor } from "../lib/ai/llm/models.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const cfg = modelFor("customer_agent"); // Sonnet: priceIn $3, priceOut $15

// --- the report sample & the $3.02 undercount ---------------------------------
const IN = 813_860, OUT = 38_642;
const oldFigure = (IN / 1e6) * 3 + (OUT / 1e6) * 15; // what the old 2-meter ledger logged
check("the old 2-meter figure reproduces the ledger's $3.02", near(oldFigure, 3.02121, 1e-4));
check("costUsd with NO cache == the old figure (backward-compatible, 2-arg unchanged)", near(costUsd(cfg, IN, OUT), oldFigure));

// --- the FOUR-meter rates the WO named (Sonnet customer agent) ----------------
check("fresh input priced at $3/M", near(costUsd(cfg, 1_000_000, 0), 3));
check("output priced at $15/M", near(costUsd(cfg, 0, 1_000_000), 15));
check("cache READ priced at $0.30/M", near(costUsd(cfg, 0, 0, 1_000_000, 0), 0.30));
check("cache WRITE priced at $3.75/M", near(costUsd(cfg, 0, 0, 0, 1_000_000), 3.75));

// --- the true cost of the report sample (cache meters now priced) --------------
// The breakpoint bug made most turns a full cache WRITE; representative meters for the
// sample (the report's exact cache_read / cache_creation plug into the SAME formula).
const CACHE_READ = 120_000, CACHE_WRITE = 650_000;
const trueCost = (IN / 1e6) * 3 + (OUT / 1e6) * 15 + (CACHE_READ / 1e6) * 0.30 + (CACHE_WRITE / 1e6) * 3.75;
check("costUsd prices all four meters (fresh + out + read + write)", near(costUsd(cfg, IN, OUT, CACHE_READ, CACHE_WRITE), trueCost));
check("the TRUE cost EXCEEDS the $3.02 undercount once cache tokens are priced", costUsd(cfg, IN, OUT, CACHE_READ, CACHE_WRITE) > oldFigure);
check("a cache-WRITE-heavy turn costs strictly more than treating it as fresh input", costUsd(cfg, 0, 0, 0, 1_000_000) > costUsd(cfg, 1_000_000, 0));
check("a cache-READ is far cheaper than fresh input (the caching win)", costUsd(cfg, 0, 0, 1_000_000, 0) < costUsd(cfg, 1_000_000, 0));

// --- wiring (source) -----------------------------------------------------------
const claude = read("lib/ai/llm/claude.ts");
check("(claude) captures cache_creation_input_tokens as the 4th meter", /cacheCreationTokens: res\.usage\?\.cache_creation_input_tokens/.test(claude));
const turn = read("lib/ai/customer-turn.ts");
check("(turn) costUsd is called with the cache read + cache write meters", /costUsd\([\s\S]{0,160}cacheReadTokens,[\s\S]{0,60}cacheCreationTokens/.test(turn));
check("(turn) cache_creation_tokens is stored best-effort (PREPARE-ONLY tolerant)", /cache_creation_tokens: result\.usage\.cacheCreationTokens/.test(turn) && /PREPARE-ONLY/.test(turn));
const mig = read("supabase/migrations/0087_agent_runs_cache_creation.sql");
check("(migration 0087) adds cache_creation_tokens, additive + idempotent (add column if not exists)", /add column if not exists cache_creation_tokens/.test(mig));

console.log(`\nCOST-LEDGER PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
