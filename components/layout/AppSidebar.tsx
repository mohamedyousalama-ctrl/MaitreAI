"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";

// Bright-Corporate operator rail (mockup): a thin 64px icon-only column on the
// right (RTL start). Blue «م» logo tile on top, icon-only nav (active = blue
// tint #EEF3FF + blue icon; idle = gray, hover #F1F4F9), الإعدادات pinned at the
// bottom. Real navigation targets unchanged — restyle only. Tooltips via title.
export function AppSidebar() {
  const pathname = usePathname();
  const role = useRole();
  const all = role === "operation" ? navItems.filter((i) => OPERATION_HREFS.has(i.href)) : navItems;
  const top = all.filter((i) => i.href !== "/settings");
  const settings = all.find((i) => i.href === "/settings");

  const isActive = (href: string, match?: string[]) =>
    (match ?? [href]).some((m) => pathname === m || pathname.startsWith(m + "/"));

  const Item = ({ href, label, Icon, active }: { href: string; label: string; Icon: typeof Settings; active: boolean }) => (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-[13px] transition-colors",
        active ? "bg-[#EEF3FF] text-[#2563EB]" : "text-[#94A3B8] hover:bg-[#F1F4F9] hover:text-[#475569]"
      )}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
    </Link>
  );

  return (
    <aside className="hidden h-screen w-16 shrink-0 flex-col items-center border-l border-[#E2E8F0] bg-white py-3.5 lg:flex">
      {/* Logo tile */}
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB] text-[20px] font-bold text-white shadow-[0_6px_14px_rgba(37,99,235,.4)]">
        م
      </div>

      {/* Nav (icon-only) */}
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {top.map((item) => {
          const Icon = item.icon;
          return <Item key={item.href} href={item.href} label={item.label} Icon={Icon} active={isActive(item.href, item.match)} />;
        })}
      </nav>

      {/* Settings pinned bottom */}
      {settings && <Item href={settings.href} label={settings.label} Icon={settings.icon} active={isActive(settings.href, settings.match)} />}
    </aside>
  );
}
