// console_v2 route group (PR 1). Everything under this group is the NEW UI, served
// from its own /c namespace (/c/foundation, /c/shift, /c/conversations, …) so it
// NEVER collides at build time with the old (console) group at its existing URLs
// (ruling #2).
//
// TWO-LAYER GATE (per-tenant, per the ruling):
//   • Layer 1 — the NEXT_PUBLIC_CONSOLE_V2 env var, checked HERE, is the
//     deploy-level kill-switch: off (the default) → the whole /c group 404s via
//     notFound(), so none of the new surface is reachable and the old console
//     stays the only live UI (New-UI-Only law).
//   • Layer 2 — the PER-TENANT `console_v2` flag on restaurants.feature_flags
//     (see lib/tenant/tier.ts) is what routes an INDIVIDUAL restaurant to /c. It
//     is enforced here once tenant resolution is wired into this layout in item 4
//     (Login/tenant-gate, R1) — via isFeatureEnabled("console_v2", ctx).
//
// Until item 4 lands, Layer 1 alone means turning the env var on exposes /c to
// EVERY authenticated tenant on that deployment — so do NOT flip it for a
// single-tenant pilot before the Layer-2 check exists. The env flag stays OFF by
// default, so there is no exposure in the meantime. The single V1-exit CUTOVER PR
// later routes flag-on tenants to /c, adds redirects, and deletes the old
// (console) group wholesale.
//
// The shell (rail, brand, RTL, tokens) comes from <ConsoleV2Shell>. Page PRs 4–17
// render their pages as children of this layout.

import { notFound } from "next/navigation";
import { CONSOLE_V2 } from "@/lib/feature-flags";
import { ConsoleV2Shell } from "@/components/console-v2";

export default function ConsoleV2GroupLayout({ children }: { children: React.ReactNode }) {
  // Layer 1 (deploy kill-switch). Layer 2 (per-tenant console_v2 feature flag) is
  // added here in item 4 once the session/tenant is resolved server-side (R1).
  if (!CONSOLE_V2) notFound();
  return <ConsoleV2Shell>{children}</ConsoleV2Shell>;
}
