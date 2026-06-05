import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: LucideIcon;
  accentBg?: string; // e.g. "bg-dashboard"
}

export function MetricCard({ label, value, delta, trend = "flat", icon: Icon, accentBg = "bg-dashboard" }: MetricCardProps) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-slate-400";

  return (
    <div className="card p-4 transition hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-opacity-10 text-white", accentBg)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {delta && (
          <span className={cn("flex items-center gap-0.5 text-xs font-semibold", trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
