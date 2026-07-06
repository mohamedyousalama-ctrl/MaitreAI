// ============================================================================
// console_v2 item 4 — the signed-in user's workspace memberships (R1). Powers the
// «CHOOSE A WORKSPACE» picker. Keyed on the USER (not an active tenant) — this is
// the one place that runs BEFORE a tenant is chosen, so it cannot use requireTenant
// (chicken-and-egg). It lists every restaurant the user is a member of, with its
// name + role, so the client can render the explicit picker. There is NO default:
// the picker always shows, and the server (resolveTenant) re-validates whichever
// one the user cookies. Read-only; scoped to the authenticated user's own rows.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // The user's memberships, with the restaurant name + active flag joined (admin
  // bypasses RLS; scoped strictly to this user's rows by user_id).
  const { data: rows } = await admin
    .from("members")
    .select("restaurant_id, role, restaurants(name, active)")
    .eq("user_id", user.id);

  const memberships = (rows ?? [])
    .map((r) => {
      // The joined restaurant is a to-one relation; tolerate object-or-array shape.
      const rest = Array.isArray((r as { restaurants?: unknown }).restaurants)
        ? (r as { restaurants: Array<{ name?: string; active?: boolean }> }).restaurants[0]
        : (r as { restaurants?: { name?: string; active?: boolean } }).restaurants;
      return {
        restaurantId: r.restaurant_id as string,
        role: r.role as string,
        name: (rest?.name ?? "").trim() || "مطعم",
        active: rest?.active,
      };
    })
    // WO-LOGIN-CLEANUP — hide deactivated tenants from the picker/switcher. Purely
    // presentational + reversible (flip `active` back on and it reappears): no
    // membership row is touched. `active !== false` keeps rows whose flag is true or
    // absent, and drops only tenants explicitly deactivated (active=false).
    .filter((m) => m.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"))
    // Callers never receive `active` — it's an internal filter input only.
    .map((m) => ({ restaurantId: m.restaurantId, role: m.role, name: m.name }));

  return NextResponse.json({ memberships });
}
