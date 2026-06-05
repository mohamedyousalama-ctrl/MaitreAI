import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  accentBg?: string; // e.g. "bg-orders"
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon: Icon, accentBg = "bg-dashboard", actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-card", accentBg)}>
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
