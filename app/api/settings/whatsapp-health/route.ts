// ============================================================================
// MaitreAI — WhatsApp channel health facts (Q4 / M1.5) — SERVER ONLY, READ.
// Derives REAL connectivity facts from the messages table so the console can tell
// the truth instead of rendering «غير متاح». Tenant-scoped via getServerTenant;
// read with the admin client scoped to restaurant_id. Messages carry no `channel`
// column — the channel is on conversations — so WhatsApp messages are selected via
// an inner join on conversations.channel = 'whatsapp'.
//
// FACTS ONLY (Phase-L truth rule): we return raw timestamps; the UI decides how to
// phrase recency. Nothing here changes sending, the webhook, or agent state.
//   • lastInboundAt        — latest inbound WhatsApp message (= last webhook-received)
//   • lastOutboundAt       — latest outbound WhatsApp message
//   • lastFailedOutboundAt — latest outbound message with status='failed'
//   • lastFailedReason     — short reason for that failure (meta/text), if any
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const rid = tenant.restaurantId;
  type Row = { created_at: string; status?: string; text?: string; meta?: Record<string, unknown> } | null;

  // Latest WhatsApp message matching `direction` (+ optional failed-only). The
  // !inner join + embedded filter restricts to conversations.channel='whatsapp'.
  async function latest(direction: "inbound" | "outbound", failedOnly = false): Promise<Row> {
    let q = admin!
      .from("messages")
      .select("created_at, status, text, meta, conversations!inner(channel)")
      .eq("restaurant_id", rid)
      .eq("conversations.channel", "whatsapp")
      .eq("direction", direction);
    if (failedOnly) q = q.eq("status", "failed");
    const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data as Row;
  }

  try {
    const inbound = await latest("inbound");
    const outbound = await latest("outbound");
    const failed = await latest("outbound", true);

    const failedReason = failed
      ? (typeof failed.meta?.kind === "string" ? (failed.meta.kind as string) : null) ??
        (failed.text ? String(failed.text).slice(0, 120) : "send_failed")
      : null;

    return NextResponse.json({
      lastInboundAt: inbound?.created_at ?? null,
      lastOutboundAt: outbound?.created_at ?? null,
      lastFailedOutboundAt: failed?.created_at ?? null,
      lastFailedReason: failedReason,
    });
  } catch (e) {
    // Health is best-effort facts; never hard-fail the settings page.
    return NextResponse.json(
      { error: "health_query_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
