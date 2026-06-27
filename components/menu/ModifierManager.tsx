"use client";

import { useState } from "react";
import type { Modifier } from "@/lib/types";
import { useRestaurantStore } from "@/lib/store";
import { modifierCategories } from "@/lib/seed-data";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModifierManagerProps {
  open: boolean;
  onClose: () => void;
}

const blankDraft = { name: "", priceImpact: 0, category: modifierCategories[0], active: true };

export function ModifierManager({ open, onClose }: ModifierManagerProps) {
  const modifiers = useRestaurantStore((s) => s.modifiers);
  const addModifier = useRestaurantStore((s) => s.addModifier);
  const updateModifier = useRestaurantStore((s) => s.updateModifier);
  const deleteModifier = useRestaurantStore((s) => s.deleteModifier);

  const [draft, setDraft] = useState(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(blankDraft);
  const [toDelete, setToDelete] = useState<Modifier | null>(null);

  const startEdit = (m: Modifier) => {
    setEditingId(m.id);
    setEdit({ name: m.name, priceImpact: m.priceImpact, category: m.category, active: m.active });
  };

  const saveEdit = () => {
    if (editingId && edit.name.trim()) updateModifier(editingId, edit);
    setEditingId(null);
  };

  const addNew = () => {
    if (!draft.name.trim()) return;
    addModifier(draft);
    setDraft(blankDraft);
  };

  const inputCls = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#0E9F6E]";

  return (
    <Drawer open={open} onClose={onClose} title="إدارة الإضافات" subtitle="مكتبة الإضافات والتعديلات القابلة لإرفاقها بالأصناف">
      {/* Add new */}
      <div className="rounded-xl border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">إضافة جديدة</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={inputCls}
            placeholder="الاسم"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            type="number"
            className={inputCls}
            placeholder="تأثير السعر"
            value={draft.priceImpact}
            onChange={(e) => setDraft({ ...draft, priceImpact: Number(e.target.value) || 0 })}
          />
          <select
            className={inputCls}
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {modifierCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={addNew}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0E9F6E] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> إضافة
          </button>
        </div>
      </div>

      {/* List */}
      <ul className="mt-4 space-y-2">
        {modifiers.map((m) => (
          <li key={m.id} className="rounded-xl border border-slate-100 bg-white p-3">
            {editingId === m.id ? (
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <input
                  type="number"
                  className={inputCls}
                  value={edit.priceImpact}
                  onChange={(e) => setEdit({ ...edit, priceImpact: Number(e.target.value) || 0 })}
                />
                <select className={inputCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {modifierCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button onClick={saveEdit} className="flex flex-1 items-center justify-center rounded-lg bg-[#0E9F6E] py-1.5 text-white hover:opacity-90">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="flex flex-1 items-center justify-center rounded-lg border border-slate-200 py-1.5 text-slate-500 hover:bg-slate-50">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {m.name}
                    {m.priceImpact > 0 && <span className="text-xs font-normal text-slate-400"> (+{m.priceImpact} ج.م)</span>}
                  </p>
                  <span className="text-xs text-slate-400">{m.category}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateModifier(m.id, { active: !m.active })}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      m.active ? "bg-[rgba(14,159,110,.12)] text-[#0A8A5F]" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {m.active ? "مفعّل" : "متوقف"}
                  </button>
                  <button onClick={() => startEdit(m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-[#0E9F6E]">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setToDelete(m)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الإضافة"
        message={`سيتم حذف «${toDelete?.name}» وإزالتها من جميع الأصناف المرتبطة.`}
        onConfirm={() => {
          if (toDelete) deleteModifier(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </Drawer>
  );
}
