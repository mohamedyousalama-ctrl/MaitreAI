"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useConversationStore } from "@/lib/conversation-store";
import { useRole, OPERATION_HREFS } from "@/lib/use-role";
import { cn } from "@/lib/utils";
import { LayoutGrid, Settings } from "lucide-react";

// Terracotta operator rail (mockup): a 74px white column on the right (RTL
// start). A solid terracotta «grid» logo tile on top = الرئيسية; icon-only nav
// (idle #897F70, active = terracotta tint); الإعدادات pinned bottom. A small
// terracotta dot marks محادثات when there are open escalations (truth-driven).
// Real navigation targets unchanged — restyle only. Tooltips via title.
export function AppSidebar() {
  const pathname = usePathname();
  const role = useRole();
  const conversations = useConversationStore((s) => s.conversations);
  const escalations = conversations.filter(
    (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
  ).length;

  const all = role === "operation" ? navItems.filter((i) => OPERATION_HREFS.has(i.href)) : navItems;
  const top = all.filter((i) => i.href !== "/settings" && i.href !== "/dashboard");
  const settings = all.find((i) => i.href === "/settings");
  const homeActive = pathname === "/dashboard";

  const isActive = (href: string, match?: string[]) =>
    (match ?? [href]).some((m) => pathname === m || pathname.startsWith(m + "/"));

  const Item = ({ href, label, Icon, active, dot }: { href: string; label: string; Icon: typeof Settings; active: boolean; dot?: boolean }) => (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative flex h-[46px] w-[46px] items-center justify-center rounded-[13px] transition-colors",
        active ? "bg-[#FBEAE5] text-[#BE5238]" : "text-[#897F70] hover:bg-[#F7F2EA]"
      )}
    >
      <Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
      {dot && <span className="absolute left-[9px] top-[7px] h-2 w-2 rounded-full border-2 border-white bg-[#BE5238]" />}
    </Link>
  );

  return (
    <aside className="hidden h-screen w-[74px] shrink-0 flex-col items-center gap-1.5 border-l border-[#F0E9DD] bg-white py-4 lg:flex">
      {/* Logo tile = home */}
      <Link
        href="/dashboard"
        title="الرئيسية"
        className={cn(
          "flex h-[46px] w-[46px] items-center justify-center rounded-[13px] transition-colors",
          homeActive ? "bg-[#BE5238] text-white shadow-[0_8px_18px_-8px_rgba(190,82,56,.6)]" : "text-[#897F70] hover:bg-[#F7F2EA]"
        )}
      >
        <LayoutGrid className="h-[21px] w-[21px]" strokeWidth={1.9} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {top.map((item) => (
          <Item key={item.href} href={item.href} label={item.label} Icon={item.icon} active={isActive(item.href, item.match)} dot={item.href === "/conversations" && escalations > 0} />
        ))}
      </nav>

      {settings && <Item href={settings.href} label={settings.label} Icon={settings.icon} active={isActive(settings.href, settings.match)} />}
    </aside>
  );
}
