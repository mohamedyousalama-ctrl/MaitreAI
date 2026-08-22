// ============================================================================
// Kivo Delivery Network — Day 1: operator creates a delivery job by hand.
// SERVER ONLY. Member-gated (dispatch is an operational action, mirroring
// /api/deliveries/[id]/assign — roster management stays manager-only).
// Inert (404) when ENABLE_DELIVERY_TRACKING is off.
//
// POST { customerPhone, customerName?, address?, lat?, lng?, codAmount?, reference? }
//   → { deliveryId, orderId, orderNumber, customerPhone }
// The returned deliveryId is what the existing assign endpoint takes, so the
// operator's next step (pick a driver) is unchanged.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/db/require-tenant";
import { createManualDeliveryJob } from "@/lib/db/delivery-job";
import { ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Job creation is a human typing a form — a handful per shift. Cap per tenant well
// above real use so a stuck client can't spray rows into orders/deliveries.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

/** Input rejections are the operator's fault (400); everything else is ours (502). */
const BAD_INPUT = new Set(["phone_required", "phone_invalid", "destination_required", "bad_coords", "bad_amount"]);

export async function POST(req: Request) {
  if (!ENABLE_DELIVERY_TRACKING) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const gate = await requireTenant();
  if (!gate.ok) return gate.response;
  const tenant = gate.tenant;

  const rl = rateLimit(`delivery-manual:${tenant.restaurantId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const res = await createManualDeliveryJob(admin, tenant.restaurantId, body);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: BAD_INPUT.has(res.error) ? 400 : 502 });
    }
    return NextResponse.json(res.job);
  } catch (e) {
    console.error("[deliveries] manual job create error", e);
    return NextResponse.json({ error: "create_failed" }, { status: 502 });
  }
}
