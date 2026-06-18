"use client";

// ============================================================================
// MaitreAI — Storefront menu + in-memory cart (Phase 3 Step 2). Public, no auth.
// Holds the cart in React state only (no DB, no login, no localStorage — clears
// on refresh). Cart lines store SELECTIONS BY ID; browser totals are a PREVIEW
// only; checkout submits ids to the server for authoritative recompute.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { UtensilsCrossed, Plus, X, Minus, Trash2, ShoppingBag } from "lucide-react";
import { ItemCustomizer } from "./ItemCustomizer";
import {
  activeVariants,
  cartSubtotal,
  lineTotal,
  selectionSummary,
  type CartLine,
} from "./pricing";

export function StorefrontMenu({
  slug,
  currency,
  items,
  modifiers,
  branches,
  deliveryAreas,
}: {
  slug: string;
  restaurantName: string;
  currency: string;
  items: MenuItem[];
  modifiers: Modifier[];
  branches: Branch[];
  deliveryAreas: DeliveryArea[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  // Auto-select a branch that actually has usable delivery zones (restaurant-wide
  // or its own), so a stray/zoneless branch can never be pre-selected and strand
  // the delivery fee. Falls back to the first branch (e.g. pickup-only setups).
  const [branchId, setBranchId] = useState(() => {
    const withZones = branches.find((b) => deliveryAreas.some((z) => !z.branchId || z.branchId === b.id));
    return (withZones ?? branches[0])?.id ?? "";
  });
  const [zoneId, setZoneId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    orderNumber: string;
    subtotal: number;
    deliveryFee: number;
    total: number;
    currency: string;
  } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Group by category (first-appearance order).
  const categories = useMemo(() => {
    const order: string[] = [];
    const byCat = new Map<string, MenuItem[]>();
    for (const item of items) {
      const cat = item.category || "أخرى";
      if (!byCat.has(cat)) {
        byCat.set(cat, []);
        order.push(cat);
      }
      byCat.get(cat)!.push(item);
    }
    return order.map((c) => ({ name: c, items: byCat.get(c)! }));
  }, [items]);

  const subtotal = cartSubtotal(cart, itemById, modifiers);
  const zonesForBranch = useMemo(
    () => deliveryAreas.filter((z) => !z.branchId || z.branchId === branchId),
    [branchId, deliveryAreas]
  );
  const selectedZone = zonesForBranch.find((z) => z.id === zoneId) ?? null;
  const deliveryFee = fulfillment === "delivery" ? selectedZone?.deliveryFee ?? 0 : 0;
  const previewTotal = subtotal + deliveryFee;
  const count = cart.reduce((n, l) => n + l.quantity, 0);

  // Keep the chosen zone valid for the active branch, and auto-select when there's
  // exactly one — so the (single-zone) delivery fee applies without a stray empty
  // dropdown. A previously-chosen zone that no longer belongs to the branch resets.
  useEffect(() => {
    if (zoneId && zonesForBranch.some((z) => z.id === zoneId)) return;
    setZoneId(zonesForBranch.length === 1 ? zonesForBranch[0].id : "");
  }, [zonesForBranch, zoneId]);

  const addLine = (line: CartLine) => {
    setCart((c) => [...c, line]);
    setOpenItem(null);
  };
  const setQty = (lineId: string, q: number) =>
    setCart((c) => c.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(1, q) } : l)));
  const removeLine = (lineId: string) => setCart((c) => c.filter((l) => l.lineId !== lineId));
  const submitOrder = async () => {
    setCheckoutError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          lines: cart.map(({ itemId, variantId, optionIds, modifierIds, quantity }) => ({
            itemId,
            variantId,
            optionIds,
            modifierIds,
            quantity,
          })),
          fulfillment,
          branchId,
          zoneId: fulfillment === "delivery" ? zoneId : null,
          customerName,
          customerPhone,
          address: fulfillment === "delivery" ? address : "",
          notes,
        }),
      });
      const data = (await res.json()) as { error?: string } & NonNullable<typeof confirmation>;
      if (!res.ok) throw new Error(data.error || "تعذر إنشاء الطلب.");
      setConfirmation(data);
      setCart([]);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "تعذر إنشاء الطلب.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 py-6 pb-28">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">لا توجد أصناف متاحة حالياً.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((cat) => (
              <section key={cat.name}>
                <h2 className="mb-3 text-lg font-bold text-slate-800">{cat.name}</h2>
                <ul className="space-y-3">
                  {cat.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setOpenItem(item)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-start transition hover:border-slate-300 hover:shadow-sm"
                      >
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900">{item.name}</h3>
                          {item.description && <p className="mt-1 text-sm text-slate-500">{item.description}</p>}
                          <p className="mt-1.5 text-sm font-semibold text-slate-700">{priceLabel(item, currency)}</p>
                        </div>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                          <Plus className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          الأسعار تقديرية للعرض — تُحتسب القيمة النهائية عند الدفع.
        </p>
      </div>

      {/* Floating cart bar */}
      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" /> السلة ({count})
              </span>
              <span className="flex items-baseline gap-1">
                {formatCurrency(subtotal, currency)}
                <span className="text-[10px] font-normal opacity-70">تقديري</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Customizer */}
      {openItem && (
        <ItemCustomizer item={openItem} modifiers={modifiers} currency={currency} onClose={() => setOpenItem(null)} onAdd={addLine} />
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="text-lg font-bold text-slate-900">سلة الطلب</h2>
              <button onClick={() => setCartOpen(false)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {confirmation ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-sm font-semibold text-emerald-800">تم استلام طلبك</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-950">#{confirmation.orderNumber}</p>
                  <p className="mt-2 text-sm text-emerald-800">
                    الإجمالي {formatCurrency(confirmation.total, confirmation.currency)} · الدفع عند الاستلام
                  </p>
                </div>
              ) : cart.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">السلة فارغة.</p>
              ) : (
                cart.map((line) => {
                  const item = itemById.get(line.itemId);
                  if (!item) return null;
                  const opts = selectionSummary(item, line, modifiers);
                  return (
                    <div key={line.lineId} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{item.name}</p>
                          {opts.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{opts.join("، ")}</p>}
                        </div>
                        <button onClick={() => removeLine(line.lineId)} aria-label="حذف" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setQty(line.lineId, line.quantity - 1)} aria-label="إنقاص" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
                          <button onClick={() => setQty(line.lineId, line.quantity + 1)} aria-label="زيادة" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(lineTotal(item, line, modifiers), currency)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!confirmation && cart.length > 0 && (
              <div className="space-y-4 border-t border-slate-100 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillment("delivery")}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${fulfillment === "delivery" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
                  >
                    توصيل
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillment("pickup")}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${fulfillment === "pickup" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}
                  >
                    استلام من الفرع
                  </button>
                </div>

                {branches.length > 1 && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">الفرع</span>
                    <select
                      value={branchId}
                      onChange={(e) => {
                        setBranchId(e.target.value);
                        setZoneId("");
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {fulfillment === "delivery" && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">منطقة التوصيل</span>
                      <select
                        value={zoneId}
                        onChange={(e) => setZoneId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="">اختر منطقة</option>
                        {zonesForBranch.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name} · {formatCurrency(zone.deliveryFee, currency)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {zonesForBranch.length === 0 && (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        لا توجد مناطق توصيل متاحة لهذا الفرع حالياً.
                      </p>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">العنوان</span>
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                        placeholder="اكتب العنوان بالتفصيل"
                      />
                    </label>
                  </>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">الاسم</span>
                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">رقم الهاتف</span>
                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" inputMode="tel" />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">ملاحظات اختيارية</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
                </label>

                <div className="space-y-1 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>المجموع</span>
                    <span>{formatCurrency(subtotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>التوصيل</span>
                    <span>{formatCurrency(deliveryFee, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                    <span className="text-sm font-semibold text-slate-700">الإجمالي التقديري</span>
                    <span className="text-lg font-bold text-slate-900">{formatCurrency(previewTotal, currency)}</span>
                  </div>
                  <p className="text-xs text-slate-500">الدفع عند الاستلام · سيتم تأكيد الإجمالي من المطعم.</p>
                </div>

                {checkoutError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{checkoutError}</p>}

                <button
                  type="button"
                  disabled={
                    submitting ||
                    !customerName.trim() ||
                    !customerPhone.trim() ||
                    !branchId ||
                    (fulfillment === "delivery" && (!zoneId || !address.trim()))
                  }
                  onClick={submitOrder}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "جارٍ إرسال الطلب..." : "تأكيد الطلب والدفع عند الاستلام"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Menu-card price label: single base price, or a range across active size variants. */
function priceLabel(item: MenuItem, currency: string): string {
  const variants = activeVariants(item);
  if (variants.length > 0) {
    const prices = variants.map((v) => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatCurrency(min, currency) : `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
  }
  return formatCurrency(item.price, currency);
}
