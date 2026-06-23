// ============================================================================
// MaitreAI — Onboarding: ingest structured menu as draft
//
// POST /api/onboarding/menu/ingest
//
// Validates the menu payload and stores it as a draft for review before
// publishing. The live menu tables (menu_categories, menu_items, etc.) are
// NOT touched — the agent continues selling from the previously published
// menu (or nothing, for a new tenant) until the operator explicitly publishes.
//
// Auth: manager of the target restaurant.
// Body: { restaurantId: string, menu: MenuPayload }
// Response: { draftId: string }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { validateMenuPayload } from "@/lib/onboarding/menu-validate";
import type { MenuPayload } from "@/lib/onboarding/menu-validate";

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
  if (!restaurantId) {
    return NextResponse.json({ error: "bad_request", detail: "restaurantId is required" }, { status: 400 });
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

  // Validate the menu payload before storing.
  const validation = validateMenuPayload(body.menu);
  if (!validation.ok) {
    return NextResponse.json({ error: "validation_failed", errors: validation.errors }, { status: 422 });
  }

  // Store as draft. Any existing drafts remain — the operator can review before
  // publishing. Only one can be 'published' at a time (enforced on publish).
  const { data: draft, error: draftErr } = await admin
    .from("menu_drafts")
    .insert({
      restaurant_id: restaurantId,
      status: "draft",
      payload: body.menu as MenuPayload,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (draftErr || !draft) {
    return NextResponse.json({ error: "store_failed", detail: draftErr?.message }, { status: 502 });
  }

  return NextResponse.json({ draftId: draft.id }, { status: 201 });
}
