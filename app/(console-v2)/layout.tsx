// console_v2 route group (item 4). Everything under this group is the NEW UI,
// served from its own /c namespace (/c/login, /c/select, /c/foundation, /c/shift…)
// so it NEVER collides at build time with the old (console) group (ruling #2).
//
// TWO-LAYER GATE (per-tenant, per the ruling):
//   • Layer 1 — the NEXT_PUBLIC_CONSOLE_V2 env var, checked HERE, is the
//     deploy-level kill-switch: off (the default) → the whole /c group 404s, so
//     none of the new surface is reachable and the old console stays the only
//     live UI (New-UI-Only law).
//   • Layer 2 — the PER-TENANT `console_v2` flag on restaurants.feature_flags is
//     enforced in the AUTHED sub-layout app/(console-v2)/c/(app)/layout.tsx, AFTER
//     the session + active tenant resolve. It cannot live here because the login
//     and workspace-picker pages are pre-tenant.
//
// This layout carries only Layer 1 + <LangShell> (language + RTL for the whole
// group, no rail) — login and select are chromeless; the authed area layers the
// rail via <AppFrame>. The single V1-exit CUTOVER PR later routes flag-on tenants
// to /c, adds redirects, and deletes the old (console) group wholesale.

import { notFound } from "next/navigation";
import { CONSOLE_V2 } from "@/lib/feature-flags";
import { LangShell } from "@/components/console-v2";

export default function ConsoleV2GroupLayout({ children }: { children: React.ReactNode }) {
  if (!CONSOLE_V2) notFound(); // Layer 1 — deploy kill-switch.
  return <LangShell lang="ar">{children}</LangShell>;
}
