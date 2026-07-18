// ============================================================================
// WO-S0-OBS — local proof: calls_used visibility + observe-only shadow caps.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types \
//        scripts/proof-s0-obs.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HARD_CALL_CAP,
  SOFT_CALL_CAP,
  TURN_COST_SOFT_USD,
  buildTurnCallObservabilityMeta,
  hasCapShadowViolation,
  logCapShadowViolation,
} from "../lib/ai/call-observability.ts";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL:", name);
  }
};
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

ok("constants match WO shadow caps", SOFT_CALL_CAP === 2 && HARD_CALL_CAP === 3 && TURN_COST_SOFT_USD > 0);

const normal = buildTurnCallObservabilityMeta(2, TURN_COST_SOFT_USD / 2);
ok("normal turn records calls_used", normal.calls_used === 2);
ok("soft cap is not exceeded at the soft threshold", !hasCapShadowViolation(normal));

const simulated = buildTurnCallObservabilityMeta(4, TURN_COST_SOFT_USD + 0.01);
ok("simulated turn records calls_used", simulated.calls_used === 4);
ok("shadow violation fires only as metadata/log state", hasCapShadowViolation(simulated));

const respond = read("lib/ai/respond.ts");
ok("respond result exposes calls_used", /calls_used: number/.test(respond));
ok("respond loop counts adapter.generate invocations", /adapter\.generate\([\s\S]{0,220}calls_used \+= 1/.test(respond));
ok("checkpoint after a model call preserves the current count", /checkpointResult\(input\.brain, ctx, calls_used\)/.test(respond));
ok("deterministic paths report zero model calls", /calls_used: 0/.test(respond));

const turn = read("lib/ai/customer-turn.ts");
ok("customer-turn gates observability on explicit flag only",
  /isFeatureExplicitlyEnabled\("call_count_observability", tenantFeatures\)/.test(turn));
ok("customer-turn persists calls metadata best-effort to agent_runs.meta",
  /update\(\{ meta: callObservabilityMeta \}\)/.test(turn) && /PREPARE-ONLY/.test(turn));
ok("customer-turn logs shadow violations without branching on replies",
  /hasCapShadowViolation\(callObservabilityMeta\)/.test(turn) && /logCapShadowViolation/.test(turn));

const helper = read("lib/ai/call-observability.ts");
ok("helper contains no enforcement verbs",
  !/\bthrow\b|\breturn\s+NextResponse\b|truncate|early[- ]exit/i.test(helper));

const tier = read("lib/tenant/tier.ts");
ok("new flag is registered in ProFeature", /"call_count_observability"/.test(tier));

const docs = read("docs/flags.md");
ok("message coalescing flag remains inbound_coalescing", /\| `inbound_coalescing` \|/.test(docs));
ok("new observability flag is documented default-off", /\| `call_count_observability` \|[\s\S]*Default OFF/.test(docs));

const migration = read("supabase/migrations/0098_agent_runs_meta.sql");
ok("migration adds agent_runs.meta idempotently", /add column if not exists meta jsonb/.test(migration));

console.info("turn_call_count", {
  tenant: "tenant-demo",
  conversation: "conversation-demo",
  calls_used: normal.calls_used,
  cost: TURN_COST_SOFT_USD / 2,
});
logCapShadowViolation({
  tenant: "tenant-demo",
  conversation: "conversation-demo",
  calls_used: simulated.calls_used,
  cost: TURN_COST_SOFT_USD + 0.01,
  meta: simulated,
});

console.log(`\nS0-OBS PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
