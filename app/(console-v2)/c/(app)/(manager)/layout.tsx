// ============================================================================
// console_v2 — MANAGER-only sub-group. Every page under (manager) is a manager
// surface (Outcomes, and later Settings / Customers / Insights / Team / Knowledge…).
// This server layout is the authoritative role gate: an `operation` member who types
// a manager URL is redirected to an operation surface BEFORE the manager page renders
// (the rail already hides the link; this stops the direct-URL path — the gap Codex
// flagged when Outcomes became the first ready manager-only route). The parent
// (app) layout has already handled auth + tenant resolution + the console_v2 flag;
// here we only add the role check. Demo mode is permissive (resolves to manager).
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConsoleV2ManagerLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <>{children}</>; // demo — permissive (manager)

  const supabase = createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect("/c/login");

  const tenant = await getServerTenant();
  if (!tenant) redirect("/c/select");

  // Operators may only reach the operation surfaces (Live Shift / Conversations);
  // every (manager) route is off-limits to them.
  if (tenant.role !== "manager") redirect("/c/conversations");

  return <>{children}</>;
}
