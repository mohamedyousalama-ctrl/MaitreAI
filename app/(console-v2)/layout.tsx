// console_v2 route group. Post-CUTOVER-2 this is the ONE and only operator
// console, served from the /c namespace. Both gates are retired: the deploy-level
// kill-switch (NEXT_PUBLIC_CONSOLE_V2) and the per-tenant console_v2 flag — /c is
// always live for every authed tenant, and the legacy (console) group is deleted.
//
// This layout carries only <LangShell> (language + RTL for the whole group, no
// rail) — login and select are chromeless; the authed area layers the rail via
// <AppFrame>.

import { LangShell } from "@/components/console-v2";

export default function ConsoleV2GroupLayout({ children }: { children: React.ReactNode }) {
  return <LangShell lang="ar">{children}</LangShell>;
}
