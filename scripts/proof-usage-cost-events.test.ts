// ============================================================================
// WO-S0-LEDGER proof: every named leak writes a usage_cost_events row and prices
// all four meters through recordUsageEvent().
// Run:
//   node --experimental-strip-types scripts/proof-usage-cost-events.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { costUsd, modelFor } from "../lib/ai/llm/models.ts";
import { recordUsageEvent } from "../lib/ai/llm/usage-events.ts";
import type { LlmUsage, LlmUseCase } from "../lib/ai/llm/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL:", name);
  }
};
const near = (a: number, b: number, eps = 1e-12) => Math.abs(a - b) <= eps;

type Inserted = { table: string; row: Record<string, unknown> };

function fakeAdmin(rows: Inserted[], error: unknown = null) {
  return {
    from(table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          rows.push({ table, row });
          return { error };
        },
      };
    },
  };
}

const usage: LlmUsage = {
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 3000,
  cacheCreationTokens: 4000,
};

const leaks: Array<{ name: string; surface: string; useCase: LlmUseCase; trigger: string }> = [
  { name: "perception", surface: "perception", useCase: "perception", trigger: "customer" },
  { name: "conversation-intel/report", surface: "conversation_intel.report", useCase: "conversation_intel", trigger: "system" },
  { name: "promo caption", surface: "agent_promo.caption", useCase: "customer_agent", trigger: "owner" },
  { name: "admin router", surface: "agent_admin.router", useCase: "admin_parse", trigger: "owner" },
];

for (const leak of leaks) {
  const rows: Inserted[] = [];
  const got = await recordUsageEvent({
    admin: fakeAdmin(rows) as never,
    tenantId: "00000000-0000-0000-0000-000000000001",
    conversationId: "00000000-0000-0000-0000-000000000002",
    orderId: leak.name === "conversation-intel/report" ? "00000000-0000-0000-0000-000000000003" : null,
    surface: leak.surface,
    useCase: leak.useCase,
    model: `model-for-${leak.name}`,
    usage,
    latencyMs: 123.9,
    trigger: leak.trigger,
  });
  const expected = costUsd(modelFor(leak.useCase), usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheCreationTokens ?? 0);
  const row = rows[0]?.row;
  check(`${leak.name}: helper returns four-meter cost`, near(got, expected));
  check(`${leak.name}: inserts usage_cost_events`, rows[0]?.table === "usage_cost_events");
  check(`${leak.name}: stores surface`, row?.surface === leak.surface);
  check(`${leak.name}: stores cache creation meter`, row?.cache_creation_tokens === usage.cacheCreationTokens);
  check(`${leak.name}: stores four-meter USD`, near(Number(row?.cost_usd), expected));
}

const failOpenRows: Inserted[] = [];
const failOpenCost = await recordUsageEvent({
  admin: fakeAdmin(failOpenRows, { message: "missing table" }) as never,
  tenantId: "00000000-0000-0000-0000-000000000001",
  surface: "perception",
  useCase: "perception",
  model: "haiku",
  usage,
  trigger: "customer",
});
check("insert errors fail open and still return cost", failOpenCost > 0 && failOpenRows.length === 1);

const helper = read("lib/ai/llm/usage-events.ts");
check("helper prices via four-meter costUsd", /costUsd\(modelFor\(args\.useCase\), inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens\)/.test(helper));
check("helper logs insert failures", /console\.error\("\[usage_cost_events\] insert failed"/.test(helper));

const customerTurn = read("lib/ai/customer-turn.ts");
check("leak a: customer-turn uses perceiveTurnWithUsage", /perceiveTurnWithUsage\(input\.userMessage, input\.history\)/.test(customerTurn));
check("leak a: perception records usage_cost_events", /surface: "perception"[\s\S]*useCase: "perception"[\s\S]*trigger: "customer"/.test(customerTurn));

const report = read("lib/intelligence/conversation-report.ts");
check("leak b: conversation-intel records usage_cost_events", /surface: "conversation_intel\.report"[\s\S]*useCase: "conversation_intel"[\s\S]*trigger: "system"/.test(report));

const promo = read("app/api/agent/promo/route.ts");
check("leak c: promo records usage_cost_events", /surface: "agent_promo\.caption"[\s\S]*useCase: "customer_agent"[\s\S]*trigger: "owner"/.test(promo));
check("leak c: promo agent_runs no longer writes zero LLM cost", /cost_usd: cost/.test(promo) && !/promo_caption[\s\S]{0,260}cost_usd: 0/.test(promo));

const admin = read("app/api/agent/admin/route.ts");
check("leak d: admin records usage_cost_events", /surface: "agent_admin\.router"[\s\S]*useCase: "admin_parse"[\s\S]*trigger: "owner"/.test(admin));
check("leak d: old two-arg admin costUsd call is gone", !/costUsd\(cfg, res\.usage\.inputTokens, res\.usage\.outputTokens\)/.test(admin));

const mig95 = read("supabase/migrations/0095_usage_cost_events.sql");
check("migration 0095 creates usage_cost_events", /create table if not exists public\.usage_cost_events/.test(mig95));
check("migration 0095 includes all four meters", /input_tokens[\s\S]*output_tokens[\s\S]*cache_read_tokens[\s\S]*cache_creation_tokens/.test(mig95));

const mig96 = read("supabase/migrations/0096_cost_views.sql");
check("migration 0096 creates v_cost_per_order", /create or replace view public\.v_cost_per_order/.test(mig96));
check("migration 0096 creates v_cost_per_tenant_day", /create or replace view public\.v_cost_per_tenant_day/.test(mig96));
check("migration 0096 joins usage_cost_events and agent_runs to orders", /from public\.orders o[\s\S]*public\.usage_cost_events[\s\S]*public\.agent_runs/.test(mig96));

console.log(`\nUSAGE-COST-EVENTS PROOF: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
