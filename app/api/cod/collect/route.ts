// ============================================================================
// MaitreAI — COD cash capture / correction (operator) — SERVER ONLY, session-auth.
// Records the actual cash collected for a COD order (default = expected; record
// the real amount for change/discrepancy). Writes the cash audit event.
// The driver one-time-link "delivered" path (PR #6) calls captureCodOnDelivered
// directly; this route is the operator-side capture/adjust.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCollection } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // M1.7-D — auth/authorize as the member (getServerTenant + manager gate), but
  // perform the WRITE with the service-role client (survives the RLS lockdown).
  // recordCollection enforces tenant scope in code (reads/writes filtered by
  // restaurantId).
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "");
  const cashCollected = Number(body.cashCollected);
  if (!orderId || !Number.isFinite(cashCollected) || cashCollected < 0) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const r = await recordCollection(admin, tenant.restaurantId, {
    orderId,
    cashCollected,
    actorUserId: tenant.userId,
    actorRole: tenant.role,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json({ ok: true, orderId, cashCollected, expected: r.expected });
}
