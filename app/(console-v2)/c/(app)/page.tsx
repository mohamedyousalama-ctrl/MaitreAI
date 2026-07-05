// console_v2 item 4 — the /c home (role-aware landing). After login + workspace
// pick, the user lands here. The moment the role's landing surface is built (item
// 5 flips live-shift.ready), this forwards there; until then it renders an honest
// placeholder inside the authed shell — never a redirect to an unbuilt route. The
// gate (auth + tenant + Layer-2 flag) already ran in the (app) layout above.

import { redirect } from "next/navigation";
import { landingItem } from "@/lib/console-v2/nav";
import { HomeLanding } from "./HomeLanding";

export const dynamic = "force-dynamic";

export default function ConsoleV2Home() {
  // Both roles currently land on Live Shift; role-specific rails are handled by the
  // shell. When Live Shift ships (ready:true), forward to it.
  const target = landingItem("manager");
  if (target.ready && target.href) redirect(target.href);
  return <HomeLanding />;
}
