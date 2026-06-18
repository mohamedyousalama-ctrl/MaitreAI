"use client";

import { Bell, Search, ChevronDown, Plus, Calendar } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useConversationStore } from "@/lib/conversation-store";
import { useRole } from "@/lib/use-role";
import { seedProfile } from "@/lib/seed-data";
import { SignOutButton } from "./SignOutButton";

// Bright-Corporate top bar (mockup): white, 62px, blue accents. Role chip +
// restaurant + branch + search + date pill + bell (real escalation count) +
// quick-add. Real data/handlers preserved; just restyled to the blue palette.
export function AppTopbar() {
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const branches = useRestaurantStore((s) => s.branches);
  const conversations = useConversationStore((s) => s.conversations);
  const role = useRole();
  const restaurantName = hydrated ? name : seedProfile.name;
  const branchName = hydrated && branches[0]?.name ? branches[0].name : "كل الفروع";
  const escalations = hydrated
    ? conversations.filter((c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human").length
    : 0;

  return (
    <header className="sticky top-0 z-20 flex h-[62px] items-center gap-2.5 border-b border-[#E2E8F0] bg-white px-4 md:px-5">
      {/* Role chip */}
      <div className="hidden items-center gap-2 rounded-[10px] border border-[#E2E8F0] px-2.5 py-1.5 text-[13px] sm:flex">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E2530] text-[11px] font-bold text-white">{role === "operation" ? "ت" : "م"}</span>
        <span className="font-semibold text-[#1E2530]">{role === "operation" ? "تشغيل" : "مدير"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
      </div>

      {/* Restaurant */}
      <div className="hidden items-center gap-2 rounded-[10px] border border-[#E2E8F0] px-3 py-2 text-[13.5px] font-semibold text-[#1E2530] md:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
        {restaurantName}
        <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
      </div>

      {/* Branch */}
      <button className="hidden items-center gap-2 rounded-[10px] border border-[#E2E8F0] px-3 py-2 text-[13.5px] text-[#475569] hover:bg-[#F8FAFE] lg:flex">
        {branchName}
        <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
      </button>

      {/* Search */}
      <div className="flex max-w-md flex-1 items-center gap-2.5 rounded-[11px] border border-transparent bg-[#F1F4F9] px-3.5 py-2.5 text-[13.5px] text-[#94A3B8]">
        <Search className="h-[17px] w-[17px] shrink-0" />
        <input
          type="text"
          placeholder="ابحث عن طلب، عميل، أو محادثة…"
          className="w-full bg-transparent text-[#1E2530] outline-none placeholder:text-[#94A3B8]"
        />
      </div>

      {/* Date pill */}
      <div className="hidden items-center gap-2 rounded-[10px] border border-[#D6E2FE] bg-[#EEF3FF] px-3 py-2 text-[13px] font-semibold text-[#1D4ED8] lg:flex">
        <Calendar className="h-[15px] w-[15px]" /> اليوم
      </div>

      {/* Bell */}
      <button className="relative flex h-10 w-10 items-center justify-center rounded-[11px] border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFE]">
        <Bell className="h-[19px] w-[19px]" />
        {escalations > 0 && (
          <span className="absolute -left-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-[#E11D48] px-1 text-[10px] font-bold text-white">
            {escalations}
          </span>
        )}
      </button>

      {/* Quick add */}
      <button title="إضافة" className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#2563EB] text-white shadow-[0_6px_14px_rgba(37,99,235,.34)] hover:bg-[#1D4ED8]">
        <Plus className="h-5 w-5" />
      </button>

      <SignOutButton />
    </header>
  );
}
