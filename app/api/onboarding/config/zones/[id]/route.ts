// ============================================================================
// MaitreAI — Onboarding Step 3: delivery zones — update + delete
//
// PUT    /api/onboarding/config/zones/[id]  — manager only; partial update
// DELETE /api/onboarding/config/zones/[id]  — manager only; delete zone
//
// Uses updateDeliveryAreaDb / deleteDeliveryAreaDb from lib/db/brain.ts.
// Tenant-scoped: verifies zone belongs to tenant before mutation.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { updateDeliveryAreaDb, deleteDeliveryAreaDb } from "@/lib/db/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveZone(supabase: ReturnType<typeof createClient>, restaurantId: string, id: string) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("delivery_zones")
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return data;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const zone = await resolveZone(supabase, tenant.restaurantId, params.id);
  if (!zone) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const errors: string[] = [];

  if ("deliveryFee" in body && (typeof body.deliveryFee !== "number" || body.deliveryFee < 0))
    errors.push("deliveryFee must be a non-negative number");
  if ("minOrder" in body && (typeof body.minOrder !== "number" || body.minOrder < 0))
    errors.push("minOrder must be a non-negative number");
  if ("name" in body && (typeof body.name !== "string" || !body.name.trim()))
    errors.push("name must be a non-empty string");

  if (errors.length) {
    return NextResponse.json({ error: "bad_request", detail: errors.join("; ") }, { status: 400 });
  }

  const patch: Parameters<typeof updateDeliveryAreaDb>[2] = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.deliveryFee === "number") patch.deliveryFee = body.deliveryFee;
  if (typeof body.minOrder === "number") patch.minOrder = body.minOrder;
  if (typeof body.estimatedTime === "string") patch.estimatedTime = body.estimatedTime;
  if ("branchId" in body) patch.branchId = typeof body.branchId === "string" ? body.branchId : undefined;
  if (typeof body.active === "boolean") patch.active = body.active;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "bad_request", detail: "no recognised fields to update" }, { status: 400 });
  }

  await updateDeliveryAreaDb(supabase, params.id, patch);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const zone = await resolveZone(supabase, tenant.restaurantId, params.id);
  if (!zone) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await deleteDeliveryAreaDb(supabase, params.id);

  return NextResponse.json({ ok: true });
}
