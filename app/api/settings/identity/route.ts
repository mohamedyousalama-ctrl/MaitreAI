// ============================================================================
// MaitreAI — R4 Identity write (POST) — SERVER ONLY, MANAGER-ONLY, AUDITED.
// Writes the restaurant's display identity: name, agent persona name, timezone.
// Bounded + validated (never empty name, sane timezone string). Every successful
// write records an audit row naming the changed fields. GET returns current.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase
    .from("restaurants").select("name, agent_persona_name, timezone").eq("id", tenant.restaurantId).maybeSingle();
  return NextResponse.json({
    name: (data?.name as string | null) ?? null,
    agentPersonaName: (data?.agent_persona_name as string | null) ?? null,
    timezone: (data?.timezone as string | null) ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; agentPersonaName?: unknown; timezone?: unknown };
  const patch: { name?: string; agent_persona_name?: string; timezone?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 120) return NextResponse.json({ error: "bad_request", detail: "name 1..120 chars" }, { status: 400 });
    patch.name = name;
  }
  if (body.agentPersonaName !== undefined) {
    const persona = String(body.agentPersonaName).trim();
    if (persona.length > 60) return NextResponse.json({ error: "bad_request", detail: "persona <=60 chars" }, { status: 400 });
    patch.agent_persona_name = persona;
  }
  if (body.timezone !== undefined) {
    const tz = String(body.timezone).trim();
    // Sane IANA-ish token (e.g. "Asia/Riyadh"); reject spaces/garbage.
    if (!/^[A-Za-z]+\/[A-Za-z_]+$/.test(tz)) return NextResponse.json({ error: "bad_request", detail: "invalid timezone" }, { status: 400 });
    patch.timezone = tz;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request", detail: "no fields" }, { status: 400 });

  try {
    await mustWrite<{ id: string }>(
      supabase.from("restaurants").update(patch).eq("id", tenant.restaurantId).select("id"),
      "settings.identity.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "update_failed", detail }, { status: 502 });
  }

  await recordAuditEvent(createAdminClient()!, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "settings_identity_updated", entityType: "restaurant", entityId: tenant.restaurantId,
    metadata: { fields: Object.keys(patch) },
  });
  return NextResponse.json({ ok: true, fields: Object.keys(patch) });
}
