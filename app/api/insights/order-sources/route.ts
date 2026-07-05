// ============================================================================
// MaitreAI — SRC2 order-source breakdown (insights) — SERVER ONLY, session-auth.
// Counts orders by the RAW orders.source column, tenant-scoped. Mirrors the
// /api/cod/ledger pattern (member client, getServerTenant). Truth-state: the
// client order model collapses non-web → whatsapp (lib/db/orders.ts), which can't
// represent an unknown value — so this reads the raw column and buckets anything
// that isn't 'web' / 'whatsapp' as «غير محدد», NEVER folding it into whatsapp.
// ============================================================================

import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  // UI4 — exclude staff-marked test orders from the real source breakdown. The
  // filter references is_test (migration 0044); a query error degrades gracefully
  // to the card's «قيد التجميع» state, never a fabricated number. Apply 0044 before
  // this ships so the breakdown is accurate.
  const { data, error } = await supabase
    .from("orders")
    .select("source")
    .eq("restaurant_id", tenant.restaurantId)
    .eq("is_test", false);
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
