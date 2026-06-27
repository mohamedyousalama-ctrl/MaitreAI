// ============================================================================
// MaitreAI — COD settle (operator) — SERVER ONLY, session-authenticated.
// Marks a driver's held cash as handed in: sums recorded cash_collected, writes a
// cod_settlements row + a 'settled' audit event, flips their held collections to
// settled. Amounts are summed from recorded cash — never re-derived by a model.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleDriver } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // M1.7-D — auth/authorize as the member (getServerTenant + manager gate), but
  // perform the WRITE with the service-role client so it keeps working once the
  // RLS lockdown makes cod_* member-read-only. settleDriver enforces tenant scope
  // in code (every write is filtered/set by restaurantId).
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const driverId = String(body.driverId ?? "");
  if (!driverId) return NextResponse.json({ error: "bad_params" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note : null;

  const r = await settleDriver(admin, tenant.restaurantId, {
    driverId,
    settledBy: tenant.userId,
    settledByRole: tenant.role,
    note,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, driverId, total: r.total, orderCount: r.orderCount, settlementId: r.settlementId });
}
