// ============================================================================
// MaitreAI — Per-tenant WhatsApp credentials settings route (Piece 3) — SERVER ONLY
// Lets a restaurant bring its own WhatsApp number without Vercel access. Reads/
// writes the service-role-only restaurants columns (wa_*_enc) via the ADMIN
// client, AFTER verifying the caller's membership (auth/cookie client). Secrets
// are WRITE-ONLY: the GET never returns the token/app-secret — only booleans for
// "a value exists". On save the two secrets are encrypted at rest (encryptSecret).
// GET: any member of the restaurant. POST: manager-only (matches tax/print).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data } = await admin
    .from("restaurants")
    .select("wa_phone_number_id, wa_waba_id, wa_verify_token, wa_configured_at, wa_access_token_enc, wa_app_secret_enc")
    .eq("id", tenant.restaurantId)
    .maybeSingle();

  // Non-secret fields are returned; the encrypted secrets are reduced to a mere
  // boolean "exists" — their values NEVER leave the server.
  return NextResponse.json({
    phoneNumberId: (data?.wa_phone_number_id as string | null) ?? "",
    wabaId: (data?.wa_waba_id as string | null) ?? "",
    verifyToken: (data?.wa_verify_token as string | null) ?? "",
    hasAccessToken: !!data?.wa_access_token_enc,
    hasAppSecret: !!data?.wa_app_secret_enc,
    configured: !!data?.wa_configured_at,
  });
}

export async function POST(req: Request) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  // --- non-secret routing fields ---
  if (typeof body.phoneNumberId === "string") {
    const v = body.phoneNumberId.trim();
    if (v && !/^[0-9]+$/.test(v)) {
      return NextResponse.json({ error: "bad_request", detail: "phone_number_id must be numeric" }, { status: 400 });
    }
    patch.wa_phone_number_id = v || null;
  }
  if (typeof body.wabaId === "string") patch.wa_waba_id = body.wabaId.trim() || null;
  if (typeof body.verifyToken === "string") patch.wa_verify_token = body.verifyToken.trim() || null;

  // --- secrets: write-only, encrypted at rest; only when a NON-EMPTY value is
  //     provided (a blank field leaves the existing ciphertext untouched, so the
  //     UI never has to round-trip the secret). Never store encrypt("").
  if (typeof body.accessToken === "string" && body.accessToken.trim()) {
    patch.wa_access_token_enc = encryptSecret(body.accessToken.trim());
  }
  if (typeof body.appSecret === "string" && body.appSecret.trim()) {
    patch.wa_app_secret_enc = encryptSecret(body.appSecret.trim());
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Mark configured (= resolvable by the webhook) when both a token and a phone
  // number id will be present after this save — combining the incoming patch with
  // what's already stored. Reuses the resolver's exact gate (wa_configured_at + token).
  const { data: cur } = await admin
    .from("restaurants")
    .select("wa_access_token_enc, wa_phone_number_id")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const willHaveToken = !!patch.wa_access_token_enc || !!cur?.wa_access_token_enc;
  const willHavePhone = !!(("wa_phone_number_id" in patch ? patch.wa_phone_number_id : cur?.wa_phone_number_id));
  const configured = willHaveToken && willHavePhone;
  if (configured) patch.wa_configured_at = new Date().toISOString();

  const { error } = await admin.from("restaurants").update(patch).eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, configured });
}
