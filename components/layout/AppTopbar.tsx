"use client";

import Link from "next/link";
import { Bell, Search, ChevronDown } from "lucide-react";
import { useRestaurantStore, useHasHydrated } from "@/lib/store";
import { useConversationStore } from "@/lib/conversation-store";
import { countEscalations } from "@/lib/escalation";
import { useOpsStore } from "@/lib/ops-store";
import { seedProfile } from "@/lib/seed-data";
import { SignOutButton } from "./SignOutButton";

// Terracotta top bar (mockup): white, MaitreAI gradient logo + wordmark,
// restaurant pill (cream), search (cream), live «مفتوح/مغلق» pill (real ops
// state, links to the Home control row), bell (real escalation count), كريم
// avatar (gold gradient). Real data/handlers preserved.
export function AppTopbar() {
  const hydrated = useHasHydrated();
  const name = useRestaurantStore((s) => s.profile.name);
  const branches = useRestaurantStore((s) => s.branches);
  const conversations = useConversationStore((s) => s.conversations);
  const isOpen = useOpsStore((s) => s.isOpen);
  const restaurantName = hydrated ? name : seedProfile.name;
  const branchName = hydrated && branches[0]?.name ? branches[0].name : "كل الفروع";
  const escalations = hydrated ? countEscalations(conversations) : 0;
  const open = hydrated ? isOpen : true;

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-[#F0E9DD] bg-white px-4 md:px-5">
      {/* Logo + wordmark */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white" style={{ background: "linear-gradient(155deg,#C25A3E,#8A3621)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F6EDDF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13a4 4 0 0 1-1-7.9 4.5 4.5 0 0 1 8.9-1A4 4 0 0 1 18 13" /><path d="M6 13h12v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5Z" /></svg>
        </span>
        <span className="hidden text-[15px] font-bold text-[#2A2019] sm:block" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>Kivo</span>
      </div>

      {/* Restaurant / branch pill */}
      <div className="hidden items-center gap-2 rounded-[11px] border border-[#EBE2D3] bg-[#F7F2EA] px-3 py-1.5 md:flex">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-[#BE5238] text-[11px] font-bold text-white">{restaurantName.trim().charAt(0) || "م"}</span>
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-[#2A2019]">{restaurantName}</span>
          <span className="block text-[11px] text-[#9A8E7E]">{branchName}</span>
        </span>
        <ChevronDown className="h-[15px] w-[15px] text-[#A99D8D]" />
      </div>

      {/* Search */}
      <div className="flex max-w-[340px] flex-1 items-center gap-2.5 rounded-[11px] border border-[#F0E9DD] bg-[#F7F2EA] px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-[#AEA391]" />
        <input type="text" placeholder="ابحث في الطلبات، العملاء، العروض…" className="w-full bg-transparent text-[13px] text-[#2A2019] outline-none placeholder:text-[#AEA391]" />
      </div>

      <div className="flex-1" />

      {/* Live open/closed pill (real state) → Home control row */}
      <Link
        href="/dashboard"
        title="حالة المطعم"
        className="flex items-center gap-2 rounded-full border px-3 py-1.5"
        style={open ? { background: "#EAF1E9", borderColor: "#CFE2D3" } : { background: "#FBEAE5", borderColor: "#F1D2C8" }}
      >
        <span className="relative h-2 w-2">
          <span className="t-live absolute inset-0 rounded-full" style={{ background: open ? "#5C8A6B" : "#BE5238", animation: "tLive 2.4s ease-in-out infinite" }} />
          <span className="absolute inset-0 rounded-full" style={{ background: open ? "#5C8A6B" : "#BE5238" }} />
        </span>
        <span className="text-[12.5px] font-semibold" style={{ color: open ? "#436B50" : "#BE5238" }}>{open ? "مفتوح" : "مغلق"}</span>
      </Link>

      {/* Bell */}
      <button className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[11px] border border-[#F0E9DD] bg-[#F7F2EA] text-[#7C7163]">
        <Bell className="h-[18px] w-[18px]" />
        {escalations > 0 && (
          <span className="absolute -left-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-[#BE5238] px-1 text-[10px] font-bold text-white">{escalations}</span>
        )}
      </button>

      {/* كريم avatar */}
      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] text-[15px] font-bold text-white" style={{ background: "linear-gradient(150deg,#C79A4E,#9A7A2E)" }}>ك</span>

      <SignOutButton />
    </header>
  );
}
