// ============================================================================
// Item 11 proof harness — durable retry queue.
// Pure backoff exercised directly; source assertions confirm the cron is
// secret-guarded + atomic-claim, the dispatch handlers THROW on still-failed
// attempts (so the queue retries), both retry sites (outcome-emit, paid-notify)
// enqueue durably, and the migration's shape (kinds, backoff cols, status enum).
//
// Run: node --experimental-strip-types scripts/proof-retry-queue.test.ts
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeNextAtMs } from "../lib/jobs/backoff.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error("  ✗ FAIL:", name); } };
const NOW = 1_000_000;
const MIN = 60_000;

// ---- Exponential backoff with cap ------------------------------------------
check("attempt 1 → +1min", computeNextAtMs(1, NOW) === NOW + MIN);
check("attempt 2 → +2min", computeNextAtMs(2, NOW) === NOW + 2 * MIN);
check("attempt 3 → +4min", computeNextAtMs(3, NOW) === NOW + 4 * MIN);
check("attempt 4 → +8min", computeNextAtMs(4, NOW) === NOW + 8 * MIN);
check("backoff caps at 1h", computeNextAtMs(20, NOW) === NOW + 3_600_000);
check("attempts<1 floored to 1", computeNextAtMs(0, NOW) === NOW + MIN);

// ---- Cron: secret-guarded, atomic claim, per-job isolation -----------------
const cron = read("app/api/cron/retry-jobs/route.ts");
check("cron closed when CRON_SECRET unset", /if \(!secret \|\| req\.headers\.get\("x-cron-secret"\) !== secret\)/.test(cron));
check("cron atomically claims each job before running", cron.includes("await claimJob(admin, job.id)") && cron.includes("skipped++"));
check("cron never lets one bad job abort the drain (per-job try/catch)", /try \{[\s\S]*dispatchRetryJob[\s\S]*\} catch/.test(cron));
check("cron backs off failures via failJob", cron.includes("failJob(admin, job,"));

// ---- Queue: claim is a guarded conditional update --------------------------
const q = read("lib/jobs/retry-queue.ts");
check("claim guarded on status='pending' (no double-run)", /\.eq\("id", jobId\)\s*\.eq\("status", "pending"\)/.test(q));
check("failJob marks 'dead' after max_attempts", /const dead = attempts >= job\.max_attempts/.test(q));
check("enqueue is best-effort (never throws)", q.includes("enqueue failed (non-blocking)") && q.includes("enqueue threw (non-blocking)"));

// ---- Dispatch: handlers THROW on still-failed attempt ----------------------
const d = read("lib/jobs/dispatch.ts");
check("outcome_emit throws if row still missing", d.includes('throw new Error("outcome_emit: outcome row still missing after emit")'));
check("paid_notify throws unless send delivered", /throw new Error\(`paid_notify: send not delivered/.test(d));
check("dispatch rejects unknown kinds", d.includes("unknown retry job kind"));

// ---- Retry site 1: outcome-emit enqueues durably ---------------------------
const oc = read("lib/intelligence/conversation-outcomes.ts");
check("outcome fail-open enqueues outcome_emit", /enqueueRetryJob\(admin, \{\s*kind: "outcome_emit"/.test(oc));
check("outcome enqueue carries restaurantId + conversationId", /payload: \{ restaurantId, conversationId \}/.test(oc));

// ---- Retry site 2: paid-notify enqueues durably ----------------------------
const mw = read("lib/payments/moyasar-webhook.ts");
check("paid notify failure enqueues paid_notify", /enqueueRetryJob\(admin, \{\s*kind: "paid_notify"/.test(mw));
check("paid_notify enqueue carries to + text", /payload: \{ restaurantId, to: phone, text \}/.test(mw));

// ---- Migration shape --------------------------------------------------------
const mig = read("supabase/migrations/0067_retry_jobs.sql");
check("retry_jobs has kind/payload/attempts/next_at", /kind\s+text not null/.test(mig) && /payload\s+jsonb/.test(mig) && /attempts\s+integer/.test(mig) && /next_at\s+timestamptz/.test(mig));
check("status enum incl. dead", /check \(status in \('pending','processing','done','dead'\)\)/.test(mig));
check("due index on pending", /retry_jobs_due_idx[\s\S]*where status = 'pending'/.test(mig));

console.log(`\nRETRY-QUEUE PROOF: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
