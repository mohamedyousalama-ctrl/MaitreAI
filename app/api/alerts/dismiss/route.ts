// ============================================================================
// MaitreAI — dismiss a critical alert (operator). WRITE. Manager-only.
// Marks the alert dismissed_at so it leaves the banner. Tenant-scoped: the
// update is keyed on both id AND restaurant_id so one tenant can never dismiss
// another's alert.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    await mustWrite<{ id: string }>(
      admin
        .from("system_alerts")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("restaurant_id", tenant.restaurantId)
        .select("id"),
      "alerts.dismiss.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
