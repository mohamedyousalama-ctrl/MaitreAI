// ============================================================================
// MaitreAI — Onboarding: read the current menu draft
//
// GET /api/onboarding/menu/draft?restaurantId=<uuid>
//
// Returns the latest draft (status='draft') for a restaurant so the operator
// can review before publishing. Returns the current published draft if no
// pending draft exists. Never returns superseded drafts.
//
// Auth: any member of the restaurant (read-only).
// Response: { draft: { id, status, payload, createdAt } } | { draft: null }
// ============================================================================

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) {
    return NextResponse.json({ error: "bad_request", detail: "restaurantId is required" }, { status: 400 });
  }

  // Auth: caller must be a member (any role) of the restaurant.
  const { data: membership } = await admin
    .from("members")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Prefer a pending draft; fall back to the published one for review.
  const { data: draft } = await admin
    .from("menu_drafts")
    .select("id, status, payload, created_at, published_at")
    .eq("restaurant_id", restaurantId)
    .in("status", ["draft", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft) return NextResponse.json({ draft: null });

  return NextResponse.json({
    draft: {
      id: draft.id,
      status: draft.status,
      payload: draft.payload,
      createdAt: draft.created_at,
      publishedAt: draft.published_at ?? null,
    },
  });
}
