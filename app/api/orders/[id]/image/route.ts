// ============================================================================
// MaitreAI — Order image route (Sprint 9, S9-3) — SERVER ONLY
// Renders an order's receipt or kitchen-ticket as a PNG. Session-authenticated
// and RLS-scoped to the operator's tenant (used by the order drawer to view /
// print / reprint). ?kind=receipt (default) | ticket.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { loadReceiptData } from "@/lib/render/load";
import { renderReceiptPng, renderKitchenTicketPng } from "@/lib/render/receipt";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await loadReceiptData(supabase, params.id);
  if (!data) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  const kind = new URL(req.url).searchParams.get("kind") === "ticket" ? "ticket" : "receipt";
  const png = kind === "ticket" ? renderKitchenTicketPng(data) : renderReceiptPng(data);

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${kind}-${data.orderNumber.replace("#", "")}.png"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
