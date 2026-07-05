// ============================================================================
// MaitreAI — Item 13: knowledge counts (GET) — SERVER ONLY, READ. Tenant-scoped.
// Real, auditable counts behind the «صحة الذاكرة» surface: items total/priced,
// zones, FAQs, last-taught, plus a reconciliation report (have/total per headline)
// so a fraction shown in the UI is always backed by real rows — never a derived
// guess like «47/129» / «2/25» with no source. Read via the admin client
// EXPLICITLY scoped to the tenant; computed by the pure lib/knowledge-counts.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeKnowledgeCounts, type CountItem, type CountFlagged } from "@/lib/knowledge-counts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const rid = tenant.restaurantId;
  const [itemsRes, zonesRes, faqsRes] = await Promise.all([
    admin.from("menu_items").select("price, updated_at").eq("restaurant_id", rid),
    admin.from("delivery_zones").select("active, updated_at").eq("restaurant_id", rid),
    admin.from("faqs").select("active, updated_at").eq("restaurant_id", rid),
  ]);
  if (itemsRes.error || zonesRes.error || faqsRes.error) {
    const detail = itemsRes.error?.message ?? zonesRes.error?.message ?? faqsRes.error?.message;
    return NextResponse.json({ error: "read_failed", detail }, { status: 502 });
  }

  const counts = computeKnowledgeCounts({
    items: (itemsRes.data ?? []) as CountItem[],
    zones: (zonesRes.data ?? []) as CountFlagged[],
    faqs: (faqsRes.data ?? []) as CountFlagged[],
  });
  return NextResponse.json(counts);
}
