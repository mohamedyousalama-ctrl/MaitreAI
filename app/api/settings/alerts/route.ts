// ============================================================================
// MaitreAI — R4 Alert routing write (POST) — SERVER ONLY, MANAGER-ONLY, AUDITED.
// Writes WHERE operational alerts are delivered to restaurants.alert_routing
// (JSONB, migration 0064). Validated (lib/settings/alerts): at least one channel,
// E.164 number when WhatsApp routing is on. Purely a routing pref — it never
// suppresses the system_alerts RECORD. Every write records an audit row. GET
// returns current.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { parseAlertRouting } from "@/lib/settings/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase.from("restaurants").select("alert_routing").eq("id", tenant.restaurantId).maybeSingle();
  return NextResponse.json({ routing: (data?.alert_routing as Record<string, unknown>) ?? {} });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const parsed = parseAlertRouting(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: "bad_request", detail: parsed.error }, { status: 400 });

  const { error } = await supabase.from("restaurants").update({ alert_routing: parsed.routing }).eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

  await recordAuditEvent(createAdminClient()!, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "settings_alerts_updated", entityType: "restaurant", entityId: tenant.restaurantId,
    metadata: { channels: Object.keys(parsed.routing.channels).filter((c) => parsed.routing.channels[c]) },
  });
  return NextResponse.json({ ok: true, routing: parsed.routing });
}
