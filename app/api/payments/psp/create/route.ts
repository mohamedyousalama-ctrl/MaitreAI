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

/**
 * A post-payment redirect is UX-only but still steers the payer's browser, so we
 * never forward a client-supplied absolute URL to the PSP (open-redirect /
 * phishing). Accept only a same-origin target (relative path or an absolute URL
 * whose origin matches this request's); anything else collapses to "" and the
 * PSP redirect fields are omitted.
 */
function sanitizeCallbackUrl(raw: unknown, origin: string): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const u = new URL(raw, origin);
    return u.origin === origin ? u.toString() : "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });

  // feature_flags is the ONLY gate — read it (a column that exists) and pass it
  // through; createMoyasarSession refuses before reading any psp_* column. A DB
  // error must surface as 5xx, NOT be swallowed into a "feature disabled" reply.
  const { data: rest, error: flagsErr } = await admin
    .from("restaurants")
    .select("feature_flags")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  if (flagsErr) return NextResponse.json({ ok: false, error: "db_error" }, { status: 503 });
  const flags = (rest?.feature_flags as Record<string, unknown> | null) ?? null;

  const body = (await req.json().catch(() => ({}))) as { orderId?: string; callbackUrl?: string };
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) return NextResponse.json({ ok: false, error: "bad_request", detail: "orderId required" }, { status: 400 });

  const result = await createMoyasarSession(admin, {
    restaurantId: tenant.restaurantId,
    orderId,
    featureFlags: flags,
    callbackUrl: sanitizeCallbackUrl(body.callbackUrl, req.nextUrl.origin),
  });

  if (!result.ok) {
    // Distinguish client/order errors (400) from feature-off (403) and
    // server/upstream/config faults (502), so callers can tell retry-worthy
    // failures apart from genuine bad requests.
    const CLIENT_ERRORS = new Set([
      "order_not_found",
      "order_tenant_mismatch",
      "amount_invalid",
      "amount_nonpositive",
    ]);
    const status =
      result.error === "psp_disabled" ? 403 : result.error === "order_already_paid" ? 409 : CLIENT_ERRORS.has(result.error) ? 400 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, sessionId: result.sessionId, payUrl: result.payUrl, reused: !!result.reused });
}
