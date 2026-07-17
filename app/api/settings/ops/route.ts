// ============================================================================
// MaitreAI — Operator open/closed + assistant on/off persistence (server only).
// The new operator Home control strip writes here. GET returns the current real
// state; POST is MANAGER-ONLY (server-enforced regardless of UI) and writes the
// real restaurants columns: is_open (bool) + agent_mode ("live" | "paused").
// Mirrors the tax/print settings pattern (auth client, membership-scoped).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/db/require-tenant";
import { DatabaseOperationError, mustWrite } from "@/lib/db/checked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const { data } = await supabase
    .from("restaurants")
    .select("is_open, agent_mode, slug")
    .eq("id", tenant.restaurantId)
    .maybeSingle();

  return NextResponse.json({
    isOpen: data?.is_open !== false, // default open when unset
    assistantOn: (data?.agent_mode ?? "live") !== "paused",
    // UI4 — storefront slug so the console can link to the public ordering page
    // (e.g. the Orders empty-state «ابعت طلب تجريبي» action).
    slug: (data?.slug as string | null) ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { isOpen?: unknown; assistantOn?: unknown };
  const patch: { is_open?: boolean; agent_mode?: string } = {};
  if (typeof body.isOpen === "boolean") patch.is_open = body.isOpen;
  if (typeof body.assistantOn === "boolean") patch.agent_mode = body.assistantOn ? "live" : "paused";
  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    await mustWrite<{ id: string }>(
      supabase.from("restaurants").update(patch).eq("id", tenant.restaurantId).select("id"),
      "settings.ops.update",
      { exactRows: 1 },
    );
  } catch (error) {
    if (error instanceof DatabaseOperationError && error.code === "KIVO_ROW_COUNT_MISMATCH") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "update_failed", detail }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    isOpen: "is_open" in patch ? patch.is_open : undefined,
    assistantOn: "agent_mode" in patch ? patch.agent_mode !== "paused" : undefined,
  });
}
