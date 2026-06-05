"use client";

import { Hand } from "lucide-react";
import { cn } from "@/lib/utils";

/** Placeholder takeover control — visual only in Sprint 1. */
export function HumanTakeoverButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-red-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90 active:scale-[0.98]",
        className
      )}
    >
      <Hand className="h-4 w-4" />
      تدخل بشري الآن
    </button>
  );
}
