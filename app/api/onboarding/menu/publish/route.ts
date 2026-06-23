// ============================================================================
// MaitreAI — Onboarding: publish a menu draft to the live tables
//
// POST /api/onboarding/menu/publish
//
// Calls the publish_menu_draft() SQL function which atomically:
//   1. Locks the draft row (validates ownership + status='draft')
//   2. Deletes the restaurant's existing live menu
//   3. Inserts categories, items, variants, choice groups, options, modifiers
//      from the draft payload in one transaction
//   4. Marks the draft as 'published'; supersedes any prior published draft
//
// After this call, loadBrain() (which the agent calls on every turn) will read
// the new menu immediately — no further action needed.
//
// Allergen data on items is informational operator-entered content. The
// deterministic allergen gate (#87) operates independently on customer message
// text and is not affected by this endpoint.
//
// Auth: manager of the target restaurant.
// Body: { restaurantId: string, draftId: string }
// Response: { ok: true }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

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

  // Atomic publish via SQL function (single transaction).
  const { error: rpcErr } = await admin.rpc("publish_menu_draft", {
    p_restaurant_id: restaurantId,
    p_draft_id: draftId,
  });

  if (rpcErr) {
    return NextResponse.json({ error: "publish_failed", detail: rpcErr.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
