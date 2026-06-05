import type { KnowledgeArea, KnowledgeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS_META: Record<KnowledgeStatus, { label: string; cls: string; bar: string; icon: typeof CheckCircle2 }> = {
  complete: { label: "مكتمل", cls: "bg-emerald-50 text-emerald-600 ring-emerald-200", bar: "bg-emerald-500", icon: CheckCircle2 },
  attention: { label: "يحتاج انتباه", cls: "bg-amber-50 text-amber-600 ring-amber-200", bar: "bg-amber-500", icon: AlertTriangle },
  missing: { label: "ناقص", cls: "bg-red-50 text-red-600 ring-red-200", bar: "bg-red-500", icon: XCircle },
};

export function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", m.cls)}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

/** Per-area knowledge health card with auto-calculated score + status. */
export function KnowledgeScoreCard({ area }: { area: KnowledgeArea }) {
  const m = STATUS_META[area.status];
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{area.label}</span>
        <KnowledgeStatusBadge status={area.status} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full transition-all", m.bar)} style={{ width: `${area.score}%` }} />
        </div>
        <span className="w-10 text-end text-sm font-bold text-slate-900">{area.score}%</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{area.detail}</p>
    </div>
  );
}
