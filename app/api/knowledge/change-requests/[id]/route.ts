// ============================================================================
// MaitreAI — Item 10 (Approvals): knowledge change-request TRANSITION + APPLY.
// SERVER ONLY, MANAGER-ONLY, AUDITED. The signing folder's decision endpoint.
//
// action ∈ { approve, reject, apply }, gated by the pure state machine (nextStatus):
//   approve: proposed → approved     reject: proposed → rejected
//   apply:   approved → applied  (idempotent: applied → applied is a NO-OP, no 2nd write)
// Any illegal transition is a 409 — the pipeline can only move forward, once.
//
// APPLY is the ONLY place a truth table is touched, and it does so ONLY through the
// EXISTING write helpers the console already uses (updateMenuItemDb / updateDeliveryAreaDb
// / updatePoliciesDb) — never a new raw write. The apply-path trail:
//   1) tenancy PRE-CHECK — the target row must exist AND belong to this tenant (the
//      helpers are keyed by id only; this + RLS closes the cross-tenant gap).
//   2) WRITE through the existing helper, using the RLS-guarded member client (RLS
//      is_manager_of enforces manager + tenancy at the DB layer too).
//   3) RE-READ verification — the helpers swallow errors and an RLS 0-row denial looks
//      like success, so we re-read the field and confirm it now equals the applied
//      value. Only an exact match marks the request 'applied'.
// A failed apply leaves the request in 'approved' with an honest apply_error — never
// half-applied; the manager can retry. Every transition emits an audit event.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { recordAuditEvent } from "@/lib/db/audit";
import { nextStatus, buildPatch, isAction, type CrTargetType } from "@/lib/knowledge/change-request";
import { updateMenuItemDb, updateDeliveryAreaDb, updatePoliciesDb } from "@/lib/db/brain";
import { saveIngredientAxis } from "@/lib/db/menu-allergy-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CrRow {
  id: string; restaurant_id: string; status: "proposed" | "approved" | "rejected" | "applied";
  target_type: CrTargetType; target_id: string | null; field: string; new_value: unknown;
}

/** Re-read the target field and confirm it now equals `patch` — the apply's proof the
 *  write actually landed (helpers swallow errors + RLS 0-row denials). Exact match only. */
