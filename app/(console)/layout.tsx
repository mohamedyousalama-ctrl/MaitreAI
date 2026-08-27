// Kivo console route group. Every page here renders inside <ConsoleLayout> so it
// gets the Kivo shell (sidebar + topbar), the `.kv-console` font/RTL base, and
// the per-tenant DataBootstrap. Pre-Kivo pages stay in the (main) group with the
// older shell until they migrate.
//
// CUTOVER-1: this layout is the single chokepoint that bounces a console_v2 flag-ON
// tenant off every legacy console page to its /c equivalent. It FAILS SAFE toward
// the old console — demo mode, no resolved tenant, the flag off, or the CONSOLE_V2
// deploy switch off all render the legacy console UNCHANGED, so flag-off tenants
// (e.g. Wesaya) are never affected. The old group is deleted only in cutover-2,
// after the /c live check passes.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ConsoleLayout } from "@/components/console/ConsoleLayout";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { CONSOLE_V2 } from "@/lib/feature-flags";
import { mapLegacyToConsoleV2 } from "@/lib/console-v2/cutover";

export const dynamic = "force-dynamic";

export default async function ConsoleGroupLayout({ children }: { children: React.ReactNode }) {
  // Only consider a redirect when the /c group actually exists (Layer-1 env) AND
  // auth is enforceable. Otherwise fall straight through to the legacy console.
  if (CONSOLE_V2 && isSupabaseConfigured()) {
    const tenant = await getServerTenant();
    if (tenant) {
      const admin = createAdminClient();
      const { data } = admin
        ? await admin.from("restaurants").select("feature_flags").eq("id", tenant.restaurantId).maybeSingle()
        : { data: null };
      const enabled = isFeatureExplicitlyEnabled(
        "console_v2",
        (data as { feature_flags?: Record<string, unknown> } | null)?.feature_flags ?? null
      );
      if (enabled) {
        // Path-preserving bounce to /c (middleware stamps the pathname; layouts
        // can't read it otherwise). Unmapped paths fold to /c → /c/shift.
        //
        // A null target means this legacy page has no /c replacement and must
        // RENDER — /orders, /dashboard, /cod, /cod/close, /deliveries. Folding
        // those sent operators to Live Shift, which cannot do the job: no order
        // book, no cash capture or shift close, no driver management. See
        // lib/console-v2/cutover.ts for why each is on that list.
        const target = mapLegacyToConsoleV2(headers().get("x-kivo-pathname") ?? "");
        if (target) redirect(target);
      }
    }
  }
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
