"use client";

// ============================================================================
// MaitreAI — Storefront menu + in-memory cart (Phase 3 Step 2). Public, no auth.
// Holds the cart in React state only (no DB, no login, no localStorage — clears
// on refresh). Cart lines store SELECTIONS BY ID; every total shown is a PREVIEW
// recomputed from the real loaded prices. No checkout/order placement (Step 3).
// ============================================================================

import { useMemo, useState } from "react";
import type { MenuItem, Modifier } from "@/lib/types";
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
  currency,
  items,
  modifiers,
}: {
  restaurantName: string;
  currency: string;
  items: MenuItem[];
  modifiers: Modifier[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

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
  const count = cart.reduce((n, l) => n + l.quantity, 0);

  const addLine = (line: CartLine) => {
    setCart((c) => [...c, line]);
    setOpenItem(null);
  };
  const setQty = (lineId: string, q: number) =>
    setCart((c) => c.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(1, q) } : l)));
  const removeLine = (lineId: string) => setCart((c) => c.filter((l) => l.lineId !== lineId));

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
              {cart.length === 0 ? (
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

            {cart.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-600">المجموع التقديري</span>
                  <span className="text-lg font-bold text-slate-900">{formatCurrency(subtotal, currency)}</span>
                </div>
                <p className="text-center text-xs text-slate-400">
                  هذا مجموع تقديري للعرض — تُحتسب القيمة النهائية عند الدفع (قريباً).
                </p>
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
