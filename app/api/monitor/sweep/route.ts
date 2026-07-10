// ============================================================================
// MaitreAI — WO-MONITORING-ALERTING: monitor sweep trigger — SERVER ONLY.
//
// Runs the DB-backed health checks (lib/monitoring/sweep) that must originate
// INSIDE the app: delivery silence, webhook-anomaly spikes, agent error rate,
// daily spend. Self-fires alerts (banner + WhatsApp-to-Mohamed) with cooldowns.
//
// Secret-guarded, closed by default (no CRON_SECRET → 401), identical posture to
// the retry-jobs cron. Accepts BOTH:
//   • GET  with `Authorization: Bearer $CRON_SECRET`  (Vercel Cron style)
//   • POST with `x-cron-secret: $CRON_SECRET`         (external scheduler / GH Action)
//
// Triggered every ~5 min by the external scheduler (.github/workflows/uptime-
// monitor.yml). NOT scheduled by vercel.json — the Hobby plan caps cron at once/
// day, which is far too coarse for the Wesaya-class outage this exists to catch.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMonitorSweep } from "@/lib/monitoring/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Closed by default. True only when CRON_SECRET is set AND the request presents it
 *  as `Authorization: Bearer <secret>` OR `x-cron-secret: <secret>`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer && bearer === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

async function run(): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const summary = await runMonitorSweep(admin);
  return NextResponse.json(summary);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}
