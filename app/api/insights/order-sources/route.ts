// ============================================================================
// MaitreAI — SRC2 order-source breakdown (insights) — SERVER ONLY, session-auth.
// Counts orders by the RAW orders.source column, tenant-scoped. Mirrors the
// /api/cod/ledger pattern (member client, getServerTenant). Truth-state: the
// client order model collapses non-web → whatsapp (lib/db/orders.ts), which can't
// represent an unknown value — so this reads the raw column and buckets anything
// that isn't 'web' / 'whatsapp' as «غير محدد», NEVER folding it into whatsapp.
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("orders")
    .select("source")
    .eq("restaurant_id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "query_failed" }, { status: 502 });

  let web = 0;
  let whatsapp = 0;
  let unknown = 0;
  for (const r of (data ?? []) as { source: string | null }[]) {
    if (r.source === "web") web++;
    else if (r.source === "whatsapp") whatsapp++;
    else unknown++; // null / future / unexpected → honest «غير محدد», never whatsapp
  }

  return NextResponse.json({ ok: true, sources: { web, whatsapp, unknown, total: web + whatsapp + unknown } });
}
