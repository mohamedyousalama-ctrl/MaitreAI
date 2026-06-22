// ============================================================================
// MaitreAI — COD ledger read (operator) — SERVER ONLY, session-authenticated.
// Per-driver cash position (expected / collected / outstanding / unsettled) +
// today's COD summary. All amounts derive from orders.total (tool-computed).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createClient } from "@/lib/supabase/server";
import { driverLedger, codDailySummary } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [drivers, summary] = await Promise.all([
    driverLedger(supabase, tenant.restaurantId),
    codDailySummary(supabase, tenant.restaurantId),
  ]);
  return NextResponse.json({ ok: true, drivers, summary });
}
