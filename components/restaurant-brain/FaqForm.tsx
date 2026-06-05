"use client";

import { useEffect, useState } from "react";
import type { FaqItem } from "@/lib/types";
import { Drawer, DrawerFooter } from "@/components/ui/Drawer";
import { TextField, TextAreaField } from "@/components/ui/FormControls";
import { StatusSelector } from "@/components/ui/StatusSelector";

export type FaqFormValues = Omit<FaqItem, "id">;

const empty: FaqFormValues = { question: "", answer: "", category: "عام", active: true };

interface FaqFormProps {
  open: boolean;
  initial?: FaqItem | null;
  onClose: () => void;
  onSubmit: (values: FaqFormValues) => void;
}

export function FaqForm({ open, initial, onClose, onSubmit }: FaqFormProps) {
  const [values, setValues] = useState<FaqFormValues>(empty);

  useEffect(() => {
    if (open) {
      setValues(
        initial
          ? { question: initial.question, answer: initial.answer, category: initial.category, active: initial.active }
          : empty
      );
    }
  }, [open, initial]);

  const set = <K extends keyof FaqFormValues>(key: K, v: FaqFormValues[K]) => setValues((s) => ({ ...s, [key]: v }));

  const valid = values.question.trim().length > 0 && values.answer.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={initial ? "تعديل السؤال" : "سؤال جديد"}
      footer={<DrawerFooter onCancel={onClose} onSave={() => valid && onSubmit(values)} accent="bg-brain" disabled={!valid} />}
    >
      <div className="space-y-4">
        <TextField label="السؤال" value={values.question} onChange={(v) => set("question", v)} placeholder="مثال: كم وقت التوصيل؟" />
        <TextAreaField label="الإجابة" value={values.answer} onChange={(v) => set("answer", v)} rows={4} />
        <TextField label="التصنيف" value={values.category} onChange={(v) => set("category", v)} placeholder="عام / التوصيل / الدفع" />
        <StatusSelector
          label="الحالة"
          value={values.active ? "active" : "inactive"}
          onChange={(v) => set("active", v === "active")}
          options={[
            { value: "active", label: "مفعّل" },
            { value: "inactive", label: "متوقف" },
          ]}
        />
      </div>
    </Drawer>
  );
}
