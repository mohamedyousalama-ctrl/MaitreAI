"use client";

import { useEffect, useState } from "react";
import type { DeliveryArea } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, NumberField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";

export type DeliveryAreaFormValues = Omit<DeliveryArea, "id">;

const empty: DeliveryAreaFormValues = {
  name: "",
  minOrder: 30,
  deliveryFee: 10,
  estimatedTime: "30-45 دقيقة",
  active: true,
};

interface DeliveryAreaFormProps {
  open: boolean;
  initial?: DeliveryArea | null;
  onClose: () => void;
  onSubmit: (values: DeliveryAreaFormValues) => void;
}

export function DeliveryAreaForm({ open, initial, onClose, onSubmit }: DeliveryAreaFormProps) {
  const [values, setValues] = useState<DeliveryAreaFormValues>(empty);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? {
              name: initial.name,
              minOrder: initial.minOrder,
              deliveryFee: initial.deliveryFee,
              estimatedTime: initial.estimatedTime,
              active: initial.active,
            }
          : empty
      );
    }
  }, [open, initial]);

  const set = <K extends keyof DeliveryAreaFormValues>(key: K, v: DeliveryAreaFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const valid = values.name.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "تعديل منطقة التوصيل" : "منطقة توصيل جديدة"}
      footer={<DrawerFooter onCancel={onClose} onSave={() => valid && onSubmit(values)} accent="bg-brain" disabled={!valid} />}
    >
      <div className="space-y-4">
        <TextField label="اسم المنطقة" value={values.name} onChange={(v) => set("name", v)} placeholder="مثال: الياسمين" />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="الحد الأدنى للطلب" value={values.minOrder} onChange={(v) => set("minOrder", v)} suffix="ر.س" />
          <NumberField label="رسوم التوصيل" value={values.deliveryFee} onChange={(v) => set("deliveryFee", v)} suffix="ر.س" />
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
