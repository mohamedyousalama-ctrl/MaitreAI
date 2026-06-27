"use client";

// Mobile bottom tab bar (Amendment 04 §M2): the K1 five tabs. The sidebar is
// lg-only, so this is the primary navigation on mobile (the primary surface).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { ENABLE_ADMIN_CHAT_CONSOLE, ENABLE_DELIVERY_TRACKING } from "@/lib/feature-flags";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";
import { cn } from "@/lib/utils";

export function MobileTabs() {
  const pathname = usePathname();
  const role = useRole();
  // Flag-gated tabs appear only when their flags are on.
  const visible = navItems.filter(
    (i) =>
      (i.href !== "/dashboard" || ENABLE_ADMIN_CHAT_CONSOLE) &&
      (i.href !== "/deliveries" || ENABLE_DELIVERY_TRACKING)
  );
  // M1.2 — only a confirmed manager sees the full tab set; non-managers (incl.
  // loading/unresolved) get the restricted set, never a manager-nav flash.
  const items = (role !== "manager" ? visible.filter((i) => OPERATION_HREFS.has(i.href)) : visible).filter((i) => !i.railOnly);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#EDE5D8] bg-white lg:hidden">
      {items.map((item) => {
        const matches = item.match ?? [item.href];
        const active = matches.some((m) => pathname === m || pathname.startsWith(m + "/"));
        const Icon = item.icon;
        const label = item.href === "/menu" ? "المنيو" : item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-[#BE5238]" : "text-[#AEA391]"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
