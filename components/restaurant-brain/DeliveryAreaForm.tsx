"use client";

import { useEffect, useState } from "react";
import type { Branch, DeliveryArea } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, NumberField, SelectField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";

export type DeliveryAreaFormValues = Omit<DeliveryArea, "id">;

// "" = restaurant-wide (all branches); any other value is a branch id.
const ALL_BRANCHES = "";

const empty: DeliveryAreaFormValues = {
  name: "",
  branchId: ALL_BRANCHES,
  minOrder: 30,
  deliveryFee: 10,
  estimatedTime: "30-45 دقيقة",
  active: true,
};

interface DeliveryAreaFormProps {
  open: boolean;
  initial?: DeliveryArea | null;
  /** The tenant's branches, for scoping a zone to a specific branch. */
  branches: Branch[];
  /** The signed-in tenant's currency (profile.currency) — never hardcoded. */
  currency: string;
  onClose: () => void;
  onSubmit: (values: DeliveryAreaFormValues) => void;
}

export function DeliveryAreaForm({ open, initial, branches, currency, onClose, onSubmit }: DeliveryAreaFormProps) {
  const [values, setValues] = useState<DeliveryAreaFormValues>(empty);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? {
              name: initial.name,
              branchId: initial.branchId ?? ALL_BRANCHES,
              minOrder: initial.minOrder,
              deliveryFee: initial.deliveryFee,
              estimatedTime: initial.estimatedTime,
              active: initial.active,
            }
          : {
              ...empty,
              // Default a new zone to the only branch when there's exactly one;
              // otherwise leave it restaurant-wide (all branches).
              branchId: branches.length === 1 ? branches[0].id : ALL_BRANCHES,
            }
      );
    }
  }, [open, initial, branches]);

  const set = <K extends keyof DeliveryAreaFormValues>(key: K, v: DeliveryAreaFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const valid = values.name.trim().length > 0;

  const branchOptions = [
    { value: ALL_BRANCHES, label: "كل الفروع" },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "تعديل منطقة التوصيل" : "منطقة توصيل جديدة"}
      footer={<DrawerFooter onCancel={onClose} onSave={() => valid && onSubmit(values)} accent="bg-brain" disabled={!valid} />}
    >
      <div className="space-y-4">
        <TextField label="اسم المنطقة" value={values.name} onChange={(v) => set("name", v)} placeholder="مثال: الياسمين" />
        <SelectField
          label="الفرع"
          value={values.branchId ?? ALL_BRANCHES}
          onChange={(v) => set("branchId", v)}
          options={branchOptions}
          hint="اربط المنطقة بفرع معيّن، أو اتركها لكل الفروع."
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="الحد الأدنى للطلب" value={values.minOrder} onChange={(v) => set("minOrder", v)} suffix={currency} />
          <NumberField label="رسوم التوصيل" value={values.deliveryFee} onChange={(v) => set("deliveryFee", v)} suffix={currency} />
        </div>
        <TextField label="الوقت المتوقع" value={values.estimatedTime} onChange={(v) => set("estimatedTime", v)} placeholder="30-45 دقيقة" />
        <StatusSelector
          label="الحالة"
          value={values.active ? "active" : "inactive"}
          onChange={(v) => set("active", v === "active")}
          options={[
            { value: "active", label: "مفعّلة" },
            { value: "inactive", label: "متوقفة" },
          ]}
        />
      </div>
    </Drawer>
  );
}
