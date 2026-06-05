"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { MenuItemForm, type MenuItemFormValues } from "@/components/menu/MenuItemForm";
import { ModifierManager } from "@/components/menu/ModifierManager";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { menuCategories } from "@/lib/seed-data";
import type { MenuItem } from "@/lib/types";
import { UtensilsCrossed, Plus, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MenuPage() {
  const hydrated = useHasHydrated();
  const menuItems = useRestaurantStore((s) => s.menuItems);
  const modifiers = useRestaurantStore((s) => s.modifiers);
  const addMenuItem = useRestaurantStore((s) => s.addMenuItem);
  const updateMenuItem = useRestaurantStore((s) => s.updateMenuItem);
  const deleteMenuItem = useRestaurantStore((s) => s.deleteMenuItem);

  const [category, setCategory] = useState("الكل");
  const [formOpen, setFormOpen] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);

  const filters = ["الكل", ...menuCategories];
  const filtered = category === "الكل" ? menuItems : menuItems.filter((m) => m.category === category);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (m: MenuItem) => {
    setEditing(m);
    setFormOpen(true);
  };
  const handleSubmit = (values: MenuItemFormValues) => {
    if (editing) updateMenuItem(editing.id, values);
    else addMenuItem(values);
    setFormOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="المنيو"
        subtitle="إدارة الأصناف والإضافات وجاهزية الذكاء الاصطناعي"
        icon={UtensilsCrossed}
        accentBg="bg-menu"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-4 w-4" /> إدارة الإضافات
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-menu px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> صنف جديد
            </button>
          </div>
        }
      />

      {/* Category filters */}
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              category === c
                ? "bg-menu text-white shadow-card"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {!hydrated ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-64 animate-pulse bg-slate-50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title="لا توجد أصناف"
            description="أضف أصنافاً للمنيو ليتمكن الموظف الذكي من تقديمها."
            icon={UtensilsCrossed}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <MenuItemCard key={item.id} item={item} modifiers={modifiers} onEdit={openEdit} onDelete={setToDelete} />
          ))}
        </div>
      )}

      <MenuItemForm
        open={formOpen}
        initial={editing}
        categories={menuCategories}
        modifiers={modifiers}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ModifierManager open={modOpen} onClose={() => setModOpen(false)} />

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الصنف"
        message={`سيتم حذف «${toDelete?.name}» من المنيو.`}
        onConfirm={() => {
          if (toDelete) deleteMenuItem(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
