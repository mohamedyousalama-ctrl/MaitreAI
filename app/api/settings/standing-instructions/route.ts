// ============================================================================
// MaitreAI — Item 14: standing-instructions authoring — SERVER ONLY, MANAGER-ONLY.
// The write surface for the 0065 governance table. Lifecycle matches the runtime
// injection gate (customer-turn: active=true AND approved_by NOT NULL AND
// retired_at NULL):
//   • create  → a DRAFT (active=false, approved_by=null) — never injects yet.
//   • publish → approve + activate together (approved_by=<manager>, active=true,
//               retired_at=null) — now it injects. Records WHO approved.
//   • retire  → active=false, retired_at=now — retire-not-delete (history kept).
// Every action writes an audit row. GET lists all rows (draft/live/retired).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { STANDING_MAX } from "@/lib/ai/standing-instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveMemberId(admin: ReturnType<typeof createAdminClient>, userId: string, restaurantId: string): Promise<string | null> {
  if (!admin) return null;
  const { data } = await admin.from("members").select("id").eq("user_id", userId).eq("restaurant_id", restaurantId).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });

  const { data, error } = await supabase
    .from("standing_instructions")
    .select("id, version, body, active, approved_by, created_by, created_at, retired_at")
    .eq("restaurant_id", tenant.restaurantId)
    .order("version", { ascending: false });
  if (error) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  return NextResponse.json({ instructions: data ?? [] });
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
  const rid = tenant.restaurantId;
  const memberId = await resolveMemberId(admin, tenant.userId, rid);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "create");

  if (action === "create") {
    const text = String(body.body ?? "").trim();
    if (!text || text.length > STANDING_MAX) {
      return NextResponse.json({ error: "bad_request", detail: `body 1..${STANDING_MAX} chars` }, { status: 400 });
    }
    // Next version for this tenant (max+1). A new instruction is a DRAFT.
    const { data: top } = await admin
      .from("standing_instructions").select("version").eq("restaurant_id", rid).order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (((top as { version?: number } | null)?.version) ?? 0) + 1;
    const { data: row, error } = await admin
      .from("standing_instructions")
      .insert({ restaurant_id: rid, version: nextVersion, body: text, active: false, created_by: memberId })
      .select("id, version")
      .single();
    if (error) return NextResponse.json({ error: "create_failed", detail: error.message }, { status: 502 });
    await recordAuditEvent(admin, {
      restaurantId: rid, userId: tenant.userId, role: tenant.role,
      action: "standing_instruction_created", entityType: "restaurant", entityId: rid,
      memberId, metadata: { instruction_id: (row as { id: string }).id, version: (row as { version: number }).version },
    });
    return NextResponse.json({ ok: true, id: (row as { id: string }).id, version: (row as { version: number }).version, active: false });
  }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "bad_request", detail: "missing id" }, { status: 400 });

  if (action === "publish") {
    // Publish REQUIRES a resolvable approver: activating with approved_by=null would
    // create an "active but unapproved" row that the runtime gate silently drops
    // (active AND approved_by NOT NULL). Fail loudly instead of a ghost-live row.
    if (!memberId) return NextResponse.json({ error: "no_member", detail: "approver could not be resolved" }, { status: 403 });
    // Approve + activate together, scoped to this tenant. Records the approver.
    const { data: updated, error } = await admin
      .from("standing_instructions")
      .update({ active: true, approved_by: memberId, retired_at: null })
      .eq("id", id).eq("restaurant_id", rid)
      .select("id");
    if (error) return NextResponse.json({ error: "publish_failed", detail: error.message }, { status: 502 });
    if (!updated || updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await recordAuditEvent(admin, {
      restaurantId: rid, userId: tenant.userId, role: tenant.role,
      action: "standing_instruction_published", entityType: "restaurant", entityId: rid,
      memberId, metadata: { instruction_id: id, approved_by: memberId },
    });
    return NextResponse.json({ ok: true, id, active: true });
  }

  if (action === "retire") {
    // Retire-not-delete: deactivate + stamp retired_at (history survives).
    const { data: updated, error } = await admin
      .from("standing_instructions")
      .update({ active: false, retired_at: new Date().toISOString() })
      .eq("id", id).eq("restaurant_id", rid)
      .select("id");
    if (error) return NextResponse.json({ error: "retire_failed", detail: error.message }, { status: 502 });
    if (!updated || updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await recordAuditEvent(admin, {
      restaurantId: rid, userId: tenant.userId, role: tenant.role,
      action: "standing_instruction_retired", entityType: "restaurant", entityId: rid,
      memberId, metadata: { instruction_id: id },
    });
    return NextResponse.json({ ok: true, id, active: false });
  }

  return NextResponse.json({ error: "bad_request", detail: "unknown action" }, { status: 400 });
}
