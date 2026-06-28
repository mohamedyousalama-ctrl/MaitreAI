// ============================================================================
// MaitreAI — conversation named-ownership stamp (MO1) — SERVER ONLY.
// On human takeover the acting member is stamped onto the conversation
// (assigned_member_id); on return-to-AI / close it is cleared. The acting member
// is resolved AUTHORITATIVELY from the session (getServerTenant → that user's
// members row for THIS restaurant) — NEVER from a client-supplied id. The write
// runs through the service-role admin client, explicitly scoped to the authorized
// restaurant_id + conversation id. State machine untouched: this only sets/clears
// the assignee column (ownership_state is flipped on the existing spine path).
// MO2 will make this an atomic claim; MO1 is a plain set.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action !== "claim" && action !== "release") {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }

  let assignee: string | null = null;
  if (action === "claim") {
    // Resolve the acting member's id from the authenticated session — input-control:
    // the member MUST belong to THIS tenant; a client never supplies the id.
    const { data: member } = await admin
      .from("members")
      .select("id")
      .eq("user_id", tenant.userId)
      .eq("restaurant_id", tenant.restaurantId)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });
    assignee = (member as { id: string }).id;
  }

  // Tenant-scoped write: conversation id AND restaurant_id (admin bypasses RLS).
  const { error } = await admin
    .from("conversations")
    .update({ assigned_member_id: assignee })
    .eq("id", params.id)
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 502 });

  return NextResponse.json({ ok: true, assignedMemberId: assignee });
}
