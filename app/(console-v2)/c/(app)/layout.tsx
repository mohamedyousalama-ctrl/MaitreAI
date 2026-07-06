// ============================================================================
// console_v2 — the AUTHENTICATED sub-layout (the tenant gate rendered). Everything
// under /c that shows real tenant chrome (the rail) lives here. Post-CUTOVER-2 the
// per-tenant console_v2 flag gate is GONE — /c is the one and only console, so this
// serves every authed tenant. In order:
//
//   1. DEMO (Supabase unconfigured) → permissive: render the shell so the new UI
//      is explorable locally.
//   2. Not signed in            → redirect to /c/login.
//   3. Signed in, no active tenant (resolveTenant returns null for zero OR
//      multiple-unchosen memberships — NO default, ever) → redirect to /c/select.
//   4. Otherwise → render <AppFrame> with the real workspace name + role.
//
// The login and workspace-picker pages sit OUTSIDE this group (pre-tenant), so
// they are chromeless.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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

  // 4. Render the authed shell with the real workspace + role. (No console_v2 flag
  //    gate anymore — the old console is gone; /c serves everyone.)
  const admin = createAdminClient();
  const { data: r } = admin
    ? await admin.from("restaurants").select("name").eq("id", tenant.restaurantId).maybeSingle()
    : { data: null };
  const tenantName = ((r as { name?: string } | null)?.name ?? "").trim() || "Kivo";
  const role = tenant.role === "manager" ? "manager" : "operation";
  return <AppFrame tenantName={tenantName} role={role}>{children}</AppFrame>;
}
