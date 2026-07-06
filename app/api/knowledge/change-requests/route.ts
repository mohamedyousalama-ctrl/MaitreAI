// ============================================================================
// MaitreAI — Item 10 (Approvals): knowledge change-requests — LIST + CREATE.
// SERVER ONLY. The write surface for the 0071 signing-folder table.
//
//  • GET  — lists this tenant's change-requests (member read; RLS + explicit
//           restaurant_id scope). Powers the Approvals folder.
//  • POST — a manager FILES a proposal from Knowledge's GATED tier. The proposal is
//           validated through the SAME allowlist the apply step uses (buildPatch), so
//           an unappliable/forged change can never even be filed. status starts
//           'proposed'; nothing touches a truth table here. Audited.
//
// All writes go through the service-role admin client (the table is service-role-write,
// mirroring standing_instructions); the auth client is used only for the member-scoped
// read.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { isTargetType, buildPatch } from "@/lib/knowledge/change-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = "id, status, target_type, target_id, target_label, field, old_value, new_value, requested_by, created_at, reviewed_by, reviewed_at, applied_by, applied_at, reason, apply_error";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data, error } = await supabase
    .from("knowledge_change_requests")
    .select(SELECT)
    .eq("restaurant_id", tenant.restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const targetType = body.targetType;
  const field = String(body.field ?? "");
  const targetId = body.targetId != null ? String(body.targetId) : null;
  const targetLabel = body.targetLabel != null ? String(body.targetLabel).slice(0, 200) : null;

  if (!isTargetType(targetType)) return NextResponse.json({ error: "bad_request", detail: "invalid targetType" }, { status: 400 });
  // Validate the proposed value through the SAME allowlist the apply step enforces —
  // a change that could never be applied is never filed.
  const built = buildPatch(targetType, field, body.newValue);
  if (!built.ok) return NextResponse.json({ error: "bad_request", detail: built.reason }, { status: 400 });
  // menu_item / delivery_zone edits must name their target row.
  if (targetType !== "policy" && !targetId) return NextResponse.json({ error: "bad_request", detail: "missing targetId" }, { status: 400 });

  const memberId = (await admin.from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", tenant.restaurantId).maybeSingle()).data as { id?: string } | null;

  const { data: row, error } = await admin
    .from("knowledge_change_requests")
    .insert({
      restaurant_id: tenant.restaurantId,
      status: "proposed",
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      field,
      old_value: body.oldValue ?? null,
      new_value: body.newValue,
      requested_by: memberId?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "create_failed", detail: error.message }, { status: 502 });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "knowledge_change_proposed", entityType: "restaurant", entityId: tenant.restaurantId,
    memberId: memberId?.id ?? null, metadata: { request_id: (row as { id: string }).id, target_type: targetType, field },
  });
  return NextResponse.json({ ok: true, id: (row as { id: string }).id });
}
