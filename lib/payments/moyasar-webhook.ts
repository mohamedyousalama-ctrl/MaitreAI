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
import { enqueueRetryJob } from "@/lib/jobs/retry-queue";
import { checkOrderSafetyHold } from "@/lib/db/safety-hold-guard";

/** Deterministic Arabic confirmation sent to the customer on a confirmed payment. */
export function paidConfirmationText(orderNumber: string): string {
  return `تم تأكيد الدفع ✅ — طلبك رقم ${orderNumber} مؤكد. شكراً لك 🌟`;
}

export interface MoyasarWebhookResult {
  httpStatus: number;
  outcome:
    | "invalid_json" | "no_provider_ref" | "unknown_session" | "invalid_signature"
    | "flag_off" | "duplicate_event" | "retry_later" | "noop_terminal"
    | "amount_mismatch_held" | "order_stamp_failed"
    | "paid" | "paid_noop" | "failed" | "expired" | "ignored";
}

interface SessionRow {
  id: string;
  restaurant_id: string;
  order_id: string;
  amount: number;
  currency: string; // DISPLAY glyph (e.g. 'ر.س') — NOT what the PSP uses
  psp_currency: string | null; // ISO the session was created with at the PSP (e.g. 'SAR')
  status: string;
}

// Tiny, explicit glyph→ISO fallback for legacy rows created before psp_currency
// existed (null). Deliberately minimal — the source of truth is psp_currency.
const GLYPH_TO_ISO: Record<string, string> = { "ر.س": "SAR", "ج.م": "EGP" };

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
  //    whose secret to verify against). HARDENING (guardian ruling 1): select ONLY
  //    the columns needed for verification/routing (id, restaurant_id, order_id,
  //    amount, currency, psp_currency, status) — all verification data, NEVER PII
  //    (customer phone / order_number). Those are loaded ONLY AFTER the signature
  //    passes, on the paid notify path. Unknown session → swallow 200 (never leak).
  const { data: sessionRaw } = await admin
    .from("payment_sessions")
    .select("id, restaurant_id, order_id, amount, currency, psp_currency, status")
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

  // 6. EVENT DEDUP (layer 1) — CHECK first (read-only). The event is RECORDED only
  //    AFTER its durable effect (markProcessed, below), so a failed transition can
  //    never consume the event and strand a session. A dedup-LOOKUP infrastructure
  //    error (e.g. the table missing because the route went live before the
  //    migration applied) FAILS LOUD (503) so Moyasar retries and the gap is
  //    visible — a missing table must never silently eat payments.
  const eventId =
    typeof payload.id === "string" && payload.id
      ? payload.id
      : `${verification.event ?? "event"}:${providerRef}:${verification.status ?? ""}`;
  const { data: seen, error: seenErr } = await admin
    .from("processed_payment_events")
    .select("event_id")
    .eq("provider", "moyasar")
    .eq("restaurant_id", restaurantId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (seenErr) {
    console.error("[moyasar:webhook] dedup lookup failed — failing loud:", (seenErr as { message?: string }).message);
    return { httpStatus: 503, outcome: "retry_later" };
  }
  if (seen) {
    console.log(`[moyasar:webhook] duplicate event ${maskRef(eventId)} — no-op`);
    return { httpStatus: 200, outcome: "duplicate_event" };
  }

  // Record the event as processed — call ONLY after a durable effect. 23505 (a
  // concurrent delivery already recorded it) is fine: the transitions are
  // idempotent. Any other error is logged, not fatal (effect already durable).
  async function markProcessed(eventStatus: string | null | undefined): Promise<void> {
    const { error } = await admin.from("processed_payment_events").insert({
      restaurant_id: restaurantId, provider: "moyasar", event_id: eventId,
      session_id: session!.id, event_status: eventStatus ?? null,
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[moyasar:webhook] processed-event record failed (effect already durable):", (error as { message?: string }).message);
    }
  }

  const status = verification.status;

  // 7. TERMINAL-STATE no-op (layer 2) — an out-of-order failed/expired AFTER paid
  //    must not regress a settled session. (No effect → no event recorded.)
  if ((status === "failed" || status === "expired" || status === "cancelled") && session.status === "paid") {
    console.log(`[moyasar:webhook] ${status} after paid for session ${session.id} — no-op`);
    return { httpStatus: 200, outcome: "noop_terminal" };
  }

  // 8. TRANSITIONS.
  if (status === "paid") {
    // WO-PAYLINK-EXPIRY — capture the pre-settlement session status NOW (before any
    // transition mutates it) so the "paid on an expired link" signal is snapshot at
    // read time, not re-read after markPaymentSessionPaid has flipped it to 'paid'.
    const wasExpired = session.status === "expired";
    // VERIFY amount + currency against the SESSION. Amount: charged minor units ==
    // the engine value at create time. Currency: compared against psp_currency —
    // the ISO the session was created with at the PSP (e.g. 'SAR') — NOT the
    // display glyph, with a tiny glyph→ISO fallback for legacy null rows. A
    // missing/mismatched currency or amount → alert + HOLD; never mark paid.
    let expectedMinor: number | null = null;
    try { expectedMinor = toHalalas(Number(session.amount)); } catch { expectedMinor = null; }
    const actualMinor = typeof data.amount === "number" ? data.amount : Number(data.amount);
    const sessionIso = (session.psp_currency || GLYPH_TO_ISO[session.currency] || "").toUpperCase();
    const payloadCurrency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "";
    const currencyOk = payloadCurrency !== "" && sessionIso !== "" && payloadCurrency === sessionIso;
    if (expectedMinor === null || actualMinor !== expectedMinor || !currencyOk) {
      await recordAlert(admin, {
        restaurantId,
        type: "payment_amount_mismatch",
        detail: `Moyasar paid ${actualMinor} ${payloadCurrency || "?"} != session ${expectedMinor} ${sessionIso || session.currency} (session ${session.id}) — held, NOT marked paid`,
        context: { sessionId: session.id, orderId: session.order_id, providerRef },
      });
      await markProcessed(status); // durable hold decision — don't re-alert on every retry
      return { httpStatus: 200, outcome: "amount_mismatch_held" };
    }

    // Stamp the order paid FIRST and confirm a row was actually stamped. If none
    // (e.g. the order is gone) → alert + HOLD: do NOT mark the session paid, do
    // NOT notify, and do NOT consume the event, so a retry can still complete it.
    const { data: stamped } = await admin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", session.order_id)
      .eq("restaurant_id", restaurantId)
      .select("id");
    if (!Array.isArray(stamped) || stamped.length === 0) {
      await recordAlert(admin, {
        restaurantId,
        type: "payment_stamp_failed",
        detail: `Moyasar paid but order ${session.order_id} not stamped (0 rows) — session NOT marked paid, held (session ${session.id})`,
        context: { sessionId: session.id, orderId: session.order_id, providerRef },
      });
      return { httpStatus: 200, outcome: "order_stamp_failed" };
    }

    // Order stamped → mark the session paid (atomic/idempotent) and record the event.
    const { changed } = await markPaymentSessionPaid(admin, session.id);
    await markProcessed(status);
    // Notify ONCE — only when THIS delivery flipped the session (changed guard →
    // no double-notify on a retry/out-of-order). Best-effort. PII (order_number +
    // phone) is loaded HERE, post-verify, NOT in the pre-verify read.
    if (!changed) return { httpStatus: 200, outcome: "paid_noop" };

    // WO-PAYLINK-EXPIRY (ruling): if the paid event settled a session that had
    // already EXPIRED (customer paid a stale link), money truth stands — we've
    // recorded paid + stamped the order above, NEVER refused — but raise an alert
    // so a human reconciles a possible double-link. Best-effort, on the flip only.
    if (wasExpired) {
      try {
        await recordAlert(admin, {
          restaurantId,
          type: "paid_after_expiry",
          detail: `Moyasar settled an EXPIRED session ${session.id} (stale link paid) — order ${session.order_id} recorded paid (money truth); reconcile for a possible duplicate link.`,
          context: { sessionId: session.id, orderId: session.order_id, providerRef },
        });
      } catch (e) {
        console.error("[moyasar:webhook] paid_after_expiry alert failed (non-blocking):", e);
      }
    }

    // WO-SAFE-1 companion (ruling): money truth stands — the order is already stamped
    // paid (Moyasar settled) and SAFE-1 blocks the OPERATOR from advancing it to
    // preparing. But a paid webhook landing on an order whose conversation is under an
    // active safety hold needs a human's eyes → raise a system alert (best-effort, on
    // the flip only). We do NOT block the payment (would strand real money).
    try {
      const hold = await checkOrderSafetyHold(admin, restaurantId, session.order_id);
      if (hold.held) {
        await recordAlert(admin, {
          restaurantId,
          type: "paid_while_safety_held",
          detail: `Payment settled on order ${session.order_id} while its conversation is under an active safety hold — order held from kitchen (SAFE-1); needs review before fulfilment.`,
          context: { sessionId: session.id, orderId: session.order_id, conversationId: hold.conversationId, providerRef },
        });
      }
    } catch (e) {
      console.error("[moyasar:webhook] safety-hold alert check failed (non-blocking):", e);
    }

    const { data: notifyRow } = await admin
      .from("payment_sessions")
      .select("orders(order_number, customers(phone))")
      .eq("id", session.id)
      .maybeSingle();
    const orders = (notifyRow as { orders?: { order_number?: string | null; customers?: { phone?: string | null } | null } | null } | null)?.orders ?? null;
    const phone = orders?.customers?.phone ?? "";
    const orderNumber = orders?.order_number ?? "";
    if (phone) {
      const text = paidConfirmationText(orderNumber);
      try {
        await notify(admin, restaurantId, phone, text);
      } catch (e) {
        // Non-blocking, but no longer silently lost: enqueue a DURABLE retry job
        // (item 11) so the customer's paid confirmation is re-attempted by the cron
        // with backoff instead of dying with this webhook delivery.
        console.error("[moyasar:webhook] paid notify failed (durable retry enqueued):", e);
        await enqueueRetryJob(admin, {
          kind: "paid_notify",
          payload: { restaurantId, to: phone, text },
          restaurantId,
        });
      }
    }
    return { httpStatus: 200, outcome: "paid" };
  }

  if (status === "failed" || status === "expired") {
    // Persist the terminal state FIRST; record the event as processed only after
    // the update is durable. A DB error → fail loud (503, retriable) rather than
    // consume the event with the session left non-terminal.
    const { error: updErr } = await admin
      .from("payment_sessions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .neq("status", "paid"); // never overwrite a paid session
    if (updErr) {
      console.error(`[moyasar:webhook] ${status} update failed — failing loud:`, (updErr as { message?: string }).message);
      return { httpStatus: 503, outcome: "retry_later" };
    }
    await markProcessed(status);
    return { httpStatus: 200, outcome: status };
  }

  // Any other status (created/opened/refunded/…) — nothing money-moving here.
  return { httpStatus: 200, outcome: "ignored" };
}
