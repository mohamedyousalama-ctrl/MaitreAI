// ============================================================================
// Kivo (KSA) — WO-3c: Moyasar webhook handler (payment truth) — SERVER ONLY.
// The signed settlement callback. This is the ONLY inbound that flips a payment
// session to 'paid' and stamps the order — so it is fail-closed and idempotent at
// TWO layers (provider event-dedup + terminal-state no-op), and it never trusts
// the payload for tenant or amount.
//
// ORDER (fail-closed): parse → resolve the session BY provider_ref (the only pre-
// verify DB read — it decides which tenant's secret to verify against; no mutation,
// no notify, no body logging) → verify the signature against THAT tenant's webhook
// secret (invalid → 401, nothing else) → flag gate (off → 410, byte-zero effects)
// → event-dedup → terminal-state no-op → transition → notify.
//
// The admin client + all effectful calls are INJECTED so the whole flow is unit-
// testable against a fake admin without a live provider/PSP.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moyasarProvider, toHalalas } from "@/lib/payments/providers/moyasar";
import type { WebhookVerification } from "@/lib/payments/provider";
import { markPaymentSessionPaid } from "@/lib/payments/transitions";
import { decryptSecret } from "@/lib/crypto/secrets";
import { isFeatureExplicitlyEnabled } from "@/lib/tenant/tier";
import { recordCriticalAlert, type CriticalAlertInput } from "@/lib/alerts/record";
import { runWithTenantWhatsAppCreds } from "@/lib/messaging/tenant-creds";
import { sendWhatsAppText } from "@/lib/messaging/outbound";

/** Deterministic Arabic confirmation sent to the customer on a confirmed payment. */
export function paidConfirmationText(orderNumber: string): string {
  return `تم تأكيد الدفع ✅ — طلبك رقم ${orderNumber} مؤكد. شكراً لك 🌟`;
}

export interface MoyasarWebhookResult {
  httpStatus: number;
  outcome:
    | "invalid_json" | "no_provider_ref" | "unknown_session" | "invalid_signature"
    | "flag_off" | "duplicate_event" | "noop_terminal" | "amount_mismatch_held"
    | "paid" | "paid_noop" | "failed" | "expired" | "ignored";
}

interface SessionRow {
  id: string;
  restaurant_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  orders?: { order_number?: string | null; customers?: { phone?: string | null } | null } | null;
}

export interface MoyasarWebhookDeps {
  verify?: (rawBody: string, headers: Record<string, string | undefined>, secret: string) => WebhookVerification;
  decrypt?: (enc: string) => string;
  recordAlert?: (admin: SupabaseClient, input: CriticalAlertInput) => Promise<void>;
  /** Tenant-bound send (defaults to runWithTenantWhatsAppCreds + sendWhatsAppText). */
  notify?: (admin: SupabaseClient, restaurantId: string, to: string, text: string) => Promise<void>;
}

function maskRef(ref: string): string {
  return ref.length >= 4 ? `…${ref.slice(-4)}` : "unknown";
}

/**
 * Handle one Moyasar webhook delivery. Returns the HTTP status + a machine outcome
 * (for tests). Never throws — any unexpected error is swallowed to a 200 so the
 * provider doesn't hammer us, but no money-state changes on an error path.
 */
