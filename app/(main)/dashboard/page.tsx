// ============================================================================
// MaitreAI — الرئيسية route guard
// The operator-side admin chat console (the Maître agent surface + in-chat promo
// builder) lives in ./MaitreConsole and is HIDDEN behind ENABLE_ADMIN_CHAT_CONSOLE
// during the order-engine upgrade. When the flag is off this route redirects to
// the operator's working home (المحادثات) so /dashboard is never the surface a
// hidden console renders on. Flip NEXT_PUBLIC_ENABLE_ADMIN_CHAT_CONSOLE=true to
// restore the console with no code changes.
// ============================================================================

import { redirect } from "next/navigation";
import { ENABLE_ADMIN_CHAT_CONSOLE, HOME_HREF } from "@/lib/feature-flags";
import { MaitreConsole } from "./MaitreConsole";

export default function DashboardPage() {
  if (!ENABLE_ADMIN_CHAT_CONSOLE) redirect(HOME_HREF);
  return <MaitreConsole />;
}
