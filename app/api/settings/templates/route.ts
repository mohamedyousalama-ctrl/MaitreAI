// ============================================================================
// Kivo — WO-5: template registry — list + MANUAL upsert (SERVER ONLY).
// GET  (any member): list this tenant's registered templates.
// POST (manager):    manually upsert a template row. Enforces the CATEGORY-TRUTH
//   LAW — a promotional body under a non-marketing category is REFUSED (422)
//   with the required category + the offending markers, so the author is told
//   the truth instead of silently storing a mislabeled template.
// The manual path is the documented fallback for when the Meta WABA sync isn't
// available (no WABA id / token) — operators maintain the registry by hand.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertTemplate, type TemplateCategory } from "@/lib/messaging/template-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES: TemplateCategory[] = ["utility", "marketing", "authentication"];

export async function GET() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await admin
    .from("message_templates")
    .select("name, language, variant, category, meta_status, quality_rating, body_text, last_synced_at, updated_at")
    .eq("restaurant_id", tenant.restaurantId)
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "db_error" }, { status: 503 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const category = String(body.category ?? "");
  if (!CATEGORIES.includes(category as TemplateCategory)) {
    return NextResponse.json({ error: "bad_category" }, { status: 400 });
  }

  const result = await upsertTemplate(admin, tenant.restaurantId, {
    name: String(body.name ?? ""),
    language: body.language != null ? String(body.language) : undefined,
    variant: body.variant != null ? String(body.variant) : undefined,
    category: category as TemplateCategory,
    bodyText: String(body.bodyText ?? ""),
    metaStatus: body.metaStatus === undefined ? undefined : (String(body.metaStatus) as never),
    qualityRating: body.qualityRating === undefined ? undefined : (String(body.qualityRating) as never),
  });

  if (!result.ok) {
    // CATEGORY-TRUTH LAW violation → 422 with the truth, not a silent store.
    if (result.error === "category_truth_violation") {
      return NextResponse.json(
        {
          error: "category_truth_violation",
          message: "المحتوى تسويقي (عرض/خصم/حثّ على الشراء) — لا يمكن تسجيله كـ utility. سجّله كـ marketing.",
          requiredCategory: result.requiredCategory,
          markers: result.markers,
        },
        { status: 422 }
      );
    }
    if (result.error === "name_required") return NextResponse.json({ error: "name_required" }, { status: 400 });
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, name: result.name, category: result.category });
}
