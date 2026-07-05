// ============================================================================
// console_v2 item 4 — the AUTHENTICATED sub-layout (the tenant gate rendered).
// Everything under /c that shows real tenant chrome (the rail) lives here. It is
// the server-side R1 gate + Layer-2 per-tenant flag, in order:
//
//   1. DEMO (Supabase unconfigured) → permissive: render the shell so the new UI
//      is explorable locally (mirrors the old console's demo path).
//   2. Not signed in            → redirect to /c/login.
//   3. Signed in, no active tenant (resolveTenant returns null for zero OR
//      multiple-unchosen memberships — NO default, ever) → redirect to /c/select.
//   4. Active tenant resolved, but this restaurant does NOT have the per-tenant
//      `console_v2` flag → this tenant hasn't cut over; send them to the old
//      console (New-UI-Only law: flag-off tenants stay on the old UI).
//   5. Otherwise → render <AppFrame> with the real workspace name + role.
//
// The login and workspace-picker pages sit OUTSIDE this group (pre-tenant), so
// they are chromeless and ungated beyond Layer 1.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { HOME_HREF } from "@/lib/feature-flags";
import { AppFrame } from "@/components/console-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConsoleV2AppLayout({ children }: { children: React.ReactNode }) {
  // 1. Demo/unconfigured — permissive so the new UI is explorable locally.
  if (!isSupabaseConfigured()) {
    return <AppFrame tenantName="Kivo · demo" role="manager">{children}</AppFrame>;
  }

  const supabase = createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  // 2. Not signed in.
  if (!user) redirect("/c/login");

  // 3. No explicit active tenant — the picker (no default, ever).
  const tenant = await getServerTenant();
  if (!tenant) redirect("/c/select");

  // 4. Layer-2: this restaurant must EXPLICITLY have console_v2 enabled, else it
  //    hasn't cut over — keep it on the old console. Use the STRICT per-flag gate,
  //    NOT isFeatureEnabled: console_v2 is a deliberate, per-tenant cutover switch
  //    that must NOT be implied by tier='pro' (a Pro tenant does not get the new
  //    console until console_v2 is turned on for it).
  const admin = createAdminClient();
  const { data: r } = admin
    ? await admin.from("restaurants").select("name, feature_flags").eq("id", tenant.restaurantId).maybeSingle()
    : { data: null };
  const enabled = isFeatureExplicitlyEnabled(
    "console_v2",
    (r as { feature_flags?: Record<string, unknown> } | null)?.feature_flags ?? null
  );
  if (!enabled) redirect(HOME_HREF);

  // 5. Render the authed shell with the real workspace + role.
  const tenantName = ((r as { name?: string } | null)?.name ?? "").trim() || "Kivo";
  const role = tenant.role === "manager" ? "manager" : "operation";
  return <AppFrame tenantName={tenantName} role={role}>{children}</AppFrame>;
}
