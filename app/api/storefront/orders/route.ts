import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { ensureCustomerId } from "@/lib/db/orders";
import { nextOrderNumber, uuidFromHash } from "@/lib/db/orders-create";
import { recomputeOrderPricing } from "@/lib/order-pricing";
import { ensureDeliveryRowForOrder } from "@/lib/db/delivery";
import { loadResolvedPaymentMethods, offeredMethods, recordPaymentSnapshot } from "@/lib/payments/resolve";
import { detectAllergenAvoidance } from "@/lib/ai/allergen-gate";

type CheckoutLine = {
  itemId: string;
  variantId?: string | null;
  optionIds?: string[];
  modifierIds?: string[];
  quantity?: number;
};

type CheckoutPayload = {
  slug?: string;
  lines?: CheckoutLine[];
  fulfillment?: "delivery" | "pickup";
  branchId?: string | null;
  zoneId?: string | null;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string;
  paymentMethod?: string;
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const STOREFRONT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const ALLERGEN_REVIEW_MESSAGE =
  "طلبك وصل ووقفناه لمراجعة ملاحظة الحساسية. الفريق هيتواصل معاك قبل أي تأكيد أو تحضير.";

export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  if (!admin) return bad("إعدادات الدفع غير متاحة حالياً.", 503);

  let payload: CheckoutPayload;
  try {
    payload = (await req.json()) as CheckoutPayload;
  } catch {
    return bad("بيانات الطلب غير صحيحة.");
  }

  const slug = clean(payload.slug).toLowerCase();
  const customerName = clean(payload.customerName);
  const customerPhone = clean(payload.customerPhone);
  const fulfillment = payload.fulfillment === "pickup" ? "pickup" : "delivery";
  if (!slug) return bad("رابط المطعم غير صحيح.");
  if (!customerName || !customerPhone) return bad("الاسم ورقم الهاتف مطلوبان.");
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) return bad("السلة فارغة.");

  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id, name, currency, active, is_open, payment_config, feature_flags")
    .ilike("slug", slug)
    .maybeSingle();
  if (restaurantError) return bad("تعذر تحميل المطعم.", 500);
  if (!restaurant || restaurant.active === false) return bad("المتجر غير موجود.", 404);
  if (restaurant.is_open === false) return bad("المطعم مغلق حالياً.");

  const restaurantId = restaurant.id as string;
  const featureFlags = ((restaurant as { feature_flags?: unknown }).feature_flags as Record<string, unknown> | null) ?? null;
  const brain = await loadBrain(admin, restaurantId);
  const branches = brain.branches.filter((b) => b.open);
  const requestedBranchId = clean(payload.branchId);
  const branch =
    (requestedBranchId ? branches.find((b) => b.id === requestedBranchId) : null) ??
    (branches.length === 1 ? branches[0] : null);
  if (!branch) return bad("اختر الفرع المناسب للطلب.");

  let address: string | null = null;
  if (fulfillment === "delivery") {
    address = clean(payload.address);
    if (!address) return bad("العنوان مطلوب للتوصيل.");
  }

  let priced;
  try {
    priced = recomputeOrderPricing({
      menuItems: brain.menuItems,
      modifiers: brain.modifiers,
      deliveryAreas: brain.deliveryAreas,
      lines: payload.lines.map((line) => ({
        itemId: clean(line.itemId),
        quantity: line.quantity,
        variantId: clean(line.variantId),
        optionIds: Array.isArray(line.optionIds) ? [...new Set(line.optionIds.map(clean).filter(Boolean))] : [],
        modifierIds: Array.isArray(line.modifierIds) ? [...new Set(line.modifierIds.map(clean).filter(Boolean))] : [],
      })),
      fulfillment,
      branchId: branch.id,
      deliveryZoneId: fulfillment === "delivery" ? clean(payload.zoneId) : null,
      taxMode: brain.taxMode,
      taxRate: brain.taxRate,
      currency: brain.profile.currency || restaurant.currency || "ج.م",
    });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "تعذر حساب الطلب.");
  }

  // S2 — payment method is server-authoritative: the acceptable set is what THIS
  // restaurant actually has enabled in payment_config, not a hardcoded list. The
  // client can't submit a method the restaurant hasn't enabled, regardless of what
  // the UI showed. A method enabled-but-unconfigured (VF on with no number) is NOT
  // acceptable — we never take a payment the restaurant can't fulfill.
  // WO-T1-PAYMENTS: offer-set truth via the single resolver (flag-off = legacy,
  // byte-identical). The acceptable-set logic below is unchanged.
  const payConfig = (
    await loadResolvedPaymentMethods(admin, restaurantId, {
      paymentConfig: (restaurant as { payment_config?: unknown }).payment_config,
      featureFlags,
    })
  ).config;
  const acceptableMethods = new Set<string>();
  if (payConfig.cod_enabled) acceptableMethods.add("cod");
  if (payConfig.vodafone_cash.enabled && (payConfig.vodafone_cash.number ?? "").trim()) acceptableMethods.add("vodafone_cash");
  // Default a missing/blank method to COD (the UI's default) — then validate it
  // against the enabled set just like an explicit choice. Unknown/disabled → reject.
  const paymentMethod = clean(payload.paymentMethod) || "cod";
  if (!acceptableMethods.has(paymentMethod)) {
    return bad("طريقة الدفع دي مش متاحة.");
  }

  // DLV6b — real picked coordinates, server-side range-validated. A bad pin is
  // worse than none, so out-of-range / non-finite values are IGNORED (stored null)
  // rather than persisted. Only kept for delivery orders; the address text stays
  // authoritative for display/receipts regardless.
  const validCoord = (v: unknown, lim: number): number | null => {
    const n = typeof v === "number" ? v : NaN;
    return Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
  };
  const latV = fulfillment === "delivery" ? validCoord(payload.lat, 90) : null;
  const lngV = fulfillment === "delivery" ? validCoord(payload.lng, 180) : null;
  // Both-or-neither: a lone coordinate is meaningless → keep a pair or nothing.
  // Spread into the upsert ONLY when a valid pair exists, so no-coords orders never
  // reference the columns (also safe if code deploys before the migration applies).
  const coordFields = latV !== null && lngV !== null ? { lat: latV, lng: lngV } : {};

  const customerId = await ensureCustomerId(admin, restaurantId, customerPhone, customerName);
  const notes = clean(payload.notes) || null;
  const allergenText = [
    notes ?? "",
    ...priced.lines.flatMap((line) => [
      line.name,
      line.variant?.name ?? "",
      ...line.choices.map((choice) => `${choice.groupName} ${choice.label}`),
      ...line.modifiers.map((modifier) => modifier.name),
    ]),
  ].filter(Boolean).join("\n");
  const allergenHit = detectAllergenAvoidance(allergenText);
  const allergyNote = allergenHit.fired
    ? `تنبيه مراجعة حساسية: ${allergenHit.term ?? "الحساسية"}`
    : null;

  const fingerprint = {
    source: "web",
    r: restaurantId,
    c: customerId ?? customerPhone,
    b: branch.id,
    f: fulfillment,
    z: priced.deliveryZone?.id ?? "",
    a: address ?? "",
    n: notes ?? "",
    lines: priced.lines.map((line) => line.fingerprint),
    total: priced.total,
  };
  const dedupeBucket = Math.floor(Date.now() / STOREFRONT_DEDUPE_WINDOW_MS);
  const id = uuidFromHash(JSON.stringify({ ...fingerprint, dedupeBucket }));

  const responseFor = (row: {
    id: string;
    order_number: string;
    total: number | string;
    subtotal: number | string;
    delivery_fee: number | string;
    tax_amount: number | string;
    tax_rate: number | string;
    currency: string;
  }, created: boolean) => {
    const body = {
      orderId: row.id,
      orderNumber: row.order_number,
      subtotal: Number(row.subtotal),
      deliveryFee: Number(row.delivery_fee),
      taxAmount: Number(row.tax_amount),
      taxRate: Number(row.tax_rate),
      total: Number(row.total),
      currency: row.currency,
      created,
      ...(allergenHit.fired
        ? { safetyReview: true, orderStatus: "pending_confirmation", message: ALLERGEN_REVIEW_MESSAGE }
        : {}),
    };
    return NextResponse.json(body, allergenHit.fired ? { status: 202 } : undefined);
  };

  // Idempotent retry of the same checkout window. This used to run only for
  // allergen-triggering submissions, to avoid orphaning a second SYSTEM_HOLD
  // conversation. It now runs for EVERY submission, because the retry costs
  // something else too: the upsert below keys on `id` and ignores duplicates, so
  // a retry inserted nothing — but only after calling nextOrderNumber.
  //
  // The old allocator was a stateless scan, so a wasted call cost nothing. The
  // atomic counter (0113) permanently increments, so every retry burned a number
  // and left a visible gap in the sequence operators reconcile COD against.
  {
    const { data: existing, error: existingErr } = await admin
      .from("orders")
      .select("id, order_number, total, subtotal, delivery_fee, tax_amount, tax_rate, currency")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) return bad("تعذر إنشاء الطلب. حاول مرة أخرى.", 500);
    if (existing) return responseFor(existing as Parameters<typeof responseFor>[0], false);
  }

  const orderNumber = await nextOrderNumber(admin, restaurantId);

  let safetyConversationId: string | null = null;
  if (allergenHit.fired) {
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({
        restaurant_id: restaurantId,
        customer_id: customerId,
        channel: "website",
        status: "مراجعة حساسية",
        owner: "human",
        ownership_state: "SYSTEM_HOLD",
        is_safety_hold: true,
        escalation_reason: "storefront_allergen",
        allergy_note: allergyNote,
      })
      .select("id")
      .single();
    if (convErr || !conv?.id) return bad("تعذر تسجيل مراجعة الحساسية. حاول مرة أخرى.", 500);
    safetyConversationId = conv.id as string;

    // eslint-disable-next-line local-rules/no-unchecked-supabase-write -- best-effort safety-review message insert; failure is logged, not a zero-row update hazard.
    const { error: msgErr } = await admin.from("messages").insert({
      restaurant_id: restaurantId,
      conversation_id: safetyConversationId,
      direction: "inbound",
      sender: "customer",
      text: [
        "Storefront order needs allergy review.",
        `Customer: ${customerName} (${customerPhone})`,
        notes ? `Notes: ${notes}` : "",
        `Items: ${priced.lines.map((line) => `${line.quantity}x ${line.name}`).join(", ")}`,
      ].filter(Boolean).join("\n"),
      status: "sent",
      meta: { source: "storefront_order", allergen_gate: true, term: allergenHit.term },
    });
    if (msgErr) console.error("[storefront/orders] safety review message create error", msgErr);
  }

  const { data, error } = await admin
    .from("orders")
    .upsert(
      {
        id,
        restaurant_id: restaurantId,
        order_number: orderNumber,
        conversation_id: safetyConversationId,
        customer_id: customerId,
        branch_id: branch.id,
        ...(allergyNote ? { allergy_note: allergyNote } : {}),
        fulfillment,
        source: "web",
        items: priced.lines.map((line) => line.orderItem),
        subtotal: priced.subtotal,
        delivery_fee: priced.deliveryFee,
        tax_amount: priced.taxAmount,
        tax_rate: priced.taxRate,
        total: priced.total,
        currency: priced.currency,
        order_status: "pending_confirmation",
        payment_status: "unpaid",
        payment_method: paymentMethod,
        address,
        ...coordFields,
        zone_id: priced.deliveryZone?.id ?? null,
        notes,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number, total, subtotal, delivery_fee, tax_amount, tax_rate, currency");

  if (error) {
    // The order did not persist. The early idempotency check above keys on the
    // ORDER row, which now does not exist — so a client retry would fall straight
    // through and create ANOTHER SYSTEM_HOLD conversation for the same basket,
    // leaving the operator a pile of duplicate allergy holds for one customer.
    // Compensate: drop the hold we just opened. Its message goes with it
    // (messages_conversation_id_fkey is ON DELETE CASCADE).
    if (safetyConversationId) {
      const { error: cleanupErr } = await admin
        .from("conversations")
        .delete()
        .eq("id", safetyConversationId)
        .eq("restaurant_id", restaurantId);
      if (cleanupErr) {
        console.error(
          "[storefront/orders] order insert failed AND the safety hold could not be rolled back — " +
            "conversation is orphaned and needs manual review",
          { conversationId: safetyConversationId, restaurantId, cleanupErr },
        );
      }
    }
    // This was invisible server-side: `bad` does not log, so a failed order
    // looked identical to a validation rejection.
    console.error("[storefront/orders] order upsert failed", {
      restaurantId,
      orderId: id,
      orderNumber,
      code: (error as { code?: string }).code,
      message: error.message,
    });
    return bad("تعذر إنشاء الطلب. حاول مرة أخرى.", 500);
  }

  // DLV1 — every delivery order gets a pending delivery row so it appears in
  // التوصيل and can be assigned a driver (R3b then lets it be delivered). Same
  // idempotent helper the WhatsApp path uses. Storefront must not return success
  // if this row cannot be created: a delivery order without a delivery row is not
  // actually dispatchable.
  if (fulfillment === "delivery") {
    try {
      const delivery = await ensureDeliveryRowForOrder(admin, id, restaurantId);
      if (!delivery.deliveryId && !delivery.skipped) {
        return bad("تعذر إنشاء سجل التوصيل. حاول مرة أخرى.", 502);
      }
    } catch (e) {
      console.error("[storefront/orders] delivery row create error", e);
      return bad("تعذر إنشاء سجل التوصيل. حاول مرة أخرى.", 502);
    }
  }

  const created = (data?.length ?? 0) > 0;
  const row = created
    ? data![0]
    : (
        await admin
          .from("orders")
          .select("id, order_number, total, subtotal, delivery_fee, tax_amount, tax_rate, currency")
          .eq("id", id)
          .maybeSingle()
      ).data;
  if (!row) return bad("تعذر تأكيد الطلب. حاول مرة أخرى.", 500);

  // WO-T1-PAYMENTS: immutable per-order snapshot of the methods offered + chosen at
  // order time. Flag-gated + best-effort (no-op flag-off / pre-ceremony); only on a
  // genuinely-created row so an idempotent re-POST never double-writes.
  if (created) {
    await recordPaymentSnapshot(admin, {
      orderId: id,
      restaurantId,
      offered: offeredMethods(payConfig),
      chosen: paymentMethod,
      featureFlags,
    });
  }

  return responseFor(row as Parameters<typeof responseFor>[0], created);
}
