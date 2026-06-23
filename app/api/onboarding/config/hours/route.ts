// ============================================================================
// MaitreAI — Onboarding Step 3: hours + open-state config
//
// GET  /api/onboarding/config/hours  — any member of restaurant
// PUT  /api/onboarding/config/hours  — manager only
//
// Covers four restaurants columns (all exist since 0001_init.sql):
//   is_open          boolean     — kitchen open flag (runtime open/close)
//   closed_message   text|null   — custom message shown when closed
//   accept_preorders boolean     — allow pre-order while closed
//   hours            jsonb       — operating schedule (split shifts, prayer pauses)
//
// The runtime one-tap toggle (/api/settings/ops) stays as-is for operator UX.
// This endpoint exposes the full hours bundle for the onboarding config wizard.
//
// Auth: manager of the target restaurant (via restaurantId query param on GET,
// body on PUT). Uses the standard settings route pattern: server client +
// getServerTenant() for membership resolution.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerTenant } from "@/lib/db/tenant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("restaurants")
    .select("is_open, closed_message, accept_preorders, hours")
    .eq("id", tenant.restaurantId)
    .single();

  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({
    isOpen: data.is_open !== false,
    closedMessage: data.closed_message ?? null,
    acceptPreorders: data.accept_preorders === true,
    hours: data.hours ?? {},
  });
}

export async function PUT(req: Request) {
  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};

  if (typeof body.isOpen === "boolean") patch.is_open = body.isOpen;

  if ("closedMessage" in body) {
    if (body.closedMessage === null || body.closedMessage === "") {
      patch.closed_message = null;
    } else if (typeof body.closedMessage === "string") {
      const msg = body.closedMessage.trim();
      if (msg.length > 500) {
        return NextResponse.json({ error: "bad_request", detail: "closedMessage must be ≤ 500 characters" }, { status: 400 });
      }
      patch.closed_message = msg;
    } else {
      return NextResponse.json({ error: "bad_request", detail: "closedMessage must be a string or null" }, { status: 400 });
    }
  }

  if (typeof body.acceptPreorders === "boolean") patch.accept_preorders = body.acceptPreorders;

  if ("hours" in body) {
    if (body.hours === null || (typeof body.hours === "object" && !Array.isArray(body.hours))) {
      patch.hours = body.hours ?? {};
    } else {
      return NextResponse.json({ error: "bad_request", detail: "hours must be an object" }, { status: 400 });
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "bad_request", detail: "no recognised fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("restaurants")
    .update(patch)
    .eq("id", tenant.restaurantId);

  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}
