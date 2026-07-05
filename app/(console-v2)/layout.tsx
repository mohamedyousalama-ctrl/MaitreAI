// console_v2 route group (PR 1). Everything under this group is the NEW UI and is
// gated by the CONSOLE_V2 flag: when the flag is off (the default), the whole group
// 404s via notFound(), so none of the new surface is reachable in production and
// the old console (app/(console)) remains the only live UI (New-UI-Only law). Flip
// NEXT_PUBLIC_CONSOLE_V2="true" (per environment / tenant) to reveal it.
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
