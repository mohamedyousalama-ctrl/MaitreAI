"use client";

import type { OperatorPromotion } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { Calendar, Megaphone, Pause, Play, Tag, Trash2 } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  percent_off: "خصم نسبة",
  amount_off: "خصم مبلغ",
  free_item: "هدية مع الطلب",
  bogo: "اشترِ واحصل",
  combo: "عرض كومبو",
  free_delivery: "توصيل مجاني",
};

const STATE_LABELS: Record<string, string> = {
  active: "نشط",
  paused: "متوقف",
  draft: "مسودة",
  scheduled: "مجدول",
  ended: "منتهي",
  archived: "مؤرشف",
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function configSummary(promo: OperatorPromotion, currency: string): string {
  const amount = asNumber(promo.config.amount);
  const value = asNumber(promo.config.value);
  const discountValue = amount ?? value;
  const scopeLabel = asString(promo.config.scopeLabel) || asString(promo.config.scope_label);

  if (promo.type === "percent_off" && discountValue !== null) {
    return `${discountValue}% خصم${scopeLabel ? ` على ${scopeLabel}` : ""}`;
  }

  if (promo.type === "amount_off" && discountValue !== null) {
    return `${formatCurrency(discountValue, currency)} خصم${scopeLabel ? ` على ${scopeLabel}` : ""}`;
  }

  if (promo.type === "free_delivery") return "توصيل مجاني";
  if (promo.type === "bogo") return "عرض اشترِ واحصل";
  if (promo.type === "combo") return "عرض كومبو محفوظ";
  if (promo.type === "free_item") return scopeLabel ? `هدية: ${scopeLabel}` : "هدية مع الطلب";

  return scopeLabel || "تفاصيل العرض محفوظة";
}

function scheduleSummary(schedule: Record<string, unknown>): string {
  const start = formatDate(schedule.start ?? schedule.starts_at ?? schedule.startDate);
  const end = formatDate(schedule.end ?? schedule.ends_at ?? schedule.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `يبدأ ${start}`;
  if (end) return `ينتهي ${end}`;
  return "بدون جدول محدد";
}

interface PromotionCardProps {
  promo: OperatorPromotion;
  currency: string;
  canManage: boolean;
  onToggle: (promo: OperatorPromotion, active: boolean) => void;
  onDelete: (promo: OperatorPromotion) => void;
}

export function PromotionCard({ promo, currency, canManage, onToggle, onDelete }: PromotionCardProps) {
  const active = promo.state === "active";

  return (
    <div className="card flex flex-col p-5 transition hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-promotions/10 text-promotions">
            <Megaphone className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{promo.name}</h3>
            <span className="text-xs text-slate-400">{TYPE_LABELS[promo.type] ?? promo.type}</span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
          )}
        >
          {STATE_LABELS[promo.state] ?? promo.state}
        </span>
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-700">{configSummary(promo, currency)}</p>
      <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
        <Calendar className="h-4 w-4 text-slate-400" /> {scheduleSummary(promo.schedule)}
      </p>
      {promo.code && (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Tag className="h-4 w-4 text-slate-400" /> كود العرض:{" "}
          <span className="font-semibold text-slate-800">{promo.code}</span>
        </p>
      )}
      {promo.budgetCap !== null && (
        <p className="mt-2 text-sm text-slate-500">
          المصروف: {formatCurrency(promo.spent, currency)} من {formatCurrency(promo.budgetCap, currency)}
        </p>
      )}

      {canManage && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onToggle(promo, !active)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
              active
                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            )}
          >
            {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {active ? "إيقاف" : "تفعيل"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(promo)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      )}
    </div>
  );
}
