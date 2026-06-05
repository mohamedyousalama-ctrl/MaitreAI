"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Field } from "./FormControls";

interface TagEditorProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
}

/** Adds/removes free-text tags. Used for ingredients, allergens, delivery zones. */
export function TagEditor({ label, tags, onChange, placeholder, hint, suggestions }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const add = (value: string) => {
    const v = value.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setDraft("");
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  const remaining = (suggestions ?? []).filter((s) => !tags.includes(s));

  return (
    <Field label={label} hint={hint}>
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
            >
              {t}
              <button onClick={() => remove(t)} className="text-slate-400 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              } else if (e.key === "Backspace" && !draft && tags.length) {
                remove(tags[tags.length - 1]);
              }
            }}
            placeholder={placeholder ?? "أضف ثم اضغط Enter"}
            className="min-w-[120px] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
      {remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-dashboard hover:text-dashboard"
            >
              <Plus className="h-3 w-3" /> {s}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
