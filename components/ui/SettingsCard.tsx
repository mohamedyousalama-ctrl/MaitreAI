import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SettingsCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  accentBg?: string;
  children: React.ReactNode;
}

export function SettingsCard({ title, description, icon: Icon, accentBg = "bg-settings", children }: SettingsCardProps) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white", accentBg)}>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="flex-1">
          <h2 className="font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** A simple visual-only toggle used throughout settings pages. */
export function Toggle({ checked, label }: { checked: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-brain" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "start-0.5" : "start-[22px]"
          )}
        />
      </span>
      {label && <span className="text-sm text-slate-600">{label}</span>}
    </span>
  );
}

interface SettingsRowProps {
  label: string;
  value?: React.ReactNode;
}

export function SettingsRow({ label, value }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="text-sm text-slate-500">{value}</span>
    </div>
  );
}
