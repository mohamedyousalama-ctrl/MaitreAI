// ============================================================================
// MaitreAI — Onboarding Step 2: WhatsApp Embedded Signup credential exchange
//
// POST /api/onboarding/embedded-signup
//
// Receives the result of Meta's Embedded Signup client-side flow, exchanges the
// short-lived authorization code for a long-lived access token, stores encrypted
// credentials per-tenant, subscribes the WABA to our webhook, and marks the
// tenant's onboarding as complete.
//
// Auth: manager of the target restaurant.
//
// Body: { restaurantId: string, code: string, phoneNumberId: string,
//         wabaId: string, verifyToken?: string }
//   - code:          authorization code from Meta's client-side callback
//   - phoneNumberId: the phone number ID the client selected in the Signup flow
//   - wabaId:        the WABA ID the client selected in the Signup flow
//   - verifyToken:   optional; if omitted a random token is generated
//
// Meta prerequisites (env vars required on the server):
//   SIGNUP_APP_ID      — the DEDICATED Embedded Signup Meta App ID (WO-SIGNUP-
//                        ENV-SPLIT). Used ONLY for this token exchange.
//   SIGNUP_APP_SECRET  — the dedicated signup app's secret. Deliberately SEPARATE
//                        from the messaging app's WHATSAPP_APP_SECRET (which stays
//                        exclusively for inbound webhook-signature verification).
//                        On success we also persist this secret per-tenant into
//                        wa_app_secret_enc so signup tenants' inbound verifies
//                        against THEIR app, not the global messaging secret.
//
// Response: { ok: true, configured: true }
// ============================================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { buildSignupTokenExchangeUrl, isSignupConfigured, signupAppCreds } from "@/lib/onboarding/signup-oauth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v25.0 — Meta's current stable (Feb 2026); v19.0 expired 2026-05-21. Signup-only bump.
const GRAPH_API_VERSION = "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Meta Graph calls run on the request thread; a stalled response must not hold the
// onboarding request open indefinitely. Bound every call with a hard timeout.
const META_FETCH_TIMEOUT_MS = 10_000;

// ── Meta Graph API helpers ──────────────────────────────────────────────────

/** Exchange a short-lived authorization code for a long-lived access token using
 *  the DEDICATED signup app. Never borrows the messaging secret — a missing signup
 *  app throws (the caller has already degraded to not_configured before this). */
async function exchangeCodeForToken(code: string): Promise<string> {
  const url = buildSignupTokenExchangeUrl(code);
  if (!url) throw new Error("SIGNUP_APP_ID or SIGNUP_APP_SECRET not configured");

  const res = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Meta token exchange failed ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (json.error) throw new Error(`Meta token exchange error: ${json.error.message}`);
  if (!json.access_token) throw new Error("Meta token exchange returned no access_token");
  return json.access_token;
}

/** Subscribe a WABA to our webhook (business-level subscription). */
async function subscribeWabaWebhook(wabaId: string, accessToken: string): Promise<void> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`WABA webhook subscription failed ${res.status}: ${body}`);
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Auth: caller must be a manager of the target restaurant.
  const serverClient = createServerClient();
  if (!serverClient) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  // 2. Parse body.
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : "";

  if (!restaurantId || !code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "bad_request", detail: "restaurantId, code, phoneNumberId, wabaId are required" },
      { status: 400 }
    );
  }

  if (!/^[0-9]+$/.test(phoneNumberId)) {
    return NextResponse.json({ error: "bad_request", detail: "phoneNumberId must be numeric" }, { status: 400 });
  }

  // 3. Verify caller is a manager of the target restaurant.
  const { data: membership } = await admin
    .from("members")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 3b. Signup app must be configured. WO-SIGNUP-ENV-SPLIT: absent SIGNUP_* → a
  //     clean not_configured, NEVER a silent fallback to the messaging secret.
  if (!isSignupConfigured()) {
    return NextResponse.json(
      { error: "not_configured", detail: "SIGNUP_APP_ID / SIGNUP_APP_SECRET not set" },
      { status: 503 }
    );
  }

  // 4. Exchange the authorization code for a long-lived access token.
  //    This is the security-critical step — errors here abort before any DB write.
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "token_exchange_failed", detail: msg }, { status: 502 });
  }

  // 5. Subscribe the WABA to our inbound webhook.
  try {
    await subscribeWabaWebhook(wabaId, accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "webhook_subscription_failed", detail: msg }, { status: 502 });
  }

  // 6. Persist encrypted credentials + mark configured + complete onboarding.
  //    verifyToken: caller may supply one; if omitted we generate a random token.
  const verifyToken =
    typeof body.verifyToken === "string" && body.verifyToken.trim()
      ? body.verifyToken.trim()
      : randomBytes(24).toString("hex");

  // WO-SIGNUP-ENV-SPLIT: persist the signup app's secret per-tenant so this
  //   tenant's inbound webhook signatures verify against ITS app (the read path at
  //   lib/db/restaurants.ts decrypts wa_app_secret_enc → tenant.env.appSecret),
  //   not the global messaging WHATSAPP_APP_SECRET. Mirrors that read exactly:
  //   encryptSecret is the counterpart of the decryptSecret the read path uses.
  //   Guarded above (isSignupConfigured) so signupAppCreds() is non-null here.
  const signupAppSecret = signupAppCreds()!.appSecret;

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("restaurants")
    .update({
      wa_phone_number_id: phoneNumberId,
      wa_waba_id: wabaId,
      wa_verify_token: verifyToken,
      wa_access_token_enc: encryptSecret(accessToken),
      wa_app_secret_enc: encryptSecret(signupAppSecret),
      wa_configured_at: now,
      onboarding_completed_at: now,
    })
    .eq("id", restaurantId);

  if (updateErr) {
    return NextResponse.json({ error: "persist_failed", detail: updateErr.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, configured: true });
}
