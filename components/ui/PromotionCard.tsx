import type { Promotion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/SettingsCard";
import { Megaphone, Calendar, Sparkles, TrendingUp } from "lucide-react";

export function PromotionCard({ promo }: { promo: Promotion }) {
  return (
    <div className="card flex flex-col p-5 transition hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-promotions/10 text-promotions">
            <Megaphone className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{promo.name}</h3>
            <span className="text-xs text-slate-400">{promo.offerType}</span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            promo.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
          )}
        >
          {promo.active ? "نشط" : "متوقف"}
        </span>
      </div>

      <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <Calendar className="h-4 w-4 text-slate-400" /> {promo.startDate} — {promo.endDate}
      </p>
      <p className="mt-1.5 text-sm text-slate-500">{promo.conditions}</p>

      {promo.aiSuggested && (
        <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-promotions ring-1 ring-purple-100">
          <Sparkles className="h-3.5 w-3.5" /> مقترح من المساعد
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-sm text-slate-600">
          <TrendingUp className="h-4 w-4 text-emerald-500" /> {promo.redemptions} استخدام
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">تفعيل الاقتراح الذكي</span>
          <Toggle checked={promo.aiSuggested} />
        </div>
      </div>
    </div>
  );
}
