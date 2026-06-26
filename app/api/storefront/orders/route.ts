import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { ensureCustomerId } from "@/lib/db/orders";
import { nextOrderNumber, uuidFromHash } from "@/lib/db/orders-create";
import { recomputeOrderPricing } from "@/lib/order-pricing";

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
    .select("id, name, currency, active, is_open")
    .ilike("slug", slug)
    .maybeSingle();
  if (restaurantError) return bad("تعذر تحميل المطعم.", 500);
  if (!restaurant || restaurant.active === false) return bad("المتجر غير موجود.", 404);
  if (restaurant.is_open === false) return bad("المطعم مغلق حالياً.");

  const restaurantId = restaurant.id as string;
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

  const VALID_METHODS = ["cod", "vodafone_cash"] as const;
  type ValidMethod = (typeof VALID_METHODS)[number];
  const paymentMethod: ValidMethod =
    VALID_METHODS.includes(payload.paymentMethod as ValidMethod)
      ? (payload.paymentMethod as ValidMethod)
      : "cod";

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
        zone_id: priced.deliveryZone?.id ?? null,
        notes,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number, total, subtotal, delivery_fee, tax_amount, tax_rate, currency");

  if (error) return bad("تعذر إنشاء الطلب. حاول مرة أخرى.", 500);

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
