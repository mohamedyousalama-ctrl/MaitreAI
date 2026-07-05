// ============================================================================
// Kivo — WO-5: template registry SYNC from Meta WABA (SERVER ONLY, manager).
// POST: pull this tenant's templates from the Meta message_templates API and
// upsert name/language/category/status/quality into message_templates.
//
// PER-TENANT CREDS: template management uses THIS tenant's own WhatsApp Business
// Account (WABA) id + decrypted access token (restaurants.wa_waba_id /
// wa_access_token_enc, resolved via resolveTenantTemplateCreds). We deliberately
// do NOT fall back to a global-env WABA — that would fetch another account's
// templates and upsert them under this tenant's restaurant_id (cross-tenant
// contamination). No usable per-tenant creds ⇒ the documented manual fallback.
//
// DOCUMENTED MANUAL FALLBACK: when the tenant has no usable WABA creds, or the
// Graph call fails, this route does NOT error and does NOT touch existing rows —
// it returns { synced:false, fallback:"manual", reason } so the operator
// maintains the registry by hand via POST /api/settings/templates (same guard).
//
// CATEGORY-TRUTH LAW on sync: Meta is authoritative for status/quality, but if a
// synced template's CONTENT is promotional while Meta labels it utility/auth, we
// store it as 'marketing' anyway (never persist a promo-as-utility) and report it
// under `recategorized`.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_GRAPH_VERSION } from "@/lib/messaging/config";
import { resolveTenantTemplateCreds } from "@/lib/db/restaurants";
import {
  assertCategoryTruth,
  mapMetaCategory,
  mapMetaStatus,
  mapQualityRating,
  upsertTemplate,
  type TemplateCategory,
} from "@/lib/messaging/template-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_TIMEOUT_MS = 15000;

interface MetaTemplate {
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  quality_score?: { score?: string } | null;
  components?: Array<{ type?: string; text?: string }>;
}

function bodyOf(t: MetaTemplate): string {
  const body = (t.components ?? []).find((c) => String(c.type).toUpperCase() === "BODY");
  return String(body?.text ?? "");
}

export async function POST() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // ── PER-TENANT creds only. No usable WABA id / token ⇒ manual fallback.
  const creds = await resolveTenantTemplateCreds(admin, tenant.restaurantId);
  if (!creds) {
    return NextResponse.json({
      synced: false,
      fallback: "manual",
      reason: "waba_not_configured",
      hint: "اربط رقم واتساب المطعم (WABA) أو أضِف القوالب يدويًا عبر POST /api/settings/templates.",
    });
  }

  // ── Fetch this tenant's templates from Meta with THIS tenant's WABA + token.
  //    Any transport/HTTP failure → manual fallback (no mutation).
  let payload: { data?: MetaTemplate[] };
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${creds.wabaId}/message_templates?fields=name,language,category,status,quality_score,components&limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    if (!res.ok) {
      return NextResponse.json({ synced: false, fallback: "manual", reason: "meta_api_error", status: res.status });
    }
    payload = (await res.json()) as { data?: MetaTemplate[] };
  } catch {
    return NextResponse.json({ synced: false, fallback: "manual", reason: "meta_unreachable" });
  }

  const templates = Array.isArray(payload.data) ? payload.data : [];
  let upserted = 0;
  const recategorized: string[] = [];
  const failed: string[] = [];

  for (const t of templates) {
    const name = String(t.name ?? "").trim();
    if (!name) continue;
    const bodyText = bodyOf(t);
    let category: TemplateCategory = mapMetaCategory(t.category);
    // LAW: promotional content can never be stored utility/auth — coerce + report.
    if (!assertCategoryTruth(category, name, bodyText).ok) {
      category = "marketing";
      recategorized.push(name);
    }
    const r = await upsertTemplate(admin, tenant.restaurantId, {
      name,
      language: t.language ? String(t.language) : undefined,
      category,
      bodyText,
      metaStatus: mapMetaStatus(t.status),
      qualityRating: mapQualityRating(t.quality_score?.score),
      fromSync: true,
    });
    if (r.ok) upserted++;
    else failed.push(name);
  }

  return NextResponse.json({
    synced: true,
    count: templates.length,
    upserted,
    recategorized,
    ...(failed.length ? { failed } : {}),
  });
}