export async function handleMoyasarWebhook(
  admin: SupabaseClient,
  rawBody: string,
  headers: Record<string, string | undefined>,
  deps: MoyasarWebhookDeps = {}
): Promise<MoyasarWebhookResult> {
  const verify = deps.verify ?? moyasarProvider.verifyWebhook;
  const decrypt = deps.decrypt ?? decryptSecret;
  const recordAlert = deps.recordAlert ?? recordCriticalAlert;
  const notify =
    deps.notify ??
    ((a: SupabaseClient, rid: string, to: string, text: string) =>
      runWithTenantWhatsAppCreds(a, rid, () => sendWhatsAppText({ to, text }).then(() => undefined)));

  // 1. Parse (invalid JSON → 400, no body logged).
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { httpStatus: 400, outcome: "invalid_json" };
  }
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const providerRef = typeof data.id === "string" ? data.id : "";
  if (!providerRef) return { httpStatus: 400, outcome: "no_provider_ref" };

  // 2. Resolve the session BY provider_ref (the only pre-verify read — it decides
  //    whose secret to verify against). Unknown session → swallow 200 (never leak).
  const { data: sessionRaw } = await admin
    .from("payment_sessions")
    .select("id, restaurant_id, order_id, amount, currency, status, orders(order_number, customers(phone))")
    .eq("provider_ref", providerRef)
    .maybeSingle();
  const session = sessionRaw as SessionRow | null;
  if (!session) {
    console.log(`[moyasar:webhook] unknown session for provider_ref ${maskRef(providerRef)} — swallowed`);
    return { httpStatus: 200, outcome: "unknown_session" };
  }
  const restaurantId = session.restaurant_id;

  // 3. Load THIS tenant's webhook secret + flags (service-role read).
  const { data: rest } = await admin
    .from("restaurants")
    .select("psp_webhook_secret_enc, feature_flags")
    .eq("id", restaurantId)
    .single();
  let secret = "";
  try {
    const enc = (rest?.psp_webhook_secret_enc as string | null) ?? "";
    secret = enc ? decrypt(enc) : "";
  } catch {
    secret = "";
  }

  // 4. SIGNATURE — fail closed. Invalid/missing → 401, no processing, no body log.
  const verification = verify(rawBody, headers, secret);
  if (!verification.valid) {
    return { httpStatus: 401, outcome: "invalid_signature" };
  }

  // 5. FLAG gate — off → 410, byte-zero side effects.
  if (!isFeatureExplicitlyEnabled("psp_payments", (rest?.feature_flags ?? null) as Record<string, unknown> | null)) {
    return { httpStatus: 410, outcome: "flag_off" };
  }

  // 6. EVENT DEDUP (layer 1) — insert-first; a re-delivered event → 200 no-op.
  const eventId =
    typeof payload.id === "string" && payload.id
      ? payload.id
      : `${verification.event ?? "event"}:${providerRef}:${verification.status ?? ""}`;
  const { error: dedupErr } = await admin.from("processed_payment_events").insert({
    restaurant_id: restaurantId,
    provider: "moyasar",
    event_id: eventId,
    session_id: session.id,
    event_status: verification.status ?? null,
  });
  if (dedupErr) {
    if ((dedupErr as { code?: string }).code === "23505") {
      console.log(`[moyasar:webhook] duplicate event ${maskRef(eventId)} — no-op`);
      return { httpStatus: 200, outcome: "duplicate_event" };
    }
    // A dedup-insert failure that ISN'T a duplicate: do not process money on an
    // uncertain guard — swallow 200 (provider retries; markPaid is still atomic).
    console.error("[moyasar:webhook] dedup insert failed (non-duplicate):", (dedupErr as { message?: string }).message);
    return { httpStatus: 200, outcome: "ignored" };
  }

  const status = verification.status;

  // 7. TERMINAL-STATE no-op (layer 2) — an out-of-order failed/expired AFTER paid
  //    must not regress a settled session.
  if ((status === "failed" || status === "expired" || status === "cancelled") && session.status === "paid") {
    console.log(`[moyasar:webhook] ${status} after paid for session ${session.id} — no-op`);
    return { httpStatus: 200, outcome: "noop_terminal" };
  }

  // 8. TRANSITIONS.
  if (status === "paid") {
    // AMOUNT VERIFICATION: the charged minor amount MUST equal the session amount
    // (the engine value at create time). Mismatch → alert + HOLD; never mark paid.
    let expectedMinor: number | null = null;
    try { expectedMinor = toHalalas(Number(session.amount)); } catch { expectedMinor = null; }
    const actualMinor = typeof data.amount === "number" ? data.amount : Number(data.amount);
    const currencyOk = !data.currency || String(data.currency).toUpperCase() === String(session.currency).toUpperCase();
    if (expectedMinor === null || actualMinor !== expectedMinor || !currencyOk) {
      await recordAlert(admin, {
        restaurantId,
        type: "payment_amount_mismatch",
        detail: `Moyasar paid amount ${actualMinor} ${String(data.currency ?? "")} != session ${expectedMinor} ${session.currency} (session ${session.id}) — held, NOT marked paid`,
        context: { sessionId: session.id, orderId: session.order_id, providerRef },
      });
      return { httpStatus: 200, outcome: "amount_mismatch_held" };
    }

    const { changed } = await markPaymentSessionPaid(admin, session.id);
    if (!changed) {
      // Already paid (out-of-order / retry that slipped past dedup) → no double notify.
      return { httpStatus: 200, outcome: "paid_noop" };
    }
    // Stamp the order paid (engine value from the verified session amount).
    await admin.from("orders").update({ payment_status: "paid" }).eq("id", session.order_id).eq("restaurant_id", restaurantId);
    // Customer notify — once, tenant-bound, deterministic. Best-effort.
    const phone = session.orders?.customers?.phone ?? "";
    const orderNumber = session.orders?.order_number ?? "";
    if (phone) {
      try { await notify(admin, restaurantId, phone, paidConfirmationText(orderNumber)); }
      catch (e) { console.error("[moyasar:webhook] paid notify failed (non-blocking):", e); }
    }
    return { httpStatus: 200, outcome: "paid" };
  }

  if (status === "failed" || status === "expired") {
    await admin
      .from("payment_sessions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .neq("status", "paid"); // never overwrite a paid session
    return { httpStatus: 200, outcome: status };
  }

  // Any other status (created/opened/refunded/…) — nothing money-moving here.
  return { httpStatus: 200, outcome: "ignored" };
}
