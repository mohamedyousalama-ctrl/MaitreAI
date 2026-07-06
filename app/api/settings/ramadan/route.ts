// ============================================================================
// Kivo (KSA) — WO-RAMADAN-MODE: manager toggle for seasonal hours (SERVER ONLY).
// MANAGER-ONLY (operating-hours policy is a manager decision). Auth via
// requireManager(); WRITE via the service-role admin client, tenant-scoped. Every
// change records an audit_events row. ramadan_hours (when provided) is validated
// with the same parseWeeklyHours the regular-hours route uses — a malformed
// payload is rejected (400), never persisted.
// ============================================================================

import { NextResponse } from "next/server";
import { requireManager } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWeeklyHours } from "@/lib/settings/hours";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const gate = await requireManager();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: { ramadan_mode?: boolean; ramadan_hours?: Record<string, unknown> | null } = {};

  if (typeof body.ramadan_mode === "boolean") patch.ramadan_mode = body.ramadan_mode;

  if ("ramadan_hours" in body) {
    if (body.ramadan_hours === null) {
      patch.ramadan_hours = null; // clear the seasonal set (falls back to regular)
    } else {
      // Ramadan windows commonly run post-iftar into suhoor (e.g. 20:00→03:00),
      // so overnight windows are allowed here (unlike the regular-hours route).
      const parsed = parseWeeklyHours(body.ramadan_hours, { allowOvernight: true });
      if (!parsed.ok) return NextResponse.json({ error: "bad_hours", detail: parsed.error }, { status: 400 });
      patch.ramadan_hours = parsed.hours;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "bad_params", detail: "provide ramadan_mode and/or ramadan_hours" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("restaurants")
    .update(patch)
    .eq("id", tenant.restaurantId)
    .select("id");
  if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "settings_flag_flipped",
    entityType: "restaurant",
    entityId: tenant.restaurantId,
    metadata: {
      setting: "ramadan_mode",
      ...(patch.ramadan_mode !== undefined ? { ramadan_mode: patch.ramadan_mode } : {}),
      ...("ramadan_hours" in patch ? { ramadan_hours_set: patch.ramadan_hours !== null } : {}),
    },
  });

  return NextResponse.json({ ok: true, ...patch });
}
