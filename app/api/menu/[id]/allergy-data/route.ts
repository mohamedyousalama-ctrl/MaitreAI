// ============================================================================
// MaitreAI — Two-axis menu allergy-data editor persistence (WO-COMPANION W2).
// SERVER ONLY, manager-gated, COMPANION-gated. The dashboard direct-write path
// (ruling A): an authenticated manager in the console IS the reviewer, so this
// writes directly + stamps — but a content EDIT to an axis CLEARS that axis's verify
// stamp, and a separate VERIFY action re-stamps it. Two axes, symmetric.
//
// DATA-ENTRY ONLY — never touches the gate, prompt, price/category/86, or any runtime
// safety behavior. DEPLOY-SAFE: axis-2 writes probe for the 0083 columns (42703) and
// return 409 "not_provisioned" rather than crashing before the migration is applied.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import {
  saveIngredientAxis, verifyIngredientAxis, savePrepAxis, verifyPrepAxis, type AxisWriteResult,
} from "@/lib/db/menu-allergy-data";

export const runtime = "nodejs";

// GET — the editor's initial state + the companion flag (so the UI gates on the
// server's authority, no client flag plumbing). Deploy-safe: select("*") tolerates a
// pre-0083 row (axis-2 fields simply absent → nulls).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const { data: rf } = await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle();
  const enabled = isFeatureExplicitlyEnabled("allergy_companion_mode", (rf?.feature_flags as Record<string, unknown> | null) ?? null);
  if (!enabled) return NextResponse.json({ enabled: false });
  const { data: row } = await admin.from("menu_items").select("*").eq("id", params.id).eq("restaurant_id", tenant.restaurantId).maybeSingle();
  if (!row) return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  const r = row as Record<string, unknown>;
  return NextResponse.json({
    enabled: true,
    ingredients: r.ingredients ?? [],
    allergens: r.allergens ?? [],
    ingredientVerifiedAt: r.allergens_reviewed_at ?? null,
    prepStatus: r.prep_status ?? null,
    crossContactRisks: r.cross_contact_risks ?? [],
    kitchenCanIsolate: r.kitchen_can_isolate ?? null,
    preparationNotes: r.preparation_notes ?? null,
    prepVerifiedAt: r.prep_verified_at ?? null,
  });
}

type Action = "save_ingredient" | "verify_ingredient" | "save_prep" | "verify_prep";
const ACTIONS: readonly Action[] = ["save_ingredient", "verify_ingredient", "save_prep", "verify_prep"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Two-axis allergy data entry is a kitchen safety confirmation → manager only.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // COMPANION-gated: OFF → the surface does not exist (flag-off byte-identical).
  const { data: rf } = await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle();
  if (!isFeatureExplicitlyEnabled("allergy_companion_mode", (rf?.feature_flags as Record<string, unknown> | null) ?? null)) {
    return NextResponse.json({ error: "feature_off" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  let res: AxisWriteResult;
  switch (action as Action) {
    case "save_ingredient":
      res = await saveIngredientAxis(admin, tenant.restaurantId, params.id, {
        ingredients: Array.isArray(body.ingredients) ? (body.ingredients as unknown[]).map(String) : undefined,
        allergens: Array.isArray(body.allergens) ? (body.allergens as unknown[]).map(String) : undefined,
      });
      break;
    case "verify_ingredient":
      res = await verifyIngredientAxis(admin, tenant.restaurantId, params.id, tenant.userId);
      break;
    case "save_prep":
      res = await savePrepAxis(admin, tenant.restaurantId, params.id, {
        prepStatus: body.prepStatus === undefined ? undefined : (body.prepStatus as string | null),
        crossContactRisks: Array.isArray(body.crossContactRisks) ? (body.crossContactRisks as unknown[]).map(String) : undefined,
        kitchenCanIsolate: body.kitchenCanIsolate === undefined ? undefined : (body.kitchenCanIsolate as string | null),
        preparationNotes: body.preparationNotes === undefined ? undefined : (body.preparationNotes as string | null),
      });
      break;
    case "verify_prep":
      res = await verifyPrepAxis(admin, tenant.restaurantId, params.id, tenant.userId);
      break;
  }

  if (res.columnsMissing) return NextResponse.json({ error: "not_provisioned" }, { status: 409 });
  if (!res.ok) return NextResponse.json({ error: res.error ?? "write_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
