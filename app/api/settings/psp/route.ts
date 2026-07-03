// ============================================================================
// Kivo (KSA) — Per-tenant PSP (Moyasar) credentials settings route — SERVER ONLY
// Mirrors app/api/settings/whatsapp/route.ts: manager-only; secrets are
// WRITE-ONLY (GET returns booleans, never a key value); the secret key + webhook
// secret are encrypted at rest (encryptSecret); the publishable key is stored in
// plaintext (it is publishable by design). psp_configured_at is stamped when a
// provider + secret key are present.
//
// FLAG-GATED: the `psp_payments` feature flag is checked FIRST. With the flag OFF
// (its state for every tenant today, incl. Wesaya) this route reads/writes NO
// psp_* column — so it stays inert AND tolerant of the columns not existing yet
// (the migration is PREPARE-ONLY / unapplied). feature_flags is read from a
// column that already exists (0024).
// ============================================================================

import { NextResponse } from "next/server";
import { getServerTenant } from "@/lib/db/tenant-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/secrets";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { getPaymentProvider } from "@/lib/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the tenant's feature_flags, or `error:true` on a DB failure so callers
// can 5xx instead of masking an infra fault as "feature disabled".
async function loadFlags(admin: NonNullable<ReturnType<typeof createAdminClient>>, restaurantId: string) {
  const { data, error } = await admin.from("restaurants").select("feature_flags").eq("id", restaurantId).maybeSingle();
  return { flags: (data?.feature_flags as Record<string, unknown> | null) ?? null, error: !!error };
}

export async function GET() {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { flags, error: flagsErr } = await loadFlags(admin, tenant.restaurantId);
  if (flagsErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  // Flag OFF ⇒ report an honest "disabled" shape without touching psp_* columns.
  if (!isFeatureExplicitlyEnabled("psp_payments", flags)) {
    return NextResponse.json({
      enabled: false,
      provider: null,
      publishableKey: "",
      hasSecretKey: false,
      hasWebhookSecret: false,
      configured: false,
    });
  }

  const { data } = await admin
    .from("restaurants")
    .select("psp_provider, psp_publishable_key, psp_secret_key_enc, psp_webhook_secret_enc, psp_configured_at")
    .eq("id", tenant.restaurantId)
    .maybeSingle();

  // Secrets are reduced to a boolean "exists"; their values NEVER leave the server.
  return NextResponse.json({
    enabled: true,
    provider: (data?.psp_provider as string | null) ?? null,
    publishableKey: (data?.psp_publishable_key as string | null) ?? "",
    hasSecretKey: !!data?.psp_secret_key_enc,
    hasWebhookSecret: !!data?.psp_webhook_secret_enc,
    configured: !!data?.psp_configured_at,
  });
}

export async function POST(req: Request) {
  const tenant = await getServerTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (tenant.role !== "manager") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { flags, error: flagsErr } = await loadFlags(admin, tenant.restaurantId);
  if (flagsErr) return NextResponse.json({ error: "db_error" }, { status: 503 });
  if (!isFeatureExplicitlyEnabled("psp_payments", flags)) {
    return NextResponse.json({ error: "psp_disabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  // --- provider (must be a known adapter) ---
  if (typeof body.provider === "string") {
    const v = body.provider.trim();
    if (v && !getPaymentProvider(v)) {
      return NextResponse.json({ error: "bad_request", detail: "unknown provider" }, { status: 400 });
    }
    patch.psp_provider = v || null;
  }

  // --- publishable key (plaintext by design — it is publishable) ---
  if (typeof body.publishableKey === "string") {
    patch.psp_publishable_key = body.publishableKey.trim() || null;
  }

  // --- secrets: write-only, encrypted at rest; only when a NON-EMPTY value is
  //     provided (a blank field leaves the existing ciphertext untouched).
  if (typeof body.secretKey === "string" && body.secretKey.trim()) {
    patch.psp_secret_key_enc = encryptSecret(body.secretKey.trim());
  }
  if (typeof body.webhookSecret === "string" && body.webhookSecret.trim()) {
    patch.psp_webhook_secret_enc = encryptSecret(body.webhookSecret.trim());
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Mark configured when a provider AND a secret key will both be present after
  // this save (combining the incoming patch with what's already stored).
  const { data: cur } = await admin
    .from("restaurants")
    .select("psp_provider, psp_secret_key_enc")
    .eq("id", tenant.restaurantId)
    .maybeSingle();
  const willHaveProvider = !!(("psp_provider" in patch ? patch.psp_provider : cur?.psp_provider));
  const willHaveSecret = !!patch.psp_secret_key_enc || !!cur?.psp_secret_key_enc;
  const configured = willHaveProvider && willHaveSecret;
  // Stamp when configured; CLEAR when not (e.g. provider cleared) so a later GET
  // can't read a stale timestamp and report configured:true inconsistently.
  patch.psp_configured_at = configured ? new Date().toISOString() : null;

  const { error } = await admin.from("restaurants").update(patch).eq("id", tenant.restaurantId);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, configured });
}
