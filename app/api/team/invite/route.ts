// ============================================================================
// MaitreAI — UI1 staff invite (AUTH-sensitive) — SERVER ONLY.
// Manager-gated (tenant.role !== "manager" → 403) + tenant-scoped: the invitee
// joins THE INVITER'S restaurant only (restaurant_id comes from the session,
// never the client). role is whitelisted (manager|operation). The auth user is
// provisioned via the service-role admin client (inviteUserByEmail — sends the
// Supabase invite email); an existing auth user is linked, never duplicated. The
// membership row is then inserted (restaurant_id = inviter's, the invited user_id,
// role). RLS unchanged.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";

export const runtime = "nodejs";

const ROLES = new Set(["manager", "operation"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Find an existing auth user by email (no getUserByEmail in supabase-js admin → paged scan). */
async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  if (!admin) return null;
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break; // last page
  }
  return null;
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "");
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  if (!ROLES.has(role)) return NextResponse.json({ error: "bad_role" }, { status: 400 });

  // 1. Provision / locate the auth user. inviteUserByEmail creates + emails a new
  //    user; for an already-registered user it errors → fall back to a lookup
  //    (link the existing user, never create a duplicate).
  let userId: string | null = null;
  const invited = await admin.auth.admin.inviteUserByEmail(email);
  if (invited.data?.user) {
    userId = invited.data.user.id;
  } else {
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) {
      return NextResponse.json({ error: "provision_failed", detail: invited.error?.message ?? "could not invite" }, { status: 502 });
    }
    userId = existing.id;
  }

  // 2. Already a member of THIS tenant? Handle gracefully (no dup, no 500). The
  //    unique(restaurant_id, user_id) is the backstop.
  const { data: existingMember } = await admin
    .from("members")
    .select("id")
    .eq("restaurant_id", tenant.restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json({ error: "already_member", message: "العضو ده موجود بالفعل في الفريق" }, { status: 409 });
  }

  // 3. Insert the membership — restaurant_id from the SESSION (never the client),
  //    role whitelisted above.
  const { error } = await admin
    .from("members")
    .insert({ restaurant_id: tenant.restaurantId, user_id: userId, role });
  if (error) {
    // Unique-violation race → already a member.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "already_member", message: "العضو ده موجود بالفعل في الفريق" }, { status: 409 });
    }
    return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, status: "invited", email, role });
}
