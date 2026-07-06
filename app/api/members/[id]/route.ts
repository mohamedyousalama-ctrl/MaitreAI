// ============================================================================
// MaitreAI — UI1 member role change (manager ↔ operation) — SERVER ONLY.
// Manager-gated (tenant.role !== "manager" → 403) AND tenant-scoped (the target
// member must belong to the actor's restaurant — verified before any write). Role
// is whitelisted server-side (manager|operation only). RLS already grants managers
// member-write; this uses it (no policy change).
//
// CRITICAL GUARD — last-manager / self-lockout: demoting the LAST remaining
// manager is refused (409), so a tenant can never be locked out of management.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

const ROLES = new Set(["manager", "operation"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const role = String(body.role ?? "");
  if (!ROLES.has(role)) return NextResponse.json({ error: "bad_role" }, { status: 400 });

  // Tenant-scoped: the target member must belong to the actor's restaurant.
  const { data: target } = await supabase
    .from("members")
    .select("id, role")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const current = (target as { role: string }).role;

  // No-op fast path.
  if (current === role) return NextResponse.json({ ok: true, role });

  // CRITICAL GUARD — refuse to demote the last manager (covers self-lockout: the
  // actor is a manager, so if they are the only one, the count is 1 → refused).
  if (current === "manager" && role === "operation") {
    const { count } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", tenant.restaurantId)
      .eq("role", "manager");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "last_manager", message: "لازم يفضل مدير واحد على الأقل" }, { status: 409 });
    }
  }

  const { error } = await supabase
    .from("members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });

  // Attribution law — a role change is a mutating action, so it's stamped WHO did it.
  const admin = createAdminClient();
  if (admin) {
    await recordAuditEvent(admin, {
      restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
      action: "member_role_changed", entityType: "restaurant", entityId: tenant.restaurantId,
      metadata: { member_id: params.id, from: current, to: role },
    });
  }

  return NextResponse.json({ ok: true, role });
}
