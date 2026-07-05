#!/usr/bin/env npx tsx
// ============================================================================
// Proof (INFORMATIONAL, tsx-only): symptom-layer RUNTIME integration.
// Run: npx tsx scripts/proof-allergen-symptom-integration.ts
//
// WO-SAFE-3 split: the pure detector/flag/wiring hard-test (169 assertions)
// lives in scripts/proof-allergen-symptom-detector.test.ts and is the BLOCKING
// CI gate (pure ESM under `node --experimental-strip-types`). THIS file is the
// runtime companion: it calls the real runCustomerTurn() with a mocked Supabase
// admin to prove the end-to-end escalate/zero-token/no-LLM path.
//
// It is NOT in the blocking CI gate because it imports customer-turn.ts, which
// pulls the whole `server-only` + `@/`-aliased server graph and therefore needs
// tsx's resolver + require()-based `server-only` stubbing (impossible under
// bare-node ESM without reimplementing tsx). Its 3 checks are already covered in
// the blocking gate by Section A (source-asserts the escalate:true wiring) and
// by scripts/proof-wo-safe-2.test.ts (unconditional base gate), so this stays a
// documented manual/informational proof, run before merging symptom-layer changes.
// ============================================================================

// Make this a module (not a global script) so tsc scopes its top-level bindings.
export {};

let pass = 0, fail = 0;
const errors: string[] = [];

function ok(desc: string, result: boolean, ...details: string[]): void {
  if (result) {
    console.log(`✓ [PASS] ${desc}`);
    pass++;
  } else {
    console.log(`✗ [FAIL] ${desc}`);
    details.forEach((d) => console.log(`       ${d}`));
    errors.push(desc);
    fail++;
  }
}

// ---------------------------------------------------------------------------
// Mock Supabase admin builder — a fluent chain that resolves to
// { data, error:null } directly (list) or on .single() (row), and returns
// itself on select/eq/order/limit/insert/update.
// ---------------------------------------------------------------------------
function buildChain(singleData: unknown, listData: unknown = []) {
  const listPromise = Promise.resolve({ data: listData, error: null });
  const singlePromise = Promise.resolve({ data: singleData, error: null });

  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "insert", "update"]) {
    chain[m] = () => chain;
  }
  chain["single"] = () => singlePromise;
  chain["then"] = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => listPromise.then(res, rej);
  chain["catch"] = (rej: (e: unknown) => unknown) => listPromise.catch(rej);
  return chain;
}

function createMockAdmin(featureFlags: Record<string, unknown>) {
  const restaurantRow = {
    agent_mode: "active", is_open: true, ai_tone: null, dialect: "egyptian",
    name: "Test Restaurant", currency: "EGP", timezone: "Africa/Cairo",
    business_type: "restaurant", tier: "standard", feature_flags: featureFlags,
    auto_accept_orders: false, agent_persona_name: null, tax_mode: "inclusive", tax_rate: 0,
    logo_url: null, phone: null, email: null, default_language: "ar",
  };

  return {
    from: (table: string) => {
      if (table === "restaurants") return buildChain(restaurantRow);
      if (table === "agent_runs") return buildChain({ id: "mock-run-id" });
      return buildChain(null, []);
    },
  } as unknown;
}

// Dangerous symptom phrase — would normally fire detectAllergenSymptom
const SYMPTOM_MSG = "دخلت الطوارئ بعد السوداني";
const RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

async function runIntegrationTests(): Promise<void> {
  // Polyfill `server-only` for tsx: the package always throws outside Next.js.
  // We intercept the require() call and return an empty module instead. (This is
  // exactly the CJS trick that keeps this file tsx-only — see the header.)
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const Module = require("module") as { _load: (...a: any[]) => unknown };
  const orig = Module._load;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...args: any[]) {
    if (request === "server-only") return {};
    return orig.call(Module, request, ...args);
  };

  const { runCustomerTurn } = await import("../lib/ai/customer-turn");

  // ─── D1: BOTH flags ON → deterministic gate fires, respond() not called ──
  const bothFlagsAdmin = createMockAdmin({
    deterministic_allergen_safety: true,
    allergen_symptom_detection: true,
  });
  try {
    const outcome = await runCustomerTurn(bothFlagsAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D1: escalate=true (gate fired)", outcome.escalate === true);
    ok("D1: model=deterministic_allergen_gate", outcome.model === "deterministic_allergen_gate");
    ok("D1: adapter=mock (no LLM)", outcome.adapter === "mock");
    ok("D1: inputTokens=0 (no LLM call)", outcome.usage.inputTokens === 0);
    ok("D1: outputTokens=0 (no LLM call)", outcome.usage.outputTokens === 0);
  } catch (e) {
    ok("D1: should NOT throw for allergen gate path", false,
      `unexpected throw: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ─── D2: base flag ABSENT but symptom flag ON → symptom detector STILL fires ──
  // WO-SAFE-2 decoupled the symptom layer from the base flag: symptomDetectionOn
  // is now a STANDALONE allergen_symptom_detection check (customer-turn.ts), so on
  // a symptom message the gate fires even when deterministic_allergen_safety is
  // absent. This is the runtime proof of that decoupling.
  const baseFlagOffAdmin = createMockAdmin({
    // deterministic_allergen_safety: absent (base gate is unconditional anyway)
    allergen_symptom_detection: true,
  });
  try {
    const outcome = await runCustomerTurn(baseFlagOffAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D2: symptom flag ON (base absent) → gate STILL fires (WO-SAFE-2 decoupling)",
      outcome.escalate === true && outcome.model === "deterministic_allergen_gate",
      `got escalate=${outcome.escalate} model=${outcome.model}`);
    ok("D2: gate path is zero-token / no-LLM",
      outcome.usage.inputTokens === 0 && outcome.usage.outputTokens === 0,
      `got in=${outcome.usage.inputTokens} out=${outcome.usage.outputTokens}`);
  } catch (e) {
    ok("D2: should NOT throw on the allergen gate path", false,
      `got: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
  }

  // ─── D3: base ON but symptom flag OFF → same fall-through ──
  const symptomFlagOffAdmin = createMockAdmin({
    deterministic_allergen_safety: true,
    allergen_symptom_detection: false,
  });
  try {
    const outcome = await runCustomerTurn(symptomFlagOffAdmin as never, {
      restaurantId: RESTAURANT_ID,
      conversationId: null,
      history: [],
      userMessage: SYMPTOM_MSG,
      persistReply: false,
    });
    ok("D3: symptom flag OFF → falls through to LLM (model ≠ allergen_gate)",
      outcome.model !== "deterministic_allergen_gate",
      `got model: ${outcome.model}`);
  } catch (e) {
    ok("D3: unexpected throw (symptom-flag-off should succeed via LLM mock)", false,
      `got: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
  }
}

(async () => {
  await runIntegrationTests();
  console.log(`\n══════════════════════════════════`);
  console.log(`  Results: ${pass} passed, ${fail} failed (${pass + fail} total)`);
  if (errors.length) {
    console.log(`\n  Failed tests:`);
    errors.forEach((e) => console.log(`    • ${e}`));
  }
  console.log(`══════════════════════════════════`);
  if (fail > 0) process.exit(1);
})();
