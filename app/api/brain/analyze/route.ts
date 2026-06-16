// ============================================================================
// MaitreAI — Conversation analysis trigger (Learning System Piece 2) — SERVER ONLY
// Runs the daily-batch analysis pass for one tenant and writes grounded insights
// to brain_insights (status=pending). Auth: server-to-server via AGENT_ROUTE_SECRET
// (a signed-in MANAGER may also trigger it). Tenant-scoped, read-only on convos.
//
// SCHEDULER NOTE: a cron/queue would POST here (or call runConversationAnalysis
// directly) once per restaurant per interval. No external scheduler is set up yet
// — this route is the clean trigger seam.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { runConversationAnalysis } from "@/lib/ai/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const secret = process.env.AGENT_ROUTE_SECRET;
  const viaSecret = !!secret && req.headers.get("x-agent-secret") === secret;

  let restaurantId: string;
  if (viaSecret) {
    restaurantId = String(body.restaurantId ?? "");
    if (!restaurantId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } else {
    // Signed-in manager fallback (so the owner could trigger a run from the UI).
    const supabase = createClient();
    if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
    const tenant = await getServerTenant();
    if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    restaurantId = tenant.restaurantId;
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  try {
    const result = await runConversationAnalysis(admin, restaurantId, {
      windowHours: typeof body.windowHours === "number" ? body.windowHours : undefined,
      sinceTimestamp: typeof body.sinceTimestamp === "string" ? body.sinceTimestamp : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "analysis_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
