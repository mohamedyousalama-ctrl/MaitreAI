// ============================================================================
// MaitreAI — conversation internal STAFF note (WB-FIX-1) — SERVER ONLY.
// A staff-only private note on a conversation. INTERNAL: it is never sent to the
// customer and never read into Karim's prompt (the agent reads explicit columns
// and does not include staff_notes). Any authenticated staff member (manager OR
// operation) may set it — same posture as the other conversation controls.
// Distinct from handover_note (the return-to-Karim summary, which IS prompt-facing).
//
// Write via the service-role admin client, tenant-scoped. A staff_notes-only edit
// does NOT bump conversations.updated_at (the SLA/wait clock) — the 0056 trigger
// masks it — so an internal note never postpones a stuck/safety alert.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/db/audit";

export const runtime = "nodejs";

const MAX_NOTE = 2000;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.note !== "string") return NextResponse.json({ error: "bad_params" }, { status: 400 });
  // Empty string clears the note. Length-bounded; stored as data only.
  const note = body.note.trim().slice(0, MAX_NOTE) || null;

  const { data: updated, error } = await admin
    .from("conversations")
    .update({ staff_notes: note })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId)
    .select("id");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });
  if (!updated || updated.length === 0) return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });

  // Who/when trail via the existing audit table (no extra columns; note text not
  // duplicated into the audit metadata — only that it was edited + length).
  await recordAuditEvent(admin, {
    restaurantId: tenant.restaurantId,
    userId: tenant.userId,
    role: tenant.role,
    action: "conversation_note_edited",
    entityType: "conversation",
    entityId: params.id,
    metadata: { cleared: note === null, length: note?.length ?? 0 },
  });

  return NextResponse.json({ ok: true });
}
