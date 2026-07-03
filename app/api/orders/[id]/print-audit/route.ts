// ============================================================================
// MaitreAI — R3 Print-audit event (POST) — SERVER ONLY. Tenant-scoped, AUDITED.
// Records that a kitchen ticket / receipt was PRINTED for an order — the physical
// hand-off evidence that complements the digital pos_status. Any authenticated
// staff member may record it (they performed the print). This writes ONLY an
// append-only audit_events row; it never touches the order's status, totals, or
// pos_status. The actor is stamped server-side (never client-trusted).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

const PRINT_KINDS = new Set(["kitchen", "receipt"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? "").trim();
  if (!PRINT_KINDS.has(kind)) return NextResponse.json({ error: "bad_request", detail: "kind must be kitchen|receipt" }, { status: 400 });

  // Verify the order belongs to this tenant before recording an event against it.
  const { data: order, error: readErr } = await admin
    .from("orders").select("id, order_number").eq("id", params.id).eq("restaurant_id", tenant.restaurantId).maybeSingle();
  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
    action: "order_printed", entityType: "order", entityId: params.id,
    metadata: { kind, order_number: (order as { order_number?: string }).order_number ?? null },
  });
  return NextResponse.json({ ok: true, kind });
}
