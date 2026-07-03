// ============================================================================
// MaitreAI — Send-receipt route (Sprint 9, S9-3) — SERVER ONLY
// Operator-triggered (and order-confirm-triggered) send of the receipt PNG to
// the customer over WhatsApp. Session-authenticated + RLS-scoped to the tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { sendReceiptToCustomer } from "@/lib/messaging/send-receipt";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";
import { recordAuditEvent } from "@/lib/db/audit";
import { resolveMemberNames } from "@/lib/db/member-names";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // R6 — Attribution Law: resolve the acting member so the receipt message it
  // authors is stamped with sent_by_member_id. Server-resolved from the session.
  const credsAdmin = createAdminClient();
  let memberId: string | null = null;
  if (credsAdmin) {
    const { data: mem } = await credsAdmin
      .from("members").select("id").eq("user_id", tenant.userId).eq("restaurant_id", tenant.restaurantId).maybeSingle();
    memberId = (mem as { id?: string } | null)?.id ?? null;
  }

  // DRYRUN-2 (F1): send the receipt from the TENANT's own WhatsApp number when
  // configured; env fallback (null override) when unconfigured → byte-identical
  // to today. The member client still does the RLS-scoped reads/writes inside.
  const res = credsAdmin
    ? await runWithTenantWhatsAppCreds(credsAdmin, tenant.restaurantId, () => sendReceiptToCustomer(supabase, params.id, memberId))
    : await sendReceiptToCustomer(supabase, params.id, memberId);

  // R6 — outbound authorship audit (member name) for a real send.
  if (res.status === "sent" && memberId && credsAdmin) {
    const names = await resolveMemberNames(credsAdmin, [memberId]);
    await recordAuditEvent(credsAdmin, {
      restaurantId: tenant.restaurantId, userId: tenant.userId, role: tenant.role,
      action: "receipt_sent", entityType: "order", entityId: params.id,
      memberId, metadata: { member_name: names.get(memberId) ?? null },
    });
  }

  const ok = res.status === "sent" || res.status === "skipped";
  return NextResponse.json(res, { status: ok ? 200 : res.status === "order_not_found" ? 404 : 502 });
}
