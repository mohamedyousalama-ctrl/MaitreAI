// ============================================================================
// MaitreAI — COD settlement slip image — SERVER ONLY, session-authenticated.
// Renders a per-driver settlement (a cod_settlements row) as a printable cash slip
// PNG. Manager-gated, tenant-scoped (the settlement must belong to the caller's
// restaurant). Figures come from the settled ledger rows (loadSettlementSlip);
// the render reuses the H2 Resvg pipeline (renderSettlementSlipPng). Mirrors the
// order-image route shape.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { loadSettlementSlip } from "@/lib/db/cod";
import { renderSettlementSlipPng, toReceiptWidth } from "@/lib/render/receipt";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = await loadSettlementSlip(supabase, tenant.restaurantId, params.id);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const width = toReceiptWidth(new URL(req.url).searchParams.get("w"));
  const png = renderSettlementSlipPng(data, width);
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="settlement-${params.id}.png"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