async function verifyApplied(s: SupabaseClient, rid: string, targetType: CrTargetType, targetId: string | null, field: string, patch: Record<string, unknown>): Promise<boolean> {
  if (targetType === "menu_item") {
    const { data } = await s.from("menu_items").select("price, description, allergens, ingredients").eq("id", targetId).eq("restaurant_id", rid).maybeSingle();
    if (!data) return false;
    const d = data as { price: number; description: string; allergens?: string[] | null; ingredients?: string[] | null };
    if (field === "price") return Number(d.price) === patch.price;
    if (field === "description") return d.description === patch.description;
    // WO-COMPANION-W2: array fields — order-insensitive equality.
    if (field === "allergens" || field === "ingredients") {
      const got = [...((d[field] as string[] | null) ?? [])].sort();
      const want = [...((patch[field] as string[] | undefined) ?? [])].sort();
      return got.length === want.length && got.every((x, i) => x === want[i]);
    }
    return false;
  }
  if (targetType === "delivery_zone") {
    const { data } = await s.from("delivery_zones").select("fee, name, active").eq("id", targetId).eq("restaurant_id", rid).maybeSingle();
    if (!data) return false;
    const d = data as { fee: number; name: string; active: boolean };
    if (field === "deliveryFee") return Number(d.fee) === patch.deliveryFee;
    if (field === "name") return d.name === patch.name;
    if (field === "active") return d.active === patch.active;
    return false;
  }
  // policy — the free-text row for this key must now equal the applied text.
  const { data } = await s.from("policies").select("text").eq("restaurant_id", rid).eq("key", field).maybeSingle();
  return !!data && (data as { text: string }).text === patch[field];
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden_role" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const id = params.id;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  if (!isAction(action)) return NextResponse.json({ error: "bad_request", detail: "invalid action" }, { status: 400 });

  // The request, tenant-scoped (a manager can only act on their own tenant's rows).
  const { data: rowRaw } = await admin
    .from("knowledge_change_requests")
    .select("id, restaurant_id, status, target_type, target_id, field, new_value")
    .eq("id", id).eq("restaurant_id", tenant.restaurantId).maybeSingle();
  if (!rowRaw) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const row = rowRaw as CrRow;

  const trans = nextStatus(row.status, action);
  if (!trans.ok) return NextResponse.json({ error: "illegal_transition", detail: trans.reason }, { status: 409 });

  const memberId = ((await admin.from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", tenant.restaurantId).maybeSingle()).data as { id?: string } | null)?.id ?? null;
  const now = new Date().toISOString();

  // ---- APPLY ----
  if (action === "apply") {
    if (trans.noop) return NextResponse.json({ ok: true, status: "applied", noop: true }); // idempotent — already applied

    const built = buildPatch(row.target_type, row.field, row.new_value);
    if (!built.ok) { // defense — was validated at create; refuse, stay approved
      await admin.from("knowledge_change_requests").update({ apply_error: built.reason.slice(0, 300) }).eq("id", id);
      return NextResponse.json({ error: "unappliable", detail: built.reason }, { status: 400 });
    }

    try {
      if (row.target_type === "menu_item") {
        const { data: exists } = await supabase.from("menu_items").select("id").eq("id", row.target_id).eq("restaurant_id", tenant.restaurantId).maybeSingle();
        if (!exists) throw new Error("target menu item not found for this tenant");
        // WO-COMPANION-W2: an allergen/ingredient apply is a SAFETY content change — route
        // it through the axis writer so the axis-1 verify stamp is CLEARED (ruling A: a
        // stamp can never outlive a content change). Other fields keep the existing helper.
        if (row.field === "allergens" || row.field === "ingredients") {
          const res = await saveIngredientAxis(supabase, tenant.restaurantId, String(row.target_id), built.patch as { ingredients?: string[]; allergens?: string[] });
          if (!res.ok) throw new Error(res.error || "ingredient-axis write failed");
        } else {
          await updateMenuItemDb(supabase, tenant.restaurantId, String(row.target_id), built.patch);
        }
      } else if (row.target_type === "delivery_zone") {
        const { data: exists } = await supabase.from("delivery_zones").select("id").eq("id", row.target_id).eq("restaurant_id", tenant.restaurantId).maybeSingle();
        if (!exists) throw new Error("target delivery zone not found for this tenant");
        await updateDeliveryAreaDb(supabase, String(row.target_id), built.patch);
      } else {
        await updatePoliciesDb(supabase, tenant.restaurantId, built.patch);
      }
      const confirmed = await verifyApplied(supabase, tenant.restaurantId, row.target_type, row.target_id, row.field, built.patch);
      if (!confirmed) throw new Error("post-write verification failed — the value did not change");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("knowledge_change_requests").update({ apply_error: msg.slice(0, 300) }).eq("id", id); // stays 'approved'
      return NextResponse.json({ error: "apply_failed", detail: msg }, { status: 502 });
    }

    await admin.from("knowledge_change_requests").update({ status: "applied", applied_by: memberId, applied_at: now, apply_error: null }).eq("id", id);
    await recordAuditEvent(admin, {
      restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
      action: "knowledge_change_applied", entityType: "restaurant", entityId: tenant.restaurantId,
      memberId, metadata: { request_id: id, target_type: row.target_type, field: row.field },
    });
    return NextResponse.json({ ok: true, status: "applied" });
  }

  // ---- APPROVE / REJECT ----
  const reason = action === "reject" ? (String(body.reason ?? "").trim().slice(0, 500) || null) : null;
  const { error } = await admin.from("knowledge_change_requests")
    .update({ status: trans.to, reviewed_by: memberId, reviewed_at: now, reason }).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "knowledge_change_reviewed", entityType: "restaurant", entityId: tenant.restaurantId,
    memberId, metadata: { request_id: id, decision: trans.to },
  });
  return NextResponse.json({ ok: true, status: trans.to });
}
