// ============================================================================
// MaitreAI — allergen review stamp (WB-ALLERGEN-3) — SERVER ONLY, manager-gated.
// A manager confirms "I've verified this dish's allergens" (including confirming
// it has NONE → reviewed with an empty array = kitchen-confirms-none). Persists
// the canonical allergen keys AND stamps allergens_reviewed_at = now() +
// allergens_reviewed_by = the authenticated user (server-resolved, never client-
// trusted). DATA-ENTRY ONLY — does not touch the gate, prompt, price/category/86,
// or any runtime safety behavior.
//
// Allergen values are validated against the controlled vocabulary (WB-ALLERGEN-1);
// anything not a canonical key is rejected so only clean keys ever reach the column.
// Write via the service-role admin client, EXPLICITLY scoped to the tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidAllergenKey } from "@/lib/ai/allergen-vocab";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Allergen review is a manager judgement (it's a kitchen safety confirmation).
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = Array.isArray(body.allergens) ? body.allergens : null;
  if (!raw) return NextResponse.json({ error: "bad_params" }, { status: 400 });

  // Validate against the controlled vocabulary — reject any non-canonical value
  // (the editor only sends canonical keys; this is the server-side guard).
  const seen = new Set<string>();
  for (const v of raw) {
    if (!isValidAllergenKey(v)) {
      return NextResponse.json({ error: "invalid_allergen", value: typeof v === "string" ? v : null }, { status: 400 });
    }
    seen.add(v);
  }
  const allergens = [...seen];

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("menu_items")
    .update({
      allergens,
      allergens_reviewed_at: now,
      allergens_reviewed_by: tenant.userId,
      updated_at: now,
    })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .select("id");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, allergens, allergensReviewedAt: now });
}
