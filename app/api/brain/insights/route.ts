// ============================================================================
// MaitreAI — Owner insight loop (Learning System Piece 3) — SERVER ONLY
// The owner console surfaces PENDING insights, the owner answers, and the answer
// becomes a KNOWLEDGE fact. Suggest-only: this stores knowledge + marks the
// insight; it NEVER changes menu/price/policy (real changes go through the normal
// confirm-before-write ops path the owner explicitly triggers).
//   GET  → open insights (pending/surfaced), strongest evidence first
//   POST → { insightId, action: "surface" | "answer" | "dismiss", answer? }
// Auth: signed-in MANAGER (console) OR the server-to-server AGENT_ROUTE_SECRET.
// ============================================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { listOpenInsights, markInsightSurfaced, answerInsight, dismissInsight, insightQuestion } from "@/lib/db/restaurant-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx { db: SupabaseClient; restaurantId: string; canWrite: boolean }

async function resolve(req: Request, body: Record<string, unknown>): Promise<Ctx | null> {
  const secret = process.env.AGENT_ROUTE_SECRET;
  if (secret && req.headers.get("x-agent-secret") === secret) {
    const admin = createAdminClient();
    const restaurantId = String(body.restaurantId ?? new URL(req.url).searchParams.get("restaurantId") ?? "");
    if (!admin || !restaurantId) return null;
    return { db: admin, restaurantId, canWrite: true };
  }
  const supabase = createClient();
  if (!supabase) return null;
  const tenant = await getServerTenant();
  if (!tenant) return null;
  return { db: supabase, restaurantId: tenant.restaurantId, canWrite: tenant.role === "manager" };
}

export async function GET(req: Request) {
  const ctx = await resolve(req, {});
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const insights = await listOpenInsights(ctx.db, ctx.restaurantId, 3);
  return NextResponse.json({ insights: insights.map((i) => ({ id: i.id, type: i.type, summary: i.summary, status: i.status, question: insightQuestion(i), evidence: { count: i.evidence?.count ?? null } })) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = await resolve(req, body);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.canWrite) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const insightId = String(body.insightId ?? "");
  const action = String(body.action ?? "");
  if (!insightId || !action) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    if (action === "surface") {
      await markInsightSurfaced(ctx.db, ctx.restaurantId, insightId);
      return NextResponse.json({ ok: true, status: "surfaced" });
    }
    if (action === "dismiss") {
      await dismissInsight(ctx.db, ctx.restaurantId, insightId);
      return NextResponse.json({ ok: true, status: "dismissed" });
    }
    if (action === "answer") {
      const answer = String(body.answer ?? "").trim();
      if (!answer) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const { factId, qaId } = await answerInsight(ctx.db, ctx.restaurantId, insightId, answer);
      return NextResponse.json({ ok: true, status: "answered", factId, qaId });
    }
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
