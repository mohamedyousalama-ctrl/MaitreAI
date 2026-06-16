// ============================================================================
// MaitreAI — Drivers (operator) — SERVER ONLY. Manager-gated. Flag: delivery.
// GET: list the tenant's drivers. POST: add a driver (name + WhatsApp phone).
// Inert (404) when ENABLE_DELIVERY_TRACKING is off.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { listDrivers, addDriver } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const drivers = await listDrivers(supabase, tenant.restaurantId);
  return NextResponse.json({ drivers });
}

export async function POST(req: Request) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!name || !phone) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const vehicle = typeof body.vehicle === "string" ? body.vehicle : null;

  try {
    const driver = await addDriver(supabase, tenant.restaurantId, { name, phone, vehicle });
    return NextResponse.json({ driver });
  } catch (e) {
    return NextResponse.json({ error: "create_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
