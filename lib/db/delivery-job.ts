// ============================================================================
// Kivo Delivery Network — Day 1: persist an operator-typed delivery job.
// SERVER ONLY.
//
// WHY THIS EXISTS (the order_id constraint):
//   public.deliveries.order_id is `uuid NOT NULL references public.orders(id)`,
//   with a UNIQUE index (deliveries_order_idx). Every delivery in this codebase is
//   therefore born from exactly one orders row — today only via
//   ensureDeliveryRowForOrder(), which additionally requires the order to already
//   exist with fulfillment='delivery'. A hand-typed Day-1 job has no upstream
//   order, so something has to give.
//
//   Two ways out were available:
//     (A) make order_id nullable + move phone/address/COD onto `deliveries`.
//         That forks loadOrderSummary, orderHasAssignedDriver, captureCodOnDelivered,
//         getRunByToken, markDeliveryDelivered and the deliveries↔orders join in
//         listDeliveries — i.e. a redesign of a module that is shared with the
//         existing order flow, plus a production migration.
//     (B) CREATE THE MINIMAL BACKING ORDER, then reuse createDeliveryForOrder().
//
//   We take (B). public.orders needs only restaurant_id + order_number to be
//   non-null (every other column carries a usable default), so a manual job is a
//   legitimate, complete order row — just one whose lines are empty and whose
//   channel is the operator instead of WhatsApp. The payoff is that NOTHING
//   downstream changes: token minting, the driver page, the status machine, COD
//   capture, the customer tracking page and the operator list all keep working
//   unmodified, and NO schema migration is required for tonight.
//
//   Manual jobs are identifiable by orders.source = MANUAL_JOB_SOURCE.
// ============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/messaging/phone";
import { nextOrderNumber } from "@/lib/db/orders-create";
import { createDeliveryForOrder } from "@/lib/db/delivery";
import { validateManualJob, type ManualJobInput, type ManualJobError } from "@/lib/delivery/manual-job";

/** orders.source value that marks a hand-dispatched Day-1 job. */
export const MANUAL_JOB_SOURCE = "manual_delivery";

export interface ManualJobCreated {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  customerPhone: string;
}

export type CreateManualJobResult =
  | { ok: true; job: ManualJobCreated }
  | { ok: false; error: ManualJobError | "create_failed" };

/**
 * Create a delivery job the operator typed by hand, and return the delivery id the
 * existing assign endpoint expects.
 *
 * Order of writes matters: customer → order → delivery. Each step is only reached
 * once the previous one has a confirmed row, so a mid-way failure leaves no
 * delivery pointing at a half-built order.
 */
export async function createManualDeliveryJob(
  admin: SupabaseClient,
  restaurantId: string,
  input: ManualJobInput
): Promise<CreateManualJobResult> {
  // Tenant country disambiguates a locally-typed number (05… / 01…).
  const { data: rest } = await admin
    .from("restaurants")
    .select("country,currency")
    .eq("id", restaurantId)
    .maybeSingle();
  const country = (rest as { country?: string | null } | null)?.country ?? null;
  const currency = (rest as { currency?: string | null } | null)?.currency || "ر.س";

  const check = validateManualJob(input, (raw) => normalizePhone(raw, country));
  if (!check.ok) return { ok: false, error: check.error };
  const job = check.job;

  // 1. Customer — upsert on the existing unique (restaurant_id, phone) so repeat
  //    jobs for the same number reuse one customer row (and so loadOrderSummary
  //    resolves customerPhone for the driver page / WhatsApp dispatch for free).
  const { data: cust, error: custErr } = await admin
    .from("customers")
    .upsert(
      { restaurant_id: restaurantId, phone: job.customerPhone, ...(job.customerName ? { name: job.customerName } : {}) },
      { onConflict: "restaurant_id,phone" }
    )
    .select("id")
    .maybeSingle();
  if (custErr || !cust) return { ok: false, error: "create_failed" };
  const customerId = (cust as { id: string }).id;

  // 2. Order — the minimal legitimate backing row (see header). COD present →
  //    leave it unpaid so the existing captureCodOnDelivered fires on `delivered`;
  //    no COD → mark it paid so that same path correctly does NOT open a cash
  //    ledger entry for a job with nothing to collect.
  const orderNumber = await nextOrderNumber(admin, restaurantId);
  const isCod = job.codAmount !== null;
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      restaurant_id: restaurantId,
      order_number: orderNumber,
      customer_id: customerId,
      fulfillment: "delivery",
      items: [],
      subtotal: isCod ? job.codAmount : 0,
      total: isCod ? job.codAmount : 0,
      currency,
      address: job.address,
      lat: job.lat,
      lng: job.lng,
      notes: job.reference,
      source: MANUAL_JOB_SOURCE,
      order_status: "ready",
      payment_status: isCod ? "unpaid" : "paid",
      payment_method: isCod ? "cod" : null,
    })
    .select("id")
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: "create_failed" };
  const orderId = (order as { id: string }).id;

  // 3. Delivery — the SAME creator the WhatsApp/storefront path uses. Idempotent
  //    on order_id, so it upholds the unique index rather than working around it.
  let deliveryId: string | null = null;
  try {
    const res = await createDeliveryForOrder(admin, { orderId, restaurantId });
    deliveryId = res.deliveryId;
  } catch {
    deliveryId = null;
  }
  if (!deliveryId) return { ok: false, error: "create_failed" };

  // eslint-disable-next-line local-rules/no-unchecked-supabase-write -- event-log insert; failure here must not undo a created job.
  await admin.from("delivery_events").insert({
    delivery_id: deliveryId,
    type: "manual_job_created",
    payload: { orderNumber, hasPin: job.lat !== null, cod: isCod },
  });

  return { ok: true, job: { deliveryId, orderId, orderNumber, customerPhone: job.customerPhone } };
}
