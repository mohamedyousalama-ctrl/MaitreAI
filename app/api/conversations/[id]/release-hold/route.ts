// ============================================================================
// MaitreAI — deliberate safety-hold release — SERVER ONLY.
// A held conversation may return to Karim only through an authenticated member
// action. This route keeps the resume route as a fail-safe bail (#87) and moves
// the actual is_safety_hold=false clear out of the browser into a service-role
// tenant-scoped server write, ready for the future member-write RLS lockdown.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";
import { isLegalTransition, type OwnershipState } from "@/lib/db/ownership";

export const runtime = "nodejs";

const NOTE_MAX = 1000;

function cleanNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const note = input.trim();
  return note ? note.slice(0, NOTE_MAX) : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const note = cleanNote(body.note);

  // Read by id first, then compare restaurant_id before any write. Do not trust
  // the route param alone; service-role can see every tenant.
  const { data: conv, error: readErr } = await admin
    .from("conversations")
    .select("id, restaurant_id, ownership_state, is_safety_hold")
    .eq("id", params.id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: "read_failed" }, { status: 502 });
  if (!conv) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  const row = conv as {
    restaurant_id: string | null;
    ownership_state: OwnershipState | null;
    is_safety_hold: boolean | null;
  };
  if (row.restaurant_id !== tenant.restaurantId) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const from = row.ownership_state;
  const wasSafetyHeld = from === "SYSTEM_HOLD" || row.is_safety_hold === true;
  if (!wasSafetyHeld) {
    return NextResponse.json({ error: "not_safety_hold" }, { status: 409 });
  }
  if (!isLegalTransition(from, "AI_ACTIVE")) {
    return NextResponse.json({ error: "illegal_transition" }, { status: 409 });
  }

  const { data: updated, error: updateErr } = await admin
    .from("conversations")
    .update({
      owner: "ai",
      status: "AI نشط",
      escalation_reason: null,
      handover_note: note,
      is_safety_hold: false,
      ownership_state: "AI_ACTIVE",
      assigned_member_id: null,
    })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .select("id")
    .maybeSingle();
  if (updateErr) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "conversation_returned",
    entityType: "conversation",
    entityId: params.id,
    metadata: {
      release: "safety_hold",
      note,
      previousOwnershipState: from,
      previousIsSafetyHold: row.is_safety_hold === true,
    },
  });

  return NextResponse.json({ ok: true, ownershipState: "AI_ACTIVE", isSafetyHold: false });
}
