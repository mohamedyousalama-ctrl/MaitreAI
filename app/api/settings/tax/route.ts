// ============================================================================
// MaitreAI — Tax/VAT settings route (Sprint 10) — SERVER ONLY
// Per-tenant tax mode + rate + registration no. GET any member; POST manager-only.
// Default inclusive (no behavior change); "added" turns VAT on.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  const { data } = await supabase.from("restaurants").select("tax_mode, tax_rate, tax_registration_no").eq("id", tenant.restaurantId).single();
  return NextResponse.json({
    taxMode: (data?.tax_mode as string) ?? "inclusive",
    taxRate: Number(data?.tax_rate ?? 0),
    taxRegNo: (data?.tax_registration_no as string | null) ?? "",
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: { tax_mode?: string; tax_rate?: number; tax_registration_no?: string | null } = {};
  if (body.taxMode === "inclusive" || body.taxMode === "added") patch.tax_mode = body.taxMode;
  if (typeof body.taxRate === "number" && body.taxRate >= 0 && body.taxRate <= 100) patch.tax_rate = body.taxRate;
  if (typeof body.taxRegNo === "string") patch.tax_registration_no = body.taxRegNo.trim() || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { error } = await supabase.from("restaurants").update(patch).eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
