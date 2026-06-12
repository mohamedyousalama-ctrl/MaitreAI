"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { seedProfile } from "@/lib/seed-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";
import { cn } from "@/lib/utils";

// Warm-hospitality palette (Amendment 04 §M1): cream surfaces, charcoal ink,
// terracotta accent. Header app name = «مساعد المطعم». Terminology per the
// Arabic guide (no «عقل المطعم»/«المطبخ»/«مركز مراجعة الذكاء»).
export function AppSidebar() {
  const pathname = usePathname();
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const restaurantName = hydrated ? name : seedProfile.name;
  const configured = isSupabaseConfigured();
  const role = useRole();
  const items = role === "operation" ? navItems.filter((i) => OPERATION_HREFS.has(i.href)) : navItems;

  return (
    <aside className="hidden h-screen w-72 shrink-0 flex-col border-l border-[#ece0d2] bg-white lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="MaitreAI" width={44} height={44} className="h-11 w-11" />
        <div>
          <h1 className="text-lg font-bold leading-tight text-[#2a211b]">مساعد المطعم</h1>
          <p className="text-xs text-[#9b8b7c]">{restaurantName}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const matches = item.match ?? [item.href];
          const active = matches.some((m) => pathname === m || pathname.startsWith(m + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#f7efe6] text-[#2a211b]"
                  : "text-[#6a5c4e] hover:bg-[#faf6ef] hover:text-[#2a211b]"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-[#b5502e] text-white shadow-sm"
                    : "bg-[#efe5d8] text-[#9b8b7c] group-hover:bg-[#e4d8c8]"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="flex-1">{item.label}</span>
              {active && <span className="h-2 w-2 rounded-full bg-[#b5502e]" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer status — truthful (no false connection claims, PRD Amendment 03 F3) */}
      <div className="border-t border-[#ece0d2] p-4">
        <div className="flex items-center gap-3 rounded-xl bg-[#faf6ef] px-3 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#c2a98f]" />
          </span>
          <div className="text-xs">
            <p className="font-semibold text-[#2a211b]">{restaurantName}</p>
            {!configured && <p className="text-[#9b8b7c]">الوضع التجريبي</p>}
          </div>
        </div>
      </div>
    </aside>
  );
}
