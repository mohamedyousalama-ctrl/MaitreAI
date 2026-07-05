// ============================================================================
// MaitreAI — R4 Weekly hours write (POST) — SERVER ONLY, MANAGER-ONLY, AUDITED.
// Writes per-day opening hours to restaurants.hours (existing JSONB). Validated
// (lib/settings/hours) so a malformed payload is a 400, never persisted. Every
// successful write records an audit row (WHO changed WHAT). GET returns current.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { parseWeeklyHours } from "@/lib/settings/hours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase.from("restaurants").select("hours").eq("id", tenant.restaurantId).maybeSingle();
  return NextResponse.json({ hours: (data?.hours as Record<string, unknown>) ?? {} });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { hours?: unknown };
  const parsed = parseWeeklyHours(body.hours);
  if (!parsed.ok) return NextResponse.json({ error: "bad_request", detail: parsed.error }, { status: 400 });

  const { error } = await supabase.from("restaurants").update({ hours: parsed.hours }).eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

  await recordAuditEvent(createAdminClient()!, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "settings_hours_updated", entityType: "restaurant", entityId: tenant.restaurantId,
    metadata: { days: Object.keys(parsed.hours) },
  });
  return NextResponse.json({ ok: true, hours: parsed.hours });
}
