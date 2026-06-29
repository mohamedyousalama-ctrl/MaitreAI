// ============================================================================
// MaitreAI — public mock-checkout API (Sprint 7 Pass 2)
// Lets the customer's checkout page (opened cross-device, unauthenticated)
// resolve and advance a payment session via the service role. The manager sees
// the outcome through the order's payment status (orders realtime). This is the
// MOCK provider; a real provider + signed webhooks arrive in a later sprint.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ACTIVE = new Set(["created", "link_sent", "opened"]);

// S1 SECURITY — this is the MOCK payment provider. Its POST advances a session
// (and the order's payment_status) with NO auth — by design a customer opens an
// unauthenticated link. With no signed provider webhook, an anonymous client that
// knows a sessionId could POST action=success and flip an order to "paid". The
// pilot takes COD + Vodafone Cash (which never create a payment_session or call
// this route), so the mock-pay mutations MUST be inert in production. They run
// ONLY when ENABLE_MOCK_PAYMENTS is explicitly set (dev/demo); otherwise the POST
// is refused before any DB write. A real provider will arrive as a separate
// signed-webhook route; this guard does not touch COD/VF or order finalization.
const MOCK_PAYMENTS_ENABLED = process.env.ENABLE_MOCK_PAYMENTS === "true";

async function loadView(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  const { data } = await admin!
    .from("payment_sessions")
    .select("id, status, amount, currency, expires_at, order_id, restaurant_id, orders(order_number, customers(name)), restaurants(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, any>;
  return {
    id: row.id,
    status: row.status as string,
    amount: Number(row.amount),
    currency: row.currency as string,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0,
    orderId: row.order_id as string,
    orderNumber: row.orders?.order_number ?? "",
    customerName: row.orders?.customers?.name ?? "",
    restaurantName: row.restaurants?.name ?? "",
  };
}

export async function GET(_req: NextRequest, { params }: { params: { sessionId: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const view = await loadView(admin, params.sessionId);
  if (!view) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Lazily expire on read.
  if (ACTIVE.has(view.status) && view.expiresAt && Date.now() > view.expiresAt) {
    await admin.from("payment_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", view.id);
    view.status = "expired";
  }
  return NextResponse.json({ ok: true, session: view });
}

export async function POST(req: NextRequest, { params }: { params: { sessionId: string } }) {
  // S1 — refuse ALL mock-pay mutations (open/success/fail) unless explicitly
  // enabled. In production (flag unset) this returns BEFORE any DB write, so an
  // anonymous client can never flip a session/order to "paid" via this route.
  if (!MOCK_PAYMENTS_ENABLED) {
    return NextResponse.json({ ok: false, error: "mock_payments_disabled" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; method?: string };
  const sessionId = params.sessionId;
  const view = await loadView(admin, sessionId);
  if (!view) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!ACTIVE.has(view.status) && body.action !== "open") {
    return NextResponse.json({ ok: true, session: view }); // already resolved — no-op
  }

  const now = new Date().toISOString();
  if (body.action === "open") {
    if (view.status === "created" || view.status === "link_sent") {
      await admin.from("payment_sessions").update({ status: "opened", updated_at: now }).eq("id", sessionId);
      view.status = "opened";
    }
  } else if (body.action === "success") {
    await admin.from("payment_sessions").update({ status: "paid", provider_ref: body.method ?? "mada", updated_at: now }).eq("id", sessionId);
    // F1.7 Fix 4 — an online-paid order's method IS known (the provider): record it
    // so the order carries the real method, not a COD default. Label only — amounts
    // and settlement are untouched.
    await admin.from("orders").update({ payment_status: "paid", order_status: "paid", payment_method: body.method ?? "mada", updated_at: now }).eq("id", view.orderId);
    view.status = "paid";
  } else if (body.action === "fail") {
    await admin.from("payment_sessions").update({ status: "failed", updated_at: now }).eq("id", sessionId);
    await admin.from("orders").update({ payment_status: "failed", updated_at: now }).eq("id", view.orderId);
    view.status = "failed";
  }
  return NextResponse.json({ ok: true, session: view });
}
