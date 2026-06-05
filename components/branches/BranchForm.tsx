"use client";

import { useEffect, useState } from "react";
import type { Branch } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, TextAreaField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";
import { TagEditor } from "@/components/ui/TagEditor";

export type BranchFormValues = Omit<Branch, "id" | "whatsappConnected">;

const empty: BranchFormValues = {
  name: "",
  address: "",
  hours: "",
  whatsappNumber: "",
  deliveryZones: [],
  open: true,
  notes: "",
  phone: "",
};

interface BranchFormProps {
  open: boolean;
  initial?: Branch | null;
  onClose: () => void;
  onSubmit: (values: BranchFormValues) => void;
}

export function BranchForm({ open, initial, onClose, onSubmit }: BranchFormProps) {
  const [values, setValues] = useState<BranchFormValues>(empty);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? {
              name: initial.name,
              address: initial.address,
              hours: initial.hours,
              whatsappNumber: initial.whatsappNumber,
              deliveryZones: initial.deliveryZones,
              open: initial.open,
              notes: initial.notes,
              phone: initial.phone,
            }
          : empty
      );
    }
  }, [open, initial]);

  const set = <K extends keyof BranchFormValues>(key: K, v: BranchFormValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const valid = values.name.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "تعديل الفرع" : "فرع جديد"}
      subtitle="بيانات الفرع تُستخدم لاحقاً في الردود والطلبات"
      footer={
        <DrawerFooter
          onCancel={onClose}
          onSave={() => valid && onSubmit(values)}
          accent="bg-branches"
          disabled={!valid}
        />
      }
    >
      <div className="space-y-4">
        <TextField label="اسم الفرع" value={values.name} onChange={(v) => set("name", v)} placeholder="مثال: فرع الياسمين" />
        <TextField label="العنوان" value={values.address} onChange={(v) => set("address", v)} placeholder="الحي، الشارع، المدينة" />
        <TextField label="أوقات العمل" value={values.hours} onChange={(v) => set("hours", v)} placeholder="12:00 ظهراً - 2:00 صباحاً" />
        <TextField label="رقم واتساب" value={values.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} placeholder="+966 5X XXX XXXX" />
        <TextField label="رقم الهاتف" value={values.phone} onChange={(v) => set("phone", v)} placeholder="+966 5X XXX XXXX" />
        <StatusSelector
          label="الحالة"
          value={values.open ? "open" : "closed"}
          onChange={(v) => set("open", v === "open")}
          options={[
            { value: "open", label: "مفتوح" },
            { value: "closed", label: "مغلق" },
          ]}
        />
        <TagEditor
          label="مناطق التوصيل"
          tags={values.deliveryZones}
          onChange={(t) => set("deliveryZones", t)}
          placeholder="أضف منطقة"
        />
        <TextAreaField label="ملاحظات" value={values.notes} onChange={(v) => set("notes", v)} rows={3} />
      </div>
    </Drawer>
  );
}
