"use client";

import { Bell, Search, ChevronDown } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { seedProfile } from "@/lib/seed-data";
import { SignOutButton } from "./SignOutButton";

export function AppTopbar() {
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const restaurantName = hydrated ? name : seedProfile.name;
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6">
      {/* Search */}
      <div className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        <Search className="h-4 w-4 shrink-0" />
        <input
          type="text"
          placeholder="ابحث عن طلب، عميل، أو محادثة..."
          className="w-full bg-transparent outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Branch selector */}
        <button className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex">
          فرع الياسمين
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>

        {/* Notifications */}
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </button>

        {/* User */}
        <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pe-3 ps-1 hover:bg-slate-50">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orders to-promotions text-sm font-bold text-white">
            م
          </span>
          <div className="hidden text-start text-xs sm:block">
            <p className="font-semibold text-slate-800">مدير المطعم</p>
            <p className="text-slate-500">{restaurantName}</p>
          </div>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
        </button>

        {/* Sign out (only rendered when Supabase auth is active) */}
        <SignOutButton />
      </div>
    </header>
  );
}
