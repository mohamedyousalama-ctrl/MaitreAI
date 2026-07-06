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
import type { PaymentSessionStatus } from "@/lib/types";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { getPaymentProvider } from "@/lib/payments/provider";
import { toHalalas } from "@/lib/payments/providers/moyasar";
import { decryptSecret } from "@/lib/crypto/secrets";
import { ACTIVE_STATUSES, DEFAULT_EXPIRY_MS, decideSessionAction } from "@/lib/payments";

export interface CreateMoyasarSessionParams {
  restaurantId: string;
  orderId: string;
  /** The tenant's `restaurants.feature_flags`. The ONLY gate for this path. */
  featureFlags: Record<string, unknown> | null | undefined;
  /** UX-only redirect after the hosted page — NOT trusted for settlement. */
  callbackUrl: string;
}

export type CreateMoyasarSessionResult =
  | { ok: true; sessionId: string; payUrl: string; providerRef: string; reused?: boolean }
  | { ok: false; error: string; detail?: string };

export async function createMoyasarSession(
  admin: SupabaseClient,
  params: CreateMoyasarSessionParams
): Promise<CreateMoyasarSessionResult> {
  // ── GATE FIRST — before ANY DB read. Flag OFF ⇒ fully inert. ──────────────
  if (!isFeatureExplicitlyEnabled("psp_payments", params.featureFlags ?? null)) {
    return { ok: false, error: "psp_disabled" };
  }

  const { restaurantId, orderId, callbackUrl } = params;
  const nowMs = Date.now();

  // ── IDEMPOTENCY pre-check (WO-3b): reuse an active session, refuse if the
  //    order is already paid, else fall through to create. Scoped by
  //    (restaurant_id, order_id), so the same order_id under a different tenant
  //    is a different key set — cross-tenant sessions stay independent.
  const { data: existing, error: existErr } = await admin
    .from("payment_sessions")
    .select("id, status, link, provider_ref, expires_at")
    .eq("restaurant_id", restaurantId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (existErr) return { ok: false, error: "session_lookup_failed" };
  const rows = (existing ?? []).map((r) => {
    const link = ((r.link as string | null) ?? "").trim();
    return {
      id: r.id as string,
      status: r.status as PaymentSessionStatus,
      link,
      providerRef: (r.provider_ref as string | null) ?? "",
      expiresAtMs: r.expires_at ? new Date(r.expires_at as string).getTime() : null,
      hasLink: !!link,
    };
  });
  const decision = decideSessionAction(rows, nowMs);
  if (decision.action === "already_paid") return { ok: false, error: "order_already_paid" };
  // An active session exists but its checkout link isn't populated yet (a
  // concurrent request is mid-flight between insert and the PSP call). Tell the
  // caller to retry rather than hand back an empty payUrl.
  if (decision.action === "pending") return { ok: false, error: "session_pending" };
  if (decision.action === "reuse") {
    const s = decision.session;
    // WO-PAYLINK-EXPIRY (Codex P2): do NOT extend the LOCAL expiry on reuse. The
    // Moyasar invoice now hard-expires at its ORIGINAL expired_at (set at create),
    // so extending payment_sessions.expires_at past it would keep handing back a
    // provider-dead URL and mis-report it as fresh. Local expiry stays aligned
    // with the provider; once it lapses, decideSessionAction mints a fresh link.
    return { ok: true, sessionId: s.id, payUrl: s.link, providerRef: s.providerRef, reused: true };
  }

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
    .select("id, total, currency, restaurant_id, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: "order_not_found" };
  if ((order.restaurant_id as string) !== restaurantId) {
    return { ok: false, error: "order_tenant_mismatch" };
  }
  // Authoritative paid guard: if the ORDER itself is already paid (via any path —
  // PSP, COD, another session), never open a new payable session for it.
  if ((order.payment_status as string) === "paid") return { ok: false, error: "order_already_paid" };
  const total = Number(order.total);
  const displayCurrency = (order.currency as string) || "ر.س";
  let amountMinor: number;
  try {
    amountMinor = toHalalas(total);
  } catch {
    return { ok: false, error: "amount_invalid" };
  }
  if (amountMinor <= 0) return { ok: false, error: "amount_nonpositive" };

  // WO-PAYLINK-EXPIRY — ONE expiry instant for both our session row AND the
  // provider invoice (createPayment below), so the hosted link dies at Moyasar
  // exactly when our session expires.
  const expiresAtIso = new Date(nowMs + DEFAULT_EXPIRY_MS).toISOString();

  // 3) Create the session row FIRST (status 'created') so provider metadata can
  //    carry a real sessionId before we call the PSP.
  const { data: sess, error: insErr } = await admin
    .from("payment_sessions")
    .insert({
      restaurant_id: restaurantId,
      order_id: orderId,
      provider: provider.id, // 'moyasar'
      amount: total,
      currency: displayCurrency, // DISPLAY glyph (e.g. 'ر.س')
      psp_currency: "SAR", // ISO currency actually sent to Moyasar (createPayment below) — the webhook verifies against THIS, not the glyph
      status: "created",
      expires_at: expiresAtIso,
    })
    .select("id")
    .single();
  if (insErr || !sess) {
    // Concurrency: the partial UNIQUE index (0059) on (restaurant_id, order_id)
    // over ACTIVE statuses means a request that raced us already created the
    // active session. The DB arbitrated (no read-then-write race) — reuse the
    // winner instead of minting a duplicate invoice.
    if ((insErr as { code?: string } | null)?.code === "23505") {
      const { data: raced } = await admin
        .from("payment_sessions")
        .select("id, link, provider_ref")
        .eq("restaurant_id", restaurantId)
        .eq("order_id", orderId)
        .in("status", ACTIVE_STATUSES as readonly string[])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (raced?.id) {
        const racedLink = ((raced.link as string | null) ?? "").trim();
        // The winner may still be mid-flight ('created', no link). Don't hand
        // back an empty payUrl — tell the caller to retry.
        if (!racedLink) return { ok: false, error: "session_pending" };
        return {
          ok: true,
          sessionId: raced.id as string,
          payUrl: racedLink,
          providerRef: (raced.provider_ref as string | null) ?? "",
          reused: true,
        };
      }
    }
    return { ok: false, error: "session_insert_failed" };
  }
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
      expiresAt: expiresAtIso, // WO-PAYLINK-EXPIRY — provider dead-links at session expiry
    });
  } catch (e) {
    // DIAGNOSTIC (one-off): surface Moyasar's raw rejection body (moyasar.ts throws
    // `moyasar_create_failed status=<code> <body>`), previously swallowed here.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[psp/create] moyasar_create_failed:", detail);
    // A failed create must NOT present as link_sent. Mark failed, report back.
    await admin
      .from("payment_sessions")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    return { ok: false, error: "provider_create_failed", detail };
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
  if (updErr) {
    // The PSP invoice exists but we couldn't persist its ref/link. Leaving the
    // row 'created' would make it look ACTIVE with no checkout URL (a stranded
    // session). Best-effort demote to 'failed' so it isn't treated as payable;
    // the invoice still carries our {sessionId,…} metadata for later webhook
    // reconciliation (WO-3b). Swallow a secondary failure — we already error out.
    try {
      await admin
        .from("payment_sessions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    } catch {
      /* best-effort demote; the primary failure is already being returned */
    }
    return { ok: false, error: "session_update_failed" };
  }

  return { ok: true, sessionId, payUrl: created.payUrl, providerRef: created.providerRef };
}
