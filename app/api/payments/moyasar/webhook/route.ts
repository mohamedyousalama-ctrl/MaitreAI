// ============================================================================
// Kivo (KSA) — WO-3c: Moyasar signed webhook route (payment truth) — SERVER ONLY.
// Thin wrapper over handleMoyasarWebhook. Reads the RAW body (verification is over
// the exact bytes), delegates the fail-closed, idempotent, flag-gated flow, and
// maps the handler outcome to an HTTP status. No payload body is ever logged.
// PUBLIC (the provider sends no cookie) — the in-body secret_token is the auth.
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleMoyasarWebhook } from "@/lib/payments/moyasar-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const { httpStatus, outcome } = await handleMoyasarWebhook(admin, rawBody, headers);
  // The provider only needs a status. We return a terse machine outcome (never the
  // payload) so retries/observability work without leaking anything.
  const ok = httpStatus >= 200 && httpStatus < 300;
  return NextResponse.json({ ok, outcome }, { status: httpStatus });
}
