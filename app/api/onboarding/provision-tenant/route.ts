// ============================================================================
// MaitreAI — Onboarding Step 1: provision a new tenant
//
// POST /api/onboarding/provision-tenant
//
// Creates a new restaurant row + a manager membership for the signed-in user.
// Safe defaults: agent_mode='setup' (Brain silent), active=false (no live
// traffic) until the operator explicitly enables the tenant.
//
// Auth: any authenticated user (creates their first or additional restaurant).
// A user who already has a restaurant is allowed to create another (e.g. a
// multi-brand operator) — the members table supports N restaurants per user.
//
// Body: { name: string, dialect?: "saudi"|"egyptian", timezone?: string,
//         currency?: string, country?: string }
// Response: { restaurantId, memberId }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DIALECTS = ["saudi", "egyptian"] as const;
type Dialect = (typeof ALLOWED_DIALECTS)[number];

export async function POST(req: Request) {
  // 1. Verify caller is authenticated (use the cookie-based server client for
  //    auth; writes go through admin to bypass RLS).
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // 2. Parse + validate body.
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "bad_request", detail: "name is required" }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "bad_request", detail: "name too long" }, { status: 400 });

  const dialect: Dialect =
    typeof body.dialect === "string" && (ALLOWED_DIALECTS as readonly string[]).includes(body.dialect)
      ? (body.dialect as Dialect)
      : "saudi";

  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "Asia/Riyadh";
  const currency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "ر.س";
  const country = typeof body.country === "string" && body.country.trim() ? body.country.trim() : "SA";

  // 3. Create restaurant with safe defaults — Brain silent, not live.
  // deterministic_allergen_safety MUST be on for every tenant: it is the code
  // gate that catches allergy euphemisms (e.g. «بيتعب من البندق») without
  // requiring the word «حساسية». Leaving it off is a child-safety failure mode.
  const { data: restaurant, error: restaurantErr } = await admin
    .from("restaurants")
    .insert({
      name,
      dialect,
      timezone,
      currency,
      country,
      agent_mode: "setup",  // Brain is silent until operator explicitly enables
      active: false,        // Not visible in public listings until enabled
      feature_flags: { deterministic_allergen_safety: true },
    })
    .select("id")
    .single();

  if (restaurantErr || !restaurant) {
    return NextResponse.json({ error: "create_failed", detail: restaurantErr?.message }, { status: 502 });
  }

  // 4. Create manager membership for the signing-up user.
  const { data: member, error: memberErr } = await admin
    .from("members")
    .insert({
      restaurant_id: restaurant.id,
      user_id: user.id,
      role: "manager",
    })
    .select("id")
    .single();

  if (memberErr || !member) {
    // Roll back the restaurant to avoid orphaned rows.
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    return NextResponse.json({ error: "membership_failed", detail: memberErr?.message }, { status: 502 });
  }

  return NextResponse.json({ restaurantId: restaurant.id, memberId: member.id }, { status: 201 });
}
