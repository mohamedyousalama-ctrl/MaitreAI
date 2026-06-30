"use client";

import { useEffect, useState } from "react";
import type { MenuItem, Modifier } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, TextAreaField, NumberField, SelectField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";
import { TagEditor } from "@/components/ui/TagEditor";
import { Field } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";
import { ALLERGENS, normalizeAllergenArray } from "@/lib/ai/allergen-vocab";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export type MenuItemFormValues = Omit<MenuItem, "id">;

interface MenuItemFormProps {
  open: boolean;
  initial?: MenuItem | null;
  categories: string[];
  modifiers: Modifier[];
  onClose: () => void;
  onSubmit: (values: MenuItemFormValues) => void;
  /** WB-ALLERGEN-3 — confirm the kitchen-reviewed allergens for an EXISTING item:
   *  persists the selected canonical keys + stamps reviewed_at/by server-side. */
  onMarkReviewed?: (allergenKeys: string[]) => void;
}

export function MenuItemForm({ open, initial, categories, modifiers, onClose, onSubmit, onMarkReviewed }: MenuItemFormProps) {
  // WB-ALLERGEN-3 — legacy free-text allergen values that don't map to a canonical
  // key (surfaced to the manager so nothing is silently dropped).
  const [unmappedAllergens, setUnmappedAllergens] = useState<string[]>([]);
  const empty: MenuItemFormValues = {
    name: "",
    category: categories[0] ?? "",
    price: 0,
    available: true,
    description: "",
    imageUrl: "",
    modifierIds: [],
    ingredients: [],
    allergens: [],
  };

  const [values, setValues] = useState<MenuItemFormValues>(empty);

  useEffect(() => {
    if (open) {
      // WB-ALLERGEN-3 — migrate stored allergens (canonical keys OR legacy free-text)
      // to canonical keys for the multi-select. Unmappable legacy values are kept
      // visible (never silently dropped) so the manager can re-pick them.
      const migrated = normalizeAllergenArray(initial?.allergens ?? []);
      setUnmappedAllergens(migrated.unmapped);
      setValues(
        initial
          ? {
              name: initial.name,
              category: initial.category,
              price: initial.price,
              available: initial.available,
              description: initial.description,
              imageUrl: initial.imageUrl,
              modifierIds: initial.modifierIds,
              ingredients: initial.ingredients,
              allergens: migrated.keys, // canonical keys
            }
          : empty
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const toggleAllergen = (key: string) =>
    setValues((s) => ({
      ...s,
      allergens: s.allergens.includes(key) ? s.allergens.filter((k) => k !== key) : [...s.allergens, key],
    }));

  const reviewedAt = initial?.allergensReviewedAt ?? null;

  const set = <K extends keyof MenuItemFormValues>(key: K, v: MenuItemFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const toggleModifier = (id: string) =>
    setValues((s) => ({
      ...s,
      modifierIds: s.modifierIds.includes(id)
        ? s.modifierIds.filter((x) => x !== id)
        : [...s.modifierIds, id],
    }));

  const valid = values.name.trim().length > 0 && values.price >= 0;
  const activeModifiers = modifiers.filter((m) => m.active);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "تعديل الصنف" : "صنف جديد"}
      subtitle="كلما اكتملت البيانات، ارتفعت جاهزية الذكاء"
      footer={
        <DrawerFooter onCancel={onClose} onSave={() => valid && onSubmit(values)} accent="bg-[image:var(--kv-grad-brand)]" disabled={!valid} />
      }
    >
      <div className="space-y-4">
        <TextField label="اسم الصنف" value={values.name} onChange={(v) => set("name", v)} placeholder="مثال: برجر كلاسيك" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="الفئة"
            value={values.category}
            onChange={(v) => set("category", v)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          <NumberField label="السعر" value={values.price} onChange={(v) => set("price", v)} suffix="ج.م" />
        </div>
        <TextAreaField label="الوصف" value={values.description} onChange={(v) => set("description", v)} rows={3} />
        <TextField label="رابط الصورة" value={values.imageUrl} onChange={(v) => set("imageUrl", v)} placeholder="https://..." />
        <StatusSelector
          label="التوفر"
          value={values.available ? "available" : "unavailable"}
          onChange={(v) => set("available", v === "available")}
          options={[
            { value: "available", label: "متوفر" },
            { value: "unavailable", label: "غير متوفر" },
          ]}
        />

        <Field label="الإضافات المرتبطة" hint="اختر الإضافات المتاحة لهذا الصنف">
          {activeModifiers.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد إضافات مفعّلة. أضفها من «إدارة الإضافات».</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {activeModifiers.map((m) => {
                const on = values.modifierIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModifier(m.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      on ? "bg-[#0E9F6E] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {m.name}
                    {m.priceImpact > 0 && <span className={on ? "opacity-80" : "text-slate-400"}> +{m.priceImpact}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <TagEditor label="المكونات" tags={values.ingredients} onChange={(t) => set("ingredients", t)} placeholder="أضف مكوّن" />

        {/* WB-ALLERGEN-3 — controlled allergen multi-select (canonical keys stored). */}
        <Field label="مسببات الحساسية" hint="اختر مسببات الحساسية الموجودة فعلاً في هذا الصنف">
          <div className="mb-2">
            {reviewedAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(14,159,110,.12)", color: "#0a8a5f" }}>
                <ShieldCheck className="h-3.5 w-3.5" /> تمت المراجعة
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(201,138,31,.16)", color: "#9a6a14" }}>
                <AlertTriangle className="h-3.5 w-3.5" /> لم تُراجع
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => {
              const on = values.allergens.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleAllergen(a.key)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                    on ? "bg-[#c0492f] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {a.arLabel}
                </button>
              );
            })}
          </div>
          {unmappedAllergens.length > 0 && (
            <p className="mt-2 text-[11px] font-semibold" style={{ color: "#9a6a14" }}>
              ⚠️ قيم قديمة غير معروفة (لم تُحفظ كاختيار): {unmappedAllergens.join("، ")} — برجاء اختيار البديل الصحيح بالأعلى.
            </p>
          )}
          {/* «تم التأكد» — saves the selected allergens AND stamps the kitchen review
              (existing items only; a new item must be saved first to get an id). */}
          {initial && onMarkReviewed && (
            <button
              type="button"
              onClick={() => onMarkReviewed(values.allergens)}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition"
              style={{ background: "var(--kv-grad-brand)" }}
            >
              <ShieldCheck className="h-4 w-4" /> تم التأكد من مسببات الحساسية
            </button>
          )}
        </Field>
      </div>
    </Drawer>
  );
}
