import type { MenuItem } from "@/lib/types";
import { formatCurrency, cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/SettingsCard";
import { Sparkles, UtensilsCrossed } from "lucide-react";

export function MenuItemCard({ item }: { item: MenuItem }) {
  return (
    <div className={cn("card flex flex-col p-4 transition hover:shadow-card-hover", !item.available && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-menu/10 text-menu">
            <UtensilsCrossed className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{item.name}</h3>
            <span className="text-xs text-slate-400">{item.category}</span>
          </div>
        </div>
        <span className="text-lg font-bold text-menu">{formatCurrency(item.price)}</span>
      </div>

      <p className="mt-3 text-sm text-slate-500">{item.description}</p>

      {item.modifiers.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">الإضافات</p>
          <div className="flex flex-wrap gap-1.5">
            {item.modifiers.map((m) => (
              <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {m}
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
          <span className="text-xs font-bold text-promotions">{item.aiReadiness}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{item.available ? "متوفر" : "غير متوفر"}</span>
          <Toggle checked={item.available} />
        </div>
      </div>
    </div>
  );
}
