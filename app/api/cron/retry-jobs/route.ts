// ============================================================================
// MaitreAI — Item 11/17: retry-jobs cron drain — SERVER ONLY.
// Drains due durable retry jobs with exponential backoff. Secret-guarded, closed
// by default (no CRON_SECRET → 401). Accepts BOTH:
//   • Vercel Cron  → GET  with `Authorization: Bearer $CRON_SECRET` (Vercel adds
//                    this header automatically once CRON_SECRET is set in env).
//   • Manual/external → POST with `x-cron-secret: $CRON_SECRET`.
// Each job is atomically claimed (pending→processing) so concurrent ticks never
// double-run one, then dispatched by kind: success → done; failure → backoff (or
// 'dead' after max_attempts). Never throws per-job — one bad job can't abort the drain.
// Scheduled by vercel.json (crons). NOTE: the Vercel Hobby plan caps cron at
// once-per-day (per-hour / */5 expressions fail at deploy), so vercel.json uses
// a daily schedule ("0 3 * * *"). Under Pro, change it to "*/5 * * * *" to run
// the durable-queue drain every 5 minutes as intended.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDueJobs, claimJob, completeJob, failJob } from "@/lib/jobs/retry-queue";
import { dispatchRetryJob } from "@/lib/jobs/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Closed by default. True only when CRON_SECRET is set AND the request presents it
 *  as `Authorization: Bearer <secret>` (Vercel Cron) OR `x-cron-secret: <secret>`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer && bearer === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

async function drain(): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const nowMs = Date.now();
  const due = await fetchDueJobs(admin, new Date(nowMs).toISOString());

  let processed = 0, done = 0, failed = 0, skipped = 0;
  for (const job of due) {
    if (!(await claimJob(admin, job.id))) { skipped++; continue; } // another tick took it
    processed++;
    try {
      await dispatchRetryJob(admin, job.kind, job.payload);
      await completeJob(admin, job.id);
      done++;
    } catch (e) {
      await failJob(admin, job, e instanceof Error ? e.message : String(e), nowMs);
      failed++;
    }
  }
  return NextResponse.json({ ok: true, due: due.length, processed, done, failed, skipped });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return drain();
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return drain();
}
