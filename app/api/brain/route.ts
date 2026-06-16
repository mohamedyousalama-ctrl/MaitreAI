// ============================================================================
// MaitreAI — Restaurant Brain API (Learning System Piece 1) — SERVER ONLY
// Manual read/write of learned KNOWLEDGE facts. Auth: a signed-in MANAGER (UI),
// OR the shared AGENT_ROUTE_SECRET for server-to-server callers (the proof here,
// and the analysis job in Piece 2). Knowledge only — never prices/availability.
//   GET   → list active facts
//   POST  → add a fact { category, fact, source? }  (manager/secret)
//   PATCH → archive a fact { id }                    (manager/secret)
// ============================================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { loadRestaurantBrain, addBrainFact, archiveBrainFact } from "@/lib/db/restaurant-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx { db: SupabaseClient; restaurantId: string; canWrite: boolean }

/** Resolve auth → { db, restaurantId, canWrite } or null (unauthorized). */
async function resolve(req: Request, body: Record<string, unknown>): Promise<Ctx | null> {
  const secret = process.env.AGENT_ROUTE_SECRET;
  if (secret && req.headers.get("x-agent-secret") === secret) {
    const admin = createAdminClient();
    const restaurantId = String(body.restaurantId ?? new URL(req.url).searchParams.get("restaurantId") ?? "");
    if (!admin || !restaurantId) return null;
    return { db: admin, restaurantId, canWrite: true }; // trusted server-to-server
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
  const { facts } = await loadRestaurantBrain(ctx.db, ctx.restaurantId);
  return NextResponse.json({ facts });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = await resolve(req, body);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.canWrite) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const fact = String(body.fact ?? "").trim();
  if (!fact) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const created = await addBrainFact(ctx.db, ctx.restaurantId, {
      category: String(body.category ?? "other"),
      fact,
      source: (body.source as "analysis" | "owner_answer" | "manual") ?? "manual",
    });
    return NextResponse.json({ fact: created });
  } catch (e) {
    return NextResponse.json({ error: "create_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = await resolve(req, body);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!ctx.canWrite) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    await archiveBrainFact(ctx.db, ctx.restaurantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "update_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
