"use client";

import { useEffect, useState } from "react";
import type { MenuItem, Modifier } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, TextAreaField, NumberField, SelectField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";
import { TagEditor } from "@/components/ui/TagEditor";
import { Field } from "@/components/ui/FormControls";
import { cn } from "@/lib/utils";

export type MenuItemFormValues = Omit<MenuItem, "id">;

const ALLERGEN_SUGGESTIONS = ["جلوتين", "ألبان", "بيض", "مكسرات", "فول صويا", "أسماك"];

interface MenuItemFormProps {
  open: boolean;
  initial?: MenuItem | null;
  categories: string[];
  modifiers: Modifier[];
  onClose: () => void;
  onSubmit: (values: MenuItemFormValues) => void;
}

export function MenuItemForm({ open, initial, categories, modifiers, onClose, onSubmit }: MenuItemFormProps) {
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
              allergens: initial.allergens,
            }
          : empty
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

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
        <DrawerFooter onCancel={onClose} onSave={() => valid && onSubmit(values)} accent="bg-menu" disabled={!valid} />
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
          <NumberField label="السعر" value={values.price} onChange={(v) => set("price", v)} suffix="ر.س" />
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
                      on ? "bg-menu text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
        <TagEditor
          label="مسببات الحساسية"
          tags={values.allergens}
          onChange={(t) => set("allergens", t)}
          placeholder="أضف مسبب حساسية"
          suggestions={ALLERGEN_SUGGESTIONS}
        />
      </div>
    </Drawer>
  );
}
