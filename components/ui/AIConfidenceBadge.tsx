import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/** Visualizes the AI's confidence for a given reply. Color shifts with level. */
export function AIConfidenceBadge({ value, className }: { value: number; className?: string }) {
  const level =
    value >= 85
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : value >= 60
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-red-50 text-red-700 ring-red-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        level,
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      {/* UI4 — "تقديرية" makes explicit this is the AI's own estimate, not a
          measured/verified figure, so an inference isn't read as a hard number. */}
      ثقة تقديرية {value}%
    </span>
  );
}
