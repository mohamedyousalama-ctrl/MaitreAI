"use client";

import type { MenuItem, Modifier } from "@/lib/types";
import { formatCurrency, cn } from "@/lib/utils";
import { menuItemReadiness } from "@/lib/knowledge";
import { Sparkles, UtensilsCrossed, Pencil, Trash2 } from "lucide-react";

interface MenuItemCardProps {
  item: MenuItem;
  modifiers: Modifier[];
  onEdit?: (item: MenuItem) => void;
  onDelete?: (item: MenuItem) => void;
}

export function MenuItemCard({ item, modifiers, onEdit, onDelete }: MenuItemCardProps) {
  const readiness = menuItemReadiness(item);
  const itemModifiers = modifiers.filter((m) => item.modifierIds.includes(m.id));

  return (
    <div className={cn("card flex flex-col p-4 transition hover:shadow-card-hover", !item.available && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-menu/10 text-menu">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <UtensilsCrossed className="h-6 w-6" />
            )}
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{item.name}</h3>
            <span className="text-xs text-slate-400">{item.category}</span>
          </div>
        </div>
        <span className="text-lg font-bold text-menu">{formatCurrency(item.price)}</span>
      </div>

      <p className="mt-3 text-sm text-slate-500">{item.description || "—"}</p>

      {itemModifiers.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">الإضافات</p>
          <div className="flex flex-wrap gap-1.5">
            {itemModifiers.map((m) => (
              <span key={m.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {m.name}
                {m.priceImpact > 0 && <span className="text-slate-400"> +{m.priceImpact}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {item.allergens.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">مسببات الحساسية</p>
          <div className="flex flex-wrap gap-1.5">
            {item.allergens.map((a) => (
              <span key={a} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600 ring-1 ring-red-100">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-promotions" />
          <span className="text-xs text-slate-500">جاهزية الذكاء</span>
          <span className="text-xs font-bold text-promotions">{readiness}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              item.available ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
            )}
          >
            {item.available ? "متوفر" : "غير متوفر"}
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-menu"
              aria-label="تعديل"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
              aria-label="حذف"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
