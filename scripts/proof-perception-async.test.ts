// WO-S0-PERC proof:
//   node --conditions=react-server --import ./scripts/prompt-snapshot-loader.mjs --experimental-strip-types scripts/proof-perception-async.test.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0;
let fail = 0;
function ok(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    console.error(`FAIL ${label}`);
  }
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const ct = read("lib/ai/customer-turn.ts");
const rs = read("lib/messaging/respond-and-send.ts");
const perception = read("lib/ai/perception.ts");
const usageEvents = read("lib/ai/llm/usage-events.ts");
const tier = read("lib/tenant/tier.ts");

ok("perception_async is a registered explicit feature flag",
  /"perception_async"/.test(tier) &&
  /isFeatureExplicitlyEnabled\(\s*feature: ProFeature,\s*features: Record<string, unknown> \| null \| undefined\s*\)/.test(tier));

ok("flag OFF preserves the synchronous perceiveTurn reply path",
  /const perceptionShouldRun = \(isFeatureExplicitlyEnabled\("perception", tenantFeatures\) \|\| goalLogicOn\) && !combinedAllergenHit\.fired;/.test(ct) &&
  /const perceptionAsyncOn = isFeatureExplicitlyEnabled\("perception_async", tenantFeatures\);/.test(ct) &&
  /const perceptionOn = perceptionShouldRun && !perceptionAsyncOn;/.test(ct) &&
  /const perceptionResult = perceptionOn \? await perceiveTurnWithUsage\(input\.userMessage, input\.history\) : null;/.test(ct) &&
  /surface: "perception"[\s\S]{0,180}?trigger: "customer"/.test(ct));

ok("flag ON removes perception output from the awaited reply path",
  /const perceptionAsync = perceptionShouldRun && perceptionAsyncOn;/.test(ct) &&
  /perceptionRead: perception/.test(ct) &&
  /perceptionAsync,/.test(ct));

const sendIdx = rs.indexOf("const send = outcome.presentation");
const textSendIdx = rs.indexOf("await sendWhatsAppText({ to: phone, text: outcome.reply, lastInboundAtMs })", sendIdx);
const scheduleIdx = rs.indexOf("scheduleAsyncPerceptionAfterReply(admin", sendIdx);
ok("async perception is queued only after the primary reply send resolves",
  sendIdx >= 0 &&
  textSendIdx > sendIdx &&
  scheduleIdx > textSendIdx &&
  /\(send\.status === "sent" \|\| send\.status === "skipped"\) && outcome\.perceptionAsync/.test(rs));

ok("post-send perception is fire-and-forget with logged errors",
  /queueMicrotask\(\(\) => \{[\s\S]{0,160}?void recordAsyncPerception\(admin, job\)\.catch\(\(e\) => console\.error\("\[perception_async\] job error", e\)\);[\s\S]{0,20}?\}\);/.test(ct) &&
  !/await scheduleAsyncPerceptionAfterReply/.test(rs));

const asyncBody = ct.slice(
  ct.indexOf("export async function recordAsyncPerception"),
  ct.indexOf("export function scheduleAsyncPerceptionAfterReply")
);
const asyncUsageCalls = asyncBody.match(/recordUsageEvent\(/g)?.length ?? 0;
const asyncAgentRunsWrites = asyncBody.match(/\.from\("agent_runs"\)/g)?.length ?? 0;
ok("async completion records exactly one usage_cost_events-bound event and zero agent_runs rows",
  /export async function perceiveTurnWithUsage/.test(perception) &&
  asyncUsageCalls === 1 &&
  asyncAgentRunsWrites === 0 &&
  /tenantId: input\.restaurantId/.test(asyncBody) &&
  /conversationId: input\.conversationId/.test(asyncBody) &&
  /surface: "perception\.async"/.test(asyncBody) &&
  /trigger: "perception_async"/.test(asyncBody) &&
  /usage: perceptionResult\.usage/.test(asyncBody) &&
  /input_tokens: inputTokens/.test(usageEvents) &&
  /output_tokens: outputTokens/.test(usageEvents) &&
  /cache_read_tokens: cacheReadTokens/.test(usageEvents) &&
  /cache_creation_tokens: cacheCreationTokens/.test(usageEvents));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} perception-async: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
