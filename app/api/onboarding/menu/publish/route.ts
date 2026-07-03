// ============================================================================
// MaitreAI — Onboarding: publish a menu draft to the live tables
//
// POST /api/onboarding/menu/publish
//
// Calls the publish_menu_draft() SQL function which atomically:
//   1. Locks the draft row (validates ownership + status='draft')
//   2. UPSERTS categories + items BY NAME, preserving surviving item ids AND their
//      `available` flag (0050); rebuilds stateless children; deletes items absent
//      from the new draft. Marks the draft 'published'.
//
// After this call, loadBrain() (which the agent calls on every turn) will read
// the new menu immediately — no further action needed.
//
// PRESERVE-86 (item 10 — 0036 gap, closed by 0050):
//   A re-publish PRESERVES the `available` flag of every SURVIVING item (matched
//   by name). A sold-out / safety-held item stays 86'd across a menu update — it
//   is NOT silently re-enabled. The ONLY way a 86 is lost is if the item was
//   RENAMED or REMOVED from the draft (0050's documented limitation: a rename =
//   remove-old + add-new). So the reset warning must fire ONLY for those items,
//   not on every publish. We compute the truth by diffing the 86'd item NAMES
//   before vs after (lib/menu/publish-availability):
//     availabilityReset=true ONLY when a 86 was actually lost (rename/removal)
//     preservedUnavailable: names that were 86'd and STAYED 86'd
//     lostUnavailable: names whose 86 was dropped (renamed/removed) — warn on these
//
// Allergen data on items is informational operator-entered content. The
// deterministic allergen gate (#87) operates independently on customer message
// text and is not affected by this endpoint.
//
// Auth: manager of the target restaurant.
// Body: { restaurantId: string, draftId: string }
// Response: { ok, availabilityReset, preservedUnavailable[], lostUnavailable[], itemsPreviouslyUnavailable }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { diffUnavailable } from "@/lib/menu/publish-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : "";
  const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";

  if (!restaurantId || !draftId) {
    return NextResponse.json(
      { error: "bad_request", detail: "restaurantId and draftId are required" },
      { status: 400 }
    );
  }

  // Auth: caller must be a manager of the target restaurant.
  const { data: membership } = await admin
    .from("members")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || membership.role !== "manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify the draft belongs to this restaurant (defence-in-depth; the SQL
  // function also checks, but we want a clear 404 before calling RPC).
  const { data: draft } = await admin
    .from("menu_drafts")
    .select("id, status")
    .eq("id", draftId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "not_found", detail: "draft not found" }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return NextResponse.json(
      { error: "conflict", detail: `draft is already ${draft.status}` },
      { status: 409 }
    );
  }

  // Snapshot the NAMES of currently-86'd items BEFORE the publish. Names (not a
  // bare count) let us prove, after the publish, which 86'd items SURVIVED (stayed
  // 86'd) vs which lost their flag via a rename/removal — the only real reset case.
  const { data: beforeRows } = await admin
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("available", false);
  const beforeNames = (beforeRows ?? []).map((r) => String((r as { name: string }).name));

  // Atomic publish via SQL function (single transaction). 0050 preserves each
  // surviving item's `available` by upserting by name.
  const { error: rpcErr } = await admin.rpc("publish_menu_draft", {
    p_restaurant_id: restaurantId,
    p_draft_id: draftId,
  });

  if (rpcErr) {
    return NextResponse.json({ error: "publish_failed", detail: rpcErr.message }, { status: 502 });
  }

  // Snapshot 86'd names AFTER, then diff: preserved = stayed 86'd (the fix
  // working); lost = its 86 was dropped (renamed/removed). Warn ONLY on lost.
  const { data: afterRows } = await admin
    .from("menu_items")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("available", false);
  const afterNames = (afterRows ?? []).map((r) => String((r as { name: string }).name));

  const diff = diffUnavailable(beforeNames, afterNames);
  return NextResponse.json({
    ok: true,
    // Honest: fires ONLY when a 86 was actually lost (rename/removal), not on every publish.
    availabilityReset: diff.availabilityReset,
    preservedUnavailable: diff.preserved,
    lostUnavailable: diff.lost,
    itemsPreviouslyUnavailable: beforeNames.length,
  });
}
