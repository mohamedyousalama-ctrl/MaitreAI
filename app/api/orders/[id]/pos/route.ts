// ============================================================================
// MaitreAI — POS hand-off marker (WB1, Deyafa cutover) — SERVER ONLY.
// Records that a Kivo-confirmed order was re-entered into the Deyafa POS, so an
// order is visibly NOT done-for-the-kitchen until it's POS-entered. Any
// authenticated staff member (manager OR operation) may mark it — they're the
// one doing the entry. The actor + time are stamped SERVER-SIDE (never
// client-trusted); the Deyafa order # is captured as entered.
//
// pos_status is SEPARATE from order_status — this route NEVER touches the order's
// status, totals, payment, or COD. Transitions are validated server-side:
//   not_entered → entered → sent_to_kitchen   (no skipping, no going backward)
//
// Write via the service-role admin client (survives the M1.7 RLS lockdown),
// EXPLICITLY scoped to the authorized restaurant_id.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

type PosStatus = "not_entered" | "entered" | "sent_to_kitchen";

// Allowed source states for each target (idempotent re-marks allowed; no skip,
// no backward move). entered ⇐ {not_entered, entered}; sent ⇐ {entered, sent}.
const ALLOWED_FROM: Record<Exclude<PosStatus, "not_entered">, PosStatus[]> = {
  entered: ["not_entered", "entered"],
  sent_to_kitchen: ["entered", "sent_to_kitchen"],
};

// POS hand-off applies ONLY to a genuinely-confirmed order that needs to reach the
// kitchen. An unconfirmed/cancelled/test order must never be markable as "entered
// in Deyafa" (it isn't a real order the kitchen should get). Eligible = confirmed
// and beyond; ineligible = draft / pending_confirmation / pending_payment /
// cancelled / is_test. Allowlist (not denylist) so a new status never silently
// becomes eligible. The UI mirrors this set, but the SERVER is authoritative.
const POS_ELIGIBLE_STATUS = new Set<string>([
  "paid", "preparing", "ready", "out_for_delivery", "delivered",
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  // Any operator can record the POS entry (manager or operation) — they perform it.

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = body.status;
  if (target !== "entered" && target !== "sent_to_kitchen") {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 80) : null;

  // Read the order's REAL status + test flag + current pos_status (tenant-scoped),
  // to gate eligibility and validate the transition.
  const { data: cur, error: readErr } = await admin
    .from("orders")
    .select("id, order_status, is_test, pos_status, pos_entered_by, pos_entered_at")
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!cur) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  // Eligibility gate (the real bug): only a confirmed, non-test order may be marked
  // entered/sent. An unconfirmed/cancelled/test order is rejected — it must not
  // appear "entered in Deyafa" when it was never a real kitchen-bound order.
  const orderStatus = (cur as { order_status?: string }).order_status ?? "";
  const isTest = (cur as { is_test?: boolean | null }).is_test === true;
  if (isTest || !POS_ELIGIBLE_STATUS.has(orderStatus)) {
    return NextResponse.json({ error: "order_not_eligible", orderStatus, isTest }, { status: 409 });
  }

  const from = ((cur as { pos_status?: string }).pos_status ?? "not_entered") as PosStatus;
  if (!ALLOWED_FROM[target].includes(from)) {
    return NextResponse.json({ error: "invalid_transition", from, to: target }, { status: 409 });
  }

  // Build the patch. The actor/time are stamped server-side on first ENTRY and
  // preserved thereafter (first-entered wins); the reference updates if provided.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { pos_status: target, updated_at: now };
  if (reference !== null) patch.pos_reference = reference || null;
  if (target === "entered") {
    // Stamp who/when entered it — keep the original stamp if already entered.
    patch.pos_entered_by = (cur as { pos_entered_by?: string | null }).pos_entered_by ?? tenant.userId;
    patch.pos_entered_at = (cur as { pos_entered_at?: string | null }).pos_entered_at ?? now;
  }

  // ATOMIC transition (MO2 atomic-claim pattern): the UPDATE is conditional on the
  // pos_status we just validated (`from`). If a concurrent/stale write already
  // advanced it, this matches 0 rows and we return 409 — never a silent no-op and
  // never clobbering the first-entry stamp by writing over a changed state.
  const { data: updated, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .eq("pos_status", from)
    .select("id, pos_status, pos_reference, pos_entered_by, pos_entered_at");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated || updated.length === 0) {
    // The row existed at read time, so 0 rows here means pos_status changed
    // concurrently between our read and this conditional update.
    return NextResponse.json({ error: "pos_conflict" }, { status: 409 });
  }

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "order_pos_marked",
    entityType: "order",
    entityId: params.id,
    metadata: { from, to: target, reference },
  });

  return NextResponse.json({ ok: true, ...(updated[0] as Record<string, unknown>) });
}
