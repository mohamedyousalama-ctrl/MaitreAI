import type { KnowledgeArea } from "@/lib/types";
import { cn } from "@/lib/utils";

function barColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

/** A single knowledge-area health bar. */
export function KnowledgeHealthCard({ area }: { area: KnowledgeArea }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{area.label}</span>
        <span className="text-sm font-bold text-slate-900">{area.score}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-all", barColor(area.score))} style={{ width: `${area.score}%` }} />
      </div>
    </div>
  );
}

/** Big circular overall score gauge. */
export function OverallScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="#059669"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-slate-900">{score}%</span>
        <span className="text-xs text-slate-500">صحة المعرفة</span>
      </div>
    </div>
  );
}
