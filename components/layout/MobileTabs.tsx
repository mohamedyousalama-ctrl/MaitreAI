"use client";

// Mobile bottom tab bar (Amendment 04 §M2): the K1 five tabs. The sidebar is
// lg-only, so this is the primary navigation on mobile (the primary surface).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";
import { cn } from "@/lib/utils";

export function MobileTabs() {
  const pathname = usePathname();
  const role = useRole();
  const items = (role === "operation" ? navItems.filter((i) => OPERATION_HREFS.has(i.href)) : navItems).filter((i) => !i.railOnly);
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
