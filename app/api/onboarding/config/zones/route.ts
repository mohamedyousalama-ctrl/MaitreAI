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
import { requireTenant } from "@/lib/db/require-tenant";
import { addDeliveryAreaDb } from "@/lib/db/brain";
import { readZoneGeometry } from "@/lib/delivery/zone-geometry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  // select("*") stays resilient whether or not migration 0081 (zone geometry) has
  // been applied — missing columns are simply absent, so this GET is byte-identical
  // pre-migration and gains center/radius once the columns exist.
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
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
    centerLat: r.center_lat == null ? undefined : Number(r.center_lat),
    centerLng: r.center_lng == null ? undefined : Number(r.center_lng),
    radiusKm: r.radius_km == null ? undefined : Number(r.radius_km),
  }));

  return NextResponse.json({ zones });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof body.name !== "string" || !body.name.trim()) errors.push("name is required");
  if (typeof body.deliveryFee !== "number" || body.deliveryFee < 0) errors.push("deliveryFee must be a non-negative number");
  if (typeof body.minOrder !== "number" || body.minOrder < 0) errors.push("minOrder must be a non-negative number");

  // Geometry (WO-DELIVERY-D1) is optional but all-or-nothing: a zone is either
  // name-only (legacy) or a full circle (center + radius). A partial circle is a bug.
  const geo = readZoneGeometry(body, errors);

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
    ...geo,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
