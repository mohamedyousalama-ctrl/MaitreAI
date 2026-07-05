// ============================================================================
// Kivo — WO-5: template registry SYNC from Meta WABA (SERVER ONLY, manager).
// POST: pull this tenant's templates from the Meta message_templates API and
// upsert name/language/category/status/quality into message_templates.
//
// DOCUMENTED MANUAL FALLBACK: template management needs a WhatsApp Business
// Account (WABA) id + access token. When either is absent, or the Graph call
// fails, this route does NOT error and does NOT touch existing rows — it returns
// { synced:false, fallback:"manual", reason } so the operator maintains the
// registry by hand via POST /api/settings/templates (same category-truth guard).
//
// CATEGORY-TRUTH LAW on sync: Meta is authoritative for status/quality, but if a
// synced template's CONTENT is promotional while Meta labels it utility/auth, we
// store it as 'marketing' anyway (never persist a promo-as-utility) and report it
// under `recategorized`.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readWhatsAppEnv, WHATSAPP_GRAPH_VERSION } from "@/lib/messaging/config";
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

// The WABA (business-account) id is a template-management credential distinct
// from phone_number_id. Read from env (no per-tenant column yet); absence → the
// documented manual fallback.
function wabaId(): string {
  return (process.env.WHATSAPP_WABA_ID ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "").trim();
}

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

  const token = readWhatsAppEnv().accessToken;
  const waba = wabaId();
  // ── MANUAL FALLBACK: credentials absent → no sync, no mutation, clear signal.
  if (!token || !waba) {
    return NextResponse.json({
      synced: false,
      fallback: "manual",
      reason: !token ? "access_token_missing" : "waba_id_missing",
      hint: "أضِف القوالب يدويًا عبر POST /api/settings/templates حتى تتوفّر بيانات اعتماد WABA.",
    });
  }

  // ── Fetch from Meta. Any transport/HTTP failure → manual fallback (no mutation).
  let payload: { data?: MetaTemplate[] };
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${waba}/message_templates?fields=name,language,category,status,quality_score,components&limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
