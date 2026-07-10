// ============================================================================
// MaitreAI — Two-axis allergy coverage endpoint (WO-COMPANION W2). SERVER ONLY.
// Powers the onboarding nudge («٨ من ١٨ صنف مؤكّدة المكونات»). COMPANION-gated: OFF →
// { enabled: false } so the onboarding meter renders nothing (page byte-identical).
// DEPLOY-SAFE: menu_items via select("*") tolerates pre-0083 rows (prep stamp absent).
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { computeAllergyCoverage, coverageLabelsAr } from "@/lib/onboarding/allergy-coverage";
import type { MenuItem } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data: rf } = await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle();
  if (!isFeatureExplicitlyEnabled("allergy_companion_mode", (rf?.feature_flags as Record<string, unknown> | null) ?? null)) {
    return NextResponse.json({ enabled: false });
  }

  const { data: rows } = await admin.from("menu_items").select("*").eq("restaurant_id", tenant.restaurantId);
  // Map only the fields the coverage helper reads (deploy-safe: missing 0083 cols → null).
  const items = ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
    available: r.available !== false,
    allergensReviewedAt: (r.allergens_reviewed_at as string | null) ?? null,
    prepVerifiedAt: (r.prep_verified_at as string | null) ?? null,
  })) as unknown as MenuItem[];

  const coverage = computeAllergyCoverage(items);
  return NextResponse.json({ enabled: true, coverage, labels: coverageLabelsAr(coverage) });
}
