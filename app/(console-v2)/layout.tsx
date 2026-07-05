// console_v2 route group (PR 1). Everything under this group is the NEW UI, served
// from its own /c namespace (/c/foundation, /c/shift, /c/conversations, …) so it
// NEVER collides at build time with the old (console) group at its existing URLs
// (ruling #2). The group is gated by the CONSOLE_V2 flag: when off (the default),
// the whole /c group 404s via notFound(), so none of the new surface is reachable
// and the old console stays the only live UI (New-UI-Only law). Flip
// NEXT_PUBLIC_CONSOLE_V2="true" (per environment / tenant) to reveal it; the single
// V1-exit CUTOVER PR later routes flag-on tenants to /c, adds redirects, and deletes
// the old (console) group wholesale.
//
// The shell (rail, brand, RTL, tokens) comes from <ConsoleV2Shell>. Page PRs 4–17
// render their pages as children of this layout.

import { notFound } from "next/navigation";
import { CONSOLE_V2 } from "@/lib/feature-flags";
import { ConsoleV2Shell } from "@/components/console-v2";

export default function ConsoleV2GroupLayout({ children }: { children: React.ReactNode }) {
  if (!CONSOLE_V2) notFound();
  return <ConsoleV2Shell>{children}</ConsoleV2Shell>;
}
