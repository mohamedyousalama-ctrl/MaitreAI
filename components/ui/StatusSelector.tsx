"use client";

import { cn } from "@/lib/utils";
import { Field } from "./FormControls";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface StatusSelectorProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  hint?: string;
}

/** Segmented control for choosing one of a small set of statuses/options. */
export function StatusSelector<T extends string>({ label, value, onChange, options, hint }: StatusSelectorProps<T>) {
  return (
    <Field label={label} hint={hint}>
      <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
