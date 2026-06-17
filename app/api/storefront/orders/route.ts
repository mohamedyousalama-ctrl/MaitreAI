import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrain } from "@/lib/db/brain";
import { ensureCustomerId } from "@/lib/db/orders";
import { nextOrderNumber, uuidFromHash } from "@/lib/db/orders-create";
import type { DeliveryArea, MenuItem, Modifier } from "@/lib/types";

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
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

function lineQuantity(q: unknown): number {
  const n = Number(q);
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.floor(n)));
}

function activeVariants(item: MenuItem) {
  return (item.variants ?? []).filter((v) => v.active);
}

function itemModifiers(item: MenuItem, modifiers: Modifier[]) {
  const allowed = new Set(item.modifierIds);
  return modifiers.filter((m) => m.active && allowed.has(m.id));
}

function assertChoiceSelection(item: MenuItem, optionIds: string[]) {
  const choices: string[] = [];
  let optionDelta = 0;

  for (const group of item.choiceGroups ?? []) {
    const selected = group.options.filter((o) => o.active && optionIds.includes(o.id));
    if (selected.length < group.minSelect || selected.length > group.maxSelect) {
      throw new Error(`اختيار ${group.name} غير مكتمل.`);
    }
    for (const option of selected) {
      choices.push(`${group.name}: ${option.label}`);
      optionDelta += option.priceDelta;
    }
  }

  const validOptionIds = new Set((item.choiceGroups ?? []).flatMap((g) => g.options.filter((o) => o.active).map((o) => o.id)));
  for (const id of optionIds) {
    if (!validOptionIds.has(id)) throw new Error("اختيار غير متاح لهذا الصنف.");
  }

  return { choices, optionDelta: round2(optionDelta) };
}

function computeLine(item: MenuItem, modifiers: Modifier[], line: CheckoutLine, index: number) {
  if (!item.available) throw new Error(`الصنف ${item.name} غير متاح حالياً.`);

  const quantity = lineQuantity(line.quantity);
  const selectedVariantId = clean(line.variantId);
  const variants = activeVariants(item);
  const variant = selectedVariantId ? variants.find((v) => v.id === selectedVariantId) : null;
  if (variants.length > 0 && !variant) throw new Error(`اختر حجم ${item.name}.`);
  if (selectedVariantId && !variant) throw new Error("حجم غير متاح لهذا الصنف.");

  const optionIds = Array.isArray(line.optionIds) ? [...new Set(line.optionIds.map(clean).filter(Boolean))] : [];
  const { choices, optionDelta } = assertChoiceSelection(item, optionIds);

  const allowedModifiers = itemModifiers(item, modifiers);
  const modifierIds = Array.isArray(line.modifierIds) ? [...new Set(line.modifierIds.map(clean).filter(Boolean))] : [];
  const selectedModifiers = modifierIds.map((id) => allowedModifiers.find((m) => m.id === id));
  if (selectedModifiers.some((m) => !m)) throw new Error("إضافة غير متاحة لهذا الصنف.");
  const modifierDelta = round2(selectedModifiers.reduce((sum, m) => sum + (m?.priceImpact ?? 0), 0));

  const unitPrice = round2((variant?.price ?? item.price) + optionDelta + modifierDelta);
  const total = round2(unitPrice * quantity);

  return {
    item: {
      id: `${item.id}-${index}`,
      menuItemId: item.id,
      name: item.name,
      quantity,
      unitPrice,
      variant: variant?.name,
      choices,
      modifiers: selectedModifiers.map((m) => m!.name),
      total,
    },
    fingerprint: {
      i: item.id,
      q: quantity,
      v: variant?.id ?? "",
      o: optionIds.sort(),
      m: modifierIds.sort(),
    },
    total,
  };
}

function resolveDeliveryZone(zones: DeliveryArea[], zoneId: string, branchId: string | null): DeliveryArea | null {
  const zone = zones.find((z) => z.id === zoneId && z.active);
  if (!zone) return null;
  if (zone.branchId && zone.branchId !== branchId) return null;
  return zone;
}

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

  const itemById = new Map(brain.menuItems.map((item) => [item.id, item]));
  const computedLines = [];
  try {
    for (const [index, line] of payload.lines.entries()) {
      const item = itemById.get(clean(line.itemId));
      if (!item) throw new Error("صنف غير موجود في القائمة.");
      computedLines.push(computeLine(item, brain.modifiers, line, index));
    }
  } catch (err) {
    return bad(err instanceof Error ? err.message : "تعذر حساب الطلب.");
  }

  const subtotal = round2(computedLines.reduce((sum, line) => sum + line.total, 0));
  let zone: DeliveryArea | null = null;
  let deliveryFee = 0;
  let address: string | null = null;

  if (fulfillment === "delivery") {
    address = clean(payload.address);
    if (!address) return bad("العنوان مطلوب للتوصيل.");
    zone = resolveDeliveryZone(brain.deliveryAreas, clean(payload.zoneId), branch.id);
    if (!zone) return bad("اختر منطقة توصيل متاحة لهذا الفرع.");
    if (subtotal < zone.minOrder) {
      return bad(`الحد الأدنى للتوصيل في ${zone.name} هو ${zone.minOrder} ${brain.profile.currency}.`);
    }
    deliveryFee = round2(zone.deliveryFee);
  }

  const total = round2(subtotal + deliveryFee);
  const customerId = await ensureCustomerId(admin, restaurantId, customerPhone, customerName);
  const notes = clean(payload.notes) || null;
  const fingerprint = JSON.stringify({
    source: "web",
    r: restaurantId,
    c: { name: customerName, phone: customerPhone },
    b: branch.id,
    f: fulfillment,
    z: zone?.id ?? "",
    a: address ?? "",
    n: notes ?? "",
    lines: computedLines.map((l) => l.fingerprint),
    total,
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
        items: computedLines.map((line) => line.item),
        subtotal,
        delivery_fee: deliveryFee,
        tax_amount: 0,
        tax_rate: 0,
        total,
        currency: brain.profile.currency || restaurant.currency || "ج.م",
        order_status: "pending_confirmation",
        payment_status: "unpaid",
        address,
        zone_id: zone?.id ?? null,
        notes,
      },
      { onConflict: "id", ignoreDuplicates: true }
    )
    .select("id, order_number, total, subtotal, delivery_fee, currency");

  if (error) return bad("تعذر إنشاء الطلب. حاول مرة أخرى.", 500);

  const created = (data?.length ?? 0) > 0;
  const row = created
    ? data![0]
    : (
        await admin
          .from("orders")
          .select("id, order_number, total, subtotal, delivery_fee, currency")
          .eq("id", id)
          .maybeSingle()
      ).data;
  if (!row) return bad("تعذر تأكيد الطلب. حاول مرة أخرى.", 500);

  return NextResponse.json({
    orderId: row.id,
    orderNumber: row.order_number,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    total: Number(row.total),
    currency: row.currency,
    created,
  });
}
