"use client";

// Section sub-nav for the folded «المنيو والذاكرة» tab (Amendment 04 §M2/K1):
// المنيو · ذاكرة المطعم · مراجعة المساعد live as sections inside one tab.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/menu", label: "المنيو" },
  { href: "/restaurant-brain", label: "ذاكرة المطعم" },
];

export function MenuMemoryTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-1 rounded-xl border border-[#e4d8c8] bg-[#faf6ef] p-1 text-sm">
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-center font-semibold transition-colors",
              active ? "bg-white text-[#b5502e] shadow-sm" : "text-[#6a5c4e] hover:text-[#2a211b]"
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
