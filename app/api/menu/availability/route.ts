// ============================================================================
// MaitreAI — Real-time 86ing: operator one-tap availability toggle — SERVER ONLY
// SESSION-authenticated + tenant-scoped. The menu dashboard calls this to mark an
// item out-of-stock ("86") or bring it back; «كريم» then stops/resumes selling it
// on the very next turn (the agent reloads the menu every turn). Every toggle
// writes an audit row (who/when/item/new state) via setItemAvailabilityDb.
// Membership is the gate (any tenant member — manager OR floor/kitchen operation —
// can 86, matching how the dashboard already lets members edit the menu via RLS);
// the write is keyed by restaurant_id so it can never reach another tenant.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { setItemAvailabilityDb } from "@/lib/db/brain";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const itemId = String(body.itemId ?? "");
  if (!itemId) return NextResponse.json({ error: "bad_params", message: "itemId مطلوب" }, { status: 400 });
  const available = !!body.available;
  const unavailableUntil =
    typeof body.unavailableUntil === "string" && body.unavailableUntil ? body.unavailableUntil : null;
  const reason = typeof body.reason === "string" ? body.reason : null;

  const res = await setItemAvailabilityDb(supabase, tenant.restaurantId, {
    itemId,
    available,
    unavailableUntil,
    source: "operator",
    actorUserId: tenant.userId,
    actorRole: tenant.role,
    reason,
  });
  if (!res.ok) {
    return NextResponse.json({ error: "item_not_found", message: "لم أجد هذا الصنف." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, itemId, available, unavailableUntil, name: res.name });
}
