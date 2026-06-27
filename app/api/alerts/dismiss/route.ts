// ============================================================================
// MaitreAI — dismiss a critical alert (operator). WRITE. Manager-only.
// Marks the alert dismissed_at so it leaves the banner. Tenant-scoped: the
// update is keyed on both id AND restaurant_id so one tenant can never dismiss
// another's alert.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { error } = await admin
    .from("system_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
