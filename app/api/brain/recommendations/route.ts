// ============================================================================
// MaitreAI — Owner recommendations (Learning System Piece 5) — SERVER ONLY
// GET → grounded, suggest-only business advice for the owner (cited from real
// data). Auth: signed-in MANAGER (console) OR server-to-server AGENT_ROUTE_SECRET.
// Deterministic (no LLM) and read-only; the owner still acts via the normal
// confirm-before-write ops path.
// ============================================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { generateOwnerRecommendations } from "@/lib/db/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolve(req: Request): Promise<{ db: SupabaseClient; restaurantId: string } | null> {
  const secret = process.env.AGENT_ROUTE_SECRET;
  if (secret && req.headers.get("x-agent-secret") === secret) {
    const admin = createAdminClient();
    const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
    if (!admin || !restaurantId) return null;
    return { db: admin, restaurantId };
  }
  const supabase = createClient();
  if (!supabase) return null;
  const tenant = await getServerTenant();
  if (!tenant) return null;
  return { db: supabase, restaurantId: tenant.restaurantId };
}

export async function GET(req: Request) {
  const ctx = await resolve(req);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recommendations = await generateOwnerRecommendations(ctx.db, ctx.restaurantId);
  return NextResponse.json({ recommendations });
}
