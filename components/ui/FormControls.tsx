"use client";

import { cn } from "@/lib/utils";

const labelCls = "mb-1.5 block text-sm font-semibold text-slate-700";
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-dashboard focus:ring-2 focus:ring-dashboard/10";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(inputCls, "resize-y")}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  suffix?: string;
  min?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          value={Number.isNaN(value) ? "" : value}
          min={min}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={cn(inputCls, suffix && "pe-12")}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cn(inputCls, "appearance-none")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-start hover:bg-slate-50"
    >
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {description && <p className="text-xs text-slate-400">{description}</p>}
      </div>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-brain" : "bg-slate-200")}>
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "start-0.5" : "start-[22px]"
          )}
        />
      </span>
    </button>
  );
}
