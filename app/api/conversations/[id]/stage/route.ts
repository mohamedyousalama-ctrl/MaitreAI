// ============================================================================
// MaitreAI — conversation sales-lifecycle STAGE (WB2) — SERVER ONLY.
// Sets conversations.stage, a SEPARATE axis from ownership (ownership_state) and
// from order status (orders.order_status, a different table). Any authenticated
// staff member may set it (same posture as the other conversation actions). The
// value is validated against the allowed set server-side; who/when is recorded in
// audit_events (no extra columns). This route NEVER touches ownership, the
// agent/Karim handoff, order status, order creation, or COD.
//
// Write via the service-role admin client, EXPLICITLY scoped to the authorized
// restaurant_id (code carries tenant isolation).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";
import { CONVERSATION_STAGES, type ConversationStage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const stage = body.stage;
  if (typeof stage !== "string" || !(CONVERSATION_STAGES as string[]).includes(stage)) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  // Read the current stage (tenant-scoped) for the audit trail.
  const { data: cur, error: readErr } = await admin
    .from("conversations")
    .select("id, stage")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!cur) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  const from = ((cur as { stage?: string }).stage ?? "new") as ConversationStage;

  // WB2 fix — do NOT set updated_at here: conversations.updated_at is the SLA/wait
  // clock that stuck-detection keys on for SYSTEM_HOLD + human-no-response alerts.
  // A label-only stage edit must not reset that clock (it could postpone/suppress a
  // safety alert). The conversations trigger (migration 0054) skips the updated_at
  // bump for a stage-only change, so persisting just `stage` leaves the clock intact;
  // any real activity still bumps it.
  const { data: updated, error } = await admin
    .from("conversations")
    .update({ stage })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .select("id, stage");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  // Stamp who/when via the existing audit trail (no extra columns).
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "conversation_stage_changed",
    entityType: "conversation",
    entityId: params.id,
    metadata: { from, to: stage },
  });

  return NextResponse.json({ ok: true, stage });
}
