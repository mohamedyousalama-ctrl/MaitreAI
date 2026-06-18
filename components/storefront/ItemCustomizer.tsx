"use client";

// ============================================================================
// MaitreAI — Storefront item customizer (Phase 3 Step 2). Public, no auth.
// Variants (required single size) · choice groups (min/max enforced) · modifiers
// (optional add-ons) · quantity · a live PREVIEW total recomputed from the real
// loaded prices. "Add to cart" emits the SELECTION BY ID (not a number).
// ============================================================================

import { useMemo, useState } from "react";
import type { MenuItem, MenuItemChoiceGroup, Modifier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { X, Minus, Plus } from "lucide-react";
import {
  activeVariants,
  itemModifiers,
  unitPrice,
  isSelectionValid,
  newLineId,
  type CartLine,
  type Selection,
} from "./pricing";

export function ItemCustomizer({
  item,
  modifiers,
  currency,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  modifiers: Modifier[];
  currency: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const variants = activeVariants(item);
  const mods = itemModifiers(item, modifiers);
  const groups = (item.choiceGroups ?? []).filter((g) => g.options.some((o) => o.active));

  // Sensible defaults: first size, and the first option of each REQUIRED single group.
  const [sel, setSel] = useState<Selection>(() => {
    const optionIds: string[] = [];
    for (const g of groups) {
      if (g.minSelect >= 1 && g.maxSelect === 1) {
        const first = g.options.find((o) => o.active);
        if (first) optionIds.push(first.id);
      }
    }
    return { variantId: variants[0]?.id ?? null, optionIds, modifierIds: [] };
  });
  const [qty, setQty] = useState(1);

  const unit = useMemo(() => unitPrice(item, sel, modifiers), [item, sel, modifiers]);
  const preview = Math.round(unit * qty * 100) / 100;
  const valid = isSelectionValid(item, sel);

  const setVariant = (variantId: string) => setSel((s) => ({ ...s, variantId }));

  const groupSelectedIds = (g: MenuItemChoiceGroup) =>
    g.options.filter((o) => sel.optionIds.includes(o.id)).map((o) => o.id);

  const toggleOption = (g: MenuItemChoiceGroup, optionId: string) => {
    setSel((s) => {
      const inGroup = new Set(g.options.map((o) => o.id));
      const current = s.optionIds.filter((id) => inGroup.has(id));
      const others = s.optionIds.filter((id) => !inGroup.has(id));
      if (g.maxSelect === 1) {
        return { ...s, optionIds: [...others, optionId] }; // radio: replace
      }
      if (current.includes(optionId)) {
        return { ...s, optionIds: [...others, ...current.filter((id) => id !== optionId)] };
      }
      if (current.length >= g.maxSelect) return s; // at cap — ignore
      return { ...s, optionIds: [...others, ...current, optionId] };
    });
  };

  const toggleModifier = (id: string) =>
    setSel((s) => ({
      ...s,
      modifierIds: s.modifierIds.includes(id)
        ? s.modifierIds.filter((x) => x !== id)
        : [...s.modifierIds, id],
    }));

  const add = () => {
    if (!valid) return;
    onAdd({ lineId: newLineId(), itemId: item.id, ...sel, quantity: qty });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-wesaya-cream sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 bg-wesaya-red p-4 text-white">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">{item.name}</h2>
            {item.description && <p className="mt-1 text-sm text-white/85">{item.description}</p>}
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* Sizes (required single-select) */}
          {variants.length > 0 && (
            <section>
              <SectionLabel title="الحجم" hint="مطلوب" />
              <div className="space-y-2">
                {variants.map((v) => (
                  <label key={v.id} className={rowCls(sel.variantId === v.id)}>
                    <span className="flex items-center gap-2">
                      <input type="radio" className="accent-wesaya-red" name="variant" checked={sel.variantId === v.id} onChange={() => setVariant(v.id)} />
                      <span className="font-medium text-slate-800">{v.name}</span>
                    </span>
                    <span className="text-sm font-bold text-wesaya-red">{formatCurrency(v.price, currency)}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Choice groups (min/max enforced) */}
          {groups.map((g) => {
            const selectedCount = groupSelectedIds(g).length;
            const atCap = g.maxSelect > 1 && selectedCount >= g.maxSelect;
            return (
              <section key={g.id}>
                <SectionLabel title={g.name} hint={groupHint(g)} />
                <div className="space-y-2">
                  {g.options.filter((o) => o.active).map((o) => {
                    const checked = sel.optionIds.includes(o.id);
                    const disabled = !checked && atCap;
                    return (
                      <label key={o.id} className={rowCls(checked, disabled)}>
                        <span className="flex items-center gap-2">
                          <input
                            type={g.maxSelect === 1 ? "radio" : "checkbox"}
                            className="accent-wesaya-red"
                            name={`g_${g.id}`}
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleOption(g, o.id)}
                          />
                          <span className="font-medium text-slate-800">{o.label}</span>
                        </span>
                        {o.priceDelta > 0 && (
                          <span className="text-sm font-bold text-wesaya-red">+{formatCurrency(o.priceDelta, currency)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Modifiers (optional add-ons) */}
          {mods.length > 0 && (
            <section>
              <SectionLabel title="إضافات" hint="اختياري" />
              <div className="space-y-2">
                {mods.map((m) => (
                  <label key={m.id} className={rowCls(sel.modifierIds.includes(m.id))}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" className="accent-wesaya-red" checked={sel.modifierIds.includes(m.id)} onChange={() => toggleModifier(m.id)} />
                      <span className="font-medium text-slate-800">{m.name}</span>
                    </span>
                    {m.priceImpact > 0 && (
                      <span className="text-sm font-bold text-wesaya-red">+{formatCurrency(m.priceImpact, currency)}</span>
                    )}
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Quantity */}
          <section className="flex items-center justify-between">
            <SectionLabel title="الكمية" />
            <div className="flex items-center gap-3">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="إنقاص" className="flex h-9 w-9 items-center justify-center rounded-lg border border-wesaya-red/30 bg-white text-wesaya-red hover:bg-wesaya-yellow-soft">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center font-extrabold tabular-nums text-wesaya-ink">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} aria-label="زيادة" className="flex h-9 w-9 items-center justify-center rounded-lg border border-wesaya-red/30 bg-white text-wesaya-red hover:bg-wesaya-yellow-soft">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>

        {/* Footer — preview total + add */}
        <div className="border-t border-black/5 bg-white p-4">
          <button
            onClick={add}
            disabled={!valid}
            className="flex w-full items-center justify-between rounded-xl bg-wesaya-red px-4 py-3.5 text-base font-extrabold text-white shadow-sm transition hover:bg-wesaya-red-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>أضِف إلى السلة</span>
            <span className="flex items-baseline gap-1 text-wesaya-yellow">
              {formatCurrency(preview, currency)}
              <span className="text-[10px] font-normal text-wesaya-yellow/80">تقديري</span>
            </span>
          </button>
          {!valid && <p className="mt-2 text-center text-xs font-semibold text-wesaya-red">اختر الخيارات المطلوبة للمتابعة.</p>}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-wesaya-brand-ink">
      {title}
      {hint && <span className="rounded-full bg-wesaya-yellow-soft px-2 py-0.5 text-[11px] font-bold text-wesaya-brand-ink">{hint}</span>}
    </p>
  );
}

function groupHint(g: MenuItemChoiceGroup): string {
  if (g.minSelect >= 1 && g.maxSelect === 1) return "مطلوب — اختر واحداً";
  if (g.maxSelect === 1) return "اختر واحداً";
  if (g.minSelect >= 1) return `اختر من ${g.minSelect} إلى ${g.maxSelect}`;
  return `اختر حتى ${g.maxSelect}`;
}

function rowCls(active: boolean, disabled = false): string {
  return [
    "flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 transition",
    active ? "border-wesaya-red bg-wesaya-yellow-soft" : "border-black/10 bg-white hover:bg-wesaya-yellow-soft/50",
    disabled ? "cursor-not-allowed opacity-50" : "",
  ].join(" ");
}
