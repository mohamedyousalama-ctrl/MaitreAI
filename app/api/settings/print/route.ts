// ============================================================================
// MaitreAI — Print settings route (Sprint 9, S9-5) — SERVER ONLY
// Per-tenant auto-print + paper-width settings (§O #5 / Amendment A3).
// GET  — read current settings (any signed-in member).
// POST — update (managers only). Default auto_print OFF.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { toReceiptWidth } from "@/lib/render/receipt";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase
    .from("restaurants")
    .select("auto_print, print_width")
    .eq("id", tenant.restaurantId)
    .single();
  return NextResponse.json({
    autoPrint: !!data?.auto_print,
    printWidth: toReceiptWidth(data?.print_width as string | undefined),
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: { auto_print?: boolean; print_width?: string } = {};
  if (typeof body.autoPrint === "boolean") patch.auto_print = body.autoPrint;
  if (typeof body.printWidth === "string") patch.print_width = toReceiptWidth(body.printWidth);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    await mustWrite<{ id: string }>(
      supabase.from("restaurants").update(patch).eq("id", tenant.restaurantId).select("id"),
      "settings.print.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "update_failed", detail }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
