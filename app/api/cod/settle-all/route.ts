// ============================================================================
// MaitreAI — COD settle-all (end-of-shift) — SERVER ONLY, session-authenticated.
// Manager-gated; tenant-scoped. Settles EVERY driver currently holding unsettled
// cash by reusing settleAllHeldDrivers → settleDriver per driver (no settlement
// logic reimplemented). Idempotent: a second call settles nothing (no held cash
// left) instead of double-settling or erroring. Write via the service-role admin
// client (cod_* are member-read-only post-M1.7); tenant scope enforced in code.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleAllHeldDrivers } from "@/lib/db/cod";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const note = typeof body.note === "string" ? body.note : null;

  const r = await settleAllHeldDrivers(admin, tenant.restaurantId, {
    settledBy: tenant.userId,
    settledByRole: tenant.role,
    note,
  });
  return NextResponse.json({ ok: true, ...r });
}
