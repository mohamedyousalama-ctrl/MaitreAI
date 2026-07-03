// ============================================================================
// Kivo — Kitchen-ticket PRINT AUDIT (WO step 2) — SERVER ONLY
// POST /api/orders/[id]/ticket-print — records an `order_events` row of
// type='ticket_printed' when the operator prints a kitchen ticket. Audit only:
// it writes NO money and mutates no order/payment state.
//
// FLAG-GATED: `kitchen_ticket` is checked FIRST (default-OFF for every tenant).
// Flag OFF ⇒ 410 and NOTHING is written — the whole surface stays inert. The
// order is verified to belong to the caller's tenant before any write (tenant
// isolation; the same order id under another tenant is a 404 here).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // Flag FIRST — off ⇒ the feature does not exist for this tenant.
  const { data: rest, error: flagErr } = await admin
    .from("restaurants")
    .select("feature_flags")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  if (flagErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  const flags = (rest?.feature_flags as Record<string, unknown> | null) ?? null;
  if (!isFeatureExplicitlyEnabled("kitchen_ticket", flags)) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 410 });
  }

  // Tenant-scoped existence check — a cross-tenant order id is a 404, never a write.
  const { data: order, error: ordErr } = await admin
    .from("orders")
    .select("id")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (ordErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Print width is operator-chosen (58mm | 80mm); recorded for audit only.
  let width = "80mm";
  try {
    const body = (await req.json()) as { width?: unknown };
    if (body && (body.width === "58mm" || body.width === "80mm")) width = body.width;
  } catch {
    /* no/invalid body → default width; the audit still records the print */
  }

  const { error: insErr } = await admin.from("order_events").insert({
    restaurant_id: tenant.restaurantId,
    order_id: params.id,
    type: "ticket_printed",
    label: "طُبعت تذكرة المطبخ",
    actor: "human",
    meta: { width, by: tenant.role ?? "operator" },
  });
  if (insErr) return NextResponse.json({ error: "audit_write_failed" }, { status: 503 });

  return NextResponse.json({ ok: true });
}
