// ============================================================================
// MaitreAI — audited "delivered without driver" override (R3) — SERVER ONLY.
// MANAGER-ONLY. Records a durable audit trace when a manager chooses to mark a
// delivery order delivered AFTER the driver-check FAILED (network/error) — a COD
// cash-attribution risk consciously accepted. This route ONLY writes the audit
// note (via the existing alert infra → system_alerts row = console banner + Q1
// WhatsApp). It does NOT perform the delivered transition or any COD capture —
// those stay on their existing paths; the client proceeds with them after this
// trace is written.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCriticalAlert } from "@/lib/alerts/record";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Manager-gated: only a manager may confirm a delivered-without-driver override.
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber : null;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

  await recordCriticalAlert(createAdminClient(), {
    type: "delivered_without_driver_override",
    restaurantId: tenant.restaurantId,
    conversationId,
    detail: `تم تسليم الطلب ${orderNumber ? `#${orderNumber} ` : ""}بدون مندوب بتأكيد المدير — فشل التحقق من المندوب. (خطر إسناد نقدية COD لغير مندوب)`,
    context: { orderId: params.id, orderNumber, actorUserId: tenant.userId, actorRole: tenant.role, reason: "driver_check_failed" },
  });

  return NextResponse.json({ ok: true });
}
