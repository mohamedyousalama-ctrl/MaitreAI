// ============================================================================
// MaitreAI — Item 11: retry-jobs cron drain (POST) — SERVER ONLY.
// Drains due durable retry jobs with exponential backoff. Secret-guarded (a
// scheduled caller sends x-cron-secret matching CRON_SECRET) — mirrors the
// agent/respond secret discipline. Each job is atomically claimed (pending→
// processing) so concurrent ticks never double-run one, then dispatched by kind:
// success → done; failure → backoff (or 'dead' after max_attempts). Never throws
// per-job — one bad job cannot abort the drain.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDueJobs, claimJob, completeJob, failJob } from "@/lib/jobs/retry-queue";
import { dispatchRetryJob } from "@/lib/jobs/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Unset secret → route is closed (never open by default).
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const due = await fetchDueJobs(admin, nowIso);

  let processed = 0, done = 0, failed = 0, skipped = 0;
  for (const job of due) {
    // Atomic claim — skip if another tick already took it.
    if (!(await claimJob(admin, job.id))) { skipped++; continue; }
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
