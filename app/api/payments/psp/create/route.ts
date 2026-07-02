// ============================================================================
// Kivo (KSA) — PSP (Moyasar) session-create route — SERVER ONLY.
// Thin wrapper: authenticate the tenant, load its feature_flags, and delegate to
// createMoyasarSession (which gates on `psp_payments` and server-prices the
// amount). With the flag OFF — its state for EVERY tenant today, including
// Wesaya — this returns 403 psp_disabled BEFORE any psp_* column is read, so the
// route is fully inert. This route does NOT touch the mock-payments route or the
// (future) webhook route.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMoyasarSession } from "@/lib/payments/create-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  // feature_flags is the ONLY gate — read it (a column that exists) and pass it
  // through; createMoyasarSession refuses before reading any psp_* column.
  const { data: rest } = await admin
    .from("restaurants")
    .select("feature_flags")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const flags = (rest?.feature_flags as Record<string, unknown> | null) ?? null;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; callbackUrl?: string };
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) return NextResponse.json({ ok: false, error: "bad_request", detail: "orderId required" }, { status: 400 });

  const result = await createMoyasarSession(admin, {
    restaurantId: tenant.restaurantId,
    orderId,
    featureFlags: flags,
    callbackUrl: typeof body.callbackUrl === "string" ? body.callbackUrl : "",
  });

  if (!result.ok) {
    const status = result.error === "psp_disabled" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, sessionId: result.sessionId, payUrl: result.payUrl });
}
