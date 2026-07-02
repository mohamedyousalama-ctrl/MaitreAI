// ============================================================================
// Kivo (KSA) — Moyasar session-create path (server only). Turns a server-priced
// order into a hosted Moyasar payment and a `payment_sessions` row.
//
// INVARIANTS:
//  • The `psp_payments` flag is checked FIRST, before any DB read — so with the
//    flag OFF this function is fully inert and NEVER touches a psp_* column
//    (the columns may not even exist yet; the migration is PREPARE-ONLY).
//  • The charged amount is the SERVER-priced order total read from the DB, never
//    client input, converted to halalas at the single site (toHalalas).
//  • `callbackUrl` is UX-only (post-payment redirect) — settlement truth comes
//    from the signed webhook (WO-3b), never from this redirect.
//
// The Supabase admin client is INJECTED (not imported) so the caller (the thin
// route) owns credentials/lifecycle. The `psp_payments` gate is exercised
// directly in the unit tests via isFeatureExplicitlyEnabled (the exact predicate
// checked first below); this module itself is server-only and not node-loaded.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { getPaymentProvider } from "@/lib/payments/provider";
import { toHalalas } from "@/lib/payments/providers/moyasar";
import { decryptSecret } from "@/lib/crypto/secrets";

export interface CreateMoyasarSessionParams {
  restaurantId: string;
  orderId: string;
  /** The tenant's `restaurants.feature_flags`. The ONLY gate for this path. */
  featureFlags: Record<string, unknown> | null | undefined;
  /** UX-only redirect after the hosted page — NOT trusted for settlement. */
  callbackUrl: string;
}

export type CreateMoyasarSessionResult =
  | { ok: true; sessionId: string; payUrl: string; providerRef: string }
  | { ok: false; error: string };

export async function createMoyasarSession(
  admin: SupabaseClient,
  params: CreateMoyasarSessionParams
): Promise<CreateMoyasarSessionResult> {
  // ── GATE FIRST — before ANY DB read. Flag OFF ⇒ fully inert. ──────────────
  if (!isFeatureExplicitlyEnabled("psp_payments", params.featureFlags ?? null)) {
    return { ok: false, error: "psp_disabled" };
  }

  const { restaurantId, orderId, callbackUrl } = params;

  // 1) Per-tenant PSP config (psp_* columns — reached ONLY past the gate).
  const { data: rest, error: restErr } = await admin
    .from("restaurants")
    .select("psp_provider, psp_secret_key_enc")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restErr) return { ok: false, error: "psp_config_read_failed" };
  const provider = getPaymentProvider((rest?.psp_provider as string) ?? null);
  if (!provider) return { ok: false, error: "psp_not_configured" };
  const secretEnc = (rest?.psp_secret_key_enc as string | null) ?? null;
  if (!secretEnc) return { ok: false, error: "psp_secret_missing" };
  let secretKey: string;
  try {
    secretKey = decryptSecret(secretEnc);
  } catch {
    return { ok: false, error: "psp_secret_undecryptable" };
  }

  // 2) SERVER-PRICED amount — order total from the DB, never client input.
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, total, currency, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: "order_not_found" };
  if ((order.restaurant_id as string) !== restaurantId) {
    return { ok: false, error: "order_tenant_mismatch" };
  }
  const total = Number(order.total);
  const displayCurrency = (order.currency as string) || "ر.س";
  let amountMinor: number;
  try {
    amountMinor = toHalalas(total);
  } catch {
    return { ok: false, error: "amount_invalid" };
  }
  if (amountMinor <= 0) return { ok: false, error: "amount_nonpositive" };

  // 3) Create the session row FIRST (status 'created') so provider metadata can
  //    carry a real sessionId before we call the PSP.
  const { data: sess, error: insErr } = await admin
    .from("payment_sessions")
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      provider: provider.id, // 'moyasar'
      amount: total,
      currency: displayCurrency,
      status: "created",
    })
    .select("id")
    .single();
  if (insErr || !sess) return { ok: false, error: "session_insert_failed" };
  const sessionId = sess.id as string;

  // 4) Create the hosted payment at the PSP.
  let created;
  try {
    created = await provider.createPayment({
      amountMinor,
      currency: "SAR", // ISO the provider expects — distinct from the display glyph
      description: `Order ${orderId}`,
      callbackUrl,
      metadata: { sessionId, restaurantId, orderId },
      secretKey,
    });
  } catch {
    // A failed create must NOT present as link_sent. Mark failed, report back.
    await admin
      .from("payment_sessions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    return { ok: false, error: "provider_create_failed" };
  }

  // 5) Persist provider_ref + link and advance → link_sent.
  const { error: updErr } = await admin
    .from("payment_sessions")
    .update({
      provider_ref: created.providerRef,
      link: created.payUrl,
      status: "link_sent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (updErr) return { ok: false, error: "session_update_failed" };

  return { ok: true, sessionId, payUrl: created.payUrl, providerRef: created.providerRef };
}
