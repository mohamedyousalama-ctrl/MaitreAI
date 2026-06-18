"use client";

// ============================================================================
// MaitreAI — Storefront menu + in-memory cart (Phase 3 Step 2). Public, no auth.
// Holds the cart in React state only (no DB, no login, no localStorage — clears
// on refresh). Cart lines store SELECTIONS BY ID; browser totals are a PREVIEW
// only; checkout submits ids to the server for authoritative recompute.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Branch, DeliveryArea, MenuItem, Modifier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  UtensilsCrossed,
  Plus,
  X,
  Minus,
  Trash2,
  ShoppingBag,
  MapPin,
  Drumstick,
  Pizza,
  Beef,
  Sandwich,
  Soup,
  CupSoda,
  Utensils,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { ItemCustomizer } from "./ItemCustomizer";
import {
  activeVariants,
  cartSubtotal,
  lineTotal,
  selectionSummary,
  type CartLine,
} from "./pricing";

// Client-only: react-leaflet breaks on the server, so the map is never SSR'd.
const LocationPicker = dynamic(() => import("./LocationPicker"), { ssr: false });

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
  const [activeCat, setActiveCat] = useState("all"); // category-pill filter (presentational)
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
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
      {/* Category pills — horizontal scroll, active = red filled */}
      {categories.length > 0 && (
        <div className="sticky top-0 z-20 border-b border-black/5 bg-wesaya-cream/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ name: "all", label: "الكل" }, ...categories.map((c) => ({ name: c.name, label: c.name }))].map((c) => {
              const active = activeCat === c.name;
              return (
                <button
                  key={c.name}
                  onClick={() => setActiveCat(c.name)}
                  className={
                    "shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition " +
                    (active
                      ? "bg-wesaya-red text-white shadow-sm"
                      : "border border-wesaya-red/30 bg-white text-wesaya-red hover:bg-wesaya-yellow-soft")
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 pb-28">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-wesaya-red/40" />
            <p className="mt-3 text-sm text-slate-500">لا توجد أصناف متاحة حالياً.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {(activeCat === "all" ? categories : categories.filter((c) => c.name === activeCat)).map((cat) => (
              <section key={cat.name}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-wesaya-brand-ink">
                  <span className="h-5 w-1.5 rounded-full bg-wesaya-red" />
                  {cat.name}
                </h2>
                <ul className="space-y-3">
                  {cat.items.map((item) => {
                    const Icon = categoryIcon(cat.name);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => setOpenItem(item)}
                          className="flex w-full items-center gap-3 rounded-lg border border-black/5 bg-white p-3 text-start shadow-sm transition hover:border-wesaya-red/30 hover:shadow-md"
                        >
                          {/* Pale-yellow thumbnail with a category icon (no external images) */}
                          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-wesaya-yellow-soft text-wesaya-red">
                            <Icon className="h-7 w-7" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-wesaya-ink">{item.name}</h3>
                            {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>}
                            <p className="mt-1 text-sm font-extrabold text-wesaya-red">{priceLabel(item, currency)}</p>
                          </div>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wesaya-red text-white shadow-sm transition group-hover:bg-wesaya-red-dark">
                            <Plus className="h-5 w-5" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          الأسعار تقديرية للعرض — تُحتسب القيمة النهائية عند الدفع.
        </p>
      </div>

      {/* Sticky brand cart bar */}
      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-wesaya-red px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_-8px_rgba(0,0,0,0.35)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <ShoppingBag className="h-5 w-5" />
              {count} في السلة
              <span className="text-white/80">·</span>
              <span className="flex items-baseline gap-1">
                {formatCurrency(subtotal, currency)}
                <span className="text-[10px] font-normal text-white/70">تقديري</span>
              </span>
            </span>
            <button
              onClick={() => setCartOpen(true)}
              className="shrink-0 rounded-xl bg-wesaya-yellow px-4 py-2.5 text-sm font-extrabold text-wesaya-brand-ink shadow-sm transition hover:brightness-95"
            >
              عرض السلة
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
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-wesaya-cream sm:rounded-2xl">
            <div className="flex items-center justify-between bg-wesaya-red p-4 text-white">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <ShoppingBag className="h-5 w-5 text-wesaya-yellow" /> سلة الطلب
              </h2>
              <button onClick={() => setCartOpen(false)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/15">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Single scrollable region: cart lines + the full checkout form, so
                everything (name/phone/notes/place-order) is reachable on small
                screens — header stays fixed, body scrolls. */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-3 p-4">
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
              <div className="space-y-4 border-t border-black/5 bg-white p-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfillment("delivery")}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${fulfillment === "delivery" ? "border-wesaya-red bg-wesaya-red text-white" : "border-black/10 bg-white text-wesaya-ink hover:bg-wesaya-yellow-soft"}`}
                  >
                    توصيل
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillment("pickup")}
                    className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${fulfillment === "pickup" ? "border-wesaya-red bg-wesaya-red text-white" : "border-black/10 bg-white text-wesaya-ink hover:bg-wesaya-yellow-soft"}`}
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
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setMapOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-wesaya-yellow px-3 py-2.5 text-sm font-extrabold text-wesaya-brand-ink shadow-sm transition hover:brightness-95"
                      >
                        <MapPin className="h-4 w-4" /> اختر موقعك على الخريطة
                      </button>
                      {coords && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-wesaya-red">
                          <MapPin className="h-3.5 w-3.5" /> تم تحديد موقعك على الخريطة — يمكنك تعديل العنوان أدناه.
                        </p>
                      )}
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">العنوان</span>
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
                        placeholder="اكتب العنوان بالتفصيل أو حدّده من الخريطة"
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

                <div className="space-y-1 rounded-xl bg-wesaya-yellow-soft/60 p-3">
                  <div className="flex items-center justify-between text-sm text-wesaya-ink/80">
                    <span>المجموع</span>
                    <span>{formatCurrency(subtotal, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-wesaya-ink/80">
                    <span>التوصيل</span>
                    <span>{formatCurrency(deliveryFee, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-wesaya-red/15 pt-2">
                    <span className="text-sm font-bold text-wesaya-ink">الإجمالي التقديري</span>
                    <span className="text-xl font-extrabold text-wesaya-red">{formatCurrency(previewTotal, currency)}</span>
                  </div>
                  <p className="text-xs text-wesaya-ink/60">الدفع عند الاستلام · سيتم تأكيد الإجمالي من المطعم.</p>
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
                  className="w-full rounded-xl bg-wesaya-red px-4 py-3.5 text-base font-extrabold text-white shadow-sm transition hover:bg-wesaya-red-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? "جارٍ إرسال الطلب..." : "تأكيد الطلب · الدفع عند الاستلام"}
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Location picker (client-only Leaflet map) — only improves the address. */}
      {mapOpen && (
        <LocationPicker
          initial={coords}
          onClose={() => setMapOpen(false)}
          onConfirm={({ lat, lng, address: picked }) => {
            setCoords({ lat, lng });
            setAddress(picked);
            setMapOpen(false);
          }}
        />
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

/** A category-appropriate icon for the menu-card thumbnail (no external images). */
function categoryIcon(category: string): LucideIcon {
  const c = category;
  if (/بيتزا/.test(c)) return Pizza;
  if (/برجر/.test(c)) return Beef;
  if (/دجاج|بروست/.test(c)) return Drumstick;
  if (/سندوي|ساندوي/.test(c)) return Sandwich;
  if (/مشروب/.test(c)) return CupSoda;
  if (/عرض|عروض/.test(c)) return Tag;
  if (/جانبي/.test(c)) return Soup;
  return Utensils;
}
