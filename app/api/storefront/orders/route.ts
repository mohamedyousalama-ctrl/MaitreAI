import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { ensureCustomerId } from "@/lib/db/orders";
import { nextOrderNumber, uuidFromHash } from "@/lib/db/orders-create";
import { recomputeOrderPricing } from "@/lib/order-pricing";
import { ensureDeliveryRowForOrder } from "@/lib/db/delivery";
import { loadResolvedPaymentMethods, offeredMethods, recordPaymentSnapshot } from "@/lib/payments/resolve";

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
  const fingerprint = JSON.stringify({
    source: "web",
    r: restaurantId,
    c: { name: customerName, phone: customerPhone },
    b: branch.id,
    f: fulfillment,
    z: priced.deliveryZone?.id ?? "",
    a: address ?? "",
    n: notes ?? "",
    lines: priced.lines.map((line) => line.fingerprint),
    total: priced.total,
  });
  const id = uuidFromHash(fingerprint);
  const orderNumber = await nextOrderNumber(admin, restaurantId);

  const { data, error } = await admin
    .from("orders")
    .upsert(
      {
        id,
        restaurant_id: restaurantId,
        order_number: orderNumber,
        customer_id: customerId,
        branch_id: branch.id,
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

  if (error) return bad("تعذر إنشاء الطلب. حاول مرة أخرى.", 500);

  // DLV1 — every delivery order gets a pending delivery row so it appears in
  // التوصيل and can be assigned a driver (R3b then lets it be delivered). Same
  // idempotent helper the WhatsApp path uses; best-effort so it never blocks the
  // order response. The helper no-ops for pickup orders.
  if (fulfillment === "delivery") {
    try {
      await ensureDeliveryRowForOrder(admin, id, restaurantId);
    } catch (e) {
      console.error("[storefront/orders] delivery row create error", e);
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

  return NextResponse.json({
    orderId: row.id,
    orderNumber: row.order_number,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    taxAmount: Number(row.tax_amount),
    taxRate: Number(row.tax_rate),
    total: Number(row.total),
    currency: row.currency,
    created,
  });
}
