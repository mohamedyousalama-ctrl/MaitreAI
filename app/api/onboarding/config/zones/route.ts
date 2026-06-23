// ============================================================================
// MaitreAI — Onboarding Step 3: delivery zones — list + create
//
// GET   /api/onboarding/config/zones  — any member; lists all zones
// POST  /api/onboarding/config/zones  — manager only; creates a zone
//
// Uses addDeliveryAreaDb / toDeliveryArea from lib/db/brain.ts (already exist).
// loadBrain() reads delivery_zones via select("*") — we add no columns, so its
// read path is byte-identical.
//
// Zone shape (DeliveryArea from lib/types.ts):
//   name           string   required
//   deliveryFee    number   required, ≥ 0
//   minOrder       number   required, ≥ 0
//   estimatedTime  string   optional, e.g. "30 دقيقة" or "30-45 دقيقة"
//   branchId       string   optional UUID
//   active         boolean  optional, default true
//
// Auth: server client + getServerTenant().
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { addDeliveryAreaDb } from "@/lib/db/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("delivery_zones")
    .select("id, name, fee, min_order, eta_minutes, branch_id, active")
    .eq("restaurant_id", tenant.restaurantId)
    .order("created_at");

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  const zones = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    deliveryFee: Number(r.fee),
    minOrder: Number(r.min_order),
    estimatedTime: r.eta_minutes != null ? `${r.eta_minutes} دقيقة` : "",
    branchId: (r.branch_id as string | null) ?? undefined,
    active: r.active as boolean,
  }));

  return NextResponse.json({ zones });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof body.name !== "string" || !body.name.trim()) errors.push("name is required");
  if (typeof body.deliveryFee !== "number" || body.deliveryFee < 0) errors.push("deliveryFee must be a non-negative number");
  if (typeof body.minOrder !== "number" || body.minOrder < 0) errors.push("minOrder must be a non-negative number");

  if (errors.length) {
    return NextResponse.json({ error: "bad_request", detail: errors.join("; ") }, { status: 400 });
  }

  await addDeliveryAreaDb(supabase, tenant.restaurantId, {
    name: (body.name as string).trim(),
    deliveryFee: body.deliveryFee as number,
    minOrder: body.minOrder as number,
    estimatedTime: typeof body.estimatedTime === "string" ? body.estimatedTime : "",
    branchId: typeof body.branchId === "string" ? body.branchId : undefined,
    active: body.active !== false,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
