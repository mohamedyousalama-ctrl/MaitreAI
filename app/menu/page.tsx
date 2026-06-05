"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { menuCategories, menuItems } from "@/lib/mock-data";
import { UtensilsCrossed, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MenuPage() {
  const [category, setCategory] = useState("الكل");
  const filtered = category === "الكل" ? menuItems : menuItems.filter((m) => m.category === category);

  return (
    <div>
      <PageHeader
        title="المنيو"
        subtitle="إدارة الأصناف والإضافات وجاهزية الذكاء الاصطناعي"
        icon={UtensilsCrossed}
        accentBg="bg-menu"
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-xl bg-menu px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:opacity-90">
            <Plus className="h-4 w-4" /> صنف جديد
          </button>
        }
      />

      {/* Category filters */}
      <div className="mb-5 flex flex-wrap gap-2">
        {menuCategories.map((c) => (
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <MenuItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
