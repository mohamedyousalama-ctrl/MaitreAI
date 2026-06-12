"use client";

import { Bell, Search, ChevronDown } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useConversationStore } from "@/lib/conversation-store";
import { seedProfile } from "@/lib/seed-data";
import { SignOutButton } from "./SignOutButton";

// Warm-hospitality topbar (§M1). The notification badge is truth-driven (F3):
// it shows the real escalation count and is hidden when there are none.
export function AppTopbar() {
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const branches = useRestaurantStore((s) => s.branches);
  const conversations = useConversationStore((s) => s.conversations);
  const restaurantName = hydrated ? name : seedProfile.name;
  const branchName = hydrated && branches[0]?.name ? branches[0].name : "كل الفروع";
  const escalations = hydrated
    ? conversations.filter(
        (c) => c.status === "يحتاج تدخل موظف" || c.status === "تم التحويل لموظف" || c.owner === "human"
      ).length
    : 0;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#ece0d2] bg-white/85 px-4 backdrop-blur md:px-6">
      {/* Search */}
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-[#e4d8c8] bg-[#faf6ef] px-3 py-2 text-sm text-[#9b8b7c]">
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder="ابحث عن طلب، عميل، أو محادثة..."
          className="w-full bg-transparent text-[#2a211b] outline-none placeholder:text-[#9b8b7c]"
        />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Branch selector */}
        <button className="hidden items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white px-3 py-2 text-sm font-medium text-[#4a3f36] hover:bg-[#faf6ef] sm:flex">
          {branchName}
          <ChevronDown className="h-4 w-4 text-[#c2a98f]" />
        </button>

        {/* Notifications — real escalation count, hidden when zero */}
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#e4d8c8] bg-white text-[#6a5c4e] hover:bg-[#faf6ef]">
          <Bell className="h-5 w-5" />
          {escalations > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#cc3a33] text-[10px] font-bold text-white">
              {escalations}
            </span>
          )}
        </button>

        {/* User */}
        <button className="flex items-center gap-2 rounded-xl border border-[#e4d8c8] bg-white py-1 pe-3 ps-1 hover:bg-[#faf6ef]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b5502e] text-sm font-bold text-white">
            م
          </span>
          <div className="hidden text-start text-xs sm:block">
            <p className="font-semibold text-[#2a211b]">مدير المطعم</p>
            <p className="text-[#9b8b7c]">{restaurantName}</p>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-[#c2a98f] sm:block" />
        </button>

        {/* Sign out (only rendered when Supabase auth is active) */}
        <SignOutButton />
      </div>
    </header>
  );
}
