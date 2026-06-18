"use client";

// ============================================================================
// MaitreAI — Storefront item customizer (Phase 3 Step 2; PR-B Wesaya re-skin).
// Variants (required single size) · choice groups (min/max enforced) · modifiers
// (optional add-ons) · quantity · a live PREVIEW total recomputed from the real
// loaded prices. "Add to cart" emits the SELECTION BY ID (not a number).
// PR-B: visuals retokened to the Wesaya mockup (full-bleed photo header, gold
// configurable badge, wrap-flow option pills, red sticky total bar). The
// selection state, validity, and pricing math are UNCHANGED.
// ============================================================================

import { useMemo, useState } from "react";
import type { MenuItem, MenuItemChoiceGroup, Modifier } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
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

  // Configurable = has size/choice/add-on slots (gold badge + base-note logic).
  const isConfigurable = groups.length > 0 || mods.length > 0 || variants.length > 0;
  // Truth rule: when there's no variant and the base price is 0, the price comes
  // ONLY from the chosen options — show the ℹ️ "حسب الاختيار" base note, never a
  // fabricated base number.
  const noBase = variants.length === 0 && item.price === 0;

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
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-wesaya-cream sm:rounded-2xl">
        {/* Scrollable: full-bleed photo header + name + base note + option pills + qty */}
        <div className="flex-1 overflow-y-auto pb-2">
          {/* Photo header with cream fade + back chevron + gold configurable badge */}
          <div className="relative h-[230px] flex-none overflow-hidden bg-wesaya-line sm:h-[264px]">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-wesaya-tint text-5xl" aria-hidden>
                🍗
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-wesaya-cream from-[2%] to-transparent to-[34%]" />
            <button
              onClick={onClose}
              aria-label="رجوع"
              className="absolute right-4 top-3.5 flex h-10 w-10 items-center justify-center rounded-[13px] bg-white/90 text-wesaya-ink shadow-[0_3px_10px_rgba(0,0,0,0.18)]"
            >
              <ChevronLeft className="h-5 w-5 -scale-x-100" />
            </button>
            {isConfigurable && (
              <span className="absolute left-4 top-4 rounded-[10px] bg-wesaya-gold px-3 py-1.5 font-baloo text-[11.5px] font-extrabold text-[#3a2400] shadow-[0_3px_8px_rgba(0,0,0,0.14)]">
                عرض قابل للتخصيص
              </span>
            )}
          </div>

          <div className="flex flex-col gap-[18px] px-5 pt-1">
            {/* Name + description */}
            <div>
              <h2 className="font-baloo text-2xl font-extrabold leading-tight text-wesaya-ink">{item.name}</h2>
              {item.description && <p className="mt-1.5 text-[13px] leading-relaxed text-wesaya-muted">{item.description}</p>}
            </div>

            {/* Base note (truth rule) */}
            {noBase && (
              <div className="flex items-start gap-2.5 rounded-[13px] border border-[#F2DCA8] bg-[#FFF7E8] px-3.5 py-3">
                <span className="text-[15px]">ℹ️</span>
                <span className="text-[12px] leading-relaxed text-[#8a6a16]">
                  يُحتسب السعر حسب اختياراتك — يُؤكَّد الإجمالي عند الطلب.
                </span>
              </div>
            )}

            {/* Sizes (required single-select) — pills */}
            {variants.length > 0 && (
              <section className="flex flex-col gap-[11px]">
                <GroupTitle title="الحجم" tag="مطلوب" />
                <div className="flex flex-wrap gap-2.5">
                  {variants.map((v) => (
                    <OptionPill
                      key={v.id}
                      label={v.name}
                      priceLabel={formatCurrency(v.price, currency)}
                      selected={sel.variantId === v.id}
                      onClick={() => setVariant(v.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Choice groups (min/max enforced) — pills */}
            {groups.map((g) => {
              const atCap = g.maxSelect > 1 && groupSelectedIds(g).length >= g.maxSelect;
              return (
                <section key={g.id} className="flex flex-col gap-[11px]">
                  <GroupTitle title={g.name} tag={groupHint(g)} />
                  <div className="flex flex-wrap gap-2.5">
                    {g.options
                      .filter((o) => o.active)
                      .map((o) => {
                        const checked = sel.optionIds.includes(o.id);
                        return (
                          <OptionPill
                            key={o.id}
                            label={o.label}
                            priceLabel={deltaLabel(o.priceDelta, currency)}
                            selected={checked}
                            disabled={!checked && atCap}
                            onClick={() => toggleOption(g, o.id)}
                          />
                        );
                      })}
                  </div>
                </section>
              );
            })}

            {/* Modifiers (optional add-ons) — pills */}
            {mods.length > 0 && (
              <section className="flex flex-col gap-[11px]">
                <GroupTitle title="إضافات" tag="اختياري" />
                <div className="flex flex-wrap gap-2.5">
                  {mods.map((m) => (
                    <OptionPill
                      key={m.id}
                      label={m.name}
                      priceLabel={deltaLabel(m.priceImpact, currency)}
                      selected={sel.modifierIds.includes(m.id)}
                      onClick={() => toggleModifier(m.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Quantity */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="font-baloo text-base font-bold text-wesaya-ink">الكمية</span>
              <div className="flex items-center overflow-hidden rounded-[14px] border-[1.5px] border-wesaya-line bg-white">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="إنقاص" className="flex h-11 w-11 items-center justify-center text-[22px] leading-none text-wesaya-red">
                  −
                </button>
                <span className="min-w-[40px] text-center font-baloo text-lg font-extrabold tabular-nums text-wesaya-ink">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} aria-label="زيادة" className="flex h-11 w-11 items-center justify-center text-[22px] leading-none text-wesaya-red">
                  ＋
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky bottom bar — live total + add */}
        <div className="flex items-center gap-3.5 border-t border-wesaya-line bg-wesaya-cream/95 px-[18px] py-3.5 backdrop-blur">
          <div className="flex min-w-[84px] flex-col">
            <span className="text-[11px] font-semibold text-wesaya-muted">الإجمالي</span>
            <span key={preview} className="font-baloo text-[21px] font-extrabold leading-tight text-wesaya-red [animation:popT_.26s_ease]">
              {formatCurrency(preview, currency)}
            </span>
          </div>
          <button
            onClick={add}
            disabled={!valid}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-wesaya-red px-4 py-[15px] font-baloo text-base font-bold text-white shadow-[0_8px_20px_rgba(214,35,0,0.34)] transition hover:bg-wesaya-red-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>🛒</span>
            <span>{valid ? "أضف للسلة" : "اختر الخيارات المطلوبة"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupTitle({ title, tag }: { title: string; tag?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-baloo text-base font-bold text-wesaya-ink">{title}</span>
      {tag && <span className="rounded-full bg-wesaya-tint px-2.5 py-0.5 text-[11px] font-bold text-wesaya-red">{tag}</span>}
    </div>
  );
}

/** Wrap-flow option pill: red when selected, white otherwise; price-delta inline. */
function OptionPill({
  label,
  priceLabel,
  selected,
  disabled = false,
  onClick,
}: {
  label: string;
  priceLabel: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center gap-2 rounded-[13px] border-[1.5px] px-3.5 py-2.5 text-sm font-bold transition " +
        (selected
          ? "border-wesaya-red bg-wesaya-red text-white shadow-[0_5px_12px_rgba(214,35,0,0.26)]"
          : "border-wesaya-line bg-white text-wesaya-ink hover:border-wesaya-red/40") +
        (disabled ? " cursor-not-allowed opacity-40" : "")
      }
    >
      <span>{label}</span>
      <span className={"text-[12px] font-extrabold " + (selected ? "text-white/90" : "text-wesaya-red")}>{priceLabel}</span>
    </button>
  );
}

/** "مجانًا" for a zero delta, otherwise "+X" — never fabricated. */
function deltaLabel(delta: number, currency: string): string {
  return delta > 0 ? `+${formatCurrency(delta, currency)}` : "مجانًا";
}

function groupHint(g: MenuItemChoiceGroup): string {
  if (g.minSelect >= 1 && g.maxSelect === 1) return "مطلوب — اختر واحداً";
  if (g.maxSelect === 1) return "اختر واحداً";
  if (g.minSelect >= 1) return `اختر من ${g.minSelect} إلى ${g.maxSelect}`;
  return `اختر حتى ${g.maxSelect}`;
}
