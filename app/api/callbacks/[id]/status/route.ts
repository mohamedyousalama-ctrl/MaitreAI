// ============================================================================
// WO-CALLBACK — update a callback's status (console) — WRITE, AUDITED.
// Manager OR operator (both work the floor). Validated against the legal status
// machine (illegal transition → 409, never a half-write); tenant-scoped on id AND
// restaurant_id; every change records an audit event (WHO moved WHAT to WHERE).
// ============================================================================
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateCallbackStatus } from "@/lib/db/callback-requests";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager" && tenant.role !== "operation") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = String(body.status ?? "");

  // Resolve the actor's members.id (handled_by references members) from the session
  // user + tenant — never client-supplied. Null if not found (audit still records userId).
  const { data: mem } = await admin
    .from("members")
    .select("id")
    .eq("user_id", tenant.userId)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  const memberId = (mem as { id?: string } | null)?.id ?? null;

  const result = await updateCallbackStatus(admin, {
    restaurantId: tenant.restaurantId,
    id: params.id,
    status,
    handledBy: memberId,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "callback_status_updated",
    entityType: "callback_request",
    entityId: params.id,
    metadata: { status: result.row.status },
  });
  return NextResponse.json({ ok: true, callback: result.row });
}
