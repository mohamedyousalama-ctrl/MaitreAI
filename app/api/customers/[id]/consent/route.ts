// ============================================================================
// Kivo (KSA) — WO-PDPL-CONSENT: operator consent toggle (SERVER ONLY).
// MANAGER-ONLY: a customer's PDPL consent is a lawful-basis decision. Auth via
// requireTenant() + manager gate; WRITE via the service-role admin client,
// EXPLICITLY scoped to the authorized restaurant_id (recordConsent). Every change
// records an audit_events row (who/what/when) — source is always 'operator' here.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordConsent } from "@/lib/privacy/record-consent";
import { isValidConsentKind } from "@/lib/privacy/consent";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const granted = body.granted;
  if (!isValidConsentKind(kind) || typeof granted !== "boolean") {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  const res = await recordConsent(admin, {
    restaurantId: tenant.restaurantId,
    customerId: params.id,
    kind,
    granted,
    source: "operator",
  });
  if (!res.ok) return NextResponse.json({ error: "write_failed" }, { status: 500 });

  // Audit the lawful-basis change (best-effort; never blocks the write result).
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "consent_updated",
    entityType: "customer",
    entityId: params.id,
    metadata: { kind, granted, source: "operator" },
  });

  return NextResponse.json({ ok: true, kind, granted });
}
