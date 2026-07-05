// ============================================================================
// MaitreAI — COD ledger read (operator) — SERVER ONLY, session-authenticated.
// Per-driver cash position (expected / collected / outstanding / unsettled) +
// today's COD summary. All amounts derive from orders.total (tool-computed).
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createClient } from "@/lib/supabase/server";
import { driverLedger, codDailySummary, heldCollectionItems, settlementHistory } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const [drivers, summary, items, settlements] = await Promise.all([
    driverLedger(supabase, tenant.restaurantId),
    codDailySummary(supabase, tenant.restaurantId),
    heldCollectionItems(supabase, tenant.restaurantId),
    settlementHistory(supabase, tenant.restaurantId),
  ]);
  return NextResponse.json({ ok: true, drivers, summary, items, settlements });
}
