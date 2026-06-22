// ============================================================================
// MaitreAI — Deliveries list (operator) — SERVER ONLY. Member-gated.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { listDeliveries } from "@/lib/db/delivery";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // polled by the operator view — always fresh

export async function GET() {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deliveries = await listDeliveries(supabase, tenant.restaurantId);
  return NextResponse.json({ deliveries });
}
