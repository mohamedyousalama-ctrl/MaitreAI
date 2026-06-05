import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ModuleCardProps {
  title: string;
  icon?: LucideIcon;
  accentBg?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A titled white surface card used to group dashboard / page content. */
export function ModuleCard({ title, icon: Icon, accentBg = "bg-dashboard", action, className, children }: ModuleCardProps) {
  return (
    <section className={cn("card flex flex-col", className)}>
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-white", accentBg)}>
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="font-bold text-slate-900">{title}</h2>
        </div>
        {action}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}
